import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.2 — m3-cost-snapshot-persistence: append-only cost-at-consumption
 * snapshot ledger.
 *
 * Per Gate D 2026-05-14: foundation for FR7 traceability (EU 178/2002 +
 * HACCP regulatory retention) and downstream rollup surfaces (slice #20 AI
 * obs dashboard "cost by tag" / "cost by capability", future recall dossier
 * financial section, recipe P&L exporter).
 *
 * Each row is the immutable record of "for stock_move X, the system resolved
 * a CostResolution of €Y across these N lots at unit cost C_i" — frozen at
 * consumption time so an auditor can reconstruct cost basis weeks later
 * even after lot state has moved on.
 *
 * Schema rationale (ADR-SNAPSHOT-SCHEMA in design.md):
 * - `numeric(18,4)` for `qty_consumed` + `total_cost` — matches slice #1
 *   (lots.quantity_received, stock_moves.quantity) precision; 4dp suffices
 *   for €0.0001 unit-cost precision.
 * - `breakdown` jsonb (array of {lot_id, qty, unit_cost, subtotal}) —
 *   denormalised per ADR-SNAPSHOT-SCHEMA rationale; 95% of consumptions are
 *   single/2-lot so a side-table would add 100% write amplification.
 * - `lot_id` dominant-lot column alongside JSONB breakdown so recall-trace
 *   queries (slice #11) can predicate on a btree column not a GIN expression.
 * - `correlation_id` propagated from LotConsumed envelope (or generated
 *   defensively); per NFR-OBS-2 (ADR-030) lets the snapshot join the OTel
 *   trace if the consumption was AI-mediated.
 * - `strategy` text enum enforced via Postgres CHECK; matches slice #4
 *   CostResolution.strategy ('fifo' | 'fefo' | 'manual').
 * - `total_cost` CHECK >= 0 — corrections that zero out a prior snapshot
 *   are legitimate (strategy='manual' with empty subtotal sum).
 * - `qty_consumed` CHECK > 0 — consumption events never carry zero qty.
 * - `product_id` is a soft FK (validated app-side) to avoid coupling to
 *   M2 ingredients table migration order; FKs to lots(id) + stock_moves(id)
 *   are hard.
 *
 * Two indexes (ADR-SNAPSHOT-INDEX, each anchored to a downstream query):
 * 1. `idx_cost_snapshots_org_move_created` — per-consumption back-reference
 *    (slice #20 hover detail + recall dossier financial section).
 * 2. `idx_cost_snapshots_org_product_created` (partial, total_cost>0) —
 *    "cost by product over 30d" rollup hot path (slice #20 widget).
 *
 * Append-only is enforced at the application layer (CostSnapshotRepository
 * refuses UPDATE/DELETE methods); the database table has no triggers blocking
 * raw SQL UPDATE/DELETE — operational policy plus app contract per
 * ADR-SNAPSHOT-IMMUTABLE.
 *
 * NOT in this migration: AuditLogSubscriber registration for
 * COST_SNAPSHOT_RECORDED (slice #21 owns), JSONB GIN index on breakdown
 * (premature; ADR-SNAPSHOT-INDEX rationale), 7-year cold-storage archival
 * (deferred to m3.x-cost-snapshot-archival per ADR-SNAPSHOT-RETENTION).
 */
export class CreateCostSnapshotsTable1700000029000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cost_snapshots" (
        "snapshot_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "stock_move_id" uuid NOT NULL,
        "lot_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "strategy" text NOT NULL,
        "qty_consumed" numeric(18,4) NOT NULL,
        "total_cost" numeric(18,4) NOT NULL,
        "breakdown" jsonb NOT NULL,
        "correlation_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "cost_snapshots_strategy_check"
          CHECK ("strategy" IN ('fifo','fefo','manual')),
        CONSTRAINT "cost_snapshots_qty_consumed_positive"
          CHECK ("qty_consumed" > 0),
        CONSTRAINT "cost_snapshots_total_cost_non_negative"
          CHECK ("total_cost" >= 0),
        CONSTRAINT "fk_cost_snapshots_stock_move"
          FOREIGN KEY ("stock_move_id") REFERENCES "stock_moves"("id"),
        CONSTRAINT "fk_cost_snapshots_lot"
          FOREIGN KEY ("lot_id") REFERENCES "lots"("id"),
        CONSTRAINT "fk_cost_snapshots_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);

    // Index 1: per-consumption back-reference (slice #20 hover detail,
    // recall dossier financial section). Compound (org, move, created DESC)
    // supports both the equality lookup and the ORDER BY DESC LIMIT 1 used
    // by latest-cost-basis queries when a manual correction exists.
    await queryRunner.query(`
      CREATE INDEX "idx_cost_snapshots_org_move_created"
        ON "cost_snapshots" ("organization_id", "stock_move_id", "created_at" DESC);
    `);

    // Index 2: product-level rollup hot path (slice #20 "cost by product
    // over 30d" widget). Partial on total_cost > 0 excludes the rare
    // zero-cost correction snapshots; saves ~5% on index size at the
    // 22 GB/year growth target. Documented for slice #20 EXPLAIN ANALYZE
    // proof per REQ-SS-9.
    await queryRunner.query(`
      CREATE INDEX "idx_cost_snapshots_org_product_created"
        ON "cost_snapshots" ("organization_id", "product_id", "created_at" DESC)
        WHERE "total_cost" > 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_cost_snapshots_org_product_created";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_cost_snapshots_org_move_created";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "cost_snapshots";`);
  }
}
