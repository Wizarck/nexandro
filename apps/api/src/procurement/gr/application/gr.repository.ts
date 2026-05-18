import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { GoodsReceipt, GoodsReceiptState } from '../domain/goods-receipt.entity';

/**
 * Multi-tenant repository for {@link GoodsReceipt}.
 *
 * Per ADR-GR-INDEXES + slice #1 ADR-LOT-MULTITENANT-AT-REPO: every method
 * takes `organizationId` as the FIRST parameter and includes it in every
 * query. No global find / list surface.
 *
 * Mutation methods are internal (called by GrConfirmationService inside a
 * transaction); read methods are the public surface consumed by slice #8
 * (UI), slice #11 (incident search), slice #14 (APPCC bundle).
 */
@Injectable()
export class GoodsReceiptRepository {
  constructor(
    @InjectRepository(GoodsReceipt)
    private readonly typeormRepo: Repository<GoodsReceipt>,
  ) {}

  /**
   * Find a GR by id, gated on organizationId. Returns null on cross-tenant.
   */
  async findById(
    organizationId: string,
    grId: string,
  ): Promise<GoodsReceipt | null> {
    return this.typeormRepo.findOne({
      where: { id: grId, organizationId },
    });
  }

  /**
   * Find a GR by its photo-ingestion provenance link, gated on
   * organizationId. Used by the photo-ingestion-routing BC (M3 hardening
   * H1a) for idempotency lookup. The DB enforces 1:1 mapping via
   * `uq_goods_receipts_source_photo_ingestion` (migration 0040, UNIQUE
   * partial WHERE source_photo_ingestion_id IS NOT NULL); this method is
   * the application-layer short-circuit per
   * ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY.
   */
  async findBySourcePhotoIngestionId(
    organizationId: string,
    sourcePhotoIngestionId: string,
  ): Promise<GoodsReceipt | null> {
    return this.typeormRepo.findOne({
      where: { organizationId, sourcePhotoIngestionId },
    });
  }

  /** Most-recent GRs for an org (ops dashboard). Uses `idx_gr_org_received`. */
  async findRecent(
    organizationId: string,
    limit: number,
    offset?: number,
  ): Promise<GoodsReceipt[]> {
    return this.typeormRepo.find({
      where: { organizationId },
      order: { receivedAt: 'DESC' },
      take: limit,
      skip: offset ?? 0,
    });
  }

  /**
   * Sprint 4 W3-9 — most-recent GRs filtered by location + state. Both
   * filters are optional; omit either to broaden the result set.
   * `locationIds` translates to a parameterised `IN (...)`. The
   * existing `idx_gr_org_received` covers the org+receivedAt
   * cardinality; the planner can drive further on the
   * `received_at_location_id` filter when callers narrow.
   */
  async findRecentFiltered(
    organizationId: string,
    limit: number,
    offset: number,
    filters: {
      locationIds?: string[];
      state?: GoodsReceiptState;
    } = {},
  ): Promise<GoodsReceipt[]> {
    // Short-circuit the explicit empty multi-select (callers should not
    // round-trip with `locationIds=[]` but the contract stays safe).
    if (filters.locationIds && filters.locationIds.length === 0) {
      return [];
    }
    const qb = this.typeormRepo
      .createQueryBuilder('gr')
      .where('gr.organization_id = :organizationId', { organizationId });
    if (filters.locationIds && filters.locationIds.length > 0) {
      qb.andWhere('gr.received_at_location_id IN (:...locationIds)', {
        locationIds: filters.locationIds,
      });
    }
    if (filters.state !== undefined) {
      qb.andWhere('gr.state = :state', { state: filters.state });
    }
    return qb
      .orderBy('gr.received_at', 'DESC')
      .take(limit)
      .skip(offset)
      .getMany();
  }

  /** All GRs for a PO (drill-down). Uses partial `idx_gr_org_po`. */
  async findByPoId(
    organizationId: string,
    poId: string,
    limit?: number,
    offset?: number,
  ): Promise<GoodsReceipt[]> {
    return this.typeormRepo.find({
      where: { organizationId, poId },
      order: { receivedAt: 'DESC' },
      take: limit,
      skip: offset ?? 0,
    });
  }

  /** Supplier history within a date range. Uses `idx_gr_org_supplier_received`. */
  async findBySupplierAndDateRange(
    organizationId: string,
    supplierId: string,
    from: Date,
    to: Date,
  ): Promise<GoodsReceipt[]> {
    return this.typeormRepo
      .createQueryBuilder('gr')
      .where('gr.organization_id = :organizationId', { organizationId })
      .andWhere('gr.supplier_id = :supplierId', { supplierId })
      .andWhere('gr.received_at >= :from', { from })
      .andWhere('gr.received_at <= :to', { to })
      .orderBy('gr.received_at', 'DESC')
      .getMany();
  }

  /**
   * Internal persistence. Called by GrConfirmationService inside a
   * transactional EntityManager. Not exposed on the module's public
   * surface (mutation flow is the service's responsibility).
   */
  async save(gr: GoodsReceipt, manager?: EntityManager): Promise<GoodsReceipt> {
    const repo = manager ? manager.getRepository(GoodsReceipt) : this.typeormRepo;
    return repo.save(gr);
  }

  /** Internal state transition update — gated on organizationId. */
  async updateState(
    organizationId: string,
    grId: string,
    state: GoodsReceiptState,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(GoodsReceipt) : this.typeormRepo;
    await repo.update({ id: grId, organizationId }, { state });
  }
}
