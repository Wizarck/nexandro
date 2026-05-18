import { Injectable } from '@nestjs/common';
import {
  IllegalReconciliationTransition,
  ReconciliationInvariantError,
  ReconciliationNotFoundError,
} from '../domain/errors';
import {
  Reconciliation,
  ReconciliationState,
} from '../domain/reconciliation.entity';
import {
  ListByOrgOpts,
  ReconciliationRepository,
} from '../infrastructure/reconciliation.repository';

export interface ResolvePayload {
  state: Exclude<ReconciliationState, 'abierta'>;
  notes: string | null;
}

const TERMINAL_STATES: ReadonlyArray<
  Exclude<ReconciliationState, 'abierta'>
> = ['aceptada', 'nota-credito', 'devuelta'];

/**
 * Application service for the procurement.reconciliation BC.
 *
 * The j11 Reconciliación tab consumes this service via the controller
 * (GET list, POST resolve). The discrepancy detector inserts rows
 * separately from inside a GR confirmation transaction; the service
 * therefore only owns READ + RESOLVE today.
 *
 * State machine (enforced here AND at the DB layer):
 *   abierta → aceptada | nota-credito | devuelta (terminal)
 *
 * RBAC: the controller is the gate (`@Roles('OWNER')` on resolve,
 * `@Roles('OWNER','MANAGER')` on list). The service trusts the caller
 * — but the `resolve()` invariants below cannot be bypassed even by an
 * Owner with stale state.
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly repo: ReconciliationRepository) {}

  /**
   * List currently-open reconciliations for the org (default surface
   * for the j11 tab). Capped at 50 — pagination lands when the
   * frontend asks.
   */
  async findOpen(
    organizationId: string,
    opts: Omit<ListByOrgOpts, 'state'> = {},
  ): Promise<Reconciliation[]> {
    return this.repo.listByOrg(organizationId, { ...opts, state: 'abierta' });
  }

  /**
   * Generic list (any state) used by the controller when the user
   * explicitly filters or asks for all rows. `opts.state` is forwarded
   * verbatim; when omitted, every state is returned.
   */
  async list(
    organizationId: string,
    opts: ListByOrgOpts = {},
  ): Promise<Reconciliation[]> {
    return this.repo.listByOrg(organizationId, opts);
  }

  /**
   * Sprint 4 W3-10 — open-reconciliation count for the j11 tab counter.
   * Defaults to `state='abierta'` because the badge surfaces ops-pending
   * work; pass an explicit `state` opt to count another bucket.
   */
  async countOpen(organizationId: string): Promise<number> {
    return this.repo.countByOrg(organizationId, { state: 'abierta' });
  }

  /**
   * Single-row lookup. Throws ReconciliationNotFoundError on cross-
   * tenant access or unknown id. Used by the drawer detail view.
   */
  async getById(id: string, organizationId: string): Promise<Reconciliation> {
    const row = await this.repo.findById(id, organizationId);
    if (row === null) {
      throw new ReconciliationNotFoundError(id);
    }
    return row;
  }

  /**
   * Resolve an open reconciliation. Forward-only state machine —
   * `abierta` is the only valid source state; all three targets are
   * terminal. The repository UPDATE is gated on `state='abierta'` so
   * concurrent resolves cannot both succeed; if affected=0, this method
   * re-reads to distinguish "already-resolved" (→ IllegalTransition)
   * from "not-found / cross-tenant" (→ NotFound).
   *
   * `notes` may be NULL (operator chose Aceptar without commentary);
   * for `nota-credito` we soft-require notes since the supplier email
   * template references them — but enforce only as a 200-char cap, not
   * a presence requirement (UX deliberately accepts blank notes per
   * j11 spec).
   */
  async resolve(
    id: string,
    organizationId: string,
    payload: ResolvePayload,
    userId: string,
  ): Promise<Reconciliation> {
    if (!TERMINAL_STATES.includes(payload.state)) {
      throw new IllegalReconciliationTransition('abierta', payload.state);
    }
    if (payload.notes !== null && payload.notes.length > 1000) {
      throw new ReconciliationInvariantError(
        'resolution_notes exceeds 1000 characters',
      );
    }

    const affected = await this.repo.resolve(id, organizationId, {
      state: payload.state,
      userId,
      notes: payload.notes,
    });

    if (affected === 0) {
      // Distinguish missing row from already-resolved.
      const current = await this.repo.findById(id, organizationId);
      if (current === null) {
        throw new ReconciliationNotFoundError(id);
      }
      throw new IllegalReconciliationTransition(current.state, payload.state);
    }

    // Re-read so the caller gets the canonical post-update row (with
    // resolved_at populated by the service clock, not the DB clock).
    const updated = await this.repo.findById(id, organizationId);
    if (updated === null) {
      // Theoretically unreachable — the UPDATE just succeeded.
      throw new ReconciliationNotFoundError(id);
    }
    return updated;
  }
}
