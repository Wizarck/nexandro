import { createHash } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.3 — m3-audit-log-hash-chain-hardening (slice #21): add the
 * tamper-evident SHA-256 hash chain across `audit_log` per ADR-AUDIT-HASH-CHAIN
 * (slice #21 design.md).
 *
 * Schema additions:
 *  - `row_hash bytea NULL` — SHA-256 over `(prev_hash || canonical_json)`.
 *    Nullable in the column definition for the backfill window; new
 *    application writes always populate it. A follow-up migration may
 *    promote to NOT NULL after a verified backfill window.
 *  - `prev_hash bytea NULL` — previous row's `row_hash` within the same
 *    tenant. `NULL` for the first row per tenant.
 *  - `ix_audit_log_chain` btree on `(organization_id, created_at DESC,
 *    id DESC)` — drives the 100-row lookback window per
 *    ADR-HASH-CHAIN-VALIDATION-PER-WRITE.
 *
 * Backfill: visit every existing row in `(organization_id ASC,
 * created_at ASC, id ASC)` order; compute `prev_hash` from the prior
 * row's `row_hash`; compute `row_hash` from
 * `SHA-256(prev_hash || canonical_json(row))`. Guard with
 * `WHERE row_hash IS NULL` so re-running the migration is a no-op.
 *
 * Canonicalisation rules MUST match `audit-log-hash-chain.canonicaliseRow`
 * in the application — keys sorted alphabetically, dates as ISO-8601 UTC,
 * jsonb canonicalised recursively. The application layer is the source
 * of truth; this migration computes the same hash in a pure-JS pass so
 * the chain integrity is unbroken at the migration → first-app-write
 * boundary.
 */
export class AuditLogHashChain1700000023000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }

    // Schema additions (idempotent via IF NOT EXISTS).
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "row_hash" bytea NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "prev_hash" bytea NULL`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_audit_log_chain"
      ON "audit_log"
      ("organization_id", "created_at" DESC, "id" DESC)
    `);

    // Backfill in tenant-scoped chronological order. Streamed in
    // tenant batches so memory stays bounded (one tenant at a time).
    const orgs: Array<{ organization_id: string }> = await queryRunner.query(
      `SELECT DISTINCT "organization_id" FROM "audit_log" WHERE "row_hash" IS NULL`,
    );
    for (const { organization_id: orgId } of orgs) {
      await this.backfillTenant(queryRunner, orgId);
    }
  }

  private async backfillTenant(
    queryRunner: QueryRunner,
    organizationId: string,
  ): Promise<void> {
    const rows: AuditRowShape[] = await queryRunner.query(
      `SELECT "id", "organization_id", "event_type", "aggregate_type",
              "aggregate_id", "actor_user_id", "actor_kind", "agent_name",
              "payload_before", "payload_after", "reason", "citation_url",
              "snippet", "created_at"
       FROM "audit_log"
       WHERE "organization_id" = $1 AND "row_hash" IS NULL
       ORDER BY "created_at" ASC, "id" ASC`,
      [organizationId],
    );

    let prevHash: Buffer | null = null;
    // Look up the prior row's row_hash to chain into existing
    // already-backfilled rows (if any; defends against partial-rerun).
    const priorRows: Array<{ row_hash: Buffer | null }> = await queryRunner.query(
      `SELECT "row_hash" FROM "audit_log"
       WHERE "organization_id" = $1 AND "row_hash" IS NOT NULL
       ORDER BY "created_at" DESC, "id" DESC LIMIT 1`,
      [organizationId],
    );
    if (priorRows.length > 0 && priorRows[0].row_hash !== null) {
      prevHash = priorRows[0].row_hash;
    }

    for (const row of rows) {
      const canonical = canonicaliseRowSql(row);
      const rowHash = computeRowHash(prevHash, canonical);
      await queryRunner.query(
        `UPDATE "audit_log" SET "row_hash" = $1, "prev_hash" = $2 WHERE "id" = $3`,
        [rowHash, prevHash, row.id],
      );
      prevHash = rowHash;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_chain"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "prev_hash"`);
    await queryRunner.query(`ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "row_hash"`);
  }
}

// ---------- canonicalisation + hash (mirrors audit-log-hash-chain.ts) ----------

interface AuditRowShape {
  id: string;
  organization_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_user_id: string | null;
  actor_kind: string;
  agent_name: string | null;
  payload_before: unknown;
  payload_after: unknown;
  reason: string | null;
  citation_url: string | null;
  snippet: string | null;
  created_at: Date;
}

function canonicaliseRowSql(row: AuditRowShape): string {
  const ordered: Record<string, unknown> = {
    actorKind: row.actor_kind,
    actorUserId: row.actor_user_id,
    aggregateId: row.aggregate_id,
    aggregateType: row.aggregate_type,
    agentName: row.agent_name,
    citationUrl: row.citation_url,
    createdAt: new Date(row.created_at).toISOString(),
    eventType: row.event_type,
    organizationId: row.organization_id,
    payloadAfter: canonicaliseValue(row.payload_after),
    payloadBefore: canonicaliseValue(row.payload_before),
    reason: row.reason,
    snippet: row.snippet,
  };
  return JSON.stringify(ordered);
}

function canonicaliseValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicaliseValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicaliseValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

function computeRowHash(prevHash: Buffer | null, canonical: string): Buffer {
  const h = createHash('sha256');
  h.update(prevHash ?? Buffer.alloc(0));
  h.update(canonical, 'utf8');
  return h.digest();
}
