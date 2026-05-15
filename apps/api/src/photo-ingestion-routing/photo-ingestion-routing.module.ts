import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ProcurementModule } from '../procurement/procurement.module';
import { PhotoIngestionRoutingService } from './application/photo-ingestion-routing.service';
import { PhotoIngestionRoutingSubscriber } from './application/photo-ingestion-routing.subscriber';

/**
 * Photo-ingestion-routing BC (M3 hardening H1a slice
 * `m3-photo-ingest-downstream-routing`).
 *
 * Owns:
 *  - `PhotoIngestionRoutingService` — routes `PHOTO_INGESTION_SIGNED`
 *    envelopes to the appropriate downstream aggregate (Lot for product,
 *    GR draft for invoice). Idempotent via
 *    `source_photo_ingestion_id` unique partial indexes + app-layer
 *    short-circuit per ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY.
 *  - `PhotoIngestionRoutingSubscriber` — `@OnEvent(PHOTO_INGESTION_SIGNED)`
 *    wire forwarding the envelope to the service. Try/catch wrapper.
 *
 * Imports:
 *  - `InventoryModule` for `LotRepository` (creates the Lot row).
 *  - `ProcurementModule` for `GoodsReceiptRepository` (creates the GR
 *    draft row).
 *
 * Audit subscriber registration for the 2 new
 * `PHOTO_INGESTION_DOWNSTREAM_ROUTED` / `PHOTO_INGESTION_ROUTING_SKIPPED`
 * channels lives in `AuditLogSubscriber` per the single-subscriber
 * pattern (slice #21 ADR-SUBSCRIBER-FAN-OUT). This module's subscriber
 * is for ROUTING side-effects, not audit writes — different concerns.
 *
 * No controllers; no REST surface; no MCP capability. The slice is a
 * pure event-bus wire.
 */
@Module({
  imports: [InventoryModule, ProcurementModule],
  providers: [PhotoIngestionRoutingService, PhotoIngestionRoutingSubscriber],
  exports: [PhotoIngestionRoutingService],
})
export class PhotoIngestionRoutingModule {}
