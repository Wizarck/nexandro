# Design — m3-appcc-export-bundle-service (Wave 2.7, slice #14/22)

## Context

This slice closes Gap #8 of the M3 architecture (FR21-FR27, ADR-035 + ADR-039) by adding the APPCC export bundle generator. The companion j9 UI surface is in flight as slice #15; this slice neither imports from nor blocks it.

Three pre-locked decisions from architecture-m3.md + j9.md constrain the design:

1. **The bundle is FR25-compliant.** Chapter 0 is the raw `audit_log` for the date range, unedited; the cover page transparency banner tells the inspector verbatim what they will *not* receive (no executive summary). The generator streams `SELECT *` from `audit_log` — it does NOT project, filter columns, or summarise.
2. **One SHA-256 over the concatenated payload.** The hash is `sha256(pdf_bytes || csv_bytes)`. It surfaces on the j9 download row, in the `EXPORT_BUNDLE_GENERATED` envelope's `payload_after.bundle_sha256`, and in the archive table.
3. **Email dispatch is via `EmailDispatchService` (ADR-039).** Per slice #13 ADR-DISPATCH-PER-RECIPIENT-AUDIT, each recipient gets its own `EXPORT_BUNDLE_DISPATCHED` envelope. Failure surfaces in the status response; it does not roll back bundle generation.

## ADRs

### ADR-BUNDLE-AS-AGGREGATE

**Decision.** The `ExportBundle` is a first-class aggregate persisted in `export_bundles`. It is NOT derived from `audit_log` envelopes alone.

**Rationale.**

- j9.md §Implementation Notes line 79 hints at "no separate `bundles` table — single source of truth ADR-025" but this is the *projection target* of the archive table read, not a requirement that the generator must work without a row. The same surface needs (a) status polling during async generation, (b) signed-URL storage path stability across requests, (c) archive listing performance backed by a B-tree index, (d) the ability to flag `archived` status on the row without rewriting the chain. All four require a row.
- Pragmatic separation: the `audit_log` envelope is the *regulator-facing record* of the generation event (when, who, what hash, what scope) — immutable + chain-validated. The `export_bundles` row is the *operational projection* used by j9 — mutable status field + storage paths.
- The `bundle_sha256` lives on BOTH: the envelope's `payload_after.bundle_sha256` (regulator) AND `export_bundles.sha256` (j9 archive table). The two are equal by construction; chain validation is on the envelope, surface read is on the row.
- A pure-projection design would force the archive query to scan `audit_log WHERE event_type='EXPORT_BUNDLE_GENERATED' AND organization_id=...` ORDER BY created_at — bounded but not cheap at large N, and conflates status updates ("ready → archived") with chain-write semantics (you'd need a second envelope just to flip a flag, which is regulator-confusing).

**Alternatives considered.**

- *Pure projection over `audit_log`.* Rejected: status mutation + archive scan cost + storage-path latching all push back. The j9 archive table needs `SELECT … FROM export_bundles WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10` — a single index probe.
- *Hybrid — envelope first, projection table built async.* Rejected: introduces eventual-consistency window between "envelope written" and "archive table shows the row"; j9's expected UX is "generate → immediately appears at top of archive list".

**Trade-offs.**

- One additional table (`export_bundles`) + one migration (0038). Both inside the slice's allocated slot range; design.md §Slot reservation documents the renumber from reserved 037 → claimed 0038.

### ADR-CHAPTER-0-STREAMING

**Decision.** Chapter 0 (raw `audit_log`) streams via TypeORM `createQueryBuilder().stream()` (cursor pagination) — one row at a time into both the CSV serialiser AND the PDF section. Memory footprint is bounded by the cursor batch size (1 000 rows = ~2 MB peak). At 10 000-row range (NFR-PERF-2 ceiling) the generator never holds more than ~2 MB of chapter 0 in memory.

**Rationale.**

- NFR-PERF-2 budget is ≤30 s for 90-day / 10 k records; an in-memory `SELECT *` materialisation could be done at 10 k records but would blow up at the > 1 year edge case where j9.md §Edge cases tells operators "Rango > 1 año puede tardar varios minutos." Streaming makes the year-plus path possible without redesign.
- The existing `AuditLogService.streamRows()` (slice m2-audit-log-csv) already establishes the cursor pattern at `(created_at DESC, id DESC)` ordering. We REUSE that primitive — the chapter 0 renderer consumes the async generator.

**Alternatives considered.**

- *Materialise to a temp file then read back.* Rejected: introduces disk I/O without memory savings (the temp file is just as large as the in-memory buffer it replaces). Streaming generators are the well-established pattern.
- *Postgres `COPY` to STDOUT.* Rejected: bypasses TypeORM column transforms; we'd need to manually re-encode the `payload_after` JSONB. The cursor pattern reuses the entity hydration path.

**Trade-offs.**

- Per-row TypeORM hydration cost: ~50 µs per row × 10 000 rows = 500 ms. Within the 30 s budget by a wide margin.

### ADR-SHA-CONCATENATED-PAYLOAD

**Decision.** The bundle SHA-256 is computed over `(pdf_bytes || csv_bytes)` — single hash, single hex string. NOT two separate hashes.

**Rationale.**

- j9.md §Implementation Notes line 78 is explicit: "Bundle SHA-256 computed over the concatenated `(pdf_bytes || csv_bytes)`."
- The inspector verifies one hex string against one bundle artefact. Two hashes (PDF-hash + CSV-hash) doubles the verification surface without doubling the security; if one byte changes in EITHER half, the concatenated hash diverges.
- The order matters: PDF first, then CSV. Documented in the chapter spec so a future re-render uses the same order.

**Alternatives considered.**

- *Separate PDF + CSV hashes.* Rejected per j9.md.
- *Merkle root over chapters.* Rejected: over-engineered for MVP; the inspector wants one hex string to copy.

**Trade-offs.**

- The hash must be computed AFTER both halves are finalised. The generator holds both halves in memory at the seal step — or uses an incremental `crypto.createHash('sha256')` that absorbs each chapter as it renders. We choose the incremental approach (Node's `Hash` is a streaming `Writable`-shaped object), so peak memory at seal time is still bounded.

### ADR-EMAIL-DISPATCH-PER-RECIPIENT

**Decision.** Each email recipient produces its own `EXPORT_BUNDLE_DISPATCHED` envelope. Per-recipient failures (transient or permanent — both shapes of `EmailDispatchError` from slice #22) produce a `failure`-tagged envelope carrying the error code + retry-count.

**Rationale.**

- Slice #13 already established this pattern (ADR-DISPATCH-PER-RECIPIENT-AUDIT). We reuse it verbatim so the operator-facing surfaces (j7 for recall, j9 for compliance) share a mental model: the dispatch receipt strip shows one row per recipient.
- The "per-recipient" granularity also makes re-dispatch (a future M3.x feature) trivial — the operator picks a subset of recipients with `deliveryStatus='failed'` and dispatches again; the new envelopes are linked to the same `aggregate_id` (`bundle.id`).

**Alternatives considered.**

- *One envelope with `recipients[]` array.* Rejected: hides per-recipient outcome from `audit_log` projections + makes re-dispatch ambiguous.

**Trade-offs.**

- More envelopes per bundle (typically 2–3 recipients = 2–3 rows). Negligible at MVP scale (one bundle per quarter per tenant per inspector).

### ADR-RBAC-MANAGER-LOCATION-SCOPED

**Decision.** Owner has full org scope. Manager has scope-restricted access — the controller reads `req.user.locationIds` from the JWT payload and passes it as a filter to each chapter renderer. Renderers that accept `location_id` (lot, procurement, haccp via location chain) apply the IN-list; renderers that have no `location_id` column (chapter 0 audit_log) ignore it.

**Rationale.**

- j9.md §Edge case "Manager (not Owner) attempts to generate" states: "Per RBAC (ADR-006 inheritance): Manager has scope-restricted export — they can only generate for their assigned locations. The scope checkboxes implicitly filter; a mute eyebrow at the top reads `Tu alcance: 1 de 3 locales`. If the inspector needs the org-wide bundle, Manager escalates to Owner."
- The audit-log chapter 0 is *NOT* location-filterable because the inspector wants raw chain-of-custody. A Manager who tries to generate an org-wide audit cover gets a tenant-scoped chapter 0 — same chapter the Owner would get, since `audit_log` is tenant-scoped not location-scoped. The derivative chapters get location-filtered.
- An alternative interpretation — block Manager from generating at all — was rejected because j9.md explicitly says Manager has location-scoped access. The right semantic is "Manager generates a scope-restricted bundle, surfaced as a warning eyebrow on j9".

**Alternatives considered.**

- *Block Manager entirely.* Rejected per j9.md.
- *Force `location_id` filter on chapter 0.* Rejected: `audit_log` is not location-anchored. Filtering would silently exclude org-level events (PO creation, AI suggestion accept, etc.) and break the FR25 trust principle.

**Trade-offs.**

- The Manager-scoped bundle contains the FULL tenant-scoped chapter 0 plus location-filtered derivative chapters. This asymmetry is intentional and surfaced in the export's cover page (the i18n template added by slice #15 carries the "Tu alcance" eyebrow).

### ADR-STORAGE-INTERFACE-LOCAL-DEFAULT

**Decision.** Bundle bytes (PDF + CSV) are persisted via a `BundleStorage` interface. The default implementation is `LocalBundleStorage` writing under `OPENTRATTOS_BUNDLE_STORAGE_ROOT` (default `./var/bundles/`). Signed read URLs are issued by the controller (HMAC-signed, 1 h TTL) and proxied through the API.

**Rationale.**

- The photo-storage BC (slice #18) already established an S3-compatible pattern. We could reuse `PhotoStorageService` directly, but:
  - The photo-storage service is tightly coupled to `image/jpeg|png|webp|heic` MIME validation + an S3 key format `org/<orgId>/photos/<uuid>.<ext>`. Reusing it for PDF + CSV bundle storage would either bend its contract or carve a parallel codepath inside it.
  - The MVP cost of a separate `BundleStorage` interface with a filesystem default is one ~80-LOC file. Future S3 backend is a swap, not a rewrite.
- The signed URL is HMAC-signed at the controller (`crypto.createHmac('sha256', BUNDLE_SIGNING_SECRET)`) so the j9 download links can be passed to the operator's browser as plain URLs without exposing storage internals. TTL = 1 h matches the photo-storage pattern.

**Alternatives considered.**

- *Reuse `PhotoStorageService` directly.* Rejected per coupling reasoning above.
- *Inline PDF + CSV bytes in the `export_bundles` row.* Rejected: bytea-blob storage on a hot table breaks `pg_dump` ergonomics and blows row sizes past 8 KB toast threshold for any non-trivial bundle.

**Trade-offs.**

- Two storage subsystems in M3 (photo-storage + bundle-storage). Each ~150 LOC. The duplication is real but bounded; consolidating into a single `BlobStorage` interface is a future refactor (M4+).

### ADR-MCP-COMPLIANCE-CAPABILITY

**Decision.** Single MCP capability `compliance.generate-export` proxies `POST /m3/compliance/exports`. Per-capability kill switch: `OPENTRATTOS_AGENT_COMPLIANCE_GENERATE_EXPORT_ENABLED`.

**Rationale.** Matches architecture-m3.md sub-decision under MCP namespacing. Hermes calls from WhatsApp / Telegram surface the same endpoint as the j9 trigger.

**Alternatives considered.** Multiple capabilities (`compliance.export-haccp`, `compliance.export-lot`, ...). Rejected — the scope dimension is body-level, not a separate capability; MCP would inflate without clarifying.

## Module wiring

```
ComplianceExportModule (apps/api/src/compliance-export/compliance-export.module.ts)
├── controllers: [BundleController]
├── providers:
│   ├── BundleGeneratorService     (consumes AuditLogService + EmailDispatchService + EventEmitter2 + chapter renderers + BundleStorage + ExportBundle repo)
│   ├── BundleArchiveQuery          (read-only over ExportBundle repo)
│   ├── BundleStatusQuery           (read-only over ExportBundle repo)
│   ├── ChapterZeroAuditLogRenderer (consumes AuditLogService.streamRows)
│   ├── ChapterHaccpRenderer        (TypeORM read of haccp_ccp_readings + corrective_actions)
│   ├── ChapterLotRenderer          (TypeORM read of lots + stock_moves)
│   ├── ChapterProcurementRenderer  (TypeORM read of purchase_orders + goods_receipts)
│   ├── ChapterPhotoRenderer        (TypeORM read of photos)
│   ├── ChapterAiObsRenderer        (TypeORM read of ai_usage_rollup)
│   └── BUNDLE_STORAGE              (= LocalBundleStorage)
├── imports:
│   ├── TypeOrmModule.forFeature([ExportBundle])
│   ├── AuditLogModule              (exports AuditLogService)
│   └── EmailDispatchModule         (exports EMAIL_DISPATCH_SERVICE)
└── exports: [BundleGeneratorService, BundleArchiveQuery, BundleStatusQuery]
```

`AppModule` adds `ComplianceExportModule` to the imports list.

## Event flow

```
POST /m3/compliance/exports
  → BundleGeneratorService.generate({ rangeStart, rangeEnd, locale, scope[], recipientEmails? })
      → INSERT export_bundles row (status='pending') → bundleId
      → UPDATE → 'generating'
      → SSE emit 'indexing'
      → Chapter 0: streamRows from audit_log → CSV + PDF section
      → SSE emit 'composing_chapter_0'
      → For each scope kind in input.scope:
          → renderer.render(orgId, range) → { pdfSection, csvSection }
          → SSE emit 'rendering_chapter_<kind>'
      → Concatenate PDF (with chapter markers) + CSV (with chapter markers)
      → Compute SHA-256 over (pdf_bytes || csv_bytes)
      → SSE emit 'sealing_hash'
      → BundleStorage.putBundle(...) → pdfStoragePath, csvStoragePath
      → UPDATE → 'ready' + sha256 + paths + byteSize + pageCount + generatedAt
      → EventEmitter2.emit('compliance.export-bundle-generated', envelope)
      → AuditLogSubscriber.onExportBundleGenerated → audit_log row (retention_class='regulatory')
      → SSE emit 'ready'
      → If recipientEmails.length > 0:
          → For each recipient r:
              → EmailDispatchService.dispatch({ to: [r], subject, attachments: [pdf, csv], tag: 'm3.compliance.export_dispatch', organizationId })
              → EventEmitter2.emit('compliance.export-bundle-dispatched', envelope-per-recipient)
              → AuditLogSubscriber.onExportBundleDispatched → audit_log row (regulatory)
  → 201 + { bundleId, status: 'ready' | 'generating' }

GET /m3/compliance/exports/:bundleId
  → BundleStatusQuery.getBundleStatus(orgId, bundleId)
  → 200 + { id, status, sha256?, pageCount?, byteSize?, generatedAt?, errorMessage?,
            pdfDownloadUrl?, csvDownloadUrl?, recipientReceipts? }

GET /m3/compliance/exports?limit=10
  → BundleArchiveQuery.recentBundles(orgId, limit)
  → 200 + { rows: [{ id, rangeStart, rangeEnd, locale, scope, status, sha256, generatedAt, requestedByUserId }, ...] }

GET /m3/compliance/exports/:bundleId/pdf
  → BundleStorage.readBundle(pdfStoragePath) → streamable Buffer
  → 200 + Content-Type: application/pdf + Content-Disposition

GET /m3/compliance/exports/:bundleId/csv
  → BundleStorage.readBundle(csvStoragePath) → streamable Buffer
  → 200 + Content-Type: text/csv; charset=utf-8 (BOM included by writer)

GET /m3/compliance/exports/:bundleId/stream
  → SSE: event: progress, data: { step: 'indexing' | ... | 'ready' }
```

## Test posture

- **Unit (apps/api)**: services + renderers + controller mocked against the source TypeORM repos via `function makeFakeRepo<T extends ObjectLiteral>(rows: T[])`. `EventEmitter2` provided real; subscribers asserted via `await app.init()` pattern from slice #21. `EmailDispatchService` provided as a `jest.Mocked<EmailDispatchService>` returning `{ status: 'success' }` by default; failure tests return `{ status: 'failure', error: { code: ... } }`.
- **SHA-256 stability test**: given a fixed input (deterministic rows + fixed dates), assert the same hash across two generation runs. Catches accidental non-determinism (e.g. iterating a `Set` instead of an array).
- **Defer to follow-up**: testcontainers + real Postgres + >100 MB bundle stress run; full `@react-pdf/renderer` byte-level verification.

## Slot reservation

- **Migration**: slot **037** was originally reserved for this slice in `docs/openspec-slice-module-3.md` line 120. However, at master HEAD `ef23364`, slot 037 is already claimed by `0037_create_fsms_standards_table.ts` (slice #9 `m3-ccp-reading-aggregate`, per its own §Slot selection rationale invoking the same §3.1 fallback because slot 033 was taken by slice #19 ai-obs at merge time). Per `.ai-playbook/specs/migration-slot-reservation.md` §3.1 "next-free at claim time" fallback, this slice claims **slot 0038** — the next free integer at the time `0038_create_export_bundles_table.ts` is scaffolded. The renumber is bounded (one slot), documented here, and recorded in tasks.md.
- **Gotcha range**: 130-139 (unchanged from the reservation table).
- **No ADRs added to `docs/architecture-decisions.md`** — the design ADRs above are slice-local + documented in this file per ADR-035 + ADR-039 already being the canonical M3 architecture ADRs for this BC.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| TypeORM `createQueryBuilder().stream()` driver quirk on large ranges | Cursor-batched fallback path lifted from `AuditLogService.streamRows()` — already battle-tested in m2-audit-log-csv. |
| `@react-pdf/renderer` ESM-only breaks apps/api Jest | Dynamic-import pattern from `packages/label-renderer/src/render.ts` + the slice #13 dossier pattern. The unit test mocks the renderer rather than running it. |
| Email transport unavailable at dispatch time | Slice #22 EmailFailureAlerter cascade; the bundle envelope captures `deliveryStatus='failed'` so j9 surfaces it. Bundle generation NEVER rolls back on email failure. |
| Manager generates a bundle and chapter 0 leaks org-level events for non-Manager locations | Documented per ADR-RBAC-MANAGER-LOCATION-SCOPED: chapter 0 is tenant-scoped by definition. j9's cover-page warning eyebrow surfaces the scope asymmetry. |
| Storage path collision between two simultaneous bundles | The storage key is `org/<orgId>/bundles/<bundleId>/{pdf,csv}` — bundleId is a UUID minted at row insert. Collision probability is the UUIDv4 collision probability. |
| SHA-256 hash differs between two consecutive renders for the same input | The chapter 0 + derivative chapter renderers MUST iterate in deterministic order. All `ORDER BY (created_at ASC, id ASC)` tiebreakers; no `Set`-iteration; no `Date.now()` in the generated content (the `generatedAt` field is OUTSIDE the hashed payload). Unit test asserts hash stability across two runs. |

## Migration slot history (for retro carry-forward)

- Reserved at Gate C: 037 (single slot).
- Actual claim at scaffold time: 0038 (next-free, per migration-slot-reservation §3.1).
- Reason: slot 037 already taken by slice #9 `0037_create_fsms_standards_table.ts` at master.
- Follow-up: slicing artefact `docs/openspec-slice-module-3.md` should be updated post-merge to reflect the actual claim.
