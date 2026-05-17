## Why

Per FR28-FR31 + FR44 + j12.md: operators (chefs + Owners) upload supplier-invoice photos (downstream → GR draft) and product photos (downstream → Lot creation). Manual data entry from these photos is the dominant data-loss surface in M2 — operators take the photo, get distracted by service, and the data never makes it to a typed row. The j12 surface fixes this by running every photo through a vision-LLM the moment it lands; high-confidence extractions auto-fill, mid-confidence extractions queue for HITL review, low-confidence extractions reject and surface as manual-entry placeholders.

This slice ships the backend half. Slice #17b m3-photo-review-ui ships the j12 surface in parallel and consumes the URL contract we register; we do not import from #17b and #17b does not import from us — both meet at master.

Three regulatory facts pin this slice's design:

1. **The 0.85 / 0.60 thresholds are code-level locked, NOT operator-tunable.** Per architecture-m3.md ADR-034 + j12 §Decisions, the EU AI Act expects HITL by design — operators MUST NOT be able to lower the band by configuration ("everything auto-fills now!") OR raise it to bypass auto-fill ("everything goes to HITL"). The thresholds live in `apps/api/src/photo-ingestion/domain/constants.ts` as pinned constants; every comparison MUST import from there. The classifier is a pure function; an IEEE 754 boundary test suite verifies inclusive `>=` comparison at `0.8499999999999999`, `0.85`, `0.8500000000000001`, `0.5999999999999999`, `0.60`, `0.6000000000000001` plus the edges 0.0 / 1.0 / NaN / ±Infinity.

2. **ALL llmExtraction + operatorCorrection are stored together.** Per FR32 + j12 §Decisions: the operational projection (`photo_ingestion_items` row) carries both JSONB columns; the regulator-facing record (audit_log envelope) carries both in `payload_after`. This is the forensic foundation: prompt tuning + EU AI Act post-hoc accountability + AI Suspicion Score backfill all require knowing what the vision-LLM said AND what the operator actually entered.

3. **Retention class is `regulatory` for all seven new audit events.** EU 178/2002 + Spain's APPCC chain-of-custody require the same retention discipline as HACCP readings.

Per the slicing artefact (`master/docs/openspec-slice-module-3.md` line 123), this is slot **039**; the migration `0039_create_photo_ingestion_items_table.ts` claims it. Slice #16's `VisionLlmProvider` + slice #18's `PhotoStorageService` (both MERGED at master) are the upstream contracts we consume.

## What Changes

### Backend (apps/api/src/photo-ingestion/)

- **`apps/api/src/photo-ingestion/photo-ingestion.module.ts`** — `PhotoIngestionModule` (BC scaffold). Wires the controller, services, repository, imports `PhotoStorageModule` (slice #18) + `SharedVisionLlmModule` (slice #16) + `AuditLogModule`. Registers TypeORM repository for `IngestionItem`.
- **`apps/api/src/photo-ingestion/types.ts`** — inline slice-local contracts. `IngestionItemKind = 'invoice' | 'product'`, `IngestionItemStatus` (6-state machine), `ConfidenceBand = 'auto_fill' | 'flag_for_review' | 'reject'`, `PhotoIngestionField`, `PhotoIngestionExtraction`, request / response shapes. NO `packages/contracts` import.
- **`apps/api/src/photo-ingestion/domain/constants.ts`** — `CONFIDENCE_AUTO_FILL = 0.85` + `CONFIDENCE_FLAG_FOR_REVIEW = 0.60`. Iron-rule note: code-level locked, NOT operator-tunable.
- **`apps/api/src/photo-ingestion/domain/errors.ts`** — `IngestionItemNotFoundError`, `IngestionCrossTenantError` (HTTP 404 — no existence disclosure), `IngestionAlreadySignedError`, `IngestionRejectBandFieldMissingError`, `IngestionItemNotSignableError`, `IngestionPhotoNotFoundError`.
- **`apps/api/src/photo-ingestion/domain/events.ts`** — bus-channel constants mirroring the 7 `AuditEventType.PHOTO_INGESTION_*` values + a reserved `PHOTO_INGESTION_READY_FOR_ROUTING_CHANNEL` for the downstream-routing handshake (deferred).
- **`apps/api/src/photo-ingestion/domain/ingestion-item.entity.ts`** — `IngestionItem` TypeORM entity (tenant-scoped, soft-delete via `deletedAt`, 2 JSONB columns for `llm_extraction` + `operator_correction`, `overall_confidence numeric(4,3)` mirrored so the queue projection sorts without unpacking).
- **`apps/api/src/migrations/0039_create_photo_ingestion_items_table.ts`** — `CreatePhotoIngestionItems1700000039000`. Single table + 2 indexes per ADR-031:
  - `idx_photo_ingestion_items_org_status_created` `(organization_id, status, created_at DESC)` — drives the HITL queue list.
  - `idx_photo_ingestion_items_org_photo` `(organization_id, photo_id)` — drives photo-anchored lookups (dedup + future recall trace).
  - Status CHECK constraint with all 6 future values declared so M3.x state additions land without a migration.

### Application services

- **`apps/api/src/photo-ingestion/application/confidence-band.classifier.ts`** — `classifyField(c: number): ConfidenceBand`. Pure function; total over all `number` inputs (NaN / ±Infinity / negative → `reject`); inclusive `>=` comparison at both thresholds. The iron-rule HITL contract is encoded here at code level.
- **`apps/api/src/photo-ingestion/application/ingestion-item.repository.ts`** — multi-tenant repository. Every per-org method gates on `organizationId`.
- **`apps/api/src/photo-ingestion/application/ingestion.service.ts`** — `IngestionService.ingest(orgId, input)`. Resolves a signed read URL via `PhotoStorageService.generateReadUrl()`, calls `VisionLlmProvider.extract()`, classifies overall + per-field bands, persists the row, emits the status-appropriate envelope. Null extraction → `rejected` + `PHOTO_EXTRACTION_FAILED`. Any reject-band field → `rejected` + `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE`. Any flag-band field → `awaiting_review` + `PHOTO_INGESTION_AWAITING_REVIEW`. Else → `auto_filled` + `PHOTO_INGESTION_AUTO_FILLED`.
- **`apps/api/src/photo-ingestion/application/hitl-sign.service.ts`** — `HitlSignService.sign(orgId, itemId, input)`. Asserts status is `awaiting_review` or `rejected`; enforces the **reject-band field rule** (every field whose LLM confidence landed `< 0.60` MUST be present + non-empty in `fieldCorrections`); writes `operatorCorrection` + `signedAt` + `signedByUserId` + `status = 'signed'`; emits `PHOTO_INGESTION_SIGNED` with the FULL payload (both llmExtraction + operatorCorrection in `payload_after` per FR32).
- **`apps/api/src/photo-ingestion/application/hitl-queue.query.ts`** — `HitlQueueQuery.listAwaitingReview(orgId, opts)`. Drives the j12 review queue.

### REST controller

- **`apps/api/src/photo-ingestion/interface/ingestion.controller.ts`** — endpoints under `/m3/photo-ingest`, gated by `@Roles('OWNER', 'MANAGER')`:
  - `POST /items` — start an ingestion; returns `{ itemId, status, overallConfidence }`.
  - `GET /items?status=…&kind=…&limit=…` — list items (default `status=awaiting_review`).
  - `GET /items/:itemId` — read a single item with full payload.
  - `POST /items/:itemId/sign` — operator confirmation.
  - `POST /items/:itemId/reclassify` — emit `PHOTO_INGESTION_RECLASSIFIED` (event-only path; downstream consumer reserved for a followup slice).
  - DTOs in `interface/dto/ingestion.dto.ts`.
  - Cross-tenant check: `req.user.organizationId === body.organizationId`; mismatch = 403.

### Audit-log envelopes

- **`apps/api/src/audit-log/application/types.ts`** — extend `AuditEventType` + `AuditEventTypeName` + `RETENTION_BY_EVENT_NAME` with 7 new entries (all `'regulatory'`):
  - `PHOTO_INGESTION_AUTO_FILLED` ↔ `m3.photo-ingestion.auto-filled`
  - `PHOTO_INGESTION_AWAITING_REVIEW` ↔ `m3.photo-ingestion.awaiting-review`
  - `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE` ↔ `m3.photo-ingestion.rejected-low-confidence`
  - `PHOTO_EXTRACTION_FAILED` ↔ `m3.photo-ingestion.extraction-failed`
  - `PHOTO_INGESTION_SIGNED` ↔ `m3.photo-ingestion.signed`
  - `PHOTO_INGESTION_RECLASSIFIED` ↔ `m3.photo-ingestion.reclassified`
  - `HITL_RETROACTIVE_CORRECTION` ↔ `m3.photo-ingestion.hitl-retroactive-correction` (reserved channel — handler wired, emit-side deferred)
- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — 7 new `@OnEvent` handlers using the standard `persistEnvelope` path (single-subscriber pattern, slice #21).
- **`apps/api/src/audit-log/application/types.spec.ts`** — extends the regulatory parametric test with the 7 new entries.

### MCP capabilities

- **`packages/mcp-server-nexandro/src/capabilities/write/inventory.ts`** — three capabilities:
  - `inventory.ingest-invoice-photo` → POST /m3/photo-ingest/items (kind pinned in `restBodyExtractor`).
  - `inventory.ingest-product-photo` → POST /m3/photo-ingest/items (kind pinned).
  - `inventory.sign-photo-ingestion` → POST /m3/photo-ingest/items/:itemId/sign.
- **`packages/mcp-server-nexandro/src/capabilities/write/index.ts`** — spread `INVENTORY_WRITE_CAPABILITIES` into `WRITE_CAPABILITIES`.
- **`packages/mcp-server-nexandro/src/capabilities/write/index.spec.ts`** — count 49 → 52; namespace count 15 → 16 (`inventory` added).
- **`packages/mcp-server-nexandro/test/smoke.spec.ts`** — registered-tools count 56 → 59.

### Wire into AppModule

- **`apps/api/src/app.module.ts`** — adds `PhotoIngestionModule` after `PhotoStorageModule`.

### Tests

- **Unit (apps/api)**:
  - `confidence-band.classifier.spec.ts` — IEEE 754 boundary discipline (8+ boundary cases) + NaN / ±Infinity / negatives.
  - `ingestion.service.spec.ts` — 5 banding branches + photo-not-found surface.
  - `hitl-sign.service.spec.ts` — happy path + reject-band enforcement + already-signed + not-signable + cross-tenant + empty-value sentinels.
  - `hitl-queue.query.spec.ts` — limit clamp + kind filter + default + multi-tenant gating.
  - `ingestion-item.repository.spec.ts` — multi-tenant gating + listByStatus filter.
  - `ingestion.controller.spec.ts` — RBAC metadata + cross-org 403 + error→HTTP mapping.
  - `audit-log/application/types.spec.ts` — extends with the 7 new regulatory entries.
- **MCP** — `inventory.spec.ts` covers the 3 capabilities' shape + restPathTemplate + restBodyExtractor (kind pinning + idempotencyKey strip) + restPathParams routing.
- **Deferred to followup** (documented in `tasks.md §Deferred`):
  - INT spec with testcontainers + real `VisionLlmProvider` adapter + real S3 storage.
  - Downstream routing chain — GR draft creation on `auto_filled` invoice OR signed invoice item; Lot creation on `auto_filled` product OR signed product item.
  - Retroactive correction (`HITL_RETROACTIVE_CORRECTION` emit-side): the post-sign correction surface ("operator realised the previously-signed quantity was wrong").
  - Bounding-box rendering schema integration with the j12 PhotoViewer overlay.

## Capabilities

### New Capabilities

- `photo-ingestion`: vision-LLM extraction + ADR-034 confidence-band classification + HITL queue persistence. ALL llmExtraction + operatorCorrection co-stored. Iron-rule HITL contract encoded at code level — operators MUST NOT lower or raise the band.
- `photo-ingestion-mcp`: 3 MCP write capabilities under the new `inventory` namespace, callable from Hermes (WhatsApp / Telegram) + AgentChatWidget per ADR-MCP-W-REGISTRY.

### Modified Capabilities

- `m2-audit-log`: extends `AuditEventType` with 7 M3 photo-ingest entries + matching `@OnEvent` handlers + retention-class regulatory pinning. Read surface unchanged.
- `m2-mcp-write-capabilities`: adds `INVENTORY_WRITE_CAPABILITIES` to the `WRITE_CAPABILITIES` barrel.

## Impact

- **Prerequisites**:
  - Slice #16 m3-vision-llm-provider-di-otel — MERGED. Consumes `VISION_LLM_PROVIDER` DI token + `VisionLlmProvider.extract()`. Real adapter implementations are out of scope for this slice; the iron-rule null-on-outage contract is enforced by THIS slice on the consumer side.
  - Slice #18 m3-photo-storage-lifecycle — MERGED. Consumes `PhotoStorageService.generateReadUrl()` to hand a signed URL to the vision-LLM provider.
  - Slice #21 m3-audit-log-hash-chain-hardening — MERGED. The 7 new envelopes flow through the canonical `AuditLogSubscriber`.
- **Parallel sibling (do NOT import — merge at master)**:
  - Slice #17b m3-photo-review-ui — creates `apps/web/src/api/photo-ingest.ts`, `apps/web/src/screens/j12/`, ui-kit j12 components (PhotoViewer + BoundingBoxOverlay + HitlReviewQueue + ConfidenceBandPill). The URL contract this slice exposes drives slice #17b entirely.
- **Code**:
  - Backend BC: ~1100 LOC across ~14 files (incl. 6 partial files already present from initial setup).
  - Audit-log types + subscriber extension: ~80 LOC delta.
  - MCP capability: ~110 LOC.
  - Migration 0039: ~90 LOC.
  - Tests: ~750 LOC across ~7 spec files.
- **Performance**:
  - NFR-PERF-2 budget: ingest extraction ≤8 s p95 (network-bound on the vision-LLM provider, NOT this BC). Local-only cost: 1 row insert + 1 envelope emit = ~5 ms.
  - HITL queue list: 1 indexed scan on `idx_photo_ingestion_items_org_status_created`; bounded by `LIMIT 200` clamp.
- **Storage growth**:
  - One `photo_ingestion_items` row per photo (~1.5–4 KB depending on extraction size; JSONB payloads dominate).
  - The audit-log envelopes carry the same payloads; retention archival deferred to ADR-029.
- **Audit**: every state transition emits one of the 7 envelopes. All `regulatory`.
- **Rollback**:
  - Migration 0039 has a symmetric `down()` (drop indexes + drop table).
  - Audit event types: removing the 7 new handlers does not break existing readers (events emit on the bus and become no-ops at the audit-log side).
  - Module: removing `PhotoIngestionModule` from `app.module.ts` 404s the REST surface; rows already persisted remain queryable until the migration is reversed.
- **Out of scope** (deferred):
  - j12 UX surface (slice #17b).
  - Downstream routing chain (GR draft / Lot creation followup).
  - Retroactive-correction emit path.
  - Bounding-box overlay rendering integration.
  - Real INT test against the live `VisionLlmProvider` adapter.
- **Parallelism**: file-path scope = `apps/api/src/photo-ingestion/**` (new BC, no existing files) + `apps/api/src/migrations/0039_create_photo_ingestion_items_table.ts` (new) + extends `apps/api/src/audit-log/application/{types,audit-log.subscriber,types.spec}.ts` (mechanical 7-entry adds) + `apps/api/src/app.module.ts` (one-line import) + `packages/mcp-server-nexandro/src/capabilities/write/{inventory.ts,inventory.spec.ts,index.ts,index.spec.ts}` + `packages/mcp-server-nexandro/test/smoke.spec.ts` (count bump). Conflicts with slice #17b are zero (#17b lives in `apps/web` + `packages/ui-kit`).
- **Effort estimate**: M (~1800 LOC application + ~750 LOC tests; matches gate-c "M" sizing for slice #17a).
