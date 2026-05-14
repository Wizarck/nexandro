import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.5 — m3-incident-search-multi-anchor: 3 search indexes per
 * ADR-031 supporting FR14 multi-anchor incident search at NFR-PERF-1
 * (p95 < 500ms at 100k audit_log events).
 *
 * Slot reserved per `master/docs/openspec-slice-module-3.md` line 117 for
 * slice #11 `m3-incident-search-multi-anchor`; gotcha range 100-109.
 *
 * Indexes created:
 *
 * 1. `idx_audit_log_org_lot_code` — compound partial GIN on
 *    `(organization_id, payload_after->>'lot_code')` WHERE
 *    `payload_after->>'lot_code' IS NOT NULL`. Accelerates the lot-code
 *    anchored search path against the audit_log envelope. Partial WHERE
 *    keeps the index narrow (only LOT_* event types populate the
 *    extracted key).
 *
 * 2. `idx_suppliers_name_trgm` — trigram GIN on `suppliers.name` using
 *    `gin_trgm_ops` for mid-substring `ILIKE '%query%'` autocomplete.
 *
 * 3. `idx_ingredients_name_trgm` — trigram GIN on `ingredients.name` using
 *    `gin_trgm_ops` for mid-substring `ILIKE '%query%'` autocomplete.
 *
 * The `(organization_id, supplier_id, received_at DESC)` index on `lots`
 * required by the lot anchor path is ALREADY present from slice #1
 * migration 0026 (`idx_lots_org_supplier_received`); this migration does
 * NOT re-create it.
 *
 * `pg_trgm` extension is already enabled by migration 0010
 * (`create_external_food_catalog`); a defensive `CREATE EXTENSION IF NOT
 * EXISTS` is included for self-contained replay.
 */
export class AddRecallSearchIndexes1700000035000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Defensive: pg_trgm is enabled by migration 0010. No-op when already
    // present; required for the trigram GIN indexes below.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // Index 1: audit_log lot-code anchor. Partial GIN keyed on the
    // organization + extracted lot_code; the partial WHERE drops every
    // audit row whose payload does not carry a lot_code (most M2 events
    // + many M3 events), keeping the index narrow.
    //
    // Functional B-tree (not GIN) chosen for the extracted text key —
    // GIN on a single jsonb extraction has no advantage over B-tree at
    // single-value cardinality. The partial WHERE is the dominant cost-
    // saver here.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_log_org_lot_code"
        ON "audit_log" ("organization_id", (("payload_after"->>'lot_code')))
        WHERE "payload_after"->>'lot_code' IS NOT NULL;
    `);

    // Index 2: suppliers.name trigram GIN. Supports the supplier anchor's
    // `ILIKE '%query%'` substring match.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_suppliers_name_trgm"
        ON "suppliers" USING gin ("name" gin_trgm_ops);
    `);

    // Index 3: ingredients.name trigram GIN.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_ingredients_name_trgm"
        ON "ingredients" USING gin ("name" gin_trgm_ops);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ingredients_name_trgm";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_suppliers_name_trgm";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_log_org_lot_code";`,
    );
    // pg_trgm intentionally NOT dropped — shared with migration 0010
    // (external_food_catalog name trigram).
  }
}
