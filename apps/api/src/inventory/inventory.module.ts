import { Module } from '@nestjs/common';
import { ConsumptionModule } from './consumption/consumption.module';
import { LotModule } from './lot/lot.module';

/**
 * Inventory bounded-context aggregator. Re-exports `LotModule` (slice #1
 * `m3-lot-aggregate`) and `ConsumptionModule` (slice #2
 * `m3-lot-consumption-events`) so M3 downstream slices import a single
 * module rather than walking sub-paths.
 *
 * Future M3 slices will add `cost-resolver` (slice #4-5), `expiry-alerts`
 * (slice #3), etc. as sub-modules under this aggregator.
 */
@Module({
  imports: [LotModule, ConsumptionModule],
  exports: [LotModule, ConsumptionModule],
})
export class InventoryModule {}
