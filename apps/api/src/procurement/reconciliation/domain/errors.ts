/**
 * Domain errors for the procurement.reconciliation BC.
 *
 * Each error carries a stable `code` for the controller layer to map to
 * HTTP status. Mirrors the GR + PO error shape (procurement/gr/domain/
 * errors.ts) so the global ExceptionFilter has a single switch.
 */

export class ReconciliationNotFoundError extends Error {
  public readonly code = 'RECON_NOT_FOUND';
  constructor(id: string) {
    super(`Reconciliation not found: ${id}`);
    this.name = 'ReconciliationNotFoundError';
  }
}

export class IllegalReconciliationTransition extends Error {
  public readonly code = 'RECON_ILLEGAL_TRANSITION';
  constructor(fromState: string, toState: string) {
    super(
      `Illegal reconciliation transition: ${fromState} → ${toState}. ` +
        `Only 'abierta' is a valid source state; terminal states are immutable.`,
    );
    this.name = 'IllegalReconciliationTransition';
  }
}

export class ReconciliationInvariantError extends Error {
  public readonly code = 'RECON_INVARIANT';
  constructor(message: string) {
    super(message);
    this.name = 'ReconciliationInvariantError';
  }
}
