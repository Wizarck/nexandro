import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.4 — m3-ai-obs-budget-tier-emitter (slice #19/22).
 *
 * Creates the `ai_usage_rollup` table — per-(organization, period_yyyy_mm)
 * aggregate of AI spend telemetry, upserted on a 5-minute cron by
 * `RollupSchedulerService`. Per ADR-030 sub-decision "Rollup table" + this
 * slice's `design.md` ADR-AI-USAGE-ROLLUP-TABLE.
 *
 * Also adds `organizations.ai_monthly_budget_eur numeric(12,2) NULL` —
 * per-tenant monthly budget (NULL = unlimited; tier evaluation
 * short-circuits per ADR-NULL-BUDGET-UNLIMITED).
 *
 * Schema rationale (design.md ADR-AI-USAGE-ROLLUP-TABLE):
 *
 * - Composite PK `(organization_id, period_yyyy_mm)` — exactly one row per
 *   (org, month). Avoids a surrogate `id uuid` + unique index; PK is the
 *   `INSERT … ON CONFLICT` conflict target.
 *
 * - `period_yyyy_mm text NOT NULL` — `YYYY-MM` format (regex-checked).
 *   Self-documenting + lexicographic chronological ordering.
 *
 * - `total_cost_eur numeric(15,4)` — matches M2 money convention (4-decimal
 *   internal precision; 2-decimal display at the DTO layer).
 *
 * - `total_input_tokens bigint` + `total_output_tokens bigint` — a busy org
 *   accumulates 10⁹+ tokens/year; `integer` (~2.1 B) is too small at the
 *   multi-year horizon.
 *
 * - `tier_crossed_at jsonb DEFAULT '{}'` — per-tier first-crossing timestamps
 *   atomic with the rollup upsert (ADR-NO-EMIT-DUPLICATE). Avoids a separate
 *   `tier_emitted_log` table with its own idempotency contract.
 *
 * - `last_aggregated_at timestamptz` — NOT a `@CreateDateColumn` (TypeORM
 *   creates would conflict with the upsert semantics); explicit column the
 *   scheduler sets on every successful tick.
 *
 * Index `ix_ai_usage_rollup_period_last_agg`: covers the scheduler's
 * "enumerate orgs active in the current period" enumeration query.
 *
 * NOT in this migration: backfill of historical rollup rows (the table
 * starts populated by the next scheduler tick; no `INSERT INTO ai_usage_rollup
 * SELECT ...` from the audit_log).
 */
export class CreateAiUsageRollup1700000032000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ai_usage_rollup — append/upsert ledger
    await queryRunner.query(`
      CREATE TABLE "ai_usage_rollup" (
        "organization_id" uuid NOT NULL,
        "period_yyyy_mm" text NOT NULL,
        "total_cost_eur" numeric(15,4) NOT NULL DEFAULT 0,
        "total_calls" integer NOT NULL DEFAULT 0,
        "total_input_tokens" bigint NOT NULL DEFAULT 0,
        "total_output_tokens" bigint NOT NULL DEFAULT 0,
        "last_aggregated_at" timestamptz NOT NULL DEFAULT now(),
        "tier_crossed_at" jsonb NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT "pk_ai_usage_rollup"
          PRIMARY KEY ("organization_id", "period_yyyy_mm"),
        CONSTRAINT "ai_usage_rollup_period_format_check"
          CHECK ("period_yyyy_mm" ~ '^\\d{4}-\\d{2}$'),
        CONSTRAINT "ai_usage_rollup_total_cost_non_negative"
          CHECK ("total_cost_eur" >= 0),
        CONSTRAINT "ai_usage_rollup_total_calls_non_negative"
          CHECK ("total_calls" >= 0),
        CONSTRAINT "fk_ai_usage_rollup_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);

    // Index for scheduler's "active orgs this period" enumeration
    await queryRunner.query(`
      CREATE INDEX "ix_ai_usage_rollup_period_last_agg"
        ON "ai_usage_rollup" ("period_yyyy_mm", "last_aggregated_at" DESC);
    `);

    // Per-tenant monthly budget (NULL = unlimited per ADR-NULL-BUDGET-UNLIMITED)
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN "ai_monthly_budget_eur" numeric(12,2) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        DROP COLUMN IF EXISTS "ai_monthly_budget_eur";
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_ai_usage_rollup_period_last_agg";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_usage_rollup";`);
  }
}
