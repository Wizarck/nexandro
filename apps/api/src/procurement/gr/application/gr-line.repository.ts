import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { GoodsReceiptLine } from '../domain/goods-receipt-line.entity';

/**
 * Repository for {@link GoodsReceiptLine}.
 *
 * Lines are gated through their parent header's `organization_id` (the
 * parent FK + cascade ensures no orphan lines exist; queries always JOIN
 * through the header for cross-tenant safety, per ADR-GR-INDEXES note
 * "Why no `(organization_id)` on `goods_receipt_lines`").
 */
@Injectable()
export class GoodsReceiptLineRepository {
  constructor(
    @InjectRepository(GoodsReceiptLine)
    private readonly typeormRepo: Repository<GoodsReceiptLine>,
  ) {}

  /**
   * Lines for a single GR. Caller is expected to have already verified
   * the GR header belongs to the correct tenant (via GoodsReceiptRepository
   * .findById). Uses `idx_gr_line_gr`.
   */
  async findByGr(grId: string): Promise<GoodsReceiptLine[]> {
    return this.typeormRepo.find({ where: { grId } });
  }

  /**
   * Cumulative qty_received across all CONFIRMED GRs for a given po_line_id,
   * gated on organizationId via the header JOIN. Used by GrConfirmationService
   * for the over-receipt accumulator check (ADR-GR-PARTIAL-RECEIPT).
   *
   * Returns 0 if no prior confirmed lines exist.
   */
  async sumQtyReceivedByPoLine(
    organizationId: string,
    poLineId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(GoodsReceiptLine)
      : this.typeormRepo;
    const row = await repo
      .createQueryBuilder('grl')
      .innerJoin('goods_receipts', 'gr', 'gr.id = grl.gr_id')
      .where('gr.organization_id = :organizationId', { organizationId })
      .andWhere('grl.po_line_id = :poLineId', { poLineId })
      .andWhere("gr.state = 'confirmed'")
      .select('COALESCE(SUM(grl.qty_received_actual), 0)', 'total')
      .getRawOne<{ total: string | number | null }>();
    if (row === undefined || row === null || row.total === null) return 0;
    const total = typeof row.total === 'string' ? Number.parseFloat(row.total) : row.total;
    return Number.isFinite(total) ? total : 0;
  }

  /** Internal bulk insert; called inside GrConfirmationService transaction. */
  async saveMany(
    lines: GoodsReceiptLine[],
    manager?: EntityManager,
  ): Promise<GoodsReceiptLine[]> {
    const repo = manager
      ? manager.getRepository(GoodsReceiptLine)
      : this.typeormRepo;
    return repo.save(lines);
  }
}
