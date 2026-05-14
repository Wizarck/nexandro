import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppliersModule } from '../../suppliers/suppliers.module';
import { PurchaseOrder } from './domain/purchase-order.entity';
import { PurchaseOrderLine } from './domain/purchase-order-line.entity';
import { PoCounter } from './domain/po-counter.entity';
import { PurchaseOrderRepository } from './infrastructure/purchase-order.repository';
import { PurchaseOrderLineRepository } from './infrastructure/purchase-order-line.repository';
import { PoCounterService } from './infrastructure/po-counter.service';
import { PoNumberService } from './application/po-number.service';
import { PoFactory } from './application/po.factory';
import { PoService } from './application/po.service';

/**
 * Procurement.po bounded context (M3 foundation slice).
 *
 * Exports the factory + service + repositories so downstream M3 slices
 * (#7 GR reconciliation, #8 procurement UI, #11 recall) can `@Inject`
 * them.
 *
 * Mutation flows beyond what's exported here (GR-driven state transitions,
 * audit-log emission) are owned by downstream slices per
 * ADR-PO-NO-AUDIT-EMIT-HERE.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PurchaseOrderLine, PoCounter]),
    SuppliersModule,
  ],
  providers: [
    PurchaseOrderRepository,
    PurchaseOrderLineRepository,
    PoCounterService,
    PoNumberService,
    PoFactory,
    PoService,
  ],
  exports: [
    PurchaseOrderRepository,
    PurchaseOrderLineRepository,
    PoCounterService,
    PoNumberService,
    PoFactory,
    PoService,
  ],
})
export class PoModule {}
