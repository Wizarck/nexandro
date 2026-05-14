import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IamModule } from '../../iam/iam.module';
import { AiUsageRollupRepository } from './application/ai-usage-rollup.repository';
import { BudgetTierService } from './application/budget-tier.service';
import { BurnRateCalculator } from './application/burn-rate.calculator';
import { LruRollupCache } from './application/lru-rollup-cache';
import { PlaceholderSpanAggregator } from './application/placeholder-span-aggregator';
import { RollupSchedulerService } from './application/rollup-scheduler.service';
import { SPAN_AGGREGATOR_PORT } from './application/ports/span-aggregator.port';
import { AiUsageRollup } from './domain/ai-usage-rollup.entity';

/**
 * AI budget tier + rollup BC (slice #19 m3-ai-obs-budget-tier-emitter,
 * Wave 2.4).
 *
 * Owns:
 *  - `AiUsageRollup` TypeORM entity + `AiUsageRollupRepository`
 *  - `BudgetTierService` (pure threshold evaluator)
 *  - `BurnRateCalculator` (forecast emission gate)
 *  - `LruRollupCache` (process-local outage fallback)
 *  - `RollupSchedulerService` (`@Cron('*/5 * * * *')` aggregator + emitter)
 *  - `PlaceholderSpanAggregator` (placeholder bound to
 *    `SPAN_AGGREGATOR_PORT`; slice #20 rebinds to the real OTel-source
 *    adapter — same pattern as slice #5's `INVENTORY_COST_RESOLVER`)
 *
 * Consumes:
 *  - `OrganizationRepository` from `IamModule` (read-only) for the
 *    `ai_monthly_budget_eur` lookup per ADR-NULL-BUDGET-UNLIMITED.
 *  - `EventEmitter2` (registered at the app root) for emitting
 *    `AI_BUDGET_TIER_CROSSED`.
 *  - `ScheduleModule.forRoot()` (registered at the app root by slice #3).
 *
 * Exports:
 *  - `AiUsageRollupRepository` — read surface for slice #20 dashboard.
 *
 * Audit-log subscription for `AI_BUDGET_TIER_CROSSED` lives on the existing
 * `AuditLogSubscriber` (slice #21 single-subscriber pattern) — wired via
 * `audit-log/application/audit-log.subscriber.ts` in THIS slice.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiUsageRollup]), IamModule],
  providers: [
    AiUsageRollupRepository,
    BudgetTierService,
    BurnRateCalculator,
    LruRollupCache,
    RollupSchedulerService,
    PlaceholderSpanAggregator,
    {
      provide: SPAN_AGGREGATOR_PORT,
      useExisting: PlaceholderSpanAggregator,
    },
  ],
  exports: [AiUsageRollupRepository, BurnRateCalculator],
})
export class BudgetModule {}
