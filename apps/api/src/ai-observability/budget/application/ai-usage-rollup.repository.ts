import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageRollup, TierName } from '../domain/ai-usage-rollup.entity';
import { AiUsageRollupQueryError } from '../domain/errors';

export interface UpsertAggregateInput {
  totalCostEur: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/**
 * TypeORM-backed repository for `ai_usage_rollup`.
 *
 * Multi-tenant invariant: every public method takes `organizationId` as the
 * FIRST parameter (matches slice #5 `CostSnapshotRepository` convention).
 *
 * `upsertAggregate()` uses raw SQL `INSERT … ON CONFLICT … DO UPDATE` so the
 * (org, period_yyyy_mm) PK collision is resolved atomically. TypeORM's
 * higher-level `repository.upsert()` would work but the raw query is
 * clearer + avoids the entity hydration round-trip.
 *
 * `markTierCrossed()` uses `jsonb_set` so the per-tier timestamp update is
 * atomic with whatever else the same transaction is doing.
 */
@Injectable()
export class AiUsageRollupRepository {
  constructor(
    @InjectRepository(AiUsageRollup)
    private readonly typeormRepo: Repository<AiUsageRollup>,
  ) {}

  /**
   * Read a single rollup row. Returns null when no row exists for the
   * (org, period) pair — caller is responsible for creating the row via
   * `upsertAggregate()` on the next tick.
   */
  async findByPeriod(
    organizationId: string,
    period: string,
  ): Promise<AiUsageRollup | null> {
    try {
      return await this.typeormRepo.findOne({
        where: { organizationId, periodYyyyMm: period },
      });
    } catch (err) {
      throw new AiUsageRollupQueryError(
        `findByPeriod failed: ${(err as Error).message}`,
        organizationId,
        period,
        err as Error,
      );
    }
  }

  /**
   * Atomic upsert of the rollup aggregate. On PK conflict, SUMS are
   * REPLACED (not added) — the aggregate represents the canonical state of
   * the (org, period) as computed from the OTel span source for THIS tick,
   * not a delta.
   *
   * `tier_crossed_at` is NOT modified here — that lives on its own RPC
   * (`markTierCrossed`) to keep the gate atomic with the per-tier emission
   * decision.
   *
   * `last_aggregated_at` is set to `now()` server-side so multi-instance
   * deployments (post-Redis swap follow-up) agree on the timestamp.
   */
  async upsertAggregate(
    organizationId: string,
    period: string,
    aggregate: UpsertAggregateInput,
  ): Promise<void> {
    try {
      await this.typeormRepo.query(
        `
        INSERT INTO ai_usage_rollup (
          organization_id, period_yyyy_mm,
          total_cost_eur, total_calls,
          total_input_tokens, total_output_tokens,
          last_aggregated_at, tier_crossed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), '{}'::jsonb)
        ON CONFLICT (organization_id, period_yyyy_mm) DO UPDATE
        SET
          total_cost_eur = EXCLUDED.total_cost_eur,
          total_calls = EXCLUDED.total_calls,
          total_input_tokens = EXCLUDED.total_input_tokens,
          total_output_tokens = EXCLUDED.total_output_tokens,
          last_aggregated_at = now()
        `,
        [
          organizationId,
          period,
          aggregate.totalCostEur,
          aggregate.totalCalls,
          aggregate.totalInputTokens,
          aggregate.totalOutputTokens,
        ],
      );
    } catch (err) {
      throw new AiUsageRollupQueryError(
        `upsertAggregate failed: ${(err as Error).message}`,
        organizationId,
        period,
        err as Error,
      );
    }
  }

  /**
   * Atomic per-tier crossing timestamp write via `jsonb_set`. Idempotent:
   * if the key already exists, `jsonb_set` overwrites — but the caller
   * (RollupSchedulerService) only calls this AFTER confirming the key was
   * absent in the prior read (ADR-NO-EMIT-DUPLICATE).
   */
  async markTierCrossed(
    organizationId: string,
    period: string,
    tier: TierName,
    crossedAt: Date,
  ): Promise<void> {
    try {
      await this.typeormRepo.query(
        `
        UPDATE ai_usage_rollup
        SET tier_crossed_at = jsonb_set(
          tier_crossed_at,
          ARRAY[$3]::text[],
          to_jsonb($4::text),
          true
        )
        WHERE organization_id = $1 AND period_yyyy_mm = $2
        `,
        [organizationId, period, tier, crossedAt.toISOString()],
      );
    } catch (err) {
      throw new AiUsageRollupQueryError(
        `markTierCrossed(${tier}) failed: ${(err as Error).message}`,
        organizationId,
        period,
        err as Error,
      );
    }
  }

  /**
   * Enumerate organizations with at least one rollup row in `period`.
   * Used by the scheduler to "list orgs active this period". When a fresh
   * scheduler tick begins, the SpanAggregatorPort handles enumeration;
   * this method exists for cold-cache recovery + slice #20 dashboards.
   */
  async findActiveOrgsInPeriod(period: string): Promise<string[]> {
    try {
      const rows = await this.typeormRepo.query(
        `
        SELECT DISTINCT organization_id
        FROM ai_usage_rollup
        WHERE period_yyyy_mm = $1
        ORDER BY organization_id
        `,
        [period],
      );
      return (rows as Array<{ organization_id: string }>).map((r) => r.organization_id);
    } catch (err) {
      throw new AiUsageRollupQueryError(
        `findActiveOrgsInPeriod failed: ${(err as Error).message}`,
        '<all>',
        period,
        err as Error,
      );
    }
  }
}
