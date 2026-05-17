# Tasks — m3-appcc-export-bundle-service (Wave 2.7, slice #14/22)

## §1 Compliance-export BC scaffold

- [x] Create `apps/api/src/compliance-export/compliance-export.module.ts` wiring controller + services + renderers + storage.
- [x] Create `apps/api/src/compliance-export/types.ts` with inline `Locale`, `ScopeKind`, `ExportBundleStatus`, `GenerateBundleInput`, `BundleArchiveRow`, `BundleStatusView`, `ChapterSection`, `RecipientReceipt`.
- [x] Create `apps/api/src/compliance-export/domain/export-bundle.entity.ts` (TypeORM entity, tenant-scoped, soft-delete via `deleted_at`, status enum CHECK at DB).

## §2 Migration 0038

- [x] Create `apps/api/src/migrations/0038_create_export_bundles_table.ts` (class `CreateExportBundles1700000038000`).
- [x] Indexes: `idx_export_bundles_org_created_at` (full) + `idx_export_bundles_org_status_created_at` (partial WHERE `deleted_at IS NULL`).
- [x] Symmetric `down()` dropping indexes + table.
- [x] Document slot renumber 037 → 0038 in `design.md §Slot reservation`.

## §3 Bundle storage abstraction

- [x] `apps/api/src/compliance-export/storage/bundle-storage.ts` — `BundleStorage` interface + `BUNDLE_STORAGE` DI token.
- [x] `apps/api/src/compliance-export/storage/local-bundle-storage.ts` — filesystem default backed by `NEXANDRO_BUNDLE_STORAGE_ROOT`.
- [x] Unit spec: `local-bundle-storage.spec.ts` covering put + read + signed-URL TTL.

## §4 Chapter renderers (6)

- [x] `chapter-0-audit-log.renderer.ts` — streams via `AuditLogService.streamRows()`. Serialises each row to CSV + appends to PDF section.
- [x] `chapter-haccp.renderer.ts` — reads `ccp_readings` + `corrective_actions`.
- [x] `chapter-lot.renderer.ts` — reads `lots` + `stock_moves`.
- [x] `chapter-procurement.renderer.ts` — reads `purchase_orders` + `goods_receipts`.
- [x] `chapter-photo.renderer.ts` — reads `photos`; empty range emits `Sin fotos de aprovisionamiento en este rango.` line.
- [x] `chapter-ai-obs.renderer.ts` — reads `ai_usage_rollup`.
- [x] Unit specs: one spec per renderer asserting (a) tenant filter applied, (b) range filter applied, (c) deterministic ordering, (d) empty-range surface (where applicable).

## §5 Bundle generator + queries

- [x] `bundle-generator.service.ts` — orchestrates the pipeline (insert pending row → mark generating → chapter 0 → derivative chapters → seal hash → store bytes → emit envelopes → email dispatch).
- [x] `bundle-archive.query.ts` — `recentBundles(orgId, limit)`.
- [x] `bundle-status.query.ts` — `getBundleStatus(orgId, bundleId)`.
- [x] Unit spec: `bundle-generator.service.spec.ts` covering (a) happy path small range, (b) scope filtering, (c) locale pass-through, (d) SHA-256 stability across runs, (e) email dispatch path with mocked `EmailDispatchService`, (f) `EXPORT_BUNDLE_GENERATED` + `EXPORT_BUNDLE_DISPATCHED` envelope shapes.
- [x] Unit specs: `bundle-archive.query.spec.ts` + `bundle-status.query.spec.ts`.

## §6 REST controller + SSE

- [x] `apps/api/src/compliance-export/interface/bundle.controller.ts` — 6 endpoints, `@Roles('OWNER', 'MANAGER')`.
- [x] `apps/api/src/compliance-export/interface/dto/bundle.dto.ts` — DTOs for POST body + query params.
- [x] Unit spec: `bundle.controller.spec.ts` covering RBAC + cross-org + DTO validation.

## §7 Audit subscriber + types extension

- [x] Extend `apps/api/src/audit-log/application/types.ts`:
  - 2 new `AuditEventType` constants (`EXPORT_BUNDLE_GENERATED`, `EXPORT_BUNDLE_DISPATCHED`),
  - 2 new entries in `AuditEventTypeName`,
  - 2 new entries in `RETENTION_BY_EVENT_NAME` (both `'regulatory'`).
- [x] Extend `apps/api/src/audit-log/application/audit-log.subscriber.ts` with 2 new `@OnEvent` handlers using `persistEnvelope`.
- [x] Extend `apps/api/src/audit-log/application/types.spec.ts` — assert presence of the 2 new types + retention class mapping.

## §8 MCP capability

- [x] `packages/mcp-server-nexandro/src/capabilities/write/compliance.ts` — single `compliance.generate-export` capability.
- [x] Update `packages/mcp-server-nexandro/src/capabilities/write/index.ts` — spread + re-export `COMPLIANCE_WRITE_CAPABILITIES`.
- [x] Update `packages/mcp-server-nexandro/src/capabilities/write/index.spec.ts` — count 48 → 49, namespace `compliance` added to the 15-namespace set.
- [x] Update `packages/mcp-server-nexandro/test/smoke.spec.ts` — registered-tools count 55 → 56.
- [x] Unit spec: `compliance.spec.ts` covering shape + restPathTemplate + restBodyExtractor + idempotencyKey field.

## §9 Wire ComplianceExportModule into AppModule

- [x] Add `ComplianceExportModule` import + entry in `apps/api/src/app.module.ts` imports list (under M3 BCs).

## §10 Documentation artifacts

- [x] `openspec/changes/m3-appcc-export-bundle-service/proposal.md`.
- [x] `openspec/changes/m3-appcc-export-bundle-service/design.md` with 6 ADRs + slot reservation rationale.
- [x] `openspec/changes/m3-appcc-export-bundle-service/specs/compliance-export/spec.md` with 12 ACs.
- [x] `openspec/changes/m3-appcc-export-bundle-service/.openspec.yaml`.

## §Deferred (followup)

- [ ] **INT spec with testcontainers**: real Postgres + real `EmailDispatchService` (SMTP fake) + > 100 MB bundle stress run. Validates NFR-PERF-2 (≤30 s for 90-day / 10 k records) end-to-end. Defer because (a) testcontainers harness requires Docker Desktop available in the CI runner — currently optional — and (b) the > 100 MB stress is a separate budget concern (chapter 0 streaming is the long pole; we cover it in unit with a mocked 10k-row generator).
- [ ] **Real `@react-pdf/renderer` byte-level verification**: render a known input → assert byte-equality of the PDF prefix against a golden fixture. Defer because `@react-pdf/renderer` is ESM-only and adds non-trivial Jest configuration; the renderer is exercised end-to-end via the generator service spec with a mocked PDF factory.
- [ ] **Cold-storage archival job** (`status='archived'` lifecycle): a daily cron mover that moves bundles past the org's retention window to cold storage + flips `status='archived'`. Scoped as part of ADR-029 retention archival follow-up (cross-cutting with the photo-storage retention cron).
- [ ] **S3-backed `BundleStorage` implementation**: the local filesystem default is sufficient for MVP self-hosted. A future Enterprise deployment lands an S3 adapter; the interface is already in place.
- [ ] **Hash chain validation at generation time**: per slice #21 + ADR-HASH-CHAIN-VALIDATION-PRE-SEAL (slice #13), validation could be invoked before sealing. For compliance export the cost-benefit is different: regulator deadline is not 4 h (it's quarterly), so blocking on chain break is acceptable. Defer the decision + implementation to a future slice — current behaviour is "trust the chain" (slice #21 already prevents broken chains from being written).
- [ ] **Manager hierarchical scope**: full scope tree resolution beyond `req.user.locationIds` JWT pass-through (e.g. "Manager of location-group-A includes all sub-locations"). M4+.
- [ ] **Re-dispatch endpoint**: the slice #13 recall pattern includes redispatch. For compliance export the equivalent is "Operator selects failed recipients and resends"; deferred to the operator-facing j9 redispatch slice.
- [ ] **CSV BOM verification across locales**: the default UTF-8 BOM works for Excel ES/CA/EU/GL locale; cross-locale fixture tests are a future hardening.
- [ ] **Multi-tenant cross-tenant INT** across all 6 chapter renderers (one `cross-tenant/m3-leakage.spec.ts` extension). Defer to the cross-BC fixture infrastructure already pending in the slicing artefact.
