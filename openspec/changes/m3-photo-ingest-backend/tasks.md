# Tasks — m3-photo-ingest-backend (Wave 2.8, slice #17a/22)

## §1 Photo-ingestion BC scaffold

- [x] Create `apps/api/src/photo-ingestion/photo-ingestion.module.ts` wiring controller + services + repository + classifier.
- [x] Create `apps/api/src/photo-ingestion/types.ts` with inline `IngestionItemKind`, `IngestionItemStatus`, `ConfidenceBand`, `PhotoIngestionField`, `PhotoIngestionExtraction`, request / response shapes. NO `packages/contracts` import.
- [x] Create `apps/api/src/photo-ingestion/domain/constants.ts` with `CONFIDENCE_AUTO_FILL = 0.85` + `CONFIDENCE_FLAG_FOR_REVIEW = 0.60` (code-level locked per ADR-034).
- [x] Create `apps/api/src/photo-ingestion/domain/errors.ts` with the 6 error classes.
- [x] Create `apps/api/src/photo-ingestion/domain/events.ts` with bus-channel constants.
- [x] Create `apps/api/src/photo-ingestion/domain/ingestion-item.entity.ts` (TypeORM entity, tenant-scoped, soft-delete, 2 JSONB columns).

## §2 Migration 0039

- [x] Create `apps/api/src/migrations/0039_create_photo_ingestion_items_table.ts` (class `CreatePhotoIngestionItems1700000039000`).
- [x] Single `photo_ingestion_items` table + 2 indexes per ADR-031:
  - `idx_photo_ingestion_items_org_status_created` `(organization_id, status, created_at DESC)` (HITL queue scan).
  - `idx_photo_ingestion_items_org_photo` `(organization_id, photo_id)` (photo-anchored lookups).
- [x] Status CHECK constraint declares all 6 state-machine values upfront so M3.x extensions land without a migration.
- [x] Symmetric `down()` dropping indexes + table.

## §3 Confidence-band classifier

- [x] `application/confidence-band.classifier.ts` — pure `classifyField(confidence)` + `classifyOverall(fields)`. Imports thresholds from `domain/constants.ts`. Inclusive `>=` comparison.
- [x] `application/confidence-band.classifier.spec.ts` — IEEE 754 boundary tests at `0.8499999999999999`, `0.85`, `0.8500000000000001`, `0.5999999999999999`, `0.6`, `0.6000000000000001` + edges `0.0`, `1.0`, `NaN`, `±Infinity`.

## §4 Ingestion + HITL services

- [x] `application/ingestion-item.repository.ts` — TypeORM-backed repository (multi-tenant gated, soft-delete aware).
- [x] `application/ingestion.service.ts` — orchestrates: load Photo → resolve signed URL via slice #18 → call slice #16 `VisionLlmProvider.extract()` → classify overall → persist row → emit status-specific event.
- [x] `application/hitl-sign.service.ts` — sign happy path + refusals (already-signed item, missing reject-band field).
- [x] `application/hitl-queue.query.ts` — `listAwaitingReview(orgId, opts)`.
- [x] Unit specs: `ingestion.service.spec.ts` (5 branches: null-extraction, all-auto-fill, any-flag-band, any-reject-band, photo-not-found), `hitl-sign.service.spec.ts` (3 paths), `hitl-queue.query.spec.ts`, `ingestion-item.repository.spec.ts`.

## §5 REST controller + DTOs

- [x] `interface/ingestion.controller.ts` — 5 endpoints, `@Roles('OWNER', 'MANAGER')`.
  - `POST /m3/photo-ingest/items`
  - `GET /m3/photo-ingest/items?status=…&kind=…&limit=…`
  - `GET /m3/photo-ingest/items/:itemId`
  - `POST /m3/photo-ingest/items/:itemId/sign`
  - `POST /m3/photo-ingest/items/:itemId/reclassify`
- [x] `interface/dto/` — DTOs for POST body + query params + path params.
- [x] Unit spec: `ingestion.controller.spec.ts` covering RBAC + cross-org + DTO validation.

## §6 Audit subscriber + types extension

- [x] Extend `apps/api/src/audit-log/application/types.ts`:
  - 7 new `AuditEventType` constants (`PHOTO_INGESTION_AUTO_FILLED`, `PHOTO_INGESTION_AWAITING_REVIEW`, `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE`, `PHOTO_EXTRACTION_FAILED`, `PHOTO_INGESTION_SIGNED`, `PHOTO_INGESTION_RECLASSIFIED`, `HITL_RETROACTIVE_CORRECTION`),
  - 7 new entries in `AuditEventTypeName`,
  - 7 new entries in `RETENTION_BY_EVENT_NAME` all `'regulatory'`.
- [x] Extend `apps/api/src/audit-log/application/audit-log.subscriber.ts` with 7 new `@OnEvent` handlers, each invoking `persistEnvelope()`.
- [x] Update `types.spec.ts` regulatory-list assertion to include the 7 new event names.

## §7 MCP write capabilities

- [x] Create `packages/mcp-server-opentrattos/src/capabilities/write/inventory.ts` with 3 capabilities:
  - `inventory.ingest-invoice-photo`
  - `inventory.ingest-product-photo`
  - `inventory.sign-photo-ingestion`
- [x] Unit spec: `inventory.spec.ts` asserting capability shapes + parameter schemas.
- [x] Wire into `packages/mcp-server-opentrattos/src/capabilities/write/index.ts`. Update `INVENTORY_WRITE_CAPABILITIES` export.
- [x] Update `write/index.spec.ts`: `WRITE_CAPABILITIES` count 49 → 52, namespace count 15 → 16.
- [x] Update `test/smoke.spec.ts` count 56 → 59.

## §8 App-module wiring

- [x] Wire `PhotoIngestionModule` into `apps/api/src/app.module.ts` (concat with existing M3 BC imports — mechanical).

## Deferred

- INT (testcontainers + real Vision-LLM + actual Postgres + signed-URL round-trip) — followup `m3.x-photo-ingest-int-tests`.
- Downstream routing chain (`PHOTO_INGESTION_AUTO_FILLED` → GR draft for invoice / Lot creation for product) — followup `m3.x-photo-ingest-downstream-routing` (slice #8 m3-procurement-ui owns GR-draft surface; Lot creation seam exists in slice #7 m3-gr-aggregate-reconciliation).
- Retroactive correction handler (`HITL_RETROACTIVE_CORRECTION` envelope is reserved here but the handler that emits it lives in the post-sign correction flow, deferred to `m3.x-photo-ingest-retroactive-correction`).
- Bounding-box rendering schema integration — the slice #16 `VisionLlmOutputValue` shape does NOT yet carry `boundingBox` per field; this slice's `PhotoIngestionField` inline type adds an OPTIONAL `boundingBox?: { x, y, width, height }` so the slice #17b PhotoViewer can render overlays when available. Provider-side emission of bounding boxes lands in a followup once a vision-LLM ships them; the inline schema is forward-compatible.
- Reclassify cross-kind validation (e.g. supplier-only invoice → product reclassification should warn). Today it accepts unconditionally; future tightening in `m3.x-photo-ingest-reclassify-guardrails`.
- Per-organization model + prompt version pinning. Today every call uses the active provider; future per-org override in `m3.x-photo-ingest-org-model-pin`.
