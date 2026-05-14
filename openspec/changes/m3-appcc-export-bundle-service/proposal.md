## Why

Spain's APPCC (Análisis de Peligros y Puntos de Control Críticos — the national HACCP regime) requires every restaurant to surrender a quarterly audit dossier to the autonomous-community sanitary authority. Marta the inspector arrives quarterly; the call to Iker the Owner is "I need the last 90 days HACCP + lot + corrective actions in the standard format, in Basque, by Friday." Per FR21–FR27 + j9.md, openTrattOS must produce that bundle: a PDF + CSV companion containing the raw `audit_log` as **chapter 0 unedited** (FR25 trust principle), followed by structured derivative chapters (HACCP, Lot, Procurement, optional Photo + AI-cost). The bundle is sealed by a SHA-256 hash over the concatenated PDF + CSV bytes so Marta can verify chain-of-custody at her fingertips.

This slice ships the backend bundle generator. Slice #15 m3-appcc-i18n-ui ships the j9 surface in parallel and consumes the URLs we register; we do not import from #15 and #15 does not import from us — both meet at master.

Three regulatory facts pin this slice's design:

1. **Chapter 0 is the unedited `audit_log`.** FR25 is explicit: "raw audit_log chapter at the top, full metadata unedited, followed by structured derivative views." There is no executive summary; the transparency banner on the cover page tells Marta verbatim what she will *not* get. The generator MUST stream `SELECT *` from `audit_log` filtered by `(organization_id, created_at BETWEEN range)` and serialise unmodified. (j9.md §Notes for implementation: streaming, memory-efficient for large date ranges.)
2. **SHA-256 is computed over `(pdf_bytes || csv_bytes)` concatenated.** Single hash per bundle. j9.md §Implementation Notes is explicit. The hash surfaces inline on the j9 download row, in the `audit_log` envelope's `payload_after.bundle_sha256`, and on the archive table.
3. **Retention class is `regulatory`.** FR26 + ADR-029 + NFR-OPS-3 require operator-configurable retention with cold-storage archival of old bundles. The 2 new `audit_log` event types (`EXPORT_BUNDLE_GENERATED`, `EXPORT_BUNDLE_DISPATCHED`) register in `RETENTION_BY_EVENT_NAME` with class `regulatory` so the M3.x retention worker (ADR-029) preserves them.

Per architecture-m3.md line 490 + ADR-035, the BC lives at `apps/api/src/compliance-export/`. Per ADR-039 the bundle is emailable via the existing `EmailDispatchService` (already wired at slice #22). Per the migration-slot-reservation §3.1 fallback, this slice claims **migration slot 0038** instead of the originally-reserved 037 (037 was consumed at master by slice #9 `0037_create_fsms_standards_table` per the next-free fallback already taken there); the renumber is documented in design.md.

## What Changes

### Backend (apps/api/src/compliance-export/)

- **`apps/api/src/compliance-export/compliance-export.module.ts`** — `ComplianceExportModule` (BC scaffold). Wires the controller, services, chapter renderers, and reads from `AuditLogService` (via `AuditLogModule` export) for chapter 0 streaming. Imports `EmailDispatchModule` for `EMAIL_DISPATCH_SERVICE` DI. Imports `EventEmitterModule` (singleton at app root) for emit. Registers TypeORM repositories for `ExportBundle`. `BundleStorage` exposed as injectable interface so a future S3 backend can replace the local filesystem default.
- **`apps/api/src/compliance-export/types.ts`** — inline slice-local contracts. Locale enum (`es-ES | ca-ES | eu-ES | gl-ES`), `ScopeKind` (`'haccp' | 'lot' | 'procurement' | 'photo' | 'ai_obs'`), `ExportBundleStatus` (`'pending' | 'generating' | 'ready' | 'failed' | 'archived'`), request / response shapes, `ChapterSection` (`{ pdfSection: Buffer; csvSection: string }`). NO `packages/contracts` import.
- **`apps/api/src/compliance-export/domain/export-bundle.entity.ts`** — `ExportBundle` TypeORM entity (id, organizationId, requestedByUserId, rangeStart, rangeEnd, locale, scope JSONB, status, pdfStoragePath, csvStoragePath, sha256, pageCount, byteSize, generatedAt nullable, archivedAt nullable, deletedAt nullable, createdAt, errorMessage nullable). Tenant-scoped + soft-delete via `deleted_at`. Status enum CHECK at DB level.
- **`apps/api/src/migrations/0038_create_export_bundles_table.ts`** — `CreateExportBundles1700000038000`. Single table + 2 indexes:
  - `idx_export_bundles_org_created_at` `(organization_id, created_at DESC)` per ADR-031.
  - `idx_export_bundles_org_status_created_at` `(organization_id, status, created_at DESC) WHERE deleted_at IS NULL` (partial — drives the archive table read).
  - Slot renumber documented in design.md §Slot reservation.

### Bundle generator + chapter renderers

- **`apps/api/src/compliance-export/application/bundle-generator.service.ts`** — `BundleGeneratorService.generate(orgId, input) → Promise<ExportBundle>` orchestrating the pipeline:
  1. Insert pending row.
  2. Mark `generating`, emit SSE step `indexing`.
  3. Run chapter 0 (raw `audit_log` stream) — SSE step `composing_chapter_0`.
  4. Run each enabled chapter renderer — SSE step `rendering_chapter_<kind>`.
  5. Concatenate PDF + CSV; compute SHA-256 over `pdf_bytes || csv_bytes` — SSE step `sealing_hash`.
  6. Persist bytes via `BundleStorage`; mark `ready` + emit `EXPORT_BUNDLE_GENERATED`.
  7. If `recipientEmails` non-empty, dispatch via `EmailDispatchService` per recipient (per-recipient `EXPORT_BUNDLE_DISPATCHED` envelope per slice #13 ADR-DISPATCH-PER-RECIPIENT-AUDIT pattern). Email failures do NOT roll back; they surface in the status response.

  Synchronous for ranges ≤90 days. For ranges > 90 days the response returns immediately with `status: 'generating'`; the generator continues in-process and updates the row when done. j9 polls or streams via SSE.

- **`apps/api/src/compliance-export/application/bundle-archive.query.ts`** — `recentBundles(orgId, limit=10)` returns rows ordered by `createdAt DESC` filtered by `deleted_at IS NULL`. Backed by `idx_export_bundles_org_status_created_at`.
- **`apps/api/src/compliance-export/application/bundle-status.query.ts`** — `getBundleStatus(orgId, bundleId)` for polling + SSE.
- **`apps/api/src/compliance-export/application/chapter-renderers/chapter-0-audit-log.renderer.ts`** — streams `audit_log` via TypeORM `createQueryBuilder().stream()`; serialises one row at a time to CSV + appends to PDF section. Memory-bounded.
- **`apps/api/src/compliance-export/application/chapter-renderers/chapter-haccp.renderer.ts`** — reads `ccp_readings` + `corrective_actions` (slice #9 — entities at `apps/api/src/haccp/`).
- **`apps/api/src/compliance-export/application/chapter-renderers/chapter-lot.renderer.ts`** — reads `lots` + `stock_moves` (slice #1).
- **`apps/api/src/compliance-export/application/chapter-renderers/chapter-procurement.renderer.ts`** — reads `purchase_orders` + `goods_receipts` (slices #6 + #7).
- **`apps/api/src/compliance-export/application/chapter-renderers/chapter-photo.renderer.ts`** — reads `photos` (slice #18). Empty chapter renders the literal: `"Sin fotos de aprovisionamiento en este rango."` per j9 §Edge cases.
- **`apps/api/src/compliance-export/application/chapter-renderers/chapter-ai-obs.renderer.ts`** — reads `ai_usage_rollup` (slice #19).

Each renderer is read-only on its source BC, filters by `(organization_id, created_at BETWEEN range)`, and returns `{ pdfSection: Buffer; csvSection: string }`.

### Storage abstraction

- **`apps/api/src/compliance-export/storage/bundle-storage.ts`** — `BundleStorage` interface (`putBundle(orgId, bundleId, kind, bytes) → Promise<string>` returning `pdfStoragePath`/`csvStoragePath`; `readBundle(path) → Promise<Buffer>`; `signedReadUrl(path, ttlSeconds) → Promise<string>`).
- **`apps/api/src/compliance-export/storage/local-bundle-storage.ts`** — filesystem-backed default. Writes under `OPENTRATTOS_BUNDLE_STORAGE_ROOT` (env, default `./var/bundles/`). Signed read URLs proxy through the controller. Future S3 backend swaps via the same interface.

### REST controller

- **`apps/api/src/compliance-export/interface/bundle.controller.ts`** — endpoints under `/m3/compliance/exports`, gated by `@Roles('OWNER', 'MANAGER')`:
  - `POST /m3/compliance/exports` — start generation; returns `{ bundleId, status }`.
  - `GET /m3/compliance/exports/:bundleId` — status + signed-URL download links once ready.
  - `GET /m3/compliance/exports?limit=10` — archive table data.
  - `GET /m3/compliance/exports/:bundleId/pdf` — streamable PDF (proxies signed URL).
  - `GET /m3/compliance/exports/:bundleId/csv` — streamable CSV.
  - `GET /m3/compliance/exports/:bundleId/stream` — SSE for progress strip.
  - Cross-tenant check: `req.user.organizationId === bundle.organizationId`; mismatch = 403.
  - Manager scope: read `req.user.locationIds` from the JWT payload; Manager-scoped exports filter chapters by `location_id IN (req.user.locationIds)` if the renderer supports it.

### Audit-log envelopes

- **`apps/api/src/audit-log/application/types.ts`** — extend `AuditEventType` + `AuditEventTypeName` + `RETENTION_BY_EVENT_NAME` with 2 new entries:
  - `EXPORT_BUNDLE_GENERATED` ↔ `compliance.export-bundle-generated`. `aggregate_type='compliance_export'`. `payload_after` includes `bundle_sha256`, `pdf_storage_path`, `csv_storage_path`, `locale`, `scope`, `range_start`, `range_end`, `page_count`, `byte_size`. retention_class = `'regulatory'`.
  - `EXPORT_BUNDLE_DISPATCHED` ↔ `compliance.export-bundle-dispatched`. Per-recipient envelope. `payload_after` includes `recipient`, `deliveryStatus`, `providerMessageId?`, `error?`. retention_class = `'regulatory'`.
- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — 2 new `@OnEvent` handlers using the standard `persistEnvelope` path (single-subscriber pattern, slice #21).

### MCP capability

- **`packages/mcp-server-opentrattos/src/capabilities/write/compliance.ts`** — single capability `compliance.generate-export` proxying `POST /m3/compliance/exports`. Per-capability kill switch: `OPENTRATTOS_AGENT_COMPLIANCE_GENERATE_EXPORT_ENABLED`.
- **`packages/mcp-server-opentrattos/src/capabilities/write/index.ts`** — spread `COMPLIANCE_WRITE_CAPABILITIES` into `WRITE_CAPABILITIES`.
- **`packages/mcp-server-opentrattos/src/capabilities/write/index.spec.ts`** — count bumps 48 → 49; namespace `compliance` added.
- **`packages/mcp-server-opentrattos/test/smoke.spec.ts`** — registered-tools count bumps 55 → 56.

### Wire into AppModule

- **`apps/api/src/app.module.ts`** — adds `ComplianceExportModule` import block under M3 BCs.

### Tests

- **Unit (apps/api)**:
  - `compliance-export/application/bundle-generator.service.spec.ts` — happy path (small range), scope filtering, locale pass-through, SHA-256 stability, recipient email dispatch path, audit envelope shapes.
  - `compliance-export/application/chapter-renderers/chapter-0-audit-log.renderer.spec.ts`.
  - `compliance-export/application/chapter-renderers/chapter-haccp.renderer.spec.ts`.
  - `compliance-export/application/chapter-renderers/chapter-lot.renderer.spec.ts`.
  - `compliance-export/application/chapter-renderers/chapter-procurement.renderer.spec.ts`.
  - `compliance-export/application/chapter-renderers/chapter-photo.renderer.spec.ts` — empty range produces the literal "Sin fotos de aprovisionamiento en este rango." marker.
  - `compliance-export/application/chapter-renderers/chapter-ai-obs.renderer.spec.ts`.
  - `compliance-export/application/bundle-archive.query.spec.ts` — order + limit + soft-delete filter.
  - `compliance-export/application/bundle-status.query.spec.ts` — cross-tenant 404 vs 403 surface.
  - `compliance-export/interface/bundle.controller.spec.ts` — RBAC OWNER + MANAGER allowed; STAFF rejected at RolesGuard metadata level; cross-org returns 403; DTO validation.
  - `compliance-export/storage/local-bundle-storage.spec.ts` — round-trip put/read; signed URL has expiry.
  - `audit-log/application/types.spec.ts` extension — assert presence of the 2 new types + retention class mapping.
- **MCP** — `compliance.spec.ts` covers the capability shape + restPathTemplate + bodyExtractor.
- **Deferred to followup** (documented in `tasks.md §Deferred`):
  - INT with testcontainers + Postgres + >100MB bundle stress run.
  - Real PDF render test (the renderer pattern is exercised at compose-time but the @react-pdf module is dynamic-imported; full INT validates byte-level output).
  - Cold-storage archival job consuming `archived` status rows (M3.x ADR-029 followup).

## Capabilities

### New Capabilities

- `compliance-export`: APPCC bundle generation (chapter 0 raw audit_log + scope-driven derivative chapters), SHA-256-sealed PDF + CSV pair, optional per-recipient email dispatch, signed-URL downloads + archive table read surface. All evidence persisted to `audit_log` with `retention_class='regulatory'`.
- `compliance-export-mcp`: MCP write capability `compliance.generate-export` per ADR-MCP-W-REGISTRY (Hermes-callable from WhatsApp/Telegram + AgentChatWidget).

### Modified Capabilities

- `m2-audit-log`: extends `AuditEventType` with 2 M3 compliance entries + matching `@OnEvent` handlers + retention-class regulatory pinning. Read surface (`/audit-log`) unchanged.
- `m2-mcp-write-capabilities`: adds `COMPLIANCE_WRITE_CAPABILITIES` to the `WRITE_CAPABILITIES` barrel.

## Impact

- **Prerequisites**:
  - Slice #21 m3-audit-log-hash-chain-hardening — MERGED. Chapter 0 streams audit_log rows that already carry `row_hash`; we do NOT re-validate the chain at generation time (that is slice #13's regulator-deadline gate, not ours).
  - Slice #22 m3-email-dispatch-di — MERGED. Bundle dispatch injects `EMAIL_DISPATCH_SERVICE` and calls `dispatch()` per recipient.
  - Slice #18 m3-photo-storage-lifecycle — MERGED. The photo chapter reads photo metadata via the `Photo` entity (read-only).
  - Slice #19 m3-ai-obs-budget-tier-emitter — MERGED. The ai-obs chapter reads `ai_usage_rollup`.
  - Slices #1, #6, #7, #9 — MERGED. The lot / procurement / haccp chapters read these BCs' entities (read-only).
- **Parallel sibling (do NOT import — merge at master)**:
  - Slice #15 m3-appcc-i18n-ui — creates `apps/web/src/api/appcc.ts`, `apps/web/src/screens/j9/`, ui-kit j9 components, and route `/compliance/export`. The URL contract this slice exposes drives slice #15 entirely; we never import from #15.
- **Code**:
  - Backend compliance-export BC: ~1400 LOC across ~14 files.
  - Audit-log types + subscriber extension: ~30 LOC delta.
  - MCP capability: ~70 LOC.
  - Migration 0038: ~50 LOC.
  - Tests: ~1100 LOC across ~13 spec files.
- **Performance**:
  - NFR-PERF-2 budget: APPCC export ≤30 s for 90-day range with ≤10 k records. Chapter 0 streams via TypeORM cursor pagination (constant memory). Derivative chapters cap at their respective table scans bounded by `(organization_id, created_at BETWEEN range)` indexes already established by ADR-031.
  - Bundle SHA-256 computation: incremental update over the concatenated bytes; <50 ms for typical bundles.
- **Storage growth**:
  - One `export_bundles` row per generation (~600 bytes excluding storage path strings).
  - PDF + CSV bytes live in `BundleStorage` backend (filesystem by default). Per-bundle ~2–5 MB typical (j9 mock example: 2.3 MB PDF + 412 KB CSV = ~2.7 MB).
  - Bundles older than the retention window are flagged `archived` (status only; bytes move to cold storage in the ADR-029 followup).
- **Audit**: every bundle generation emits 1 `EXPORT_BUNDLE_GENERATED` + N `EXPORT_BUNDLE_DISPATCHED` (one per recipient). All `regulatory`.
- **Rollback**:
  - Migration 0038 has a symmetric `down()` (drop indexes + drop table).
  - Audit event types: removing the 2 new handlers does not break existing readers (events emit on the bus and become no-ops at the audit-log side).
  - Module: removing `ComplianceExportModule` from `app.module.ts` 404s the REST surface; bundles already persisted remain queryable until the migration is reversed.
- **Out of scope** (deferred):
  - i18n templates + locale chip UI (slice #15).
  - Cold-storage archival job (ADR-029 / M3.x).
  - Real @react-pdf/renderer byte-level INT test.
  - Long-term `archived` lifecycle (status flagging present; cron mover deferred).
  - Manager location-scoping deeper than `req.user.locationIds` JWT pass-through (full hierarchical scope is M4+).
- **Parallelism**: file-path scope = `apps/api/src/compliance-export/**` (new BC, no existing files) + `apps/api/src/migrations/0038_create_export_bundles_table.ts` (new) + extends to `apps/api/src/audit-log/application/{types,audit-log.subscriber}.ts` (mechanical 2-entry adds) + `apps/api/src/app.module.ts` (one-line import) + `packages/mcp-server-opentrattos/src/capabilities/write/{compliance.ts,index.ts,index.spec.ts}` + `packages/mcp-server-opentrattos/test/smoke.spec.ts` (count bump). Conflicts with slice #15 are zero (#15 lives in `apps/web` + `packages/ui-kit`).
- **Effort estimate**: L (~1700 LOC application + ~1100 LOC tests; matches gate-c "L" sizing for slice #14 at ~12–18 days nominal).
