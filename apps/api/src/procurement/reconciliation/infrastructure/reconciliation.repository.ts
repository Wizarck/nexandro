import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Reconciliation,
  ReconciliationState,
} from '../domain/reconciliation.entity';

/**
 * Options accepted by {@link ReconciliationRepository.listByOrg}.
 *
 *  - `state`  — narrow to a single ReconciliationState. j11 default is
 *               `'abierta'`; omit to list every state for the supplier
 *               history drawer.
 *  - `limit`  — page size, clamped to `[1, MAX_LIMIT]` by the service
 *               layer; the repo trusts the caller and forwards as-is so
 *               the bounds belong to one place.
 *  - `offset` — page offset, must be ≥ 0.
 */
export interface ListReconciliationsOptions {
  state?: ReconciliationState;
  limit?: number;
  offset?: number;
}

/**
 * Payload accepted by {@link ReconciliationRepository.resolve}. Always
 * applied inside a single UPDATE so the row hits the
 * `recon_resolution_coherence_check` (migration 0046) atomically — the
 * three fields move together from (`abierta`, NULL, NULL) to
 * (`<terminal>`, NOT NULL, NOT NULL).
 */
export interface ResolveReconciliationPayload {
  state: Exclude<ReconciliationState, 'abierta'>;
  userId: string;
  notes?: string | null;
}

/**
 * Multi-tenant repository for {@link Reconciliation}.
 *
 * Mirrors slice #1 ADR-LOT-MULTITENANT-AT-REPO / slice #6
 * ADR-PO-MULTITENANT-AT-REPO: every method takes `organizationId` and
 * includes it in every database query. There is intentionally NO
 * overload that omits it.
 *
 * Sprint 4 W3-5b (this slice) ships the full public surface (list /
 * findById / create / resolve); the state-machine validation lives in
 * `ReconciliationService` (Layer 3). The repo is the persistence seam.
 */
@Injectable()
export class ReconciliationRepository {
  private readonly logger = new Logger(ReconciliationRepository.name);

  constructor(
    @InjectRepository(Reconciliation)
    private readonly typeormRepo: Repository<Reconciliation>,
  ) {}

  /**
   * List reconciliations for an org, newest-first. The default filter
   * (`state='abierta'`) is the j11 Reconciliación tab's working set.
   *
   * Uses `idx_recon_org_state` when `state` is set; falls back to
   * `idx_recon_org_created` (DESC) otherwise.
   */
  async listByOrg(
    organizationId: string,
    opts: ListReconciliationsOptions = {},
  ): Promise<Reconciliation[]> {
    const qb = this.typeormRepo
      .createQueryBuilder('r')
      .where('r.organization_id = :organizationId', { organizationId });

    if (opts.state) {
      qb.andWhere('r.state = :state', { state: opts.state });
    }

    qb.orderBy('r.created_at', 'DESC');

    if (opts.limit !== undefined) {
      qb.take(opts.limit);
    }
    if (opts.offset !== undefined) {
      qb.skip(opts.offset);
    }

    return qb.getMany();
  }

  /**
   * Find a single reconciliation by id, gated on organizationId. Returns
   * `null` when the row belongs to another tenant or does not exist —
   * the caller maps this to a 404 (never a 403, to avoid leaking that a
   * cross-tenant row exists).
   */
  async findById(
    id: string,
    organizationId: string,
  ): Promise<Reconciliation | null> {
    return this.typeormRepo.findOne({ where: { id, organizationId } });
  }

  /**
   * Persist a freshly-created reconciliation entity. Called by the
   * discrepancy detector caller (today: GR confirmation hook; tomorrow:
   * any other detection seam). Returns the persisted entity.
   *
   * The entity is expected to come pre-shaped with `id` (uuid) +
   * `organizationId` + `discrepancyType` + `diff` etc.; the repo does
   * not mutate fields. Default `state='abierta'` flows from the column
   * default in migration 0046.
   */
  async create(entity: Reconciliation): Promise<Reconciliation> {
    return this.typeormRepo.save(entity);
  }

  /**
   * Resolve a reconciliation in a single UPDATE: stamps `state`,
   * `resolved_at = NOW()`, `resolved_by_user_id`, and `resolution_notes`.
   *
   * Multi-tenancy gate: WHERE clause AND on `organization_id` + initial
   * `state='abierta'` so the UPDATE is also the state-machine guard at
   * the persistence layer (race-safe against double-resolve from two
   * tabs). Returns the freshly-updated entity, or `null` when the row
   * was not in `abierta` state (or did not exist for this tenant) — the
   * service layer surfaces the precise error.
   */
  async resolve(
    id: string,
    organizationId: string,
    payload: ResolveReconciliationPayload,
  ): Promise<Reconciliation | null> {
    const result = await this.typeormRepo
      .createQueryBuilder()
      .update(Reconciliation)
      .set({
        state: payload.state,
        resolvedAt: () => 'NOW()',
        resolvedByUserId: payload.userId,
        resolutionNotes: payload.notes ?? null,
      })
      .where('id = :id', { id })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere('state = :openState', { openState: 'abierta' })
      .execute();

    if (!result.affected || result.affected === 0) {
      return null;
    }

    // Re-read so the returned entity carries the freshly-stamped
    // `resolved_at` (the updater used `NOW()` raw and TypeORM's
    // .returning() varies by driver — re-select keeps the code portable).
    return this.findById(id, organizationId);
  }
}
