import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { OrganizationRepository } from '../../../iam/infrastructure/organization.repository';
import type { TierCrossedAt, TierName } from '../domain/ai-usage-rollup.entity';
import {
  AI_BUDGET_TIER_CROSSED_CHANNEL,
  buildAiBudgetTierCrossedPayload,
} from '../domain/events';
import { AiUsageRollupRepository } from './ai-usage-rollup.repository';
import { BudgetTierService } from './budget-tier.service';
import { BurnRateCalculator } from './burn-rate.calculator';
import { LruRollupCache } from './lru-rollup-cache';
import {
  SPAN_AGGREGATOR_PORT,
  type PeriodSpanAggregate,
  type SpanAggregatorPort,
} from './ports/span-aggregator.port';

const SCHEDULER_ENV_FLAG = 'OPENTRATTOS_AI_BUDGET_SCHEDULER_ENABLED';

/**
 * Per ADR-AGGREGATE-INTERVAL: 5-minute cron tick aggregates `gen_ai.*`
 * spans into `ai_usage_rollup` per-(org, period_yyyy_mm), evaluates budget
 * tiers, and emits `AI_BUDGET_TIER_CROSSED` per newly-crossed tier.
 *
 * Operational invariants:
 *  - Env-flag gate: `OPENTRATTOS_AI_BUDGET_SCHEDULER_ENABLED !== 'true'` →
 *    tick is a no-op. Matches slice #3 ExpiryScannerService pattern.
 *  - Per-org exceptions log + continue (one org's failure does NOT stall
 *    the whole tick).
 *  - Whole-tick exceptions caught + logged so the cron handler does not
 *    die (NestJS @Cron's default behaviour also catches; we wrap for
 *    structured logging).
 *  - On rollup upsert failure: fall back to `LruRollupCache.get(key)` and
 *    evaluate tiers against the cached aggregate. Cold cache → skip
 *    evaluation for this tick + log structured warn.
 *  - NULL org budget short-circuits tier + forecast evaluation per
 *    ADR-NULL-BUDGET-UNLIMITED.
 *
 * The aggregator source is injected via `SPAN_AGGREGATOR_PORT`. THIS slice
 * binds a `PlaceholderSpanAggregator` that returns [] for `listActiveOrgs`
 * — slice #20 rebinds to a real OTel-source adapter.
 */
@Injectable()
export class RollupSchedulerService {
  private readonly logger = new Logger(RollupSchedulerService.name);

  constructor(
    private readonly rollups: AiUsageRollupRepository,
    private readonly tiers: BudgetTierService,
    private readonly burnRate: BurnRateCalculator,
    private readonly lru: LruRollupCache,
    private readonly events: EventEmitter2,
    private readonly organizations: OrganizationRepository,
    @Inject(SPAN_AGGREGATOR_PORT)
    private readonly aggregator: SpanAggregatorPort,
  ) {}

  @Cron('*/5 * * * *', { name: 'ai-budget-rollup' })
  async runTick(): Promise<void> {
    if (process.env[SCHEDULER_ENV_FLAG] !== 'true') {
      return;
    }

    const now = new Date();
    const period = formatPeriod(now);

    try {
      const orgIds = await this.aggregator.listActiveOrgs(period);
      for (const orgId of orgIds) {
        await this.processOrg(orgId, period, now);
      }
    } catch (err) {
      this.logger.error(
        `ai-budget.rollup.tick-failed period=${period} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Per-org pipeline. Wrapped in try/catch so one org's exception does
   * NOT propagate. Per ADR-LRU-CACHE-FALLBACK: on rollup-upsert failure,
   * fall back to cached aggregate.
   */
  private async processOrg(
    organizationId: string,
    period: string,
    now: Date,
  ): Promise<void> {
    try {
      let aggregate: PeriodSpanAggregate;
      try {
        aggregate = await this.aggregator.aggregateForPeriod(organizationId, period);
      } catch (err) {
        this.logger.warn(
          `ai-budget.rollup.aggregator-failed orgId=${organizationId} period=${period} reason=${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      const cacheKey = this.lru.buildKey(organizationId, period);
      let effectiveSpend: number;
      let alreadyCrossed: TierCrossedAt;

      try {
        await this.rollups.upsertAggregate(organizationId, period, {
          totalCostEur: aggregate.totalCostEur,
          totalCalls: aggregate.totalCalls,
          totalInputTokens: aggregate.totalInputTokens,
          totalOutputTokens: aggregate.totalOutputTokens,
        });

        // Refresh cache snapshot on success — both fields the fallback
        // path consumes (cost + tier_crossed_at). Read tier state from the
        // freshly-upserted row.
        const row = await this.rollups.findByPeriod(organizationId, period);
        effectiveSpend = aggregate.totalCostEur;
        alreadyCrossed = (row?.tierCrossedAt ?? {}) as TierCrossedAt;

        this.lru.set(cacheKey, {
          organizationId,
          period,
          totalCostEur: effectiveSpend,
          tierCrossedAt: alreadyCrossed as Record<string, string>,
        });
      } catch (err) {
        // Postgres outage / lock timeout / network — fall back to LRU.
        const cached = this.lru.get(cacheKey);
        if (cached === undefined) {
          this.logger.warn(
            `ai-budget.rollup.fallback orgId=${organizationId} period=${period} reason=cold-cache-${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        this.logger.warn(
          `ai-budget.rollup.fallback orgId=${organizationId} period=${period} reason=${err instanceof Error ? err.message : String(err)}`,
        );
        effectiveSpend = cached.totalCostEur;
        alreadyCrossed = cached.tierCrossedAt as TierCrossedAt;
      }

      // Budget lookup. NULL budget short-circuits per ADR-NULL-BUDGET-UNLIMITED.
      const org = await this.organizations.findOneBy({ id: organizationId });
      const budgetLimit = readOrgBudget(org);
      if (budgetLimit === null) {
        return;
      }

      // Threshold tiers
      const newlyCrossed = this.tiers.evaluate({
        currentSpend: effectiveSpend,
        budgetLimit,
        alreadyCrossed,
      });

      for (const tier of newlyCrossed) {
        await this.emitTierCrossed({
          organizationId,
          period,
          tier,
          totalSpend: effectiveSpend,
          budgetLimit,
          projectedEom: null,
          now,
        });
      }

      // Burn-rate forecast — only if not yet emitted this period
      const { daysIntoMonth, daysInMonth } = monthArithmetic(now);
      const forecast = this.burnRate.shouldEmitForecast({
        currentSpend: effectiveSpend,
        budgetLimit,
        daysIntoMonth,
        daysInMonth,
        alreadyCrossed,
      });

      if (forecast.emit) {
        await this.emitTierCrossed({
          organizationId,
          period,
          tier: 'forecast',
          totalSpend: effectiveSpend,
          budgetLimit,
          projectedEom: forecast.projectedEom,
          now,
        });
      }
    } catch (err) {
      this.logger.error(
        `ai-budget.rollup.org-failed orgId=${organizationId} period=${period} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async emitTierCrossed(input: {
    organizationId: string;
    period: string;
    tier: TierName;
    totalSpend: number;
    budgetLimit: number;
    projectedEom: number | null;
    now: Date;
  }): Promise<void> {
    const payload = buildAiBudgetTierCrossedPayload({
      organizationId: input.organizationId,
      period: input.period,
      tier: input.tier,
      totalSpendEur: input.totalSpend,
      budgetLimitEur: input.budgetLimit,
      projectedEomEur: input.projectedEom,
      crossedAt: input.now,
    });

    // Mark BEFORE emitting so a crash between mark + emit replays exactly
    // the same dedup state on the next tick (the slice #21 idempotency
    // cache catches the audit-log side).
    try {
      await this.rollups.markTierCrossed(
        input.organizationId,
        input.period,
        input.tier,
        input.now,
      );
    } catch (err) {
      this.logger.warn(
        `ai-budget.rollup.mark-tier-failed orgId=${input.organizationId} period=${input.period} tier=${input.tier} reason=${err instanceof Error ? err.message : String(err)}`,
      );
      // Continue: emit even if the mark fails — better to over-emit than
      // miss a critical alert; slice #21's idempotency dedup catches dupes.
    }

    this.events.emit(AI_BUDGET_TIER_CROSSED_CHANNEL, payload);
  }
}

/** YYYY-MM in UTC. Exported for unit tests + scheduler observability. */
export function formatPeriod(date: Date): string {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Month arithmetic for burn-rate projection. `daysIntoMonth` is 1-based
 * (day 1 of the month → 1, NOT 0). `daysInMonth` is the calendar count
 * (28..31), computed via the JS Date trick of `new Date(year, month, 0)`.
 */
export function monthArithmetic(now: Date): {
  daysIntoMonth: number;
  daysInMonth: number;
} {
  const daysIntoMonth = now.getUTCDate();
  // last day of THIS month = day 0 of NEXT month
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysInMonth = lastDay.getUTCDate();
  return { daysIntoMonth, daysInMonth };
}

/**
 * Extract `ai_monthly_budget_eur` from an Organization (or null). The
 * column is added to the entity by THIS slice's
 * `iam/domain/organization.entity.ts` extension.
 */
function readOrgBudget(org: { aiMonthlyBudgetEur?: number | null } | null): number | null {
  if (org === null || org === undefined) return null;
  const raw = org.aiMonthlyBudgetEur;
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
  if (raw <= 0) return null;
  return raw;
}
