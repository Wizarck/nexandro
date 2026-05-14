import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.5 — m3-trace-tree-forward-reverse (slice #12).
 *
 * Per Gate D 2026-05-14: provisions the recall-traversal hot path.
 *
 * Two concerns:
 *
 * 1. Three partial B-tree expression indexes on `audit_log.payload_after`
 *    paths used by the forward + reverse recursive CTE in
 *    `apps/api/src/recall/application/trace.service.ts`:
 *       - `idx_audit_log_payload_lot_id`        — lot.id at the lot level
 *       - `idx_audit_log_payload_recipe_id`     — recipe.id at the recipe level
 *       - `idx_audit_log_payload_menu_item_id`  — menu_item.id at the menu-item level
 *
 *    Each index is partial (`WHERE … IS NOT NULL`) so it stays narrow —
 *    most audit rows don't carry these payload fields. Only `LOT_CONSUMED`
 *    (slice #2) and adjacent event types populate them, so the index
 *    covers the traversal hot path without bloating the table.
 *
 *    Per ADR-TRACE-INDEXES (design.md, this slice): B-tree expression
 *    over the text `->>` extract — the traversal pattern is equality on
 *    a scalar path (`payload_after->>'lot_id' = $1`), which B-tree on a
 *    function expression is the canonical fit for. GIN was rejected as
 *    the wrong tool for this access pattern.
 *
 * 2. Adds `organizations.recall_max_depth INT NULL` per ADR-028
 *    (architecture-m3.md lines 176-181). CHECK constraint enforces the
 *    `BETWEEN 1 AND 30` safety range; NULL means "use the module
 *    constant `RECALL_TRACE_MAX_DEPTH=10`". Operator UX to mutate this
 *    column is deferred to M3.x; today the column is read by
 *    `TraceService.resolveMaxDepth()` and honoured at query time.
 *
 * Migration slot 0036 claimed per `master/docs/openspec-slice-module-3.md`
 * line 118 (gotcha range 110-119). No conflict with slice #11
 * (which doesn't claim a migration slot).
 *
 * NOT in this migration: the recall trace tree materialized view
 * (deferred to M3.x if traversal latency becomes a bottleneck — current
 * NFR-PERF-1 budget met by the expression indexes alone).
 */
export class AddRecallTraversalIndexes1700000036000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index 1: lot-id path — forward CTE depth 1 step + reverse CTE
    // depth 1-2 step (depending on anchor kind).
    await queryRunner.query(`
      CREATE INDEX "idx_audit_log_payload_lot_id"
        ON "audit_log" ("organization_id", ("payload_after"->>'lot_id'))
        WHERE ("payload_after"->>'lot_id') IS NOT NULL;
    `);

    // Index 2: recipe-id path — forward CTE depth 2 step + reverse CTE
    // root probe (anchor.kind = 'recipe').
    await queryRunner.query(`
      CREATE INDEX "idx_audit_log_payload_recipe_id"
        ON "audit_log" ("organization_id", ("payload_after"->>'recipe_id'))
        WHERE ("payload_after"->>'recipe_id') IS NOT NULL;
    `);

    // Index 3: menu-item-id path — forward CTE depth 3 step + reverse CTE
    // root probe (anchor.kind = 'menu-item').
    await queryRunner.query(`
      CREATE INDEX "idx_audit_log_payload_menu_item_id"
        ON "audit_log" ("organization_id", ("payload_after"->>'menu_item_id'))
        WHERE ("payload_after"->>'menu_item_id') IS NOT NULL;
    `);

    // Per-org depth override per ADR-TRACE-DEPTH-CAP. Nullable; NULL means
    // "use RECALL_TRACE_MAX_DEPTH=10". CHECK enforces safety range so an
    // operator running raw SQL cannot wedge the traversal at depth 0 or
    // blow past the hard cap.
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN "recall_max_depth" integer NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "organizations_recall_max_depth_check"
        CHECK ("recall_max_depth" IS NULL OR ("recall_max_depth" BETWEEN 1 AND 30));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT IF EXISTS "organizations_recall_max_depth_check";
    `);
    await queryRunner.query(`
      ALTER TABLE "organizations" DROP COLUMN IF EXISTS "recall_max_depth";
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_log_payload_menu_item_id";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_log_payload_recipe_id";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_log_payload_lot_id";`,
    );
  }
}
