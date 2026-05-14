import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.3 — m3-audit-log-hash-chain-hardening (slice #21): add the
 * `retention_class` metadata column to `audit_log` per
 * ADR-AUDIT-RETENTION-CLASS (slice #21 design.md).
 *
 * Schema additions:
 *  - `retention_class text NOT NULL DEFAULT 'operational'`
 *    CHECK in (`regulatory`, `operational`, `ephemeral`).
 *  - `ix_audit_log_retention` btree on
 *    `(organization_id, retention_class, created_at DESC)` — drives
 *    the future cold-storage archival query path (M3.x follow-up).
 *
 * Backfill: targeted UPDATE keyed on `event_type`:
 *  - `regulatory` set for HACCP + EU 178/2002 footprint events:
 *    AGENT_ACTION_FORENSIC, LOT_CONSUMED, LOT_EXPIRY_NEAR, GR_CONFIRMED,
 *    COST_SNAPSHOT_RECORDED, PO_RECEIVED_FULL, PO_RECEIVED_PARTIAL,
 *    LOT_CREATED, STOCK_MOVE_CREATED.
 *  - `ephemeral` set for AGENT_ACTION_EXECUTED (lean request audit, 90-day
 *    rolling).
 *  - everything else keeps the DEFAULT 'operational'.
 *
 * Idempotent on re-run: ADD COLUMN IF NOT EXISTS; the UPDATE statements
 * are keyed on event_type so they converge to the same end state on every
 * run.
 */
export class AuditLogRetentionClass1700000024000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "audit_log"
      ADD COLUMN IF NOT EXISTS "retention_class" text NOT NULL DEFAULT 'operational'
    `);
    // CHECK constraint added separately so re-runs after a partial apply
    // don't error on a duplicate constraint name.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_retention_class_check'
        ) THEN
          ALTER TABLE "audit_log"
          ADD CONSTRAINT "audit_log_retention_class_check"
          CHECK ("retention_class" IN ('regulatory', 'operational', 'ephemeral'));
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_audit_log_retention"
      ON "audit_log"
      ("organization_id", "retention_class", "created_at" DESC)
    `);

    // Promote regulatory rows.
    await queryRunner.query(`
      UPDATE "audit_log"
      SET "retention_class" = 'regulatory'
      WHERE "event_type" IN (
        'AGENT_ACTION_FORENSIC',
        'LOT_CONSUMED',
        'LOT_EXPIRY_NEAR',
        'GR_CONFIRMED',
        'COST_SNAPSHOT_RECORDED',
        'PO_RECEIVED_FULL',
        'PO_RECEIVED_PARTIAL',
        'LOT_CREATED',
        'STOCK_MOVE_CREATED'
      )
      AND "retention_class" <> 'regulatory'
    `);

    // Promote ephemeral rows.
    await queryRunner.query(`
      UPDATE "audit_log"
      SET "retention_class" = 'ephemeral'
      WHERE "event_type" = 'AGENT_ACTION_EXECUTED'
      AND "retention_class" <> 'ephemeral'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_retention"`);
    await queryRunner.query(`
      ALTER TABLE "audit_log"
      DROP CONSTRAINT IF EXISTS "audit_log_retention_class_check"
    `);
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "retention_class"`,
    );
  }
}
