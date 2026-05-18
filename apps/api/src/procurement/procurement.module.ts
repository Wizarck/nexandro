import { Module } from '@nestjs/common';
import { GrModule } from './gr/gr.module';
import { PoModule } from './po/po.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

/**
 * Procurement bounded-context aggregator. Re-exports `PoModule` (slice
 * #6 m3-po-aggregate), `GrModule` (slice #7 m3-gr-aggregate-
 * reconciliation), and `ReconciliationModule` (Sprint 3 Block C j11
 * shell) so downstream M3 slices import a single module rather than
 * walking sub-paths.
 */
@Module({
  imports: [PoModule, GrModule, ReconciliationModule],
  exports: [PoModule, GrModule],
})
export class ProcurementModule {}
