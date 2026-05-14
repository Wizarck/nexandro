/**
 * Domain errors for the procurement.gr BC.
 *
 * Per design.md errors module. Each error has a stable `code` field for
 * app-side mapping to HTTP status codes when the controller layer lands
 * (slice #8 owns the UI surface; this slice is service-layer only).
 */

export class GrNotFoundError extends Error {
  public readonly code = 'GR_NOT_FOUND';
  constructor(grId: string) {
    super(`GoodsReceipt not found: ${grId}`);
    this.name = 'GrNotFoundError';
  }
}

export class IllegalGrTransition extends Error {
  public readonly code = 'ILLEGAL_GR_TRANSITION';
  constructor(fromState: string, toState: string) {
    super(
      `Illegal GR state transition: ${fromState} → ${toState}. ` +
        `'cancelled' is only valid from 'draft'.`,
    );
    this.name = 'IllegalGrTransition';
  }
}

export class OverReceiptError extends Error {
  public readonly code = 'GR_OVER_RECEIPT';
  public readonly cumulative: number;
  public readonly limit: number;
  public readonly poLineId: string;
  constructor(poLineId: string, cumulative: number, limit: number) {
    super(
      `Over-receipt on po_line_id=${poLineId}: cumulative=${cumulative} ` +
        `exceeds limit=${limit} (qty_ordered × (1 + tolerance)).`,
    );
    this.name = 'OverReceiptError';
    this.poLineId = poLineId;
    this.cumulative = cumulative;
    this.limit = limit;
  }
}

export class PoLineAlreadyReceivedError extends Error {
  public readonly code = 'GR_PO_LINE_ALREADY_RECEIVED';
  constructor(poLineId: string, grId: string) {
    super(
      `po_line_id=${poLineId} already has a goods_receipt_lines row in ` +
        `gr_id=${grId} (UNIQUE partial constraint).`,
    );
    this.name = 'PoLineAlreadyReceivedError';
  }
}

export class GrLineInvariantError extends Error {
  public readonly code = 'GR_LINE_INVARIANT';
  constructor(message: string) {
    super(message);
    this.name = 'GrLineInvariantError';
  }
}

export class IndependentGrMissingSupplierError extends Error {
  public readonly code = 'GR_SHAPE_INCONSISTENT';
  constructor(message: string) {
    super(message);
    this.name = 'IndependentGrMissingSupplierError';
  }
}

export class PoAggregateNotEnabledError extends Error {
  public readonly code = 'GR_PO_AGGREGATE_NOT_ENABLED';
  constructor() {
    super('PO aggregate not yet enabled in this deployment');
    this.name = 'PoAggregateNotEnabledError';
  }
}

export class GrCrossTenantAccessError extends Error {
  public readonly code = 'GR_CROSS_TENANT_ACCESS';
  constructor(grId: string, requestedOrg: string) {
    super(
      `Cross-tenant access attempted on GR ${grId} by organization ` +
        `${requestedOrg}. Multi-tenant invariant violation.`,
    );
    this.name = 'GrCrossTenantAccessError';
  }
}
