import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import type { PoState } from '../domain/types';

export interface PoFilterOptions {
  supplierIds?: string[];
  states?: PoState[];
  limit?: number;
  offset?: number;
}

/**
 * Multi-tenant repository for {@link PurchaseOrder}.
 *
 * Per ADR-PO-MULTITENANT-AT-REPO (mirrors slice #1 ADR-LOT-MULTITENANT-AT-REPO):
 * every public method takes `organizationId` as the FIRST parameter and
 * includes it in every database query. There is intentionally NO overload
 * that omits it — TypeScript compile-time check + INT cross-tenant leakage
 * test enforce the invariant.
 *
 * Slice #6 (this slice) ships the public surface; mutation methods (`save`)
 * are reserved for downstream slices:
 *  - Creation → slice #7 m3-gr-aggregate-reconciliation (via PoFactory)
 *  - State transitions → slice #7 (GR partial/full) + slice #8 (UI cancel/close)
 *  - Audit-log emission → slice #21 (PO_* event registration)
 */
@Injectable()
export class PurchaseOrderRepository {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly typeormRepo: Repository<PurchaseOrder>,
  ) {}

  /**
   * Find a PO by id, gated on organizationId.
   * Returns null if the PO belongs to a different organization or doesn't exist.
   */
  async findById(
    organizationId: string,
    poId: string,
  ): Promise<PurchaseOrder | null> {
    return this.typeormRepo.findOne({
      where: { id: poId, organizationId },
    });
  }

  /**
   * Find a PO by its human-readable number ("PO-2026-0001"), gated on
   * organizationId. Returns null if the PO belongs to a different
   * organization or doesn't exist.
   *
   * Uses `idx_po_org_number_unique` (UNIQUE) for the lookup.
   */
  async findByNumber(
    organizationId: string,
    poNumber: string,
  ): Promise<PurchaseOrder | null> {
    return this.typeormRepo.findOne({
      where: { poNumber, organizationId },
    });
  }

  /**
   * Return POs for the given supplier within the org, newest-first.
   * Uses `idx_po_org_supplier_created` for the index scan.
   *
   * Pagination defaults to a 20-row window which matches the slice #8
   * j11 procurement table's default page size.
   */
  async findActiveBySupplier(
    organizationId: string,
    supplierId: string,
    limit = 20,
    offset = 0,
  ): Promise<PurchaseOrder[]> {
    return this.typeormRepo.find({
      where: { organizationId, supplierId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Return POs in active states (`sent`, `partially_received`) for the
   * given org, ordered by expected delivery date ascending (nulls last).
   * Uses the partial index `idx_po_org_state_expected_delivery`.
   *
   * Powers the slice #8 ops dashboard "active POs" widget.
   */
  async findActiveOps(
    organizationId: string,
    limit = 50,
    offset = 0,
  ): Promise<PurchaseOrder[]> {
    return this.typeormRepo
      .createQueryBuilder('po')
      .where('po.organization_id = :organizationId', { organizationId })
      .andWhere('po.state IN (:...activeStates)', {
        activeStates: ['sent', 'partially_received'],
      })
      .orderBy('po.expected_delivery_date', 'ASC', 'NULLS LAST')
      .take(limit)
      .skip(offset)
      .getMany();
  }

  /**
   * Sprint 4 W3-9 — filter-chip surface for the j11 PO tab.
   *
   * Unlike {@link findActiveOps}, this returns POs across ALL states by
   * default (so chips like `estado=draft` or `estado=cancelled` resolve)
   * and accepts optional supplier + state narrowing. Ordered newest-first
   * for the chip-filtered view (delivery-date ordering only makes sense
   * for the active-ops widget).
   *
   * When called with empty filters this is equivalent to "every PO in the
   * org, newest first" — guard the call at the controller layer so the
   * default landing view keeps the active-ops scope.
   */
  async findByFilter(
    organizationId: string,
    options: PoFilterOptions = {},
  ): Promise<PurchaseOrder[]> {
    const qb = this.typeormRepo
      .createQueryBuilder('po')
      .where('po.organization_id = :organizationId', { organizationId });
    if (options.supplierIds && options.supplierIds.length > 0) {
      qb.andWhere('po.supplier_id IN (:...supplierIds)', {
        supplierIds: options.supplierIds,
      });
    }
    if (options.states && options.states.length > 0) {
      qb.andWhere('po.state IN (:...states)', { states: options.states });
    }
    return qb
      .orderBy('po.created_at', 'DESC')
      .take(options.limit ?? 50)
      .skip(options.offset ?? 0)
      .getMany();
  }

  /**
   * Bulk lookup by ids within an organization. Used by downstream slices
   * (e.g. slice #8 UI multi-select; slice #7 GR processing). Returns only
   * POs that belong to the requested organization — silently drops any id
   * whose row lives in another tenant.
   */
  async findManyByIds(
    organizationId: string,
    poIds: string[],
  ): Promise<PurchaseOrder[]> {
    if (poIds.length === 0) return [];
    return this.typeormRepo.find({
      where: { organizationId, id: In(poIds) },
    });
  }

  /**
   * Internal persistence method. Reserved for `PoFactory` (creation) and
   * downstream slices #7 / #8 (state transitions). Not part of the public
   * surface in this slice — callers go through factory + application
   * service to enforce invariants.
   */
  async save(po: PurchaseOrder): Promise<PurchaseOrder> {
    return this.typeormRepo.save(po);
  }
}
