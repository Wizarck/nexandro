import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.2 — m3-lot-expiry-alerts (slice #3): expiry_alerts_fired
 * append-only log.
 *
 * Per ADR-EXPIRY-DEDUPLICATION (design.md): a separate fired-log table
 * (rather than columns on `lots`) preserves an audit trail of every
 * `LotExpiryNearEvent` emitted, isolates write contention from the hot
 * `lots` row (slice #2 consumption events also write there), and survives
 * lot-row mutation (`expires_at_snapshot` captures the value at fire time).
 *
 * Two indexes:
 *  1. `idx_expiry_alerts_fired_dedup` —
 *     `(organization_id, lot_id, alert_band, fired_at DESC)`. Hot path: the
 *     scanner's `findRecentFor(...)` dedup lookup runs once per candidate
 *     lot per tick, index-only.
 *  2. `idx_expiry_alerts_fired_org_fired` —
 *     `(organization_id, fired_at DESC)`. Supports operator-facing "what
 *     fired in the last N hours" Hermes status queries (slice #20 j8
 *     widget consumes this).
 *
 * No FK on `organization_id` by convention (matches `audit_log` — append-only
 * log tables prefer performance over referential integrity). `lot_id` keeps
 * its FK with `ON DELETE CASCADE` so test-fixture lot deletes do not leave
 * orphan rows.
 *
 * Down migration drops the table; no data depends on it outside this BC.
 */
export class CreateExpiryAlertsFiredTable1700000028000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "expiry_alerts_fired" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "lot_id" uuid NOT NULL,
        "alert_band" text NOT NULL,
        "fired_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at_snapshot" timestamptz NOT NULL,
        CONSTRAINT "expiry_alerts_fired_band_check"
          CHECK ("alert_band" IN ('t-72h','t-24h')),
        CONSTRAINT "fk_expiry_alerts_fired_lot"
          FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE CASCADE
      );
    `);

    // Dedup hot-path lookup: (org, lot, band, fired_at DESC).
    await queryRunner.query(`
      CREATE INDEX "idx_expiry_alerts_fired_dedup"
        ON "expiry_alerts_fired"
          ("organization_id", "lot_id", "alert_band", "fired_at" DESC);
    `);

    // Operator-facing recent-activity index: (org, fired_at DESC).
    await queryRunner.query(`
      CREATE INDEX "idx_expiry_alerts_fired_org_fired"
        ON "expiry_alerts_fired" ("organization_id", "fired_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_expiry_alerts_fired_org_fired";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_expiry_alerts_fired_dedup";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "expiry_alerts_fired";`);
  }
}
