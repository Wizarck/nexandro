/**
 * Domain errors for the inventory.lots BC.
 *
 * Per ADR-LOT-SCHEMA + ADR-LOT-MULTITENANT-AT-REPO + design.md.
 * All errors extend Error with a stable `code` field for app-side
 * mapping to HTTP status codes (controller layer wires this when
 * downstream slices expose endpoints — this slice is backend-only).
 */

export class LotNotFoundError extends Error {
  public readonly code = 'LOT_NOT_FOUND';
  constructor(lotId: string) {
    super(`Lot not found: ${lotId}`);
    this.name = 'LotNotFoundError';
  }
}

export class LotCrossTenantAccessError extends Error {
  public readonly code = 'LOT_CROSS_TENANT_ACCESS';
  constructor(lotId: string, requestedOrg: string) {
    super(
      `Cross-tenant access attempted on lot ${lotId} by organization ${requestedOrg}. ` +
        `Multi-tenant invariant violation.`,
    );
    this.name = 'LotCrossTenantAccessError';
  }
}

export class StockMoveImmutableError extends Error {
  public readonly code = 'STOCK_MOVE_IMMUTABLE';
  constructor(stockMoveId: string) {
    super(
      `StockMove ${stockMoveId} is append-only. ` +
        `Use a new 'adjustment' move to record corrections.`,
    );
    this.name = 'StockMoveImmutableError';
  }
}

export class InvalidLotQuantityError extends Error {
  public readonly code = 'INVALID_LOT_QUANTITY';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLotQuantityError';
  }
}

export class InvalidLotExpiryError extends Error {
  public readonly code = 'INVALID_LOT_EXPIRY';
  constructor(receivedAt: Date, expiresAt: Date) {
    super(
      `Lot expires_at (${expiresAt.toISOString()}) must be > received_at ` +
        `(${receivedAt.toISOString()}).`,
    );
    this.name = 'InvalidLotExpiryError';
  }
}

export class InvalidUnitError extends Error {
  public readonly code = 'INVALID_UNIT';
  constructor(unit: string) {
    super(
      `Invalid unit "${unit}". Allowed: kg, g, L, ml, un.`,
    );
    this.name = 'InvalidUnitError';
  }
}

export class InvalidMoveTypeError extends Error {
  public readonly code = 'INVALID_MOVE_TYPE';
  constructor(moveType: string) {
    super(
      `Invalid move_type "${moveType}". Allowed: inbound, outbound, adjustment, waste.`,
    );
    this.name = 'InvalidMoveTypeError';
  }
}

export class InvalidMoveQuantitySignError extends Error {
  public readonly code = 'INVALID_MOVE_QUANTITY_SIGN';
  constructor(moveType: string, quantity: number) {
    super(
      `Move type "${moveType}" requires ${
        moveType === 'inbound' ? 'positive' : 'negative'
      } quantity; got ${quantity}.`,
    );
    this.name = 'InvalidMoveQuantitySignError';
  }
}
