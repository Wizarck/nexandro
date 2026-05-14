import { Module } from '@nestjs/common';
import { ConsumptionModule } from './consumption/consumption.module';
import { ExpiryModule } from './expiry/expiry.module';
import { LotModule } from './lot/lot.module';

/**
 * Inventory bounded-context aggregator. Re-exports `LotModule` (slice #1
 * `m3-lot-aggregate`), `ConsumptionModule` (slice #2
 * `m3-lot-consumption-events`), and `ExpiryModule` (slice #3
 * `m3-lot-expiry-alerts`) so M3 downstream slices import a single
 * module rather than walking sub-paths.
 *
 * Future M3 slices will add `cost-resolver` (slices #4-5) etc as
 * sub-modules under this aggregator.
 */
@Module({
  imports: [LotModule, ConsumptionModule, ExpiryModule],
  exports: [LotModule, ConsumptionModule, ExpiryModule],
})
export class InventoryModule {}
