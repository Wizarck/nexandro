import { randomUUID } from 'node:crypto';
import {
  AI_BUDGET_TIER_CROSSED_CHANNEL,
  buildAggregateId,
  buildAiBudgetTierCrossedPayload,
} from './events';

describe('AI_BUDGET_TIER_CROSSED event shape', () => {
  it('exposes the bus channel constant', () => {
    expect(AI_BUDGET_TIER_CROSSED_CHANNEL).toBe('ai-observability.budget-tier-crossed');
  });

  describe('buildAggregateId', () => {
    it('joins orgId and period with a colon', () => {
      const orgId = randomUUID();
      expect(buildAggregateId(orgId, '2026-05')).toBe(`${orgId}:2026-05`);
    });
  });

  describe('buildAiBudgetTierCrossedPayload', () => {
    it('produces an envelope-shaped payload', () => {
      const orgId = randomUUID();
      const crossedAt = new Date('2026-05-14T10:30:00.000Z');
      const payload = buildAiBudgetTierCrossedPayload({
        organizationId: orgId,
        period: '2026-05',
        tier: 'info',
        totalSpendEur: 50,
        budgetLimitEur: 100,
        projectedEomEur: null,
        crossedAt,
      });

      expect(payload).toEqual({
        organizationId: orgId,
        aggregateType: 'ai_usage_rollup',
        aggregateId: `${orgId}:2026-05`,
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: {
          period: '2026-05',
          tier: 'info',
          totalSpendEur: 50,
          budgetLimitEur: 100,
          projectedEomEur: null,
          crossedAt: '2026-05-14T10:30:00.000Z',
        },
      });
    });

    it('marshals projectedEom for forecast events', () => {
      const orgId = randomUUID();
      const payload = buildAiBudgetTierCrossedPayload({
        organizationId: orgId,
        period: '2026-05',
        tier: 'forecast',
        totalSpendEur: 70,
        budgetLimitEur: 100,
        projectedEomEur: 217,
        crossedAt: new Date('2026-05-10T00:00:00.000Z'),
      });

      expect(payload.payloadAfter.tier).toBe('forecast');
      expect(payload.payloadAfter.projectedEomEur).toBe(217);
    });

    it('uses ISO-8601 timestamp', () => {
      const payload = buildAiBudgetTierCrossedPayload({
        organizationId: randomUUID(),
        period: '2026-05',
        tier: 'fatal',
        totalSpendEur: 110,
        budgetLimitEur: 100,
        projectedEomEur: null,
        crossedAt: new Date('2026-05-31T23:59:59.000Z'),
      });
      expect(payload.payloadAfter.crossedAt).toBe('2026-05-31T23:59:59.000Z');
    });
  });
});
