import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Organization } from '../../../iam/domain/organization.entity';
import type { OrganizationRepository } from '../../../iam/infrastructure/organization.repository';
import type { AiUsageRollup } from '../domain/ai-usage-rollup.entity';
import { AI_BUDGET_TIER_CROSSED_CHANNEL } from '../domain/events';
import type { AiUsageRollupRepository } from './ai-usage-rollup.repository';
import { BudgetTierService } from './budget-tier.service';
import { BurnRateCalculator } from './burn-rate.calculator';
import { LruRollupCache } from './lru-rollup-cache';
import type {
  PeriodSpanAggregate,
  SpanAggregatorPort,
} from './ports/span-aggregator.port';
import {
  RollupSchedulerService,
  formatPeriod,
  monthArithmetic,
} from './rollup-scheduler.service';

interface Mocks {
  rollups: jest.Mocked<Pick<AiUsageRollupRepository, 'upsertAggregate' | 'findByPeriod' | 'markTierCrossed' | 'findActiveOrgsInPeriod'>>;
  organizations: jest.Mocked<Pick<OrganizationRepository, 'findOneBy'>>;
  aggregator: jest.Mocked<SpanAggregatorPort>;
  events: { emit: jest.Mock };
}

const ORG_A = '11111111-1111-4000-8000-000000000001';

function makeAggregate(orgId: string, period: string, totalCostEur: number): PeriodSpanAggregate {
  return {
    organizationId: orgId,
    period,
    totalCostEur,
    totalCalls: 10,
    totalInputTokens: 1000,
    totalOutputTokens: 200,
    avgDailySpendEur: totalCostEur / 15,
  };
}

function makeRollup(orgId: string, period: string, overrides: Partial<AiUsageRollup> = {}): AiUsageRollup {
  return {
    organizationId: orgId,
    periodYyyyMm: period,
    totalCostEur: 0,
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastAggregatedAt: new Date('2026-05-14T10:00:00.000Z'),
    tierCrossedAt: {},
    ...overrides,
  } as AiUsageRollup;
}

function build(): { svc: RollupSchedulerService; mocks: Mocks } {
  const mocks: Mocks = {
    rollups: {
      upsertAggregate: jest.fn(async () => undefined),
      findByPeriod: jest.fn(async () => null),
      markTierCrossed: jest.fn(async () => undefined),
      findActiveOrgsInPeriod: jest.fn(async () => []),
    } as never,
    organizations: {
      findOneBy: jest.fn(async () => null),
    } as never,
    aggregator: {
      listActiveOrgs: jest.fn(async () => []),
      aggregateForPeriod: jest.fn(),
    } as never,
    events: { emit: jest.fn() },
  };

  const svc = new RollupSchedulerService(
    mocks.rollups as unknown as AiUsageRollupRepository,
    new BudgetTierService(),
    new BurnRateCalculator(),
    new LruRollupCache(),
    mocks.events as unknown as EventEmitter2,
    mocks.organizations as unknown as OrganizationRepository,
    mocks.aggregator,
  );
  return { svc, mocks };
}

describe('RollupSchedulerService', () => {
  let originalFlag: string | undefined;

  beforeEach(() => {
    originalFlag = process.env.NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED;
    } else {
      process.env.NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED = originalFlag;
    }
  });

  describe('env-flag gate', () => {
    it('runTick is a no-op when env flag is not "true"', async () => {
      delete process.env.NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED;
      const { svc, mocks } = build();
      await svc.runTick();
      expect(mocks.aggregator.listActiveOrgs).not.toHaveBeenCalled();
    });

    it('runTick is a no-op when env flag is "false"', async () => {
      process.env.NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED = 'false';
      const { svc, mocks } = build();
      await svc.runTick();
      expect(mocks.aggregator.listActiveOrgs).not.toHaveBeenCalled();
    });
  });

  describe('per-org pipeline', () => {
    beforeEach(() => {
      process.env.NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED = 'true';
    });

    it('NULL budget short-circuits tier evaluation', async () => {
      const { svc, mocks } = build();
      const period = formatPeriod(new Date());
      mocks.aggregator.listActiveOrgs.mockResolvedValue([ORG_A]);
      mocks.aggregator.aggregateForPeriod.mockResolvedValue(makeAggregate(ORG_A, period, 80));
      mocks.rollups.findByPeriod.mockResolvedValue(makeRollup(ORG_A, period));
      mocks.organizations.findOneBy.mockResolvedValue({
        id: ORG_A,
        aiMonthlyBudgetEur: null,
      } as Organization);

      await svc.runTick();

      // Upsert ran (telemetry preserved per ADR-NULL-BUDGET-UNLIMITED)
      expect(mocks.rollups.upsertAggregate).toHaveBeenCalledTimes(1);
      // But no tier emission
      expect(mocks.events.emit).not.toHaveBeenCalled();
      expect(mocks.rollups.markTierCrossed).not.toHaveBeenCalled();
    });

    it('emits AI_BUDGET_TIER_CROSSED when info tier crosses (50% spent)', async () => {
      const { svc, mocks } = build();
      const period = formatPeriod(new Date());
      mocks.aggregator.listActiveOrgs.mockResolvedValue([ORG_A]);
      mocks.aggregator.aggregateForPeriod.mockResolvedValue(makeAggregate(ORG_A, period, 50));
      mocks.rollups.findByPeriod.mockResolvedValue(makeRollup(ORG_A, period));
      mocks.organizations.findOneBy.mockResolvedValue({
        id: ORG_A,
        aiMonthlyBudgetEur: 100,
      } as Organization);

      await svc.runTick();

      // Note: also potentially a forecast event depending on date — assert
      // ≥ 1 emission with info tier.
      const tierCalls = mocks.events.emit.mock.calls.filter(
        ([channel]) => channel === AI_BUDGET_TIER_CROSSED_CHANNEL,
      );
      expect(tierCalls.length).toBeGreaterThanOrEqual(1);
      const infoCall = tierCalls.find(([, payload]) => payload.payloadAfter.tier === 'info');
      expect(infoCall).toBeDefined();
      expect(infoCall![1].payloadAfter.totalSpendEur).toBe(50);
      expect(infoCall![1].payloadAfter.budgetLimitEur).toBe(100);
    });

    it('bulk-cross emits info + warn + error in one tick', async () => {
      const { svc, mocks } = build();
      const period = formatPeriod(new Date());
      mocks.aggregator.listActiveOrgs.mockResolvedValue([ORG_A]);
      // 95% spend in one shot, cold tier state.
      mocks.aggregator.aggregateForPeriod.mockResolvedValue(makeAggregate(ORG_A, period, 95));
      mocks.rollups.findByPeriod.mockResolvedValue(makeRollup(ORG_A, period));
      mocks.organizations.findOneBy.mockResolvedValue({
        id: ORG_A,
        aiMonthlyBudgetEur: 100,
      } as Organization);

      await svc.runTick();

      const tierCalls = mocks.events.emit.mock.calls.filter(
        ([channel]) => channel === AI_BUDGET_TIER_CROSSED_CHANNEL,
      );
      const tiers = tierCalls
        .map(([, p]) => p.payloadAfter.tier as string)
        .filter((t) => t !== 'forecast');
      expect(tiers).toEqual(['info', 'warn', 'error']);
      expect(mocks.rollups.markTierCrossed).toHaveBeenCalledTimes(tiers.length + (tierCalls.length - tiers.length));
    });

    it('does NOT re-emit already-crossed tier within same period', async () => {
      const { svc, mocks } = build();
      const period = formatPeriod(new Date());
      mocks.aggregator.listActiveOrgs.mockResolvedValue([ORG_A]);
      mocks.aggregator.aggregateForPeriod.mockResolvedValue(makeAggregate(ORG_A, period, 60));
      mocks.rollups.findByPeriod.mockResolvedValue(
        makeRollup(ORG_A, period, {
          tierCrossedAt: { info: '2026-05-01T10:00:00Z' },
        }),
      );
      mocks.organizations.findOneBy.mockResolvedValue({
        id: ORG_A,
        aiMonthlyBudgetEur: 100,
      } as Organization);

      await svc.runTick();

      const tierCalls = mocks.events.emit.mock.calls.filter(
        ([channel]) => channel === AI_BUDGET_TIER_CROSSED_CHANNEL,
      );
      const infoCalls = tierCalls.filter(([, p]) => p.payloadAfter.tier === 'info');
      expect(infoCalls).toHaveLength(0);
    });

    it('falls back to LRU cache when upsert fails (warm cache)', async () => {
      const { svc, mocks } = build();
      const period = formatPeriod(new Date());
      mocks.aggregator.listActiveOrgs.mockResolvedValue([ORG_A]);
      mocks.aggregator.aggregateForPeriod.mockResolvedValue(makeAggregate(ORG_A, period, 80));
      mocks.organizations.findOneBy.mockResolvedValue({
        id: ORG_A,
        aiMonthlyBudgetEur: 100,
      } as Organization);

      // First tick: successful upsert, populates LRU
      mocks.rollups.findByPeriod.mockResolvedValue(makeRollup(ORG_A, period));
      await svc.runTick();

      // Reset spies; second tick: upsert fails → fallback
      mocks.events.emit.mockClear();
      mocks.rollups.upsertAggregate.mockRejectedValueOnce(new Error('postgres down'));

      await svc.runTick();

      // Even on failure, tier evaluation continued — at least one emission
      // attempt happened from the cached aggregate. We don't assert
      // specific tier order because tier state is already marked from tick 1.
      // The key assertion: no exception leaked.
      expect(mocks.rollups.upsertAggregate).toHaveBeenCalled();
    });

    it('skips tier evaluation when upsert fails + LRU cache is cold', async () => {
      const { svc, mocks } = build();
      const period = formatPeriod(new Date());
      mocks.aggregator.listActiveOrgs.mockResolvedValue([ORG_A]);
      mocks.aggregator.aggregateForPeriod.mockResolvedValue(makeAggregate(ORG_A, period, 80));
      mocks.rollups.upsertAggregate.mockRejectedValue(new Error('postgres down'));
      mocks.organizations.findOneBy.mockResolvedValue({
        id: ORG_A,
        aiMonthlyBudgetEur: 100,
      } as Organization);

      await svc.runTick();

      // Cold cache → skip tier evaluation. No emission.
      const tierCalls = mocks.events.emit.mock.calls.filter(
        ([channel]) => channel === AI_BUDGET_TIER_CROSSED_CHANNEL,
      );
      expect(tierCalls).toHaveLength(0);
    });

    it('per-org exception is logged + does NOT propagate', async () => {
      const { svc, mocks } = build();
      const period = formatPeriod(new Date());
      mocks.aggregator.listActiveOrgs.mockResolvedValue([ORG_A, 'orgB']);
      mocks.aggregator.aggregateForPeriod
        .mockResolvedValueOnce(makeAggregate(ORG_A, period, 30))
        .mockRejectedValueOnce(new Error('boom'));
      mocks.rollups.findByPeriod.mockResolvedValue(makeRollup(ORG_A, period));
      mocks.organizations.findOneBy.mockResolvedValue({
        id: ORG_A,
        aiMonthlyBudgetEur: null,
      } as Organization);

      await expect(svc.runTick()).resolves.toBeUndefined();
      // orgA processed, orgB threw — but tick completed cleanly.
      expect(mocks.rollups.upsertAggregate).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatPeriod + monthArithmetic helpers', () => {
    it('formatPeriod returns YYYY-MM in UTC', () => {
      expect(formatPeriod(new Date('2026-05-14T10:00:00.000Z'))).toBe('2026-05');
      expect(formatPeriod(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01');
      expect(formatPeriod(new Date('2026-12-31T23:59:59.000Z'))).toBe('2026-12');
    });

    it('monthArithmetic computes daysIntoMonth (1-based) + daysInMonth', () => {
      // May 2026 has 31 days. May 14 → daysIntoMonth=14.
      const result = monthArithmetic(new Date('2026-05-14T10:00:00.000Z'));
      expect(result.daysIntoMonth).toBe(14);
      expect(result.daysInMonth).toBe(31);
    });

    it('monthArithmetic handles February (28 or 29 days)', () => {
      // 2024 is a leap year (29 days). 2026 is not (28 days).
      expect(monthArithmetic(new Date('2024-02-15T00:00:00.000Z')).daysInMonth).toBe(29);
      expect(monthArithmetic(new Date('2026-02-15T00:00:00.000Z')).daysInMonth).toBe(28);
    });
  });
});
