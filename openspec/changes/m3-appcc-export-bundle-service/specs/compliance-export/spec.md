# Spec — compliance-export (m3-appcc-export-bundle-service, slice #14/22, Wave 2.7)

## Capability

The compliance-export BC accepts an Owner or Manager request to generate an APPCC inspection bundle for a configurable date range, locale, and scope. The bundle is a PDF + CSV pair, with chapter 0 = raw `audit_log` unedited (FR25) and N derivative chapters per the scope selection. The bundle is sealed by a SHA-256 hash over `pdf_bytes || csv_bytes`; metadata persists in `export_bundles`; signed-URL downloads route through the controller. Optional per-recipient email dispatch via `EmailDispatchService` (ADR-039). Every generation + dispatch emits an `audit_log` envelope with `retention_class='regulatory'`.

## Acceptance criteria

### AC-COMP-1 — Generate a bundle (happy path)

Given an authenticated Owner / Manager,
when they POST to `/m3/compliance/exports` with `{ rangeStart, rangeEnd, locale, scope[] }` (and optionally `recipientEmails[]`),
the API:

1. inserts an `export_bundles` row with `status='pending'`,
2. transitions to `status='generating'`,
3. streams chapter 0 (raw `audit_log` rows for the org + range, ordered by `(created_at ASC, id ASC)`) into both the PDF section and the CSV companion — NO column projection, NO field renaming, NO summarisation,
4. invokes each enabled chapter renderer in the scope set, in this fixed order: `haccp`, `lot`, `procurement`, `photo`, `ai_obs`,
5. concatenates the PDF sections (with per-chapter title page) + CSV sections (with `## CHAPTER N — <name>` separator rows),
6. computes `sha256(pdf_bytes || csv_bytes)`,
7. persists bytes via `BundleStorage` under stable paths,
8. updates the row to `status='ready'` + `sha256` + paths + `byteSize` + `pageCount` + `generatedAt`,
9. emits `EXPORT_BUNDLE_GENERATED` with `aggregate_type='compliance_export'` + `aggregate_id=bundleId`,
10. returns `201` with `{ bundleId, status }` (synchronous for ranges ≤ 90 days; async with `status='generating'` for > 90 days).

The audit-log subscriber persists the row with `retention_class='regulatory'`.

### AC-COMP-2 — Chapter 0 is the raw `audit_log` (FR25)

When the generator composes chapter 0:

- The CSV section contains EVERY column of `audit_log` for every row in the org + range, unmodified.
- The PDF section renders chapter 0 as a chronological table with every column visible (or paginated headers if width forces it).
- There is NO executive summary, NO row-level redaction, NO "key events highlighted" affordance. The transparency banner on the cover page (i18n template, slice #15) tells the inspector this verbatim.
- A request whose range yields zero `audit_log` rows still produces a chapter 0 with a header row + a single line "Sin eventos en el rango." (es-ES default; locale-equivalent in other locales).

### AC-COMP-3 — Scope filtering

When `input.scope` excludes a kind (e.g. `'photo'` not present), the corresponding renderer is NOT invoked AND no chapter for that kind appears in either the PDF or CSV output.

When `input.scope` is empty (`[]`), only chapter 0 is rendered.

When `input.scope = ['haccp', 'lot', 'procurement', 'photo', 'ai_obs']` (all five), all five derivative chapters are appended in the canonical order.

### AC-COMP-4 — SHA-256 is computed over `(pdf_bytes || csv_bytes)` and is stable

Given the same input (range + locale + scope + tenant's source rows), `BundleGeneratorService.generate()` produces the SAME `bundle_sha256` across two consecutive runs.

The hash is computed by `crypto.createHash('sha256').update(pdf_bytes).update(csv_bytes).digest('hex')`. The order is non-negotiable (PDF first, CSV second). The result is stored in:

- `export_bundles.sha256` (operational projection)
- `audit_log.payload_after.bundle_sha256` (regulator chain-of-custody)

Both equal by construction.

### AC-COMP-5 — Locale pass-through

The `locale` enum (`'es-ES' | 'ca-ES' | 'eu-ES' | 'gl-ES'`) is opaque to the bundle generator in THIS slice. It is:

- persisted on the `export_bundles` row,
- stamped on the `audit_log` envelope (`payload_after.locale`),
- passed unmodified to each chapter renderer (renderers may use it for column headers + chapter titles — minimal hardcoded labels acceptable; full i18n template hookup is slice #15).

Switching locale does NOT regenerate already-stored bundles; each bundle is locked to the locale at generation time (j9.md §Decisions).

### AC-COMP-6 — RBAC

`@Roles('OWNER', 'MANAGER')` is declared on every controller method in this BC. The global `RolesGuard` rejects `STAFF` callers at 403. The metadata is asserted via `Reflect.getMetadata(ROLES_METADATA_KEY, proto.<method>)`.

Manager-scoped exports filter the derivative chapters by `req.user.locationIds` IN-list; chapter 0 (audit_log) is tenant-scoped per design — Manager generates an audit chapter 0 identical to an Owner-generated one for the same tenant. The j9 surface (slice #15) shows the scope asymmetry to the operator.

Cross-org access (`req.user.organizationId !== body.organizationId`) returns 403 with `{ code: 'CROSS_ORG_FORBIDDEN' }`.

### AC-COMP-7 — Optional email dispatch + per-recipient envelopes

When `input.recipientEmails` is non-empty:

1. After the bundle is `ready`, the generator calls `EmailDispatchService.dispatch({ to: [r], subject, attachments: [pdfAttachment, csvAttachment], tag: 'm3.compliance.export_dispatch', organizationId })` for each recipient `r`.
2. For each recipient, an `EXPORT_BUNDLE_DISPATCHED` envelope is emitted carrying `payload_after = { recipient, deliveryStatus, providerMessageId?, error? }`.
3. A `failure`-tagged dispatch does NOT roll back the bundle — the bundle remains `status='ready'` and downloadable. The failure surfaces in the response's `recipientReceipts[]` array AND in the per-recipient envelope.

When `input.recipientEmails` is empty or omitted, no email is sent and no `EXPORT_BUNDLE_DISPATCHED` envelope is emitted.

### AC-COMP-8 — Bundle status + archive read

`GET /m3/compliance/exports/:bundleId` returns:

- `{ id, status, sha256?, pageCount?, byteSize?, generatedAt?, errorMessage?, pdfDownloadUrl?, csvDownloadUrl?, recipientReceipts? }`,
- `status='generating'` while in flight,
- `status='ready'` with download URLs once complete,
- `status='failed'` + `errorMessage` on generation failure (the row stays for ops debugging),
- `status='archived'` once the M3.x cold-storage mover flags it (this slice does not implement the mover — only the column).

`GET /m3/compliance/exports?limit=10` returns the last `limit` bundles for the tenant, ordered by `createdAt DESC`, filtered by `deleted_at IS NULL`. Status of `'pending'` and `'failed'` rows ARE included so the operator sees in-flight + recently failed attempts in the archive table.

### AC-COMP-9 — Signed-URL downloads

`GET /m3/compliance/exports/:bundleId/pdf` returns the PDF bytes with `Content-Type: application/pdf` + `Content-Disposition: attachment; filename="appcc-export-<bundleId>.pdf"`.

`GET /m3/compliance/exports/:bundleId/csv` returns the CSV bytes with `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="appcc-export-<bundleId>.csv"`.

Both endpoints validate tenant + bundle ownership + status (`'ready'` only); other statuses return 409 `{ code: 'BUNDLE_NOT_READY' }`.

The CSV bytes begin with the UTF-8 BOM (`0xEF 0xBB 0xBF`) so Excel ES-locale opens it cleanly.

### AC-COMP-10 — SSE progress stream

`GET /m3/compliance/exports/:bundleId/stream` (SSE) emits progress events in the canonical order:

```
event: progress
data: { "step": "indexing" }

event: progress
data: { "step": "composing_chapter_0" }

event: progress
data: { "step": "rendering_chapter_haccp" }

… (one event per renderer in the scope set, in canonical order)

event: progress
data: { "step": "sealing_hash" }

event: progress
data: { "step": "ready", "sha256": "...", "pageCount": N, "byteSize": N }
```

On failure: `event: progress / data: { "step": "failed", "errorMessage": "..." }`. The stream closes after `ready` or `failed`.

### AC-COMP-11 — Audit envelope shape + retention class

Every `EXPORT_BUNDLE_GENERATED` envelope has:

- `aggregate_type = 'compliance_export'`,
- `aggregate_id = bundle.id`,
- `actor_user_id = req.user.userId` (or `null` for system-initiated future cron generation),
- `actor_kind = 'user'` (or `'agent'` when via MCP),
- `payload_after` containing `{ bundle_sha256, pdf_storage_path, csv_storage_path, locale, scope, range_start, range_end, page_count, byte_size }`,
- `retention_class = 'regulatory'` (computed via the slice #21 `RETENTION_BY_EVENT_NAME` lookup).

Every `EXPORT_BUNDLE_DISPATCHED` envelope has the same `aggregate_type` + `aggregate_id`, with `payload_after = { recipient, deliveryStatus, providerMessageId?, error?, dispatchedAt }`. Also `retention_class = 'regulatory'`.

The mappings are asserted in `apps/api/src/audit-log/application/types.spec.ts`.

### AC-COMP-12 — MCP capability `compliance.generate-export`

`compliance.generate-export` is registered in the `WRITE_CAPABILITIES` registry. It proxies `POST /m3/compliance/exports`. The per-capability env flag `OPENTRATTOS_AGENT_COMPLIANCE_GENERATE_EXPORT_ENABLED` gates Hermes access — when `false`, the `AgentCapabilityGuard` rejects with 403 even if the agent is otherwise authorised.

The capability schema includes `rangeStart`, `rangeEnd`, `locale`, `scope`, optional `recipientEmails`, optional `idempotencyKey`. The schema is non-empty + every entry includes an optional `idempotencyKey` field per the smoke-test invariants in `write/index.spec.ts`.

### AC-COMP-13 — Multi-tenant isolation

Every chapter renderer applies `WHERE organization_id = $1` at the source query layer. A bundle generated for `org-A` MUST NOT contain any row from `org-B` in any chapter — verified by unit tests that load a 2-tenant fixture set and assert the chapter byte set against tenant A's expected rows only.
