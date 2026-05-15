# Spec — photo-ingestion-routing (m3-photo-ingest-downstream-routing, M3 hardening H1a)

## Capability

When `PHOTO_INGESTION_SIGNED` fires for an `IngestionItem`, the photo-ingestion-routing BC materializes the appropriate downstream aggregate based on the item's `kind`:

- `kind === 'product'` → create a `Lot` row (inventory BC) seeded from the operator-signed extraction fields. Provenance is recorded via `lots.source_photo_ingestion_id`.
- `kind === 'invoice'` → create a `GoodsReceipt` row in `draft` state (procurement BC) seeded from the operator-signed extraction fields. Provenance is recorded via `goods_receipts.source_photo_ingestion_id`.

Idempotent under at-least-once delivery: re-firing the signal for the same `ingestionItemId` MUST NOT create a duplicate downstream row. Both the application service AND a UNIQUE partial index on `source_photo_ingestion_id` enforce idempotency.

Missing critical fields (the LLM did not extract them and the operator did not correct them) fail open: the routing service emits `PHOTO_INGESTION_ROUTING_SKIPPED` (`regulatory`) and stops. No throw, no retry, no partial state. The signed envelope remains valid; operations sees the skip envelope and manually creates the downstream row from the j12 detail screen.

## Acceptance criteria

### AC-ROUTE-1 — Product happy path creates a Lot

Given a `PHOTO_INGESTION_SIGNED` envelope arrives with:

- `organizationId = ORG_A`
- `aggregateType = 'photo_ingestion_item'`
- `aggregateId = ITEM_1`
- `payloadAfter.kind = 'product'`
- `payloadAfter.operatorCorrection.fields` containing at minimum: `gtin` (non-empty string), `quantity` (number > 0), `expiry_date` (ISO 8601 timestamp), `unit` (`'kg' | 'g' | 'L' | 'ml' | 'un'`), `location_id` (UUID), and optionally `supplier_id` (UUID),

When the `PhotoIngestionRoutingSubscriber` receives the envelope and forwards it to `PhotoIngestionRoutingService.routeSigned()`,

Then the service:

1. Calls `LotRepository.findBySourcePhotoIngestionId(ORG_A, ITEM_1)` — returns `null` (first-fire).
2. Calls `Lot.create({ organizationId: ORG_A, locationId, supplierId, receivedAt: <signed envelope's signedAt or now>, expiresAt: <extracted>, quantityReceived: <extracted>, unit: <extracted>, metadata: { sourceKind: 'photo-ingest', sourceItemId: ITEM_1 } })`, then sets `lot.sourcePhotoIngestionId = ITEM_1`, then calls `LotRepository.save(lot)`.
3. Emits `PHOTO_INGESTION_DOWNSTREAM_ROUTED` envelope with:
   - `organizationId = ORG_A`
   - `aggregateType = 'photo_ingestion_item'`
   - `aggregateId = ITEM_1`
   - `actorKind = 'system'`, `actorUserId = null`
   - `payloadAfter = { ingestionItemId: ITEM_1, kind: 'product', downstreamAggregateType: 'lot', downstreamAggregateId: <new lot id> }`
4. Returns `{ routed: true, downstreamAggregateType: 'lot', downstreamAggregateId: <new lot id> }`.

### AC-ROUTE-2 — Invoice happy path creates a GR draft

Given a `PHOTO_INGESTION_SIGNED` envelope arrives with:

- `organizationId = ORG_A`, `aggregateId = ITEM_2`
- `payloadAfter.kind = 'invoice'`
- `payloadAfter.operatorCorrection.fields` containing at minimum: `supplier_invoice_ref` (non-empty string), `supplier_id` (UUID), `received_at_location_id` (UUID), `receiving_user_id` (UUID — falls back to signed envelope's signed-by user), and at least one `line_items` entry,

When the subscriber forwards to the service,

Then the service:

1. Calls `GoodsReceiptRepository.findBySourcePhotoIngestionId(ORG_A, ITEM_2)` — returns `null`.
2. Builds a `GoodsReceipt` row with `state='draft'`, `sourcePhotoIngestionId=ITEM_2`, `poId=null` (independent GR), and persists via `GoodsReceiptRepository.save(gr)`. GR lines are NOT created here (slice #7's `confirm()` flow handles line materialization).
3. Emits `PHOTO_INGESTION_DOWNSTREAM_ROUTED` envelope with `downstreamAggregateType='goods_receipt'`, `downstreamAggregateId=<new gr id>`, `payloadAfter.lineItemsHint = <the extracted line_items array>`.
4. Returns `{ routed: true, downstreamAggregateType: 'goods_receipt', downstreamAggregateId: <new gr id> }`.

### AC-ROUTE-3 — Idempotent re-fire returns existing row

Given a `Lot` row already exists with `sourcePhotoIngestionId=ITEM_1` and the bus replays the SAME `PHOTO_INGESTION_SIGNED` envelope for `ITEM_1`,

When the subscriber forwards to the service a SECOND time,

Then the service:

1. Calls `LotRepository.findBySourcePhotoIngestionId(ORG_A, ITEM_1)` — returns the pre-existing Lot.
2. Does NOT call `Lot.create()`, does NOT call `LotRepository.save()`.
3. Emits `PHOTO_INGESTION_DOWNSTREAM_ROUTED` envelope with `payloadAfter.alreadyRouted = true` and `payloadAfter.downstreamAggregateId = <existing lot id>`.
4. Returns `{ routed: true, downstreamAggregateType: 'lot', downstreamAggregateId: <existing lot id> }`.

The same applies symmetrically to invoice envelopes (idempotent on `GoodsReceiptRepository.findBySourcePhotoIngestionId`).

Race-condition backstop: if two concurrent emits both pass the lookup and both attempt insert, the UNIQUE partial index causes a PG `23505` on the second insert. The service catches `23505`, re-runs `findBySourcePhotoIngestionId`, and emits `alreadyRouted: true` for the loser.

### AC-ROUTE-4 — Missing critical field emits skip envelope

Given a `PHOTO_INGESTION_SIGNED` envelope with `payloadAfter.kind='product'` but the operator-corrected fields are missing `gtin`,

When the subscriber forwards to the service,

Then the service:

1. Does NOT call `LotRepository.save()`.
2. Emits `PHOTO_INGESTION_ROUTING_SKIPPED` envelope with `payloadAfter.reason = ['missing:gtin']` (plus any other missing-field reasons).
3. Returns `{ routed: false, skipReason: ['missing:gtin'] }`.

Critical-field set per kind (per ADR-FIELD-MAPPING-FAIL-OPEN):

- `'product'`: `gtin` (non-empty string), `quantity` (number > 0), `unit` (allowed lot unit), `location_id` (UUID).
- `'invoice'`: `supplier_invoice_ref` (non-empty string), `supplier_id` (UUID), `received_at_location_id` (UUID), `line_items` (non-empty array with each entry having `qty > 0`).

If `Lot.create()` throws a domain error (e.g. `InvalidLotQuantityError`), the service catches and emits `PHOTO_INGESTION_ROUTING_SKIPPED` with reason `'invariant:<errorName>'`.

### AC-ROUTE-5 — Multi-tenant isolation

Given two organizations `ORG_A` and `ORG_B` and an `IngestionItem ITEM_3` belonging to `ORG_A`,

When `PHOTO_INGESTION_SIGNED` fires with `organizationId=ORG_A`, `aggregateId=ITEM_3`,

Then the routing service's repository calls:

- `LotRepository.findBySourcePhotoIngestionId(ORG_A, ITEM_3)` is called with `ORG_A` as the first parameter.
- The query returned by the repository MUST include `WHERE organization_id = ORG_A` in its WHERE clause.
- If `ORG_B` were to later query `LotRepository.findBySourcePhotoIngestionId(ORG_B, ITEM_3)`, the result MUST be `null` (the lot belongs to `ORG_A`, gated by the tenant column).

The same applies to `GoodsReceiptRepository.findBySourcePhotoIngestionId`.

### AC-ROUTE-6 — Routed envelope shape

Every `PHOTO_INGESTION_DOWNSTREAM_ROUTED` and `PHOTO_INGESTION_ROUTING_SKIPPED` envelope MUST:

- Pin `aggregateType = 'photo_ingestion_item'` (NOT `'lot'` / `'goods_receipt'` — the envelope describes a decision about the ingestion item).
- Pin `actorKind = 'system'`, `actorUserId = null` (the routing decision is system-made, not operator-initiated).
- Carry `payloadAfter.ingestionItemId` (string, UUID) matching the source envelope's `aggregateId`.
- Carry `payloadAfter.kind` (`'product' | 'invoice'`).

`PHOTO_INGESTION_DOWNSTREAM_ROUTED` additionally carries:

- `payloadAfter.downstreamAggregateType` (`'lot' | 'goods_receipt'`).
- `payloadAfter.downstreamAggregateId` (string, UUID).
- `payloadAfter.alreadyRouted` (boolean, only `true` on idempotent re-fire).
- `payloadAfter.lineItemsHint?: Array<…>` (only on invoice kind, only when LLM extracted line items).

`PHOTO_INGESTION_ROUTING_SKIPPED` additionally carries:

- `payloadAfter.reason: string[]` (e.g. `['missing:gtin', 'invariant:InvalidLotQuantityError']`).

Both envelopes have `retention_class = 'regulatory'`.
