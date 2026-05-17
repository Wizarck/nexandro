# Tasks — m3-photo-ingest-downstream-routing (M3 hardening H1a)

## §1 Migration 0040 — provenance columns

- [ ] Create `apps/api/src/migrations/0040_add_source_photo_ingestion_id.ts` (class `AddSourcePhotoIngestionId1700000040000`).
- [ ] `ALTER TABLE lots ADD COLUMN source_photo_ingestion_id UUID NULL` with FK → `photo_ingestion_items(id)` `ON DELETE SET NULL`.
- [ ] `ALTER TABLE goods_receipts ADD COLUMN source_photo_ingestion_id UUID NULL` with FK → `photo_ingestion_items(id)` `ON DELETE SET NULL`.
- [ ] `CREATE UNIQUE INDEX uq_lots_source_photo_ingestion ON lots(source_photo_ingestion_id) WHERE source_photo_ingestion_id IS NOT NULL`.
- [ ] `CREATE UNIQUE INDEX uq_goods_receipts_source_photo_ingestion ON goods_receipts(source_photo_ingestion_id) WHERE source_photo_ingestion_id IS NOT NULL`.
- [ ] Symmetric `down()` drops both indexes + both columns.

## §2 Entity column additions

- [ ] Extend `apps/api/src/inventory/lot/domain/lot.entity.ts`:
  - Add `@Column({ name: 'source_photo_ingestion_id', type: 'uuid', nullable: true }) sourcePhotoIngestionId: string | null = null;`.
  - Extend `LotCreateProps` with optional `sourcePhotoIngestionId?: string | null`.
  - `Lot.create()` factory writes the new field.
- [ ] Extend `apps/api/src/procurement/gr/domain/goods-receipt.entity.ts`:
  - Add `@Column({ name: 'source_photo_ingestion_id', type: 'uuid', nullable: true }) sourcePhotoIngestionId: string | null = null;`.

## §3 Repository extensions

- [ ] Extend `apps/api/src/inventory/lot/application/lot.repository.ts` with `findBySourcePhotoIngestionId(organizationId, ingestionItemId): Promise<Lot | null>`. Multi-tenant gated.
- [ ] Extend `apps/api/src/procurement/gr/application/gr.repository.ts` with `findBySourcePhotoIngestionId(organizationId, ingestionItemId): Promise<GoodsReceipt | null>`. Multi-tenant gated.

## §4 Routing module

- [ ] Create `apps/api/src/photo-ingestion-routing/photo-ingestion-routing.module.ts`. Imports `InventoryModule` + `ProcurementModule` (for `GrModule`'s exported `GoodsReceiptRepository`). Providers: `PhotoIngestionRoutingService` + `PhotoIngestionRoutingSubscriber`. No controllers.
- [ ] Create `apps/api/src/photo-ingestion-routing/application/types.ts` with inline `PhotoIngestionRoutingResult`, `ProductPhotoFieldMap`, `InvoicePhotoFieldMap`. NO `packages/contracts` import.
- [ ] Create `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.service.ts`:
  - `routeSigned(envelope)` — branches on `payload_after.kind` (`'product' | 'invoice'`).
  - `createLotFromPhoto(orgId, ingestionItemId, fieldMap)` — idempotent via `LotRepository.findBySourcePhotoIngestionId`.
  - `createGrDraftFromPhoto(orgId, ingestionItemId, fieldMap)` — idempotent via `GoodsReceiptRepository.findBySourcePhotoIngestionId`.
  - `extractProductFields(payload)` / `extractInvoiceFields(payload)` — field-map resolution preferring `operator_correction` over `llm_extraction`.
  - `validateProductFields(map)` / `validateInvoiceFields(map)` — returns `string[]` of missing-field reasons.
  - On critical-field miss: emit `PHOTO_INGESTION_ROUTING_SKIPPED` envelope, return `{ routed: false, skipReason }`.
  - On Lot/GR invariant throw: catch + emit `PHOTO_INGESTION_ROUTING_SKIPPED` with reason `'invariant:<errorName>'`.
  - On success: emit `PHOTO_INGESTION_DOWNSTREAM_ROUTED` envelope with `actorKind='system'`, `actorUserId=null`, `aggregateType='photo_ingestion_item'`, `aggregateId=<itemId>`, `payloadAfter={ ingestionItemId, kind, downstreamAggregateType, downstreamAggregateId }`.
  - On idempotent re-fire (existing row found): emit envelope with `alreadyRouted: true`, NO new insert.
- [ ] Create `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.subscriber.ts`:
  - `@OnEvent(AuditEventType.PHOTO_INGESTION_SIGNED)` → `service.routeSigned(envelope)`.
  - try/catch wrapper — log at ERROR, do not propagate.

## §5 Audit-log extension

- [ ] Extend `apps/api/src/audit-log/application/types.ts`:
  - 2 new `AuditEventType` constants (`PHOTO_INGESTION_DOWNSTREAM_ROUTED`, `PHOTO_INGESTION_ROUTING_SKIPPED`).
  - 2 new entries in `AuditEventTypeName`.
  - 2 new entries in `RETENTION_BY_EVENT_NAME`, both `'regulatory'`.
- [ ] Extend `apps/api/src/audit-log/application/audit-log.subscriber.ts` with 2 new `@OnEvent` handlers, each invoking `persistEnvelope()`.
- [ ] Update `apps/api/src/audit-log/application/types.spec.ts` regulatory parametric test to include the 2 new event names.

## §6 App-module wiring

- [ ] Wire `PhotoIngestionRoutingModule` into `apps/api/src/app.module.ts` (after `PhotoIngestionModule`).

## §7 Unit tests

- [ ] Create `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.service.spec.ts` covering AC-ROUTE-1..6.
- [ ] Create `apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.subscriber.spec.ts` covering subscriber wiring + try/catch behavior.

## §8 Quality gates

- [ ] `npm install` succeeds.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` clean.
- [ ] `npm --workspace=@nexandro/api run test` green.

## Deferred

- INT spec under `apps/api/test/int/photo-ingest-routing.int.spec.ts` — testcontainers + real Postgres exercising the unique-partial-index race scenario. Tracked as `m3.x-photo-ingest-routing-int-tests`.
- Backfill cron: existing signed `photo_ingestion_items` rows (pre-slice-merge) are NOT retroactively routed. Tracked as `m3.x-photo-ingest-routing-backfill`.
- GR confirmation lifecycle: this slice only creates the `draft` row. Operator confirms via existing slice #7 `GrConfirmationService.confirm()`. No change.
- Cost resolution from the new lot: slice #5 `CostSnapshotService` picks it up automatically when `LotCreated` fires (slice #1 emit-side handled by slice #21). No change.
- UI surfacing: j12 PhotoIngestReviewScreen does NOT show the routing decision. Tracked as `m3.x-photo-ingest-routing-ui` (parallel UI work).
- Per-org routing policy: this slice assumes always-route. A future per-org "always-skip" or "manual-route" policy is tracked as `m3.x-photo-ingest-routing-policy`.
- Auto-fill routing: v1 only routes on `PHOTO_INGESTION_SIGNED`. Routing on `PHOTO_INGESTION_AUTO_FILLED` (LLM-only assertion) is tracked as `m3.x-photo-ingest-routing-autofill`.
- Default-location resolution: if the LLM did not extract a `location_id` and the operator did not supply one, the slice skips with `'missing:locationId'`. Resolving from the signer's default location is tracked as `m3.x-photo-ingest-default-location`.
- Retroactive re-route: once a signed item is skipped, the only path to materialize the downstream row is operator manual entry. Re-signing is currently blocked by `IngestionAlreadySignedError`. A correction path lands at `m3.x-photo-ingest-retroactive-correction`.
