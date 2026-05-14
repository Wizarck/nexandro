/**
 * Domain errors for the procurement.po BC.
 *
 * Per design.md ADR-PO-STATE-MACHINE + ADR-PO-LINE-IMMUTABILITY +
 * ADR-PO-NUMBER-FORMAT. Each error carries a stable `code` field for
 * downstream slice #8 UI mapping to HTTP status codes / toast copy.
 */

import type { PoState } from './types';

export class IllegalStateTransitionError extends Error {
  public readonly code = 'PO_E_ILLEGAL_TRANSITION';
  constructor(public readonly from: PoState, public readonly to: PoState) {
    super(
      `Illegal PO state transition: ${from} -> ${to}. ` +
        `See ADR-PO-STATE-MACHINE for the legal transition matrix.`,
    );
    this.name = 'IllegalStateTransitionError';
  }
}

export class PoMustHaveAtLeastOneLineError extends Error {
  public readonly code = 'PO_E_MUST_HAVE_AT_LEAST_ONE_LINE';
  constructor() {
    super('A PurchaseOrder must have at least one line.');
    this.name = 'PoMustHaveAtLeastOneLineError';
  }
}

export class SupplierNotFoundError extends Error {
  public readonly code = 'PO_E_SUPPLIER_NOT_FOUND';
  constructor(supplierId: string, organizationId: string) {
    super(
      `Supplier ${supplierId} not found for organization ${organizationId}.`,
    );
    this.name = 'SupplierNotFoundError';
  }
}

export class InvalidCurrencyCodeError extends Error {
  public readonly code = 'PO_E_INVALID_CURRENCY';
  constructor(currency: string) {
    super(
      `Invalid currency "${currency}". Must be a 3-letter ISO 4217 code (e.g. EUR, USD).`,
    );
    this.name = 'InvalidCurrencyCodeError';
  }
}

export class PoLineImmutableAfterSendError extends Error {
  public readonly code = 'PO_E_LINE_IMMUTABLE_AFTER_SEND';
  constructor(
    public readonly poId: string,
    public readonly state: PoState,
  ) {
    super(
      `PO ${poId} is in state ${state}; lines are immutable once a PO leaves 'draft'. ` +
        `To correct an error, cancel + recreate the PO.`,
    );
    this.name = 'PoLineImmutableAfterSendError';
  }
}

export class PoNumberAllocationDeadlockError extends Error {
  public readonly code = 'PO_E_NUMBER_ALLOCATION_DEADLOCK';
  constructor(organizationId: string, year: number) {
    super(
      `Failed to allocate PO number for organization ${organizationId}, year ${year}: ` +
        `database lock timeout. Retry the operation.`,
    );
    this.name = 'PoNumberAllocationDeadlockError';
  }
}

export class InvalidPoInputError extends Error {
  public readonly code = 'PO_E_INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPoInputError';
  }
}
