import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.2 — m3-gr-aggregate-reconciliation: GoodsReceipt aggregate.
 *
 * Per Gate D 2026-05-14: creates the `goods_receipts` (header) and
 * `goods_receipt_lines` (detail) tables that close the procurement loop
 * by materializing one `lots` row per GR line on confirmation.
 *
 * Schema rationale (design.md ADR-GR-LOT-CREATION-SEAM + ADR-GR-INDEXES +
 * ADR-GR-IDEMPOTENCY + ADR-GR-INDEPENDENT-LOT-NO-PO):
 *
 * - `po_id` + `po_line_id` are NULLABLE — independent (petty-cash / direct
 *   purchase) GRs have no PO. App validator (GrConfirmationService) enforces
 *   shape coherence: either both header.po_id and ALL lines have po_line_id,
 *   or both are NULL.
 *
 * - FKs into `purchase_orders` and `purchase_order_lines` are NOT created
 *   here: slice #6 (m3-po-aggregate) ships those tables in parallel and
 *   may not be merged yet. Slice #6 will add the FKs when it merges (or a
 *   follow-up migration after both slices land). The columns are typed
 *   `uuid` so the constraint can be added later without ALTER COLUMN.
 *
 * - FK into `products` is NOT created — the canonical "product" surface
 *   has not landed; M2 uses `ingredients` and the long-term migration to
 *   a `products` table is M3.x. Column is `uuid NOT NULL`; integrity is
 *   enforced by application validators until the FK lands.
 *
 * - `unit_price_actual numeric(12,4)` per ADR-GR-MONEY-PRECISION.
 *   Quantities use numeric(18,4) to match `lots.quantity_received`.
 *
 * - `received_at_location_id` is NOT NULL — every GR happens at a kitchen
 *   location (mirrors `lots.location_id`).
 *
 * - `state text NOT NULL CHECK ('draft','confirmed','cancelled')` — matches
 *   slice #1's pattern of text + CHECK (no Postgres enum). State machine
 *   logic enforced at the application layer.
 *
 * 5 indexes (ADR-GR-INDEXES):
 * 1. `idx_gr_org_received` — ops dashboard "most recent GRs"
 * 2. `idx_gr_org_po` (partial) — PO drill-down
 * 3. `idx_gr_org_supplier_received` — supplier history / recall search
 * 4. `uniq_gr_line_po_line` (UNIQUE partial) — idempotency per ADR-GR-IDEMPOTENCY
 * 5. `idx_gr_line_gr` — parent-child join for drawer
 *
 * NOT in this migration: audit_log subscriber registration (slice #21),
 * variance threshold default rows (config lives in `organizations.metadata`).
 */
export class CreateGoodsReceiptsTables1700000031000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Header — `goods_receipts`
    await queryRunner.query(`
      CREATE TABLE "goods_receipts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "po_id" uuid NULL,
        "supplier_id" uuid NOT NULL,
        "received_at" timestamptz NOT NULL,
        "received_at_location_id" uuid NOT NULL,
        "receiving_user_id" uuid NOT NULL,
        "supplier_invoice_ref" text NULL,
        "state" text NOT NULL DEFAULT 'draft',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "goods_receipts_state_check"
          CHECK ("state" IN ('draft','confirmed','cancelled')),
        CONSTRAINT "fk_gr_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
        CONSTRAINT "fk_gr_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id"),
        CONSTRAINT "fk_gr_location"
          FOREIGN KEY ("received_at_location_id") REFERENCES "locations"("id"),
        CONSTRAINT "fk_gr_user"
          FOREIGN KEY ("receiving_user_id") REFERENCES "users"("id")
      );
    `);

    // Detail — `goods_receipt_lines`
    await queryRunner.query(`
      CREATE TABLE "goods_receipt_lines" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "gr_id" uuid NOT NULL,
        "po_line_id" uuid NULL,
        "product_id" uuid NOT NULL,
        "qty_received_actual" numeric(18,4) NOT NULL,
        "unit_price_actual" numeric(12,4) NOT NULL,
        "lot_id_created" uuid NULL,
        "expires_at_override" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "gr_lines_qty_received_non_negative"
          CHECK ("qty_received_actual" >= 0),
        CONSTRAINT "gr_lines_unit_price_non_negative"
          CHECK ("unit_price_actual" >= 0),
        CONSTRAINT "fk_gr_lines_gr"
          FOREIGN KEY ("gr_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_gr_lines_lot"
          FOREIGN KEY ("lot_id_created") REFERENCES "lots"("id")
      );
    `);

    // Index 1: ops dashboard "most recent GRs"
    await queryRunner.query(`
      CREATE INDEX "idx_gr_org_received"
        ON "goods_receipts" ("organization_id", "received_at" DESC);
    `);

    // Index 2: PO drill-down (partial; PO-linked GRs only)
    await queryRunner.query(`
      CREATE INDEX "idx_gr_org_po"
        ON "goods_receipts" ("organization_id", "po_id")
        WHERE "po_id" IS NOT NULL;
    `);

    // Index 3: supplier history "all GRs from supplier X last N days"
    await queryRunner.query(`
      CREATE INDEX "idx_gr_org_supplier_received"
        ON "goods_receipts" ("organization_id", "supplier_id", "received_at" DESC);
    `);

    // Index 4: idempotency UNIQUE partial — same po_line_id at most once per GR
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uniq_gr_line_po_line"
        ON "goods_receipt_lines" ("gr_id", "po_line_id")
        WHERE "po_line_id" IS NOT NULL;
    `);

    // Index 5: parent-child join from header drawer
    await queryRunner.query(`
      CREATE INDEX "idx_gr_line_gr"
        ON "goods_receipt_lines" ("gr_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // FK order: drop lines first (depends on header)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_gr_line_gr";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uniq_gr_line_po_line";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "goods_receipt_lines";`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_gr_org_supplier_received";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_gr_org_po";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_gr_org_received";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "goods_receipts";`);
  }
}
