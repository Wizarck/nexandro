import type { TierName } from './ai-usage-rollup.entity';

/**
 * Bus channel for the `AI_BUDGET_TIER_CROSSED` event. Matches the
 * `<bc>.<verb>` convention from M2/M3 events.
 *
 * Slice #21 (`m3-audit-log-hash-chain-hardening`) wires the consumer side
 * with one `@OnEvent(AI_BUDGET_TIER_CROSSED_CHANNEL)` handler on
 * `AuditLogSubscriber` (we extend that file in THIS slice; see
 * `apps/api/src/audit-log/application/audit-log.subscriber.ts`).
 */
export const AI_BUDGET_TIER_CROSSED_CHANNEL = 'ai-observability.budget-tier-crossed' as const;

/**
 * INLINE payload shape — per Wave 2.1+2.2+2.3 hard constraint, slice
 * application code does NOT import from `@nexandro/contracts`. The
 * payload is envelope-shaped (matches `AuditEventEnvelope`) so the
 * `AuditLogSubscriber` consumes it via `persistEnvelope()` without a
 * per-event-type translator.
 *
 * `aggregateType='ai_usage_rollup'`: the entity that crossed the tier is
 * the rollup row.
 *
 * `aggregateId='<orgId>:<period>'`: composite-string form because the
 * rollup table uses a composite PK (no surrogate `id uuid`). Keeps
 * `audit_log.aggregate_id` queryable for slice #20 + future dashboards.
 *
 * `actorKind='system'`: the scheduler is the actor.
 */
export interface AiBudgetTierCrossedPayload {
  organizationId: string;
  aggregateType: 'ai_usage_rollup';
  aggregateId: string;
  actorUserId: null;
  actorKind: 'system';
  payloadAfter: {
    period: string; // YYYY-MM
    tier: TierName;
    totalSpendEur: number;
    budgetLimitEur: number;
    projectedEomEur: number | null;
    crossedAt: string; // ISO-8601 UTC
  };
}

/**
 * Helper: compose the composite `aggregate_id` from `(orgId, period)`.
 * Centralised so future format changes are one-place edits.
 */
export function buildAggregateId(organizationId: string, period: string): string {
  return `${organizationId}:${period}`;
}

/**
 * Builds the canonical envelope per ADR-BUDGET-TIER-CROSSED-EVENT. Pure
 * function — used by both the scheduler (for emission) and unit tests.
 */
export function buildAiBudgetTierCrossedPayload(input: {
  organizationId: string;
  period: string;
  tier: TierName;
  totalSpendEur: number;
  budgetLimitEur: number;
  projectedEomEur: number | null;
  crossedAt: Date;
}): AiBudgetTierCrossedPayload {
  return {
    organizationId: input.organizationId,
    aggregateType: 'ai_usage_rollup',
    aggregateId: buildAggregateId(input.organizationId, input.period),
    actorUserId: null,
    actorKind: 'system',
    payloadAfter: {
      period: input.period,
      tier: input.tier,
      totalSpendEur: input.totalSpendEur,
      budgetLimitEur: input.budgetLimitEur,
      projectedEomEur: input.projectedEomEur,
      crossedAt: input.crossedAt.toISOString(),
    },
  };
}
