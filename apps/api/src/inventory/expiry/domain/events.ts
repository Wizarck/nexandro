import { z } from 'zod';
import type { AuditEventEnvelope } from '../../../audit-log/application/types';

/**
 * Channel name for the event bus. The audit-log subscriber registration
 * is **deferred to slice #21** (`m3-audit-log-hash-chain-hardening`) per
 * design.md ADR-EXPIRY-NO-EMIT-HERE; this slice only emits the envelope.
 */
export const LOT_EXPIRY_NEAR_CHANNEL = 'audit.event';

/**
 * Persisted event-type string (mirrors `AuditEventTypeName` convention in
 * `audit-log/application/types.ts`). The audit_log `event_type` column
 * is `text` so adding a new value requires no migration.
 */
export const LOT_EXPIRY_NEAR_EVENT_TYPE = 'LOT_EXPIRY_NEAR';

/** Aggregate kind for the audit envelope. Matches slice #1's `lot` convention. */
export const LOT_AGGREGATE_TYPE = 'lot';

/**
 * Zod schema for the `LotExpiryNearEvent` payload, per ADR-EXPIRY-EVENT-PAYLOAD.
 *
 * Wave 2.1 lesson `[[feedback_subagent_apply_typing_fix_cascade]]`:
 *  - inlined here (NOT re-exported from `packages/contracts/`) to avoid
 *    TS6059 + cross-package coupling in the apps/api build.
 *  - `z.enum([...])` for the band discriminator — no `.nonempty()`.
 *  - string min-lengths via `.min(1, msg)` where applicable (UUID strings
 *    use `.uuid()` which already enforces non-empty).
 */
export const LotExpiryNearPayloadSchema = z.object({
  lot_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  location_id: z.string().uuid(),
  supplier_id: z.string().uuid().nullable(),
  expires_at: z.string().datetime(),
  expires_at_snapshot_taken_at: z.string().datetime(),
  alert_band: z.enum(['t-72h', 't-24h']),
  hours_until_expiry: z.number().int().min(0).max(72),
  quantity_remaining: z.number().min(0),
  unit: z.enum(['kg', 'g', 'L', 'ml', 'un']),
  ingredient_id: z.string().uuid().nullable(),
});

export type LotExpiryNearPayload = z.infer<typeof LotExpiryNearPayloadSchema>;

/**
 * Typed envelope emitted on `audit.event`. Mirrors the canonical
 * `AuditEventEnvelope` shape used across the codebase (Wave 1.18
 * `m2-audit-log-emitter-migration`). `payloadAfter` carries the
 * `LotExpiryNearPayload`; `payloadBefore` is `null` (alerts are
 * fire-and-forget; there is no prior state to record).
 *
 * `actorUserId` is `null` because the scanner fires on a cron tick, not
 * on a user action. `actorKind='system'` keeps the audit envelope shape
 * compatible with the existing `AuditLogSubscriber` registration that
 * slice #21 will wire.
 */
export type LotExpiryNearEvent = AuditEventEnvelope<null, LotExpiryNearPayload>;

/**
 * Construct a well-formed `LotExpiryNearEvent` envelope. Validates the
 * payload via Zod before returning so emit-site mistakes surface as
 * unit-test failures rather than runtime subscriber bugs.
 */
export function buildLotExpiryNearEvent(input: {
  organizationId: string;
  lotId: string;
  payload: LotExpiryNearPayload;
}): LotExpiryNearEvent {
  const parsed = LotExpiryNearPayloadSchema.parse(input.payload);
  return {
    organizationId: input.organizationId,
    aggregateType: LOT_AGGREGATE_TYPE,
    aggregateId: input.lotId,
    actorUserId: null,
    actorKind: 'system',
    payloadBefore: null,
    payloadAfter: parsed,
  };
}
