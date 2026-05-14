import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.1 — m3-lot-aggregate: StockMove append-only ledger.
 *
 * Per Gate D 2026-05-14: append-only ledger of quantity flows against a Lot.
 * Stores inbound (positive) on lot creation, outbound (negative) on
 * consumption (slice #2 wires), adjustment (signed) for corrections,
 * waste (negative) for discards (M3.x scope).
 *
 * Schema rationale:
 * - `move_type` enum enforced via Postgres CHECK.
 * - `quantity` signed numeric(18,4) — sign convention enforced by application
 *   layer (slice #2 / slice #7 / future waste-flow); outbound MUST be negative.
 * - `actor_user_id` NOT NULL — every move has an accountable actor
 *   (no system-generated moves in MVP; M3.x may add for waste cron).
 * - `reason` text NULL — populated for adjustment + waste moves.
 *
 * One index: `idx_stock_moves_org_lot_created` — depletion history per lot
 * (slice #4 audits FIFO/FEFO depletion order; slice #11-12 audits recall).
 *
 * Append-only is enforced at the application layer (StockMoveRepository
 * refuses UPDATE/DELETE methods); the database table has no triggers blocking
 * raw SQL UPDATE/DELETE — operational policy plus app contract.
 *
 * NOT in this migration: consumption event subscriber (slice #2),
 * audit_log subscriber registration for STOCK_MOVE_CREATED (slice #21).
 */
export class CreateStockMovesTable1700000027000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stock_moves" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "lot_id" uuid NOT NULL,
        "move_type" text NOT NULL,
        "quantity" numeric(18,4) NOT NULL,
        "actor_user_id" uuid NOT NULL,
        "reason" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "stock_moves_move_type_check"
          CHECK ("move_type" IN ('inbound','outbound','adjustment','waste')),
        CONSTRAINT "stock_moves_quantity_non_zero"
          CHECK ("quantity" <> 0),
        CONSTRAINT "fk_stock_moves_lot"
          FOREIGN KEY ("lot_id") REFERENCES "lots"("id"),
        CONSTRAINT "fk_stock_moves_location"
          FOREIGN KEY ("location_id") REFERENCES "locations"("id"),
        CONSTRAINT "fk_stock_moves_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
        CONSTRAINT "fk_stock_moves_actor"
          FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
      );
    `);

    // Index: depletion history per lot, newest first
    await queryRunner.query(`
      CREATE INDEX "idx_stock_moves_org_lot_created"
        ON "stock_moves" ("organization_id", "lot_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_stock_moves_org_lot_created";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_moves";`);
  }
}
