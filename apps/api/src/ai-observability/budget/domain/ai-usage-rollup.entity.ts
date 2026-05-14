import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Budget-tier name set per design.md ADR-BUDGET-TIER-LEVELS.
 * `forecast` is a separate "burn-rate projected over-budget" tier emitted by
 * `BurnRateCalculator`, NOT a threshold-based crossing.
 */
export type TierName = 'info' | 'warn' | 'error' | 'fatal' | 'forecast';

/**
 * Persisted per-tier first-crossing timestamps (ISO-8601 UTC strings).
 * Stored on the rollup row's `tier_crossed_at` jsonb column. Atomic with
 * the rollup upsert per ADR-NO-EMIT-DUPLICATE.
 */
export type TierCrossedAt = Partial<Record<TierName, string>>;

/**
 * TypeORM returns numeric columns as strings (postgres protocol); convert
 * to JS number for application code. Hoisted above the @Entity declaration
 * so the decorator factory captures the function reference at class-eval
 * time — Wave 2.1 typing-cascade lesson (TS6059 / CJS hoist).
 */
const numericTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number =>
    value === null ? 0 : Number.parseFloat(value),
};

/** Same shape for `bigint` columns — postgres returns string for bigint too. */
const bigintTransformer = {
  to: (value: number): number => value,
  from: (value: string | null): number =>
    value === null ? 0 : Number.parseInt(value, 10),
};

/**
 * Per-(organization, period_yyyy_mm) aggregate of AI spend telemetry.
 * Upserted on a 5-minute cron by `RollupSchedulerService` via
 * `INSERT … ON CONFLICT (organization_id, period_yyyy_mm) DO UPDATE`.
 *
 * Tier-crossing idempotency is anchored on this same row's `tier_crossed_at`
 * jsonb column (ADR-NO-EMIT-DUPLICATE). The next-month rollup row starts
 * with `tier_crossed_at = {}` so the tier set resets at month boundary.
 *
 * Mutation flows owned by:
 *  - inserts → `AiUsageRollupRepository.upsertAggregate()` (scheduler)
 *  - reads → `AiUsageRollupRepository.findByPeriod()`,
 *            `findActiveOrgsInPeriod()` (scheduler + slice #20 dashboard)
 *
 * Multi-tenant invariant enforced at the repository layer (organizationId
 * is the first parameter on every public method).
 */
@Entity({ name: 'ai_usage_rollup' })
@Index('ix_ai_usage_rollup_period_last_agg', ['periodYyyyMm', 'lastAggregatedAt'])
export class AiUsageRollup {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @PrimaryColumn({ name: 'period_yyyy_mm', type: 'text' })
  periodYyyyMm!: string;

  @Column({
    name: 'total_cost_eur',
    type: 'numeric',
    precision: 15,
    scale: 4,
    default: 0,
    transformer: numericTransformer,
  })
  totalCostEur!: number;

  @Column({
    name: 'total_calls',
    type: 'integer',
    default: 0,
  })
  totalCalls!: number;

  @Column({
    name: 'total_input_tokens',
    type: 'bigint',
    default: 0,
    transformer: bigintTransformer,
  })
  totalInputTokens!: number;

  @Column({
    name: 'total_output_tokens',
    type: 'bigint',
    default: 0,
    transformer: bigintTransformer,
  })
  totalOutputTokens!: number;

  /**
   * Set by `RollupSchedulerService.tick()` on every successful upsert.
   * Intentionally NOT `@CreateDateColumn`/`@UpdateDateColumn` — explicit
   * column the scheduler controls (matches the upsert-semantics design).
   */
  @Column({ name: 'last_aggregated_at', type: 'timestamptz' })
  lastAggregatedAt!: Date;

  @Column({ name: 'tier_crossed_at', type: 'jsonb', default: () => `'{}'::jsonb` })
  tierCrossedAt: TierCrossedAt = {};
}
