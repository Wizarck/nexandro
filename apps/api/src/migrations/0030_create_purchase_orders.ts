import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.2 — m3-po-aggregate: PurchaseOrder + PurchaseOrderLine foundation.
 *
 * Per Gate D 2026-05-14: foundation slice for procurement.po BC.
 * Creates three tables:
 *  - `purchase_orders` (15 cols) — PO header with state machine + money totals
 *  - `purchase_order_lines` (12 cols + FK col) — ordered ingredients with VAT math
 *  - `po_counters` (3 cols) — per-org monotonic counter for human-readable PO numbers
 *
 * Schema rationale (design.md):
 * - `numeric(18,4)` for every money column (ADR-PO-VAT-MONEY-FIELDS) —
 *   matches M2 ingredient.quantity_per_unit + slice #1 lots.quantity_received.
 * - `currency` enforced via `length(currency) = 3` CHECK (ISO 4217 alpha-3).
 * - `state` CHECK enforces six-state enum at DB level (defense in depth beyond
 *   the application state machine).
 * - `supplier_id` NOT NULL with NO ACTION on delete (ADR-PO-SUPPLIER-FK): supplier
 *   soft-delete via `isActive=false` keeps PO history intact.
 * - `purchase_order_lines.organization_id` is DENORMALIZED to support the
 *   multi-tenant repo gate without joining `purchase_orders` on every query.
 * - `po_counters` is row-locked via `SELECT ... FOR UPDATE` for monotonic
 *   allocation (ADR-PO-NUMBER-FORMAT); same pattern as M2 agent_idempotency_keys.
 *
 * Three indexes on `purchase_orders` (ADR-PO-INDEXES, each anchored to a query):
 * 1. `idx_po_org_supplier_created` — buyer history (slice #8 UI, slice #11 recall)
 * 2. `idx_po_org_state_expected_delivery` (partial) — ops dashboard active POs
 * 3. UNIQUE `idx_po_org_number_unique` — per-org PO-number uniqueness (defense)
 *
 * NOT in this migration: GR confirmation (slice #7), audit-log subscriber
 * registration (slice #21), operator UI (slice #8).
 */
export class CreatePurchaseOrders1700000030000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "purchase_orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "supplier_id" uuid NOT NULL,
        "po_number" text NOT NULL,
        "state" text NOT NULL DEFAULT 'draft',
        "currency" text NOT NULL,
        "subtotal" numeric(18,4) NOT NULL DEFAULT 0,
        "vat_total" numeric(18,4) NOT NULL DEFAULT 0,
        "total" numeric(18,4) NOT NULL DEFAULT 0,
        "expected_delivery_date" date NULL,
        "notes" text NULL,
        "created_by_user_id" uuid NOT NULL,
        "sent_at" timestamptz NULL,
        "closed_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "po_state_check"
          CHECK ("state" IN ('draft','sent','partially_received','received','closed','cancelled')),
        CONSTRAINT "po_currency_check"
          CHECK (length("currency") = 3),
        CONSTRAINT "fk_po_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
        CONSTRAINT "fk_po_supplier"
          FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION,
        CONSTRAINT "fk_po_created_by_user"
          FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "purchase_order_lines" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "purchase_order_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "line_number" int NOT NULL,
        "ingredient_id" uuid NOT NULL,
        "quantity_ordered" numeric(18,4) NOT NULL,
        "unit" text NOT NULL,
        "unit_price" numeric(18,4) NOT NULL,
        "vat_rate" numeric(5,4) NOT NULL DEFAULT 0,
        "vat_inclusive" boolean NOT NULL DEFAULT false,
        "line_subtotal" numeric(18,4) NOT NULL,
        "line_vat" numeric(18,4) NOT NULL,
        "line_total" numeric(18,4) NOT NULL,
        CONSTRAINT "po_line_unit_check"
          CHECK ("unit" IN ('kg','g','L','ml','un')),
        CONSTRAINT "po_line_quantity_positive"
          CHECK ("quantity_ordered" > 0),
        CONSTRAINT "po_line_unit_price_non_negative"
          CHECK ("unit_price" >= 0),
        CONSTRAINT "po_line_unique_line_number"
          UNIQUE ("purchase_order_id", "line_number"),
        CONSTRAINT "fk_po_line_purchase_order"
          FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_po_line_ingredient"
          FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "po_counters" (
        "organization_id" uuid NOT NULL,
        "year" int NOT NULL,
        "next_value" int NOT NULL DEFAULT 1,
        CONSTRAINT "po_counters_pk"
          PRIMARY KEY ("organization_id", "year")
      );
    `);

    // Index 1: buyer history — "show last N POs for supplier X"
    await queryRunner.query(`
      CREATE INDEX "idx_po_org_supplier_created"
        ON "purchase_orders" ("organization_id", "supplier_id", "created_at" DESC);
    `);

    // Index 2: ops dashboard — active POs sorted by expected delivery
    // Partial index excludes draft + terminal states; if active states ever change,
    // update this WHERE list (and the spec scenario asserting its shape).
    await queryRunner.query(`
      CREATE INDEX "idx_po_org_state_expected_delivery"
        ON "purchase_orders" ("organization_id", "state", "expected_delivery_date")
        WHERE "state" IN ('sent','partially_received');
    `);

    // Index 3: UNIQUE per-org PO-number enforcement (defense in depth beyond counter)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_po_org_number_unique"
        ON "purchase_orders" ("organization_id", "po_number");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_po_org_number_unique";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_po_org_state_expected_delivery";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_po_org_supplier_created";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_order_lines";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_orders";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_counters";`);
  }
}
