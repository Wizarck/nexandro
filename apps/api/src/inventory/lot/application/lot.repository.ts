import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lot } from '../domain/lot.entity';

/**
 * Read-only multi-tenant repository for {@link Lot}.
 *
 * Per ADR-LOT-MULTITENANT-AT-REPO: every method takes `organizationId` as
 * the FIRST parameter and includes it in every query. There is intentionally
 * NO overload that omits it — TypeScript compile-time check + INT
 * cross-tenant leakage test enforce the invariant.
 *
 * Mutation methods (save / update / delete) are claimed by downstream slices
 * (#7 wires save through the GR confirmation flow; this slice's public
 * surface is read-only).
 *
 * The internal `save()` method exists so slice #7 can plug in without
 * re-exporting it from the public surface. Internal-only — do NOT add
 * `@Module exports`.
 */
@Injectable()
export class LotRepository {
  constructor(
    @InjectRepository(Lot)
    private readonly typeormRepo: Repository<Lot>,
  ) {}

  /**
   * Find a lot by id, gated on organizationId.
   * Returns null if the lot belongs to a different organization or doesn't exist.
   */
  async findById(organizationId: string, lotId: string): Promise<Lot | null> {
    return this.typeormRepo.findOne({
      where: { id: lotId, organizationId },
    });
  }

  /**
   * Find a lot by its photo-ingestion provenance link, gated on
   * organizationId. Used by the photo-ingestion-routing BC (M3 hardening
   * H1a) for idempotency lookup: if a Lot already exists with the given
   * `sourcePhotoIngestionId`, the routing service returns the existing
   * row instead of inserting a duplicate.
   *
   * The DB enforces 1:1 mapping via `uq_lots_source_photo_ingestion`
   * (migration 0040, UNIQUE partial WHERE source_photo_ingestion_id IS
   * NOT NULL); this method is the application-layer short-circuit per
   * ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY.
   */
  async findBySourcePhotoIngestionId(
    organizationId: string,
    sourcePhotoIngestionId: string,
  ): Promise<Lot | null> {
    return this.typeormRepo.findOne({
      where: { organizationId, sourcePhotoIngestionId },
    });
  }

  /**
   * Legacy M2 compatibility — find a lot by the `supplier_lot_code` field
   * inside its `metadata` jsonb. Used by callers that haven't migrated from
   * `ingredient.lot_code text` string lookups yet. Slow path; the recall
   * traversal indexes (slice #2 migration 0037) accelerate the common path.
   */
  async findByLotCode(
    organizationId: string,
    lotCode: string,
  ): Promise<Lot | null> {
    return this.typeormRepo
      .createQueryBuilder('lot')
      .where('lot.organization_id = :organizationId', { organizationId })
      .andWhere("lot.metadata->>'supplier_lot_code' = :lotCode", { lotCode })
      .getOne();
  }

  /**
   * Return lots with `quantityRemaining > 0` for the given org + location,
   * ordered by `receivedAt` ASC (FIFO) with `expiresAt` ASC NULLS LAST
   * as tiebreaker (FEFO). Uses `idx_lots_org_loc_available_fifo` partial
   * index for sub-10ms response at 100k lots/org.
   *
   * `asOf` filters lots that didn't exist at the supplied timestamp
   * (historical cost-rollup queries — slice #4 uses this for time-travel
   * cost computations).
   *
   * `unitFilter` is optional — when set, restricts to lots of matching unit.
   * Most cost-rollup callers will pass the recipe-ingredient's unit.
   *
   * NOTE: this slice does NOT FK-join into M2 ingredients — that join is
   * slice #4's responsibility (it owns the ingredient ↔ lot mapping logic).
   */
  async findAvailableFifo(
    organizationId: string,
    locationId: string,
    asOf: Date,
    unitFilter?: string,
  ): Promise<Lot[]> {
    const qb = this.typeormRepo
      .createQueryBuilder('lot')
      .where('lot.organization_id = :organizationId', { organizationId })
      .andWhere('lot.location_id = :locationId', { locationId })
      .andWhere('lot.quantity_remaining > 0')
      .andWhere('lot.received_at <= :asOf', { asOf })
      .orderBy('lot.received_at', 'ASC')
      .addOrderBy('lot.expires_at', 'ASC', 'NULLS LAST');
    if (unitFilter !== undefined) {
      qb.andWhere('lot.unit = :unit', { unit: unitFilter });
    }
    return qb.getMany();
  }

  /**
   * Internal persistence method. Reserved for slice #7 (GR confirmation)
   * to plug into. Not part of the public surface in this slice — the
   * downstream slice imports `Lot` + `LotRepository` and calls this
   * method directly from its application service.
   */
  async save(lot: Lot): Promise<Lot> {
    return this.typeormRepo.save(lot);
  }

  /**
   * Slice #3 (`m3-lot-expiry-alerts`, Wave 2.2) — additive read-only
   * scan used by `ExpiryScannerService`.
   *
   * Returns lots with `expires_at` strictly in the future and within
   * `withinHours` of `now()`, with `quantity_remaining > 0`. Filters
   * `expires_at IS NOT NULL` so the planner picks the partial index
   * `idx_lots_org_expires_active` (provisioned in migration 0026 per
   * ADR-LOT-INDEXES, claimed by this slice per ADR-EXPIRY-INDEX-USE).
   *
   * Per REQ-EX-4: `organizationId` is the FIRST parameter and gates
   * every WHERE clause.
   *
   * Per REQ-EX-5 + REQ-EX-6: excludes zero-quantity and past-expiry
   * lots at the SQL layer.
   */
  async findByExpiryWindow(
    organizationId: string,
    withinHours: number,
  ): Promise<Lot[]> {
    return this.typeormRepo
      .createQueryBuilder('lot')
      .where('lot.organization_id = :organizationId', { organizationId })
      .andWhere('lot.expires_at IS NOT NULL')
      .andWhere('lot.expires_at > now()')
      .andWhere(
        `lot.expires_at <= now() + (:withinHours * interval '1 hour')`,
        { withinHours },
      )
      .andWhere('lot.quantity_remaining > 0')
      .orderBy('lot.expires_at', 'ASC')
      .getMany();
  }

  /**
   * Slice #3 helper — return the distinct `organization_id` set with
   * at least one lot whose `expires_at` falls in `(now, now+within]`
   * and `quantity_remaining > 0`. Used by `ExpiryScannerService` to
   * enumerate tenants per tick without violating REQ-EX-4 (the
   * subsequent `findByExpiryWindow` call gates on org).
   *
   * Uses the partial index `idx_lots_org_expires_active`. Returns an
   * array of UUID strings.
   */
  async findDistinctOrgsWithExpiryIn(
    withinHours: number,
  ): Promise<string[]> {
    const rows: Array<{ organization_id: string }> = await this.typeormRepo
      .createQueryBuilder('lot')
      .select('DISTINCT lot.organization_id', 'organization_id')
      .where('lot.expires_at IS NOT NULL')
      .andWhere('lot.expires_at > now()')
      .andWhere(
        `lot.expires_at <= now() + (:withinHours * interval '1 hour')`,
        { withinHours },
      )
      .andWhere('lot.quantity_remaining > 0')
      .getRawMany();
    return rows.map((r) => r.organization_id);
  }
}
