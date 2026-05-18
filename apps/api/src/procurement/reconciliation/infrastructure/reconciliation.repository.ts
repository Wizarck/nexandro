import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DiscrepancyType,
  Reconciliation,
  ReconciliationState,
} from '../domain/reconciliation.entity';

export interface ListByOrgOpts {
  /** Filter by reconciliation state. Omit to return all states. */
  state?: ReconciliationState | ReconciliationState[];
  /**
   * Sprint 4 W3-9 — filter chip group. Each multi-value list narrows
   * the result set; omit to skip the filter. Empty arrays are treated
   * the same as `undefined` (no filter), matching the operator
   * expectation that "no chip selected = no constraint".
   */
  discrepancyTypes?: DiscrepancyType[];
  supplierIds?: string[];
  limit?: number;
  offset?: number;
}

export interface ResolveInput {
  state: Exclude<ReconciliationState, 'abierta'>;
  userId: string;
  notes: string | null;
}

/**
 * Multi-tenant repository for {@link Reconciliation}.
 *
 * Per ADR-LOT-MULTITENANT-AT-REPO (mirrors slice #1 + slice #6 + slice
 * #7 pattern): every method takes `organizationId` as the FIRST
 * parameter and includes it in every database query. There is
 * intentionally no overload that omits it.
 *
 * Mutation surface stays small (just `create` + `resolve`) — the
 * aggregate is otherwise immutable. Detection runs from inside a GR
 * confirmation transaction and inserts via `create`; the j11 drawer
 * calls `resolve` once per row.
 */
@Injectable()
export class ReconciliationRepository {
  constructor(
    @InjectRepository(Reconciliation)
    private readonly typeormRepo: Repository<Reconciliation>,
  ) {}

  /**
   * List reconciliations for an organization. Defaults to all states,
   * newest-first, capped at 50. The `(org, state)` index covers the
   * common `state=abierta` filter that powers the j11 default tab.
   */
  async listByOrg(
    organizationId: string,
    opts: ListByOrgOpts = {},
  ): Promise<Reconciliation[]> {
    const qb = this.typeormRepo
      .createQueryBuilder('recon')
      .where('recon.organization_id = :organizationId', { organizationId });

    if (opts.state !== undefined) {
      if (Array.isArray(opts.state)) {
        if (opts.state.length > 0) {
          qb.andWhere('recon.state IN (:...filterStates)', {
            filterStates: opts.state,
          });
        }
      } else {
        qb.andWhere('recon.state = :state', { state: opts.state });
      }
    }

    // Sprint 4 W3-9 — additive filter chips. Each list narrows the
    // result; empty arrays no-op to keep "no chip selected" semantically
    // equivalent to "filter omitted".
    if (opts.discrepancyTypes !== undefined && opts.discrepancyTypes.length > 0) {
      qb.andWhere('recon.discrepancy_type IN (:...discrepancyTypes)', {
        discrepancyTypes: opts.discrepancyTypes,
      });
    }
    if (opts.supplierIds !== undefined && opts.supplierIds.length > 0) {
      qb.andWhere('recon.supplier_id IN (:...supplierIds)', {
        supplierIds: opts.supplierIds,
      });
    }

    qb.orderBy('recon.created_at', 'DESC');
    qb.take(opts.limit ?? 50);
    qb.skip(opts.offset ?? 0);
    return qb.getMany();
  }

  /**
   * Sprint 4 W3-10 — cheap count for the j11 tab counter. Mirrors
   * `listByOrg`'s state-filter semantics so callers can ask for the
   * open-only count (`state='abierta'`) without paging the rows.
   * Uses the `idx_recon_org_state` partial index.
   */
  async countByOrg(
    organizationId: string,
    opts: Pick<ListByOrgOpts, 'state'> = {},
  ): Promise<number> {
    const qb = this.typeormRepo
      .createQueryBuilder('recon')
      .where('recon.organization_id = :organizationId', { organizationId });

    if (opts.state !== undefined) {
      if (Array.isArray(opts.state)) {
        if (opts.state.length > 0) {
          qb.andWhere('recon.state IN (:...filterStates)', {
            filterStates: opts.state,
          });
        }
      } else {
        qb.andWhere('recon.state = :state', { state: opts.state });
      }
    }

    return qb.getCount();
  }

  /**
   * Find a reconciliation by id, gated on organizationId. Returns null
   * on cross-tenant access (no error — the caller decides 404 vs other
   * mapping; the service layer surfaces a typed NotFound).
   */
  async findById(
    id: string,
    organizationId: string,
  ): Promise<Reconciliation | null> {
    return this.typeormRepo.findOne({
      where: { id, organizationId },
    });
  }

  /**
   * Bulk lookup by ids within an organization. Silently drops any id
   * whose row lives in another tenant.
   */
  async findManyByIds(
    organizationId: string,
    ids: string[],
  ): Promise<Reconciliation[]> {
    if (ids.length === 0) return [];
    return this.typeormRepo.find({
      where: { organizationId, id: In(ids) },
    });
  }

  /**
   * Insert a new reconciliation row. Caller is responsible for assigning
   * the `id` (typically `randomUUID()` from the detector). The DB
   * `recon_resolution_coherence_check` constraint rejects any insert
   * where state=`abierta` is paired with resolved_at/by.
   */
  async create(entity: Reconciliation): Promise<Reconciliation> {
    return this.typeormRepo.save(entity);
  }

  /**
   * Atomically move a reconciliation to a terminal state. UPDATE gated
   * on `(id, organizationId, state='abierta')` so concurrent resolves
   * are idempotent (returns affected=0 on the second call). The service
   * layer translates `affected=0` into `IllegalReconciliationTransition`
   * after re-reading the row to distinguish "already-resolved" from
   * "not-found".
   *
   * Returns the count of affected rows so the caller can react to the
   * race-loss case without an extra round-trip.
   */
  async resolve(
    id: string,
    organizationId: string,
    input: ResolveInput,
  ): Promise<number> {
    const result = await this.typeormRepo
      .createQueryBuilder()
      .update(Reconciliation)
      .set({
        state: input.state,
        resolvedAt: new Date(),
        resolvedByUserId: input.userId,
        resolutionNotes: input.notes,
      })
      .where('id = :id', { id })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere("state = 'abierta'")
      .execute();
    return result.affected ?? 0;
  }
}
