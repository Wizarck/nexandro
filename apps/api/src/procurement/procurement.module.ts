import { Module } from '@nestjs/common';
import { PoModule } from './po/po.module';

/**
 * Procurement bounded-context aggregator. Re-exports `PoModule` so M3
 * downstream slices import a single module rather than walking sub-paths.
 *
 * Future M3 slices add `gr` (slice #7 goods receipt) and any procurement
 * adjacency under this aggregator.
 */
@Module({
  imports: [PoModule],
  exports: [PoModule],
})
export class ProcurementModule {}
