import { z } from 'zod';

/**
 * Canonical `LotConsumed` event — inline types + Zod schema for the
 * inventory.consumption BC (M3 slice #2 `m3-lot-consumption-events`).
 *
 * Per Wave 2.1 typing-fix cascade lesson [[feedback_subagent_apply_typing_fix_cascade]]:
 * we intentionally DO NOT import the envelope shape from
 * `@nexandro/contracts` in `apps/api/` code (TS6059 `rootDir` cascade).
 * The downstream slices that consume this event (#11 incident search,
 * #12 trace tree, #13 recall dispatch) re-declare or import via a single
 * cross-package re-export added by slice #21 once the contracts shape is
 * locked. For this slice the shape lives **inline** here and the
 * subscriber wiring (slice #21) consumes it via direct service-layer
 * import.
 *
 * Per ADR-CONSUMPTION-EVENT-SCHEMA + ADR-CONSUMPTION-MULTI-TENANT-PAYLOAD
 * (design.md), every payload carries `organization_id` at the top level
 * (duplicated from envelope) so downstream consumers don't need to JOIN
 * back to the envelope wrapper for tenant isolation.
 *
 * Per ADR-CONSUMPTION-NO-EMIT-HERE: the bus event-type string is fixed
 * here; the `AuditLogSubscriber.KNOWN_EVENTS` set in
 * `apps/api/src/audit-log/` is NOT extended in this slice. Slice #21
 * wires the persistence side.
 *
 * Field naming convention: snake_case in the **payload** (JSONB-friendly,
 * matches the audit-log payload column shape), camelCase in the **envelope**
 * (matches `AuditEventEnvelope` from `audit-log/application/types.ts`).
 */

/**
 * Canonical event-type bus channel. Other code paths (controllers,
 * services, INT tests) reference this constant — never inline the
 * string literal.
 *
 * Persisted form by slice #21 will be the UPPER_SNAKE_CASE
 * `AuditEventTypeName['m3.inventory.lot-consumed']` = `'LOT_CONSUMED'`.
 */
export const LOT_CONSUMED_EVENT = 'm3.inventory.lot-consumed' as const;
export type LotConsumedEventName = typeof LOT_CONSUMED_EVENT;

/**
 * Allowed unit set — mirrors `LotUnit` from the slice #1 lot.entity.ts.
 * Duplicated here intentionally: keeps the Zod schema self-contained and
 * decouples the consumption BC from a hard import on the lot entity's
 * type alias (downstream slices may consume just the event without the
 * full lot domain on their classpath).
 */
export const LOT_CONSUMED_UNITS = ['kg', 'g', 'L', 'ml', 'un'] as const;
export type LotConsumedUnit = (typeof LOT_CONSUMED_UNITS)[number];

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `LotConsumedPayload` — the typed JSONB content stored under
 * `audit_log.payload_after` once slice #21 wires the subscriber, and the
 * payload shape emitted on the bus today.
 *
 * Per ADR-CONSUMPTION-EVENT-SCHEMA fields table:
 *   - `organization_id` REQUIRED (multi-tenant top-level convention)
 *   - `qty_consumed` STRICTLY POSITIVE (sign normalised from the
 *     signed `stock_moves.quantity` negative value)
 *   - `unit` in canonical enum
 *   - `recipe_id` / `menu_item_id` both nullable; at-most-one populated
 *     invariant is enforced at the service boundary (NOT here — Zod
 *     allows both null + both populated; service-level guard rejects).
 *   - `consumed_at` server-side timestamp string (ISO-8601 datetime).
 *   - `nexandro_tag` free-form, optional.
 *   - `reason` free-form, optional.
 *
 * Wave 2.1 lesson [[feedback_subagent_apply_typing_fix_cascade]]:
 * we use `.min(1, msg)` over `.nonempty()` to avoid tuple-vs-array
 * inference traps. (No arrays in this payload — convention preserved
 * for future fields like `consumed_in_batch: lot_id[]`.)
 */
export const LotConsumedPayloadSchema = z.object({
  organization_id: z.string().regex(UUID_RX, 'organization_id must be a UUID'),
  lot_id: z.string().regex(UUID_RX, 'lot_id must be a UUID'),
  stock_move_id: z
    .string()
    .regex(UUID_RX, 'stock_move_id must be a UUID'),
  qty_consumed: z
    .number()
    .positive('qty_consumed must be strictly positive')
    .finite('qty_consumed must be a finite number'),
  unit: z.enum(LOT_CONSUMED_UNITS),
  recipe_id: z.string().regex(UUID_RX, 'recipe_id must be a UUID').nullable(),
  menu_item_id: z
    .string()
    .regex(UUID_RX, 'menu_item_id must be a UUID')
    .nullable(),
  consumed_at: z
    .string()
    .datetime({ message: 'consumed_at must be ISO-8601 datetime' }),
  consumed_by_user_id: z
    .string()
    .regex(UUID_RX, 'consumed_by_user_id must be a UUID'),
  nexandro_tag: z.string().min(1).max(127).nullable(),
  reason: z.string().min(1).max(500).nullable(),
});

export type LotConsumedPayload = z.infer<typeof LotConsumedPayloadSchema>;

/**
 * Bus envelope emitted by `ConsumptionService.recordConsumption()`.
 *
 * Shape parallels `AuditEventEnvelope` from
 * `apps/api/src/audit-log/application/types.ts` (camelCase envelope
 * fields, snake_case payload fields). Inline here to keep the
 * consumption BC self-contained and to avoid a cross-BC import on
 * `audit-log/` which would couple slice #2 to slice #21's wiring
 * timeline.
 *
 * Slice #21 (`m3-audit-log-hash-chain-hardening`) extends
 * `AuditEventType` with `LOT_CONSUMED: 'm3.inventory.lot-consumed'` and
 * adds the `@OnEvent` handler in `AuditLogSubscriber`. Until then, the
 * subscriber set does not include this channel — emission is
 * fire-and-forget on the bus.
 *
 * Per ADR-CONSUMPTION-EMITTER-LOCATION: this envelope is constructed
 * ONLY inside `ConsumptionService.recordConsumption()`. No other code
 * path constructs it; a future ESLint rule (deferred to slice #11) will
 * pin this invariant.
 */
export interface LotConsumedEvent {
  /** Always `'lot'` — anchors the FR15 forward-trace audit-log query. */
  aggregateType: 'lot';
  /** Tenant gate. Duplicated into payload per multi-tenant convention. */
  organizationId: string;
  /** The lot whose quantity was decremented; FK to `lots.id`. */
  aggregateId: string;
  /** The user (or agent-attributed user) responsible. */
  actorUserId: string;
  /**
   * Always `'user'` for this slice — agent-mediated flows still attribute
   * to a human user per ADR-013. When agent-only events land in later
   * slices, this widens to the AuditActorKind union.
   */
  actorKind: 'user';
  /** Typed event-type channel. Inline so JSON consumers see it on the wire. */
  eventType: LotConsumedEventName;
  /** No before-image — consumption is an additive ledger row. */
  payloadBefore: null;
  /** Validated `LotConsumedPayload` (Zod-parsed at boundary). */
  payloadAfter: LotConsumedPayload;
  /** Server-side persistence timestamp (matches `stock_moves.created_at`). */
  createdAt: Date;
}
