import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../../inventory/inventory.module';
import { PoModule } from '../po/po.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { GoodsReceipt } from './domain/goods-receipt.entity';
import { GoodsReceiptLine } from './domain/goods-receipt-line.entity';
import { GoodsReceiptRepository } from './application/gr.repository';
import { GoodsReceiptLineRepository } from './application/gr-line.repository';
import { GrConfirmationService } from './application/gr-confirmation.service';
import { GrController } from './interface/gr.controller';

/**
 * procurement.gr bounded context (M3 Wave 2.2 — slice #7).
 *
 * Exports the GR confirmation service + read-only repositories so
 * downstream M3 slices (#8 UI, #11 incident search, #14 APPCC bundle,
 * #21 audit-chain) can `@Inject` them.
 *
 * Imports slice-#1 `InventoryModule` to access `LotRepository` (the
 * Lot creation seam reserved in slice #1 design.md).
 *
 * Per ADR-GR-PO-STATE-TRANSITION: slice-#6 `PoModule` is NOT imported
 * here unless `M3_PO_AGGREGATE_ENABLED=true`. The conditional import
 * happens in `ProcurementModule` to keep this leaf module pure.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GoodsReceipt, GoodsReceiptLine]),
    InventoryModule,
    // Sprint 4 W3-5b: PoModule exposes PurchaseOrder* repos consumed by
    // the post-commit reconciliation hook; ReconciliationModule exposes
    // the detector + reconciliation repo. Both modules are leaf modules
    // (no back-reference to GrModule) so no circular-import risk.
    PoModule,
    ReconciliationModule,
  ],
  controllers: [GrController],
  providers: [
    GoodsReceiptRepository,
    GoodsReceiptLineRepository,
    GrConfirmationService,
  ],
  exports: [
    GoodsReceiptRepository,
    GoodsReceiptLineRepository,
    GrConfirmationService,
  ],
})
export class GrModule {}
