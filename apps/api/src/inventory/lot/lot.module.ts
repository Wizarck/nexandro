import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lot } from './domain/lot.entity';
import { StockMove } from './domain/stock-move.entity';
import { LotRepository } from './application/lot.repository';
import { StockMoveRepository } from './application/stock-move.repository';

/**
 * Inventory.lots bounded context (M3 foundation slice).
 *
 * Exports the two repositories so downstream M3 slices (#2 consumption,
 * #3 expiry alerts, #4 cost resolver, #7 GR reconciliation, #11-13 recall)
 * can `@Inject` them.
 *
 * This module ships read-only public surface; downstream slices that need
 * mutation call `LotRepository.save()` + `StockMoveRepository.append()`
 * directly per ADR-LOT-NO-EVENT-EMIT-HERE (audit event registration deferred
 * to slice #21).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Lot, StockMove])],
  providers: [LotRepository, StockMoveRepository],
  exports: [LotRepository, StockMoveRepository],
})
export class LotModule {}
