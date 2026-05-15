## Why

Slice #17a `m3-photo-ingest-backend` (Wave 2.8) shipped the HITL signing path: operators review LLM extractions, correct reject-band fields, and `HitlSignService.sign()` writes `operator_correction` + emits `PHOTO_INGESTION_SIGNED`. But **the signal currently has no downstream business effect** — no `Lot` is created (slice #1 `m3-lot-aggregate`), no `GoodsReceipt` draft is created (slice #7 `m3-gr-aggregate-reconciliation`). The operator finishes the review and the data sits on `photo_ingestion_items` as a forensic record only.

This M3-hardening H1a slice closes that functional gap by wiring `PHOTO_INGESTION_SIGNED` to the appropriate downstream aggregate based on the ingestion item's `kind`:

- `kind === 'product'` → create a `Lot` row (inventory BC) seeded from the operator-signed extraction.
- `kind === 'invoice'` → create a `GoodsReceipt` draft row (procurement BC) seeded from the operator-signed extraction.

The two downstream BC contracts already exist (slice #1 `LotRepository.save()` and slice #7's `GoodsReceiptRepository.save()` are both reachable via `InventoryModule` + `GrModule` exports). The slice introduces no new aggregate types — it is a routing wire on top of existing seams.

Provenance is recorded via two new nullable columns:

- `lots.source_photo_ingestion_id UUID NULL`
- `goods_receipts.source_photo_ingestion_id UUID NULL`

Each is policed by a UNIQUE partial index `WHERE source_photo_ingestion_id IS NOT NULL`, giving us a DB-level idempotency guarantee: re-firing `PHOTO_INGESTION_SIGNED` for the same item cannot create a duplicate downstream row. The subscriber additionally short-circuits via a soft lookup before insert for a clean error path.

A new audit event `PHOTO_INGESTION_DOWNSTREAM_ROUTED` records the routing decision (which aggregate type + id was materialized). Retention class `'regulatory'` — the routing decision is part of the EU AI Act chain of custody (operator confirmed extraction → system materialized aggregate X with id Y).

Critical extraction fields can be missing (the photo was illegible, the operator did not supply enough corrections to satisfy downstream invariants). When that happens the slice emits `PHOTO_INGESTION_ROUTING_SKIPPED` (also `'regulatory'`) and stops — it does NOT throw. The signing flow already succeeded; routing is a best-effort downstream consumer and must not poison the signed envelope.

Per FR-FORENSIC-CHAIN (M3 PRD): the audit log MUST connect operator-signed extraction → downstream aggregate creation with a single envelope. This slice provides that link.

## What Changes

### New module — `apps/api/src/photo-ingestion-routing/`

- **`apps/api/src/photo-ingestion-routing/photo-ingestion-routing.module.ts`** — `PhotoIngestionRoutingModule`. Imports `InventoryModule` (for `LotRepository`) + `GrModule` (for `GoodsReceiptRepository` + `GoodsReceiptLineRepository`). Providers: `PhotoIngestionRoutingService` + `PhotoIngestionRoutingSubscriber`. No controllers (background routing only).
- **`apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.service.ts`** — `PhotoIngestionRoutingService.routeSigned(envelope)`. Branches on `payload_after.kind`:
  - `'product'` → `createLotFromPhoto(orgId, ingestionItemId, payload)` — idempotent: returns existing `Lot` row when `source_photo_ingestion_id` already maps.
  - `'invoice'` → `createGrDraftFromPhoto(orgId, ingestionItemId, payload)` — idempotent: returns existing `GoodsReceipt` row when `source_photo_ingestion_id` already maps.
  - Either branch: validate field-mapping (extract `gtin`, `expiry_date`, `quantity`, `unit`, `supplier_id` for product; `supplier_invoice_ref`, `supplier_id`, `received_at_location_id`, `line_items[]` for invoice). Missing critical field → emit `PHOTO_INGESTION_ROUTING_SKIPPED` audit envelope with `payload_after.reason` listing the missing fields; return `{ routed: false }` (no throw).
  - On successful route: emit `PHOTO_INGESTION_DOWNSTREAM_ROUTED` with `payload_after = { ingestionItemId, downstreamAggregateType, downstreamAggregateId, kind }`.
- **`apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.subscriber.ts`** — `@OnEvent(AuditEventType.PHOTO_INGESTION_SIGNED)` handler. Calls `PhotoIngestionRoutingService.routeSigned(envelope)`. Wrapped in try/catch — exceptions log + drop (the signing transaction has already committed; routing is best-effort).
- **`apps/api/src/photo-ingestion-routing/application/types.ts`** — inline contracts. NO `packages/contracts` import:
  - `interface PhotoIngestionRoutingResult` — `{ routed: boolean; downstreamAggregateType?: 'lot' | 'goods_receipt'; downstreamAggregateId?: string; skipReason?: string[] }`
  - `interface ProductPhotoFieldMap` — `{ gtin?: string; expiryDate?: Date; quantity?: number; unit?: 'kg' | 'g' | 'L' | 'ml' | 'un'; supplierId?: string; locationId?: string }`
  - `interface InvoicePhotoFieldMap` — `{ supplierInvoiceRef?: string; supplierId?: string; receivedAt?: Date; receivedAtLocationId?: string; receivingUserId?: string; lineItems?: Array<{ productId: string; qty: number; unitPrice: number; unit: 'kg' | 'g' | 'L' | 'ml' | 'un' }> }`
- **`apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.service.spec.ts`** — unit tests covering the 5 AC paths.
- **`apps/api/src/photo-ingestion-routing/application/photo-ingestion-routing.subscriber.spec.ts`** — unit test verifying the subscriber routes `PHOTO_INGESTION_SIGNED` envelopes to `PhotoIngestionRoutingService.routeSigned()`.

### Migration 0040

- **`apps/api/src/migrations/0040_add_source_photo_ingestion_id.ts`** — `AddSourcePhotoIngestionId1700000040000`:
  - `ALTER TABLE lots ADD COLUMN source_photo_ingestion_id UUID NULL` (FK → `photo_ingestion_items(id)`).
  - `ALTER TABLE goods_receipts ADD COLUMN source_photo_ingestion_id UUID NULL` (FK → `photo_ingestion_items(id)`).
  - `CREATE UNIQUE INDEX uq_lots_source_photo_ingestion ON lots(source_photo_ingestion_id) WHERE source_photo_ingestion_id IS NOT NULL`.
  - `CREATE UNIQUE INDEX uq_goods_receipts_source_photo_ingestion ON goods_receipts(source_photo_ingestion_id) WHERE source_photo_ingestion_id IS NOT NULL`.
  - Symmetric `down()` dropping indexes + columns.

### Entity column additions

- **`apps/api/src/inventory/lot/domain/lot.entity.ts`** — add `@Column({ name: 'source_photo_ingestion_id', type: 'uuid', nullable: true }) sourcePhotoIngestionId: string | null = null;` plus extend `LotCreateProps` with optional `sourcePhotoIngestionId`.
- **`apps/api/src/procurement/gr/domain/goods-receipt.entity.ts`** — add `@Column({ name: 'source_photo_ingestion_id', type: 'uuid', nullable: true }) sourcePhotoIngestionId: string | null = null;`.

### Repository additions

- **`apps/api/src/inventory/lot/application/lot.repository.ts`** — `findBySourcePhotoIngestionId(organizationId, ingestionItemId): Promise<Lot | null>`. Multi-tenant gated.
- **`apps/api/src/procurement/gr/application/gr.repository.ts`** — `findBySourcePhotoIngestionId(organizationId, ingestionItemId): Promise<GoodsReceipt | null>`. Multi-tenant gated.

### Audit-log envelope extension

- **`apps/api/src/audit-log/application/types.ts`** — extend `AuditEventType` + `AuditEventTypeName` + `RETENTION_BY_EVENT_NAME` with 2 new entries:
  - `PHOTO_INGESTION_DOWNSTREAM_ROUTED` ↔ `m3.photo-ingestion.downstream-routed` (regulatory)
  - `PHOTO_INGESTION_ROUTING_SKIPPED` ↔ `m3.photo-ingestion.routing-skipped` (regulatory)
- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — 2 new `@OnEvent` handlers using the standard `persistEnvelope` path (single-subscriber pattern, slice #21).
- **`apps/api/src/audit-log/application/types.spec.ts`** — extend the regulatory parametric test with the 2 new event names.

### Wire into AppModule

- **`apps/api/src/app.module.ts`** — adds `PhotoIngestionRoutingModule` after `PhotoIngestionModule`.

### Tests

- **Unit (apps/api)**:
  - `photo-ingestion-routing.service.spec.ts` — 6 cases: (1) product happy path creates Lot, (2) invoice happy path creates GR draft, (3) idempotent re-fire returns existing row, (4) missing critical field emits `PHOTO_INGESTION_ROUTING_SKIPPED`, (5) cross-tenant isolation (org A signing cannot create row in org B), (6) `PHOTO_INGESTION_DOWNSTREAM_ROUTED` envelope shape.
  - `photo-ingestion-routing.subscriber.spec.ts` — subscriber forwards envelope to service with try/catch.
  - `audit-log/application/types.spec.ts` — extended with 2 new regulatory entries.

## Capabilities

### New Capabilities

- `photo-ingestion-routing`: backend-only routing service that wires `PHOTO_INGESTION_SIGNED` to the appropriate downstream aggregate (Lot for product, GR draft for invoice). Idempotent via `source_photo_ingestion_id` unique partial indexes. Multi-tenant via `organization_id` gate on every repository call. Fail-open: missing critical field → audit envelope + halt (no throw).

### Modified Capabilities

- `m2-audit-log`: extends `AuditEventType` with 2 new entries (`PHOTO_INGESTION_DOWNSTREAM_ROUTED`, `PHOTO_INGESTION_ROUTING_SKIPPED`) + matching `@OnEvent` handlers + retention-class regulatory pinning. Read surface unchanged.
- `m3-lot-aggregate`: extends `Lot` entity with `source_photo_ingestion_id` provenance column + `LotRepository.findBySourcePhotoIngestionId` read method. `Lot.create()` factory accepts optional `sourcePhotoIngestionId`.
- `m3-gr-aggregate-reconciliation`: extends `GoodsReceipt` entity with `source_photo_ingestion_id` provenance column + `GoodsReceiptRepository.findBySourcePhotoIngestionId` read method. The slice's `confirm()` flow does NOT touch the new column — that surface remains slice #7's domain. Routing creates a `draft` row only.

## Impact

- **Prerequisites**:
  - Slice #17a m3-photo-ingest-backend — MERGED. Consumes the `PHOTO_INGESTION_SIGNED` event + `payload_after` shape (`{ photoId, kind, status, modelVersion, promptVersion, llmExtraction, operatorCorrection }`).
  - Slice #1 m3-lot-aggregate — MERGED. Consumes `LotRepository.save()` + `Lot.create()` factory.
  - Slice #7 m3-gr-aggregate-reconciliation — MERGED. Consumes `GoodsReceiptRepository.save()` for the draft GR row. We do NOT call `GrConfirmationService.confirm()` — confirmation remains an operator-initiated action per slice #7 design.
  - Slice #21 m3-audit-log-hash-chain-hardening — MERGED. The 2 new envelopes flow through the canonical `AuditLogSubscriber`.
- **FR mapping**:
  - FR-PHOTO-ROUTE-1 (functional closure): signed product → Lot.
  - FR-PHOTO-ROUTE-2 (functional closure): signed invoice → GR draft.
  - FR-FORENSIC-CHAIN: `PHOTO_INGESTION_DOWNSTREAM_ROUTED` envelope connects signed-extraction to downstream aggregate via id.
  - FR-OPS-ISOLATION: multi-tenant gate enforced on every repository call (`organizationId` first param).
- **Code**:
  - Routing BC: ~250 LOC across 5 files.
  - Audit-log types + subscriber extension: ~30 LOC delta.
  - Lot + GR entity / repository: ~40 LOC delta across 4 files.
  - Migration 0040: ~50 LOC.
  - Tests: ~350 LOC across 3 spec files.
- **Performance**:
  - Routing path: 1 idempotency check (indexed) + 1 insert + 1 envelope emit = ~10 ms per signed event. Synchronous from the subscriber, but the signing flow has already committed before this handler runs (NestJS `EventEmitter2` runs handlers serially after the emitter returns).
- **Storage growth**: One UUID column on `lots` + `goods_receipts`. Both nullable; existing rows unaffected.
- **Audit**: every routing decision emits one of the 2 new envelopes. Both `regulatory`.
- **Rollback**:
  - Migration 0040 has a symmetric `down()` (drop indexes + drop columns).
  - Module: removing `PhotoIngestionRoutingModule` from `app.module.ts` disables the routing wire; existing `lots` / `goods_receipts` rows with `source_photo_ingestion_id` set remain valid (the column stays).
- **Out of scope** (deferred):
  - Backfill: existing signed `photo_ingestion_items` rows (pre-slice-merge) are NOT retroactively routed. A cron / one-shot migration is deferred to a follow-up.
  - GR confirmation lifecycle: this slice only creates the `draft` row. Operator confirms via existing slice #7 `GrConfirmationService.confirm()` (j7 procurement UI).
  - Cost resolution from the new lot: slice #5 `CostSnapshotService` picks it up automatically when `LotCreated` fires.
  - UI surfacing: j12 PhotoIngestReviewScreen does NOT show the routing decision yet; surfacing waits for a follow-up UI slice.
  - Per-org routing policy: this slice assumes always-route. A future per-org "always-skip" or "manual-route" policy is deferred.
- **Parallelism**: file-path scope = `apps/api/src/photo-ingestion-routing/**` (new module, no existing files) + `apps/api/src/migrations/0040_add_source_photo_ingestion_id.ts` (new) + small entity/repository edits in `apps/api/src/inventory/lot/` + `apps/api/src/procurement/gr/` (additive — new column + new read method) + 2-entry adds to `apps/api/src/audit-log/application/{types,audit-log.subscriber,types.spec}.ts` + 1-line `app.module.ts` import.
- **Effort estimate**: S (~700 LOC application + ~350 LOC tests).
