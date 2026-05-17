import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import {
  AUDIT_RETENTION_DAYS,
  AuditEventEnvelope,
  AuditEventType,
  RETENTION_CLASSES,
  RetentionClass,
} from '../application/types';
import {
  AUDIT_ARCHIVE_STORAGE,
  type AuditArchiveStorage,
} from './audit-archive-storage';

const gzipAsync = promisify(gzip);

interface BucketRow {
  organization_id: string;
  ym: string;
  ids: string[];
}

/**
 * Daily cron that archives `audit_log` rows past their retention
 * window to cold storage. Implements the cold-storage tail of
 * ADR-AUDIT-RETENTION-CLASS (slice #21 m3-audit-log-hash-chain-hardening)
 * with retention windows pinned at:
 *
 *  - `regulatory` → 7 years (2555 days)
 *  - `operational` → 1 year (365 days)
 *  - `ephemeral` → 90 days
 *
 * **Schedule:** `@Cron(CronExpression.EVERY_DAY_AT_2AM)` (UTC) — runs
 * after the daily operational + ephemeral windows close and before
 * peak morning Spain operations.
 *
 * **Env-gated:** disabled by default; activates only when
 * `NEXANDRO_AUDIT_LOG_ARCHIVAL_ENABLED=true`. Matches the
 * disabled-by-default pattern from `ExpiryScannerService` and
 * `ReviewQueueStaleScanner` so the cron only runs where intended.
 *
 * **Storage:** pluggable via `AUDIT_ARCHIVE_STORAGE` DI token —
 * filesystem default + S3-compatible alternative (AWS S3, MinIO,
 * Azure Blob via S3-compat). Picked at module instantiation by
 * `createAuditArchiveStorage()`.
 *
 * **Write-then-delete contract:** for each (organization × yearMonth ×
 * retentionClass) bucket the scanner:
 *  1. SELECTs the row ids
 *  2. SELECTs the full row payloads (ORDER BY created_at ASC so the
 *     archive preserves chain order)
 *  3. JSONL-encodes + gzips them in memory
 *  4. WRITES to storage (throws on failure)
 *  5. DELETEs the ids ONLY after the write resolved
 *  6. Emits `AUDIT_LOG_ARCHIVAL_BATCH` operational envelope per bucket
 *
 * If step 4 throws, steps 5+6 are skipped and the rows survive for the
 * next tick. Each bucket runs in its own try/catch so a failure in
 * one bucket does NOT abort sibling buckets.
 *
 * **Concurrency / hash-chain safety:** archived rows are physically
 * deleted, breaking the hash chain on the deleted slice. The
 * `AUDIT_LOG_CHAIN_LOOKBACK_ROWS=100` validator only scans the most
 * recent 100 rows per tenant, so a bucket older than 100 rows back
 * is safe to delete. v1 contract: operators MUST NOT enable the
 * archival cron on tenants with fewer than 100 rows older than the
 * smallest retention threshold (90 days for ephemeral). v2 may
 * record a per-tenant "archive cursor" so the validator skips the
 * deleted range.
 */
@Injectable()
export class AuditLogArchivalScanner {
  private readonly logger = new Logger(AuditLogArchivalScanner.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
    @Inject(AUDIT_ARCHIVE_STORAGE)
    private readonly storage: AuditArchiveStorage,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'audit-log-archival' })
  async runTick(): Promise<void> {
    if (process.env.NEXANDRO_AUDIT_LOG_ARCHIVAL_ENABLED !== 'true') {
      return;
    }
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error(
        `audit-log-archival tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Exposed for unit + integration tests, and for one-shot operator
   * triggers (e.g. backfilling cold storage after a multi-day cron
   * outage). Iterates all retention classes sequentially.
   */
  async runOnce(): Promise<void> {
    for (const retentionClass of RETENTION_CLASSES) {
      await this.archiveClass(retentionClass);
    }
  }

  private async archiveClass(retentionClass: RetentionClass): Promise<void> {
    const thresholdDays = AUDIT_RETENTION_DAYS[retentionClass];
    let buckets: BucketRow[];
    try {
      buckets = await this.dataSource.query(
        `SELECT organization_id,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS ym,
                array_agg(id ORDER BY created_at ASC, id ASC) AS ids
           FROM audit_log
          WHERE retention_class = $1
            AND created_at < NOW() - ($2 || ' days')::interval
       GROUP BY organization_id, ym`,
        [retentionClass, thresholdDays],
      );
    } catch (err) {
      this.logger.error(
        `audit-log-archival bucket-query failed retentionClass=${retentionClass}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    for (const bucket of buckets ?? []) {
      try {
        await this.archiveBucket(bucket, retentionClass);
      } catch (err) {
        this.logger.error(
          `audit-log-archival bucket-failed org=${bucket.organization_id} ` +
            `ym=${bucket.ym} retentionClass=${retentionClass} ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue to next bucket; the row set is preserved (no DELETE
        // ran) and will be re-attempted on the next tick.
      }
    }
  }

  private async archiveBucket(
    bucket: BucketRow,
    retentionClass: RetentionClass,
  ): Promise<void> {
    if (!bucket.ids || bucket.ids.length === 0) return;
    const rows: unknown[] = await this.dataSource.query(
      `SELECT * FROM audit_log
        WHERE id = ANY($1::uuid[])
     ORDER BY created_at ASC, id ASC`,
      [bucket.ids],
    );
    if (rows.length === 0) return;
    const jsonl = rows.map((r) => JSON.stringify(r)).join('\n');
    const gz = await gzipAsync(Buffer.from(jsonl, 'utf8'));
    const writeResult = await this.storage.write(
      bucket.organization_id,
      bucket.ym,
      gz,
    );
    // Write succeeded — only NOW are we allowed to delete.
    await this.dataSource.query(
      `DELETE FROM audit_log WHERE id = ANY($1::uuid[])`,
      [bucket.ids],
    );
    // Per-bucket operational envelope. organizationId is the aggregate
    // (a valid uuid for the FK / column type); the bucket coordinates
    // live in payloadAfter so a single row is keyed by org but tagged
    // with retentionClass+yearMonth.
    const envelope: AuditEventEnvelope = {
      organizationId: bucket.organization_id,
      aggregateType: 'organization',
      aggregateId: bucket.organization_id,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: {
        retentionClass,
        yearMonth: bucket.ym,
        rowCount: rows.length,
        bytes: writeResult.bytes,
        path: writeResult.path,
      },
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.AUDIT_LOG_ARCHIVAL_BATCH,
      envelope,
      this.logger,
    );
    this.logger.log(
      `audit-log-archival.emitted org=${bucket.organization_id} ` +
        `ym=${bucket.ym} retentionClass=${retentionClass} ` +
        `rowCount=${rows.length} bytes=${writeResult.bytes} ` +
        `path=${writeResult.path}`,
    );
  }
}
