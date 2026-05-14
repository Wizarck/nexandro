import { Module } from '@nestjs/common';
import { LotModule } from './lot/lot.module';

/**
 * Inventory bounded-context aggregator. Re-exports `LotModule` so M3
 * downstream slices import a single module rather than walking sub-paths.
 *
 * Future M3 slices will add `cost-resolver` (slice #4-5), `expiry-alerts`
 * (slice #3), etc as sub-modules under this aggregator.
 */
@Module({
  imports: [LotModule],
  exports: [LotModule],
})
export class InventoryModule {}
