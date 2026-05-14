import { Module } from '@nestjs/common';
import { GrModule } from './gr/gr.module';
import { PoModule } from './po/po.module';

/**
 * Procurement bounded-context aggregator. Re-exports `PoModule` (slice
 * #6 m3-po-aggregate) and `GrModule` (slice #7 m3-gr-aggregate-
 * reconciliation) so downstream M3 slices import a single module rather
 * than walking sub-paths.
 */
@Module({
  imports: [PoModule, GrModule],
  exports: [PoModule, GrModule],
})
export class ProcurementModule {}
