import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.1 — m3-lot-aggregate: canonical Lot entity.
 *
 * Per Gate D 2026-05-14: foundation slice for inventory.lots BC.
 * Creates the `lots` table — discrete batch of stock received at one
 * location at one time from one supplier. Five downstream M3 slices
 * (#2 consumption events, #3 expiry alerts, #4 cost resolver,
 * #7 GR reconciliation, #11-13 recall) declare FKs to lots.id.
 *
 * Schema rationale (ADR-LOT-SCHEMA in design.md):
 * - `numeric(18,4)` for quantities — matches M2 ingredient.quantity_per_unit;
 *   4 decimal places covers grams precision (0.0001 kg).
 * - `quantity_remaining` materialized (NOT derived from sum of stock_moves)
 *   so FIFO/FEFO read queries don't sum on every recipe rollup.
 *   INT test (slice #2) asserts nightly sync invariant.
 * - `unit` enum enforced via Postgres CHECK (catches direct-SQL fixtures).
 * - `supplier_id` NULL only for legacy backfill paths (M3.x);
 *   app validator enforces NOT NULL on creation in slice #7.
 * - `metadata` jsonb — open shape for supplier-specific fields
 *   (invoice_ref, vehicle_plate, arrival_temperature, supplier_lot_code).
 *
 * Three indexes (ADR-LOT-INDEXES, each anchored to a downstream query):
 * 1. `idx_lots_org_supplier_received` — recall forward-trace (slice #11-12)
 * 2. `idx_lots_org_expires_active` (partial) — expiry scans (slice #3)
 * 3. `idx_lots_org_loc_available_fifo` (partial) — FIFO/FEFO (slice #4)
 *
 * NOT in this migration: stock_moves table (0027), traversal indexes for
 * consumption graph (slice #2's migration 0037), audit_log subscriber
 * registration (slice #21).
 */
export class CreateLotsTable1700000026000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "lots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "supplier_id" uuid NULL,
        "received_at" timestamptz NOT NULL,
        "expires_at" timestamptz NULL,
        "quantity_received" numeric(18,4) NOT NULL,
        "quantity_remaining" numeric(18,4) NOT NULL,
        "unit" text NOT NULL,
        "metadata" jsonb NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "lots_unit_check"
          CHECK ("unit" IN ('kg','g','L','ml','un')),
        CONSTRAINT "lots_quantity_received_positive"
          CHECK ("quantity_received" > 0),
        CONSTRAINT "lots_quantity_remaining_non_negative"
          CHECK ("quantity_remaining" >= 0),
        CONSTRAINT "lots_quantity_remaining_le_received"
          CHECK ("quantity_remaining" <= "quantity_received"),
        CONSTRAINT "fk_lots_location"
          FOREIGN KEY ("location_id") REFERENCES "locations"("id"),
        CONSTRAINT "fk_lots_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);

    // Index 1: recall forward-trace from supplier ("all lots from X in last N days")
    await queryRunner.query(`
      CREATE INDEX "idx_lots_org_supplier_received"
        ON "lots" ("organization_id", "supplier_id", "received_at" DESC);
    `);

    // Index 2: expiry-proximity scans (slice #3) — partial index excludes shelf-stable
    await queryRunner.query(`
      CREATE INDEX "idx_lots_org_expires_active"
        ON "lots" ("organization_id", "expires_at")
        WHERE "expires_at" IS NOT NULL;
    `);

    // Index 3: FIFO/FEFO lookups (slice #4) — partial index excludes exhausted lots
    await queryRunner.query(`
      CREATE INDEX "idx_lots_org_loc_available_fifo"
        ON "lots" ("organization_id", "location_id", "quantity_remaining")
        WHERE "quantity_remaining" > 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lots_org_loc_available_fifo";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lots_org_expires_active";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lots_org_supplier_received";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lots";`);
  }
}
