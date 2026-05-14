import type { LotConsumedUnit } from './events';

/**
 * Caller-facing input value object for
 * `ConsumptionService.recordConsumption()`.
 *
 * Per ADR-CONSUMPTION-EVENT-SCHEMA the service is responsible for:
 *  - loading the lot (multi-tenant gated) to snapshot `unit` into the payload
 *  - appending a signed-negative `stock_moves` outbound row
 *  - building + Zod-validating the canonical `LotConsumedPayload`
 *  - emitting the typed `LotConsumedEvent` on the bus
 *
 * Per ADR-CONSUMPTION-RECIPE-MENU-NULLABLE: at most one of `recipeId` /
 * `menuItemId` may be populated; both null is allowed for "manual depletion"
 * (chef dropped the pan) — in which case `reason` is REQUIRED non-empty.
 * The invariants are enforced at the service boundary, not in this
 * value object's shape (Zod is open here for testability + raw input
 * forwarding from controllers).
 */
export interface RecordConsumptionInput {
  /** FK to `lots.id` — the lot whose `quantity_remaining` decreases. */
  lotId: string;
  /** Strictly positive number; the service converts to signed-negative for `stock_moves.quantity`. */
  qtyConsumed: number;
  /**
   * Mirrors `lots.unit`. Defensive — the service snapshots from the lot
   * row itself, but the caller MAY pass the expected unit for an
   * application-side mismatch check (future enhancement; ignored today).
   */
  unit?: LotConsumedUnit;
  /** Recipe driver. Populate when a recipe execution drives consumption. */
  recipeId?: string | null;
  /** Menu-item driver. Populate when an agent surface attributes by menu-item. */
  menuItemId?: string | null;
  /** Free-form AI-obs / cost-attribution tag per ADR-030. Optional. */
  opentrattosTag?: string | null;
  /** Free-form operator note. REQUIRED non-empty when both drivers null. */
  reason?: string | null;
  /**
   * Idempotency key — uuid v4. Same key replayed within the same org
   * returns the original event without producing a second
   * `stock_moves` row (REQ-CE-5 in spec.md). Caller is responsible for
   * generating + persisting the key on the agent / UI side.
   */
  idempotencyKey: string;
}
