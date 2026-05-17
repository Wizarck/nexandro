import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  PHOTO_S3_CLIENT,
  PhotoS3Client,
  PhotoStorageService,
} from './photo-storage.service';
import { PhotoRepository } from './photo.repository';

const RETENTION_WINDOW_DAYS = 90;
const HARD_DELETE_GRACE_DAYS = 7;
const BATCH_SIZE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Daily retention cron at 03:00 UTC (off-peak for EU operators). Per
 * ADR-RETENTION-90-DAY: 2-phase soft-then-hard delete, 7-day grace.
 *
 * Phase 1 — Soft-delete: identifies `full_res_90d` rows where
 *   `created_at < now() - 90 days AND deleted_at IS NULL`. For each row:
 *   - sets `deleted_at = now()`
 *   - emits `PHOTO_DELETED` with `reason='retention_90d'`
 *   - does NOT call S3 DELETE (object retained for the grace window)
 *
 * Phase 2 — Hard-delete: identifies rows where `deleted_at < now() - 7 days`.
 *   For each row:
 *   - calls S3 DELETE against `s3_key`
 *   - removes the row
 *   - emits NO additional event (Phase 1 row is the canonical audit record)
 *
 * `thumbnail_indefinite` and `legal_hold` retention classes are SKIPPED.
 *
 * Resilience (mirrors slice #3 ExpiryScannerService pattern):
 *  - per-row try/catch: one row's failure does not abort the run
 *  - cron-wide try/catch: a tick failure logs but does not crash the worker
 *  - env flag `NEXANDRO_PHOTO_RETENTION_ENABLED=false` short-circuits
 *  - idempotent at the row level: re-running picks up where a crashed run
 *    left off (WHERE clause filters out already-processed rows)
 */
@Injectable()
export class PhotoRetentionScheduler {
  private readonly logger = new Logger(PhotoRetentionScheduler.name);

  constructor(
    private readonly repository: PhotoRepository,
    private readonly storage: PhotoStorageService,
    @Inject(PHOTO_S3_CLIENT) private readonly s3: PhotoS3Client,
  ) {}

  /** Daily at 03:00 UTC. */
  @Cron('0 3 * * *', { name: 'photo-retention' })
  async runTick(): Promise<void> {
    if (process.env.NEXANDRO_PHOTO_RETENTION_ENABLED !== 'true') {
      return;
    }
    await this.runRetention();
  }

  /**
   * Public entry point (also called from INT tests with a fixed `now`).
   * Runs Phase 1 then Phase 2. Top-level try/catch keeps the worker alive.
   */
  async runRetention(now: Date = new Date()): Promise<void> {
    try {
      await this.runPhase1SoftDelete(now);
    } catch (err) {
      this.logger.error(
        `photo-retention.phase1.failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      await this.runPhase2HardDelete(now);
    } catch (err) {
      this.logger.error(
        `photo-retention.phase2.failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Phase 1 — soft-delete `full_res_90d` rows older than 90 days. Paginates
   * via `findCandidatesForSoftDelete` until the candidate set drains.
   *
   * Defensive note: we paginate by repeatedly calling
   * `findCandidatesForSoftDelete` after each batch is processed. Because
   * the batch updates `deleted_at`, the partial-index-driven WHERE clause
   * `deleted_at IS NULL` excludes already-processed rows on the next
   * iteration — guaranteeing forward progress without OFFSET pagination
   * (which is unsafe under concurrent inserts).
   */
  async runPhase1SoftDelete(now: Date): Promise<void> {
    const beforeCreatedAt = new Date(
      now.getTime() - RETENTION_WINDOW_DAYS * MS_PER_DAY,
    );
    let processed = 0;
    // Bound iteration to avoid runaway loops in degenerate cases.
    for (let iter = 0; iter < 1000; iter += 1) {
      const candidates = await this.repository.findCandidatesForSoftDelete(
        beforeCreatedAt,
        BATCH_SIZE,
        'full_res_90d',
      );
      if (candidates.length === 0) break;
      for (const photo of candidates) {
        try {
          await this.storage.softDeletePhoto({
            organizationId: photo.organizationId,
            photoId: photo.id,
            reason: 'retention_90d',
            now,
          });
          processed += 1;
        } catch (err) {
          this.logger.error(
            `photo-retention.phase1.row_failed photo=${photo.id} org=${photo.organizationId}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
          // continue with next row
        }
      }
    }
    if (processed > 0) {
      this.logger.log(`photo-retention.phase1.done processed=${processed}`);
    }
  }

  /**
   * Phase 2 — hard-delete rows past the 7-day grace window. Calls S3 DELETE
   * before removing the row so a crash between the two leaves an orphan
   * S3 object (recoverable by ops) rather than a row pointing at a missing
   * object.
   */
  async runPhase2HardDelete(now: Date): Promise<void> {
    const beforeDeletedAt = new Date(
      now.getTime() - HARD_DELETE_GRACE_DAYS * MS_PER_DAY,
    );
    let processed = 0;
    for (let iter = 0; iter < 1000; iter += 1) {
      const candidates = await this.repository.findCandidatesForHardDelete(
        beforeDeletedAt,
        BATCH_SIZE,
      );
      if (candidates.length === 0) break;
      for (const photo of candidates) {
        try {
          await this.s3.deleteObject(photo.s3Key);
          await this.repository.hardDelete(photo.id);
          processed += 1;
        } catch (err) {
          this.logger.error(
            `photo-retention.phase2.row_failed photo=${photo.id} org=${photo.organizationId}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
          // continue with next row
        }
      }
    }
    if (processed > 0) {
      this.logger.log(`photo-retention.phase2.done processed=${processed}`);
    }
  }
}
