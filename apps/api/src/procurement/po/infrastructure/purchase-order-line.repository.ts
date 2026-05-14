import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import { PurchaseOrderLine } from '../domain/purchase-order-line.entity';
import { PoLineImmutableAfterSendError } from '../domain/errors';

/**
 * Patch shape accepted by {@link PurchaseOrderLineRepository.update}.
 * Excludes id + foreign keys (purchase_order_id, organization_id, ingredient_id)
 * which are immutable for the life of the line row.
 */
export interface PurchaseOrderLinePatch {
  quantityOrdered?: number;
  unit?: PurchaseOrderLine['unit'];
  unitPrice?: number;
  vatRate?: number;
  vatInclusive?: boolean;
  lineSubtotal?: number;
  lineVat?: number;
  lineTotal?: number;
  lineNumber?: number;
}

/**
 * Multi-tenant repository for {@link PurchaseOrderLine}.
 *
 * Per ADR-PO-LINE-IMMUTABILITY: lines are mutable only while the parent
 * PO is in state `draft`. The `update` and `delete` methods enforce this
 * by joining to the parent and throwing
 * {@link PoLineImmutableAfterSendError} when the parent has left draft.
 *
 * Every public method takes `organizationId` as the FIRST parameter.
 */
@Injectable()
export class PurchaseOrderLineRepository {
  constructor(
    @InjectRepository(PurchaseOrderLine)
    private readonly typeormRepo: Repository<PurchaseOrderLine>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
  ) {}

  /**
   * Return all lines for a PO, ordered by line_number ascending. The
   * `organizationId` gate ensures cross-tenant lookups return an empty
   * array even if the caller knows the PO id.
   */
  async findByPo(
    organizationId: string,
    poId: string,
  ): Promise<PurchaseOrderLine[]> {
    return this.typeormRepo.find({
      where: { organizationId, purchaseOrderId: poId },
      order: { lineNumber: 'ASC' },
    });
  }

  /**
   * Find a single line by id within the organization.
   */
  async findById(
    organizationId: string,
    lineId: string,
  ): Promise<PurchaseOrderLine | null> {
    return this.typeormRepo.findOne({
      where: { id: lineId, organizationId },
    });
  }

  /**
   * Update a line. Throws {@link PoLineImmutableAfterSendError} if the
   * parent PO is not in state `draft`.
   *
   * Recompute of header totals is the caller's responsibility — typically
   * `PoFactory.recomputeTotals(poId)` after a batch of line updates in
   * draft state.
   */
  async update(
    organizationId: string,
    lineId: string,
    patch: PurchaseOrderLinePatch,
  ): Promise<PurchaseOrderLine> {
    await this.assertParentIsDraft(organizationId, lineId);
    await this.typeormRepo.update({ id: lineId, organizationId }, patch);
    const updated = await this.findById(organizationId, lineId);
    if (updated === null) {
      // The row vanished between the assert and the update — treat as
      // not-found for the caller. Multi-tenant violation cannot happen
      // here because both queries gate on organizationId.
      throw new PoLineImmutableAfterSendError(lineId, 'cancelled');
    }
    return updated;
  }

  /**
   * Delete a line. Throws {@link PoLineImmutableAfterSendError} if the
   * parent PO is not in state `draft`.
   */
  async delete(organizationId: string, lineId: string): Promise<void> {
    await this.assertParentIsDraft(organizationId, lineId);
    await this.typeormRepo.delete({ id: lineId, organizationId });
  }

  /**
   * Internal persistence method. Reserved for `PoFactory` (creation flow).
   * Multi-line batch-save in a single transaction.
   */
  async saveMany(lines: PurchaseOrderLine[]): Promise<PurchaseOrderLine[]> {
    if (lines.length === 0) return [];
    return this.typeormRepo.save(lines);
  }

  private async assertParentIsDraft(
    organizationId: string,
    lineId: string,
  ): Promise<void> {
    const row = await this.typeormRepo
      .createQueryBuilder('line')
      .innerJoin(
        PurchaseOrder,
        'po',
        'po.id = line.purchase_order_id AND po.organization_id = line.organization_id',
      )
      .select(['po.id AS po_id', 'po.state AS po_state'])
      .where('line.id = :lineId', { lineId })
      .andWhere('line.organization_id = :organizationId', { organizationId })
      .getRawOne<{ po_id: string; po_state: PurchaseOrder['state'] }>();

    if (row === undefined) {
      // Either the line doesn't exist or it belongs to another org.
      // Treat as "no-op" for the caller — `delete` returns success on
      // missing rows by Postgres convention, and `update` will surface
      // the missing row when it refetches.
      return;
    }
    if (row.po_state !== 'draft') {
      throw new PoLineImmutableAfterSendError(row.po_id, row.po_state);
    }
  }
}
