/**
 * Domain errors for the inventory.consumption BC (M3 slice #2).
 *
 * Each error carries a stable `code` field that downstream HTTP layers
 * (slice #11 incident-search controller, future MCP write capabilities)
 * map to status codes:
 *   - INVALID_CONSUMPTION_INPUT       → 400
 *   - LOT_INSUFFICIENT_QUANTITY       → 409
 *   - DUPLICATE_IDEMPOTENCY_KEY       → 409 (returns original event body)
 *
 * Cross-tenant lot access is intentionally surfaced as
 * `InvalidConsumptionInputError` with message "lot not found" — the
 * same "not-found-at-this-org" semantics slice #1's `LotRepository`
 * uses. We never leak the existence of lots in other tenants.
 */

export class InvalidConsumptionInputError extends Error {
  public readonly code = 'INVALID_CONSUMPTION_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConsumptionInputError';
  }
}

export class LotInsufficientQuantityError extends Error {
  public readonly code = 'LOT_INSUFFICIENT_QUANTITY';
  public readonly lotId: string;
  public readonly requested: number;
  public readonly available: number;
  constructor(lotId: string, requested: number, available: number) {
    super(
      `Lot ${lotId} has insufficient quantity for consumption: ` +
        `requested ${requested}, available ${available}.`,
    );
    this.name = 'LotInsufficientQuantityError';
    this.lotId = lotId;
    this.requested = requested;
    this.available = available;
  }
}

export class DuplicateIdempotencyKeyError extends Error {
  public readonly code = 'DUPLICATE_IDEMPOTENCY_KEY';
  public readonly idempotencyKey: string;
  constructor(idempotencyKey: string) {
    super(
      `Idempotency key ${idempotencyKey} has already produced a consumption event. ` +
        `Caller should reuse the prior response rather than retrying.`,
    );
    this.name = 'DuplicateIdempotencyKeyError';
    this.idempotencyKey = idempotencyKey;
  }
}
