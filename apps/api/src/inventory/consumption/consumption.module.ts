import { Module } from '@nestjs/common';
import { LotModule } from '../lot/lot.module';
import { ConsumptionService } from './application/consumption.service';

/**
 * Inventory.consumption bounded context (M3 slice #2,
 * `m3-lot-consumption-events`).
 *
 * Exports `ConsumptionService` — the canonical seam for emitting
 * `LotConsumedEvent` per ADR-CONSUMPTION-EMITTER-LOCATION. Downstream
 * slices (#11 incident search, #12 trace tree, #13 recall dispatch)
 * consume the event via `@OnEvent(LOT_CONSUMED_EVENT)` once slice #21
 * wires the `AuditLogSubscriber` registration.
 *
 * Per ADR-CONSUMPTION-NO-EMIT-HERE: this module does NOT register a
 * subscriber for `LOT_CONSUMED_EVENT` itself. The event is emitted on
 * the bus (in-process) but persistence to `audit_log` is deferred to
 * slice #21.
 *
 * Imports `LotModule` (slice #1) for `LotRepository` + `StockMoveRepository`.
 * Does NOT re-export those — callers reach them through `LotModule`
 * directly. The consumption BC is the *application-layer* author of
 * lot consumption side effects; downstream code touches lots via the
 * lot module's read-only surface.
 */
@Module({
  imports: [LotModule],
  providers: [ConsumptionService],
  exports: [ConsumptionService],
})
export class ConsumptionModule {}
