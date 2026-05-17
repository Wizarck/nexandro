## Why

The 2 AM recall surface — J6 + J7 — is the spine of M3's regulatory promise (EU 178/2002 ≤4 h response, FR17–FR20). Slices #11 (multi-anchor incident search) and #12 (forward/reverse trace tree) supply the diagnostic pieces. This slice closes the loop: it lets an Owner / Manager open an incident, 86-flag the affected menu items across every kitchen agent surface, generate a pre-formatted dossier PDF, and dispatch the dossier by email to the pre-configured insurer + sanitary-authority contacts — in one tap from the J6 sticky CTA. Slice #22 m3-email-dispatch-di (already merged) supplies the email transport DI; slice #21 m3-audit-log-hash-chain-hardening (already merged) supplies the hash chain validator that we call to harden the dossier signature before sealing.

Three regulatory facts pin this slice's design:

1. **The audit_log envelope chain is the canonical record.** Per ADR-025 + ADR-031 + ADR-032 (hash chaining, merged in slice #21), every step of an incident — open / search / trace / 86-flag / dispatch / addendum — already produces audit_log rows. The incident is therefore *not* a new aggregate with its own table; it is the cluster of audit_log envelopes that share the same `aggregate_id` (the incident UUID). Building a separate `incidents` table would (a) create a divergence risk between the regulator-facing chain and an "operational" mirror, and (b) consume one of slice #13's reserved gotcha slots (120–129) without justification — the slot reservation list explicitly leaves slice #13 with **no migration entry**. We honour that by storing zero rows outside of `audit_log`.

2. **`aggregate_type = 'recall_incident'` is the indexing anchor.** Five new event types — `RECALL_INVESTIGATION_OPENED`, `RECALL_86_FLAG_DISPATCHED`, `RECALL_DOSSIER_GENERATED`, `RECALL_DOSSIER_REDISPATCHED`, `RECALL_ADDENDUM_ATTACHED` — all carry the same `aggregate_id` (the incident UUID) so the existing `ix_audit_log_aggregate` index (created in migration 0017) drives every read. No new index. No new table. The slice consumes ZERO of slot range 120–129.

3. **`retention_class = 'regulatory'` is non-negotiable.** Every new event type ships regulator-facing data (recipient list, dossier PDF hash, lot provenance, signature block). They register in the `RETENTION_BY_EVENT_NAME` map slice #21 introduced.

The slice also lands the operator-facing surfaces: 7 new ui-kit components (per j7.md's component list) + 2 screens (J6 sticky CTA + confirmation strip; J7 full post-crisis surface) + 4 TanStack Query hooks. The frontend lives in apps/web behind `/recall/incidents/:id`.

Per ADR-028 the dossier PDF reuses `packages/label-renderer/`'s `@react-pdf/renderer` pattern (NO new package). To keep this slice from absorbing a renderer refactor, we ship a minimal `apps/api/src/recall/dossier/pdf-renderer.ts` that imports `@react-pdf/renderer` directly with a local `RecallDossier` component — the same lazy-import discipline `packages/label-renderer/src/render.ts` uses so apps/api Jest runners stay happy.

## What Changes

### Backend (apps/api/src/recall/)

- **`apps/api/src/recall/recall.module.ts`** — `RecallModule` (BC scaffold). Wires the controller, services, and reads from `AuditLogService` (via `AuditLogModule` export) for chronology + chain validation. Imports `EmailDispatchModule` for `EMAIL_DISPATCH_SERVICE` DI. Imports `EventEmitterModule` (singleton at app root) for emit.
  - If slice #11's parallel landing has not yet created `recall.module.ts`, THIS slice creates it. If slice #11 lands first, slice #11's `RecallModule` is extended at master-merge time to include the new providers from this slice (mechanical rebase).
- **`apps/api/src/recall/domain/constants.ts`** — already-promised `RECALL_TRACE_MAX_DEPTH = 10` per ADR-028. Adds:
  - `RECALL_INCIDENT_AGGREGATE_TYPE = 'recall_incident'` — pinned canonical aggregate type.
  - `RECALL_LEGAL_DEADLINE_HOURS = 4` — EU 178/2002 response budget (FR20).
  - `RECALL_INCIDENT_CODE_PREFIX = 'IR'` — `IR-2026-0007` style.
- **`apps/api/src/recall/domain/incident.ts`** — pure type definitions (no entity class — incidents are projections over `audit_log` per the proposal rationale):
  - `IncidentStatus = 'open' | 'dispatched' | 'closed'`.
  - `Incident` interface: `{ id, organizationId, openedAt, openedByUserId, status, incidentCode, legalDeadline, lotIds, locationIds, recipientList, dossierHash? }`.
  - `ChronologyEntry`, `IncidentReceipt`, `DispatchRecipient` shapes (envelope-shaped, audit_log-derived).
- **`apps/api/src/recall/types.ts`** — slice-local TraceNode + IncidentSearchHit shapes (per the cross-slice contract pattern — do NOT import from slices #11 / #12).
- **`apps/api/src/recall/incident/incident.service.ts`** — `IncidentService.openIncident()` + `getIncident()` + `attachAddendum()` + `closeIncident()`. Reads chronology from `AuditLogService.query({ aggregateId })`; writes through event emission only.
- **`apps/api/src/recall/incident/incident-code-generator.ts`** — counter-driven `IR-YYYY-NNNN` codes. Computed by counting `RECALL_INVESTIGATION_OPENED` events year-to-date for the tenant + adding 1. No new table.
- **`apps/api/src/recall/dossier/dossier.service.ts`** — `DossierService.generate(organizationId, incident, traceForward, traceReverse)`:
  - Validates the audit_log chain via `HashChainValidator.validate(orgId)` (slice #21 — call signature TBD; if absent we call `validateChainIntegrity()` directly with a lookback batch via `AuditLogService`).
  - Builds the chronology (audit_log rows for the incident's aggregate_id).
  - Composes the RecallDossier shape: `{ incidentCode, chronology, lotProvenance, consumptionChain, signatureBlock, pdfBytes, chainBroken? }`.
  - Hands the shape to `recall/dossier/pdf-renderer.ts` → returns `Buffer`.
- **`apps/api/src/recall/dossier/pdf-renderer.ts`** — minimal `@react-pdf/renderer` consumer with a self-contained `RecallDossier` React component. Dynamic imports (matches `packages/label-renderer/src/render.ts` pattern) so apps/api Jest runners don't transitively pull `@react-pdf` at import time.
- **`apps/api/src/recall/dispatch/recall-dispatch.service.ts`** — `RecallDispatchService.dispatch86Flag()` + `dispatchDossier()` + `redispatchDossier()`:
  - `dispatch86Flag` emits `RECALL_86_FLAG_DISPATCHED` on the bus channel `recall.86-flag-dispatched`. The audit-log subscriber persists.
  - `dispatchDossier` orchestrates: generate dossier (DossierService) → call `EmailDispatchService.dispatch()` per recipient → emit `RECALL_DOSSIER_GENERATED` envelope carrying the dossier hash + per-recipient receipts.
  - `redispatchDossier(subset)` emits `RECALL_DOSSIER_REDISPATCHED` per recipient; same email flow.
- **`apps/api/src/recall/incident/incident.controller.ts`** — REST surface, `OWNER + MANAGER` roles via the existing `@Roles()` decorator:
  - `POST /m3/recall/incidents` — open new incident.
  - `POST /m3/recall/incidents/:id/dispatch` — 86-flag + dossier in one call (the j6 sticky CTA).
  - `GET /m3/recall/incidents/:id` — full payload for J7 (receipt card + chronology + dossier preview link).
  - `GET /m3/recall/incidents/:id/dossier.pdf` — streamable PDF (matches the audit-log CSV export pattern).
  - `POST /m3/recall/incidents/:id/redispatch` — re-send to subset of recipients.
  - `POST /m3/recall/incidents/:id/addenda` — attach addendum.
- **`apps/api/src/audit-log/application/types.ts`** — extend `AuditEventType` + `AuditEventTypeName` + `RETENTION_BY_EVENT_NAME` with 5 new entries (all `'regulatory'` class). Channel names follow the `recall.*` lowercase-kebab convention from ADR-COMMUNICATION-PATTERNS:
  - `RECALL_INVESTIGATION_OPENED` ↔ `recall.investigation-opened`.
  - `RECALL_86_FLAG_DISPATCHED` ↔ `recall.86-flag-dispatched`.
  - `RECALL_DOSSIER_GENERATED` ↔ `recall.dossier-generated`.
  - `RECALL_DOSSIER_REDISPATCHED` ↔ `recall.dossier-redispatched`.
  - `RECALL_ADDENDUM_ATTACHED` ↔ `recall.addendum-attached`.
- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — 5 new `@OnEvent` handlers (envelope shape; persisted via `persistEnvelope`), 1 per event type. Pattern lifted directly from slice #21 `onPhotoUploaded` / `onPhotoDeleted`.
- **`apps/api/src/app.module.ts`** — uncomments `RecallModule` from the "Future Bounded Contexts" list near the bottom of the imports.

### MCP capabilities (packages/mcp-server-nexandro/src/capabilities/write/)

- **`recall.ts`** — two new entries in `RECALL_WRITE_CAPABILITIES`:
  - `recall.dispatch-86-flag` → `POST /m3/recall/incidents/:id/dispatch`.
  - `recall.generate-dossier` → re-uses the same endpoint (dispatch generates + emails); a thin alias is acceptable per ADR-MCP-W-REGISTRY.
- **`index.ts`** — spread `RECALL_WRITE_CAPABILITIES` into the registry.
- Per-capability kill switches: `NEXANDRO_AGENT_RECALL_DISPATCH_86_FLAG_ENABLED` + `NEXANDRO_AGENT_RECALL_GENERATE_DOSSIER_ENABLED` (env-flag pattern from M2 ADR-MCP-W-PERCAP-FLAGS).

### Frontend (apps/web/src/ + packages/ui-kit/src/)

- **`apps/web/src/screens/RecallInvestigateJ6Screen.tsx`** — j6 host shell: imports the slice #11 search field if present (defensively imports via dynamic lookup; falls back to a stub when absent), the slice #12 trace tree (same defensive pattern), and our new `RecallActionBar` + `RecallConfirmationStrip` at the sticky bottom. The shell mounts on the dedicated `CrisisLayout` (a new `apps/web/src/layouts/CrisisLayout.tsx` — no top nav, no sidebar).
- **`apps/web/src/screens/RecallDossierJ7Screen.tsx`** — j7 host shell: composes `DispatchReceiptCard` + `DossierPreview` + `AddendumComposer` + `IncidentChronologyRail` + `RecipientList`. Standard `AppLayout` wraps it.
- **`apps/web/src/layouts/CrisisLayout.tsx`** — minimal chrome-stripped layout per j6.md.
- **`apps/web/src/api/recall.ts`** — REST client adapters: `getIncident`, `openIncident`, `dispatchIncident`, `redispatchIncident`, `attachAddendum`, `fetchDossierBlob`.
- **`apps/web/src/hooks/useRecallIncident.ts`** — `useIncident(id)`, `useDispatch86Flag()`, `useRedispatch()`, `useAttachAddendum()` (TanStack Query). Includes the `useCountdownToDeadline()` hook per j6.md's live `tabular-nums` countdown requirement.
- **7 new ui-kit components**, each in its own folder per the `<Name>/{<Name>.tsx, <Name>.types.ts, <Name>.test.tsx, <Name>.stories.tsx, index.ts}` pattern from `components.md`:
  - `RecallActionBar/` — sticky single-CTA bar (destructive bg, 64 px tall).
  - `RecallConfirmationStrip/` — inline confirm + ghost-back (NOT a modal).
  - `DispatchReceiptCard/` — recipient delivery status rows.
  - `DossierPreview/` — `<iframe src={pdfUrl}>` with `Content-Type: application/pdf` + plain-text fallback when iframe load fails.
  - `AddendumComposer/` — text area + file attach (immutable post-confirm).
  - `IncidentChronologyRail/` — vertical strip (laptop sidebar, phone bottom drawer; `role="log"` + `aria-live="polite"`).
  - `RecipientList/` — checkboxes for the re-dispatch picker.
- **`packages/ui-kit/src/index.ts`** — re-exports for all 7 components + their types.

### Tests

- **Unit (apps/api)**:
  - `recall/incident/incident.service.spec.ts` — open + getById + chronology + addendum + status transitions.
  - `recall/incident/incident-code-generator.spec.ts` — counter increment, year boundary.
  - `recall/dossier/dossier.service.spec.ts` — hash chain validation gate (chainBroken flag in metadata when validator fails; signature block; chronology projection).
  - `recall/dispatch/recall-dispatch.service.spec.ts` — event emission shapes (correct envelope, retention_class='regulatory' implicit via subscriber), redispatch subset semantics, email dispatch invocation per recipient.
  - `recall/incident/incident.controller.spec.ts` — RBAC (OWNER + MANAGER only; STAFF rejected at 403), validation, error mapping.
  - `audit-log/application/types.spec.ts` extension — assert 5 new types in `AUDIT_EVENT_TYPES`, persisted UPPER_SNAKE_CASE names match, `computeRetentionClass()` returns `'regulatory'` for all 5.
  - `audit-log/application/audit-log.subscriber.spec.ts` extension — emit each of the 5 events, assert a row is persisted.
- **Unit (ui-kit)** — 7 spec files (one per component):
  - Render + key interaction (CTA tap dispatches handler; addendum confirm fires once; immutability assertion on the addendum textarea post-confirm).
- **MCP** — `recall.spec.ts` covers the two new capability registrations.
- **Defer to follow-up**: INT (testcontainers) for the full email + audit envelope flow. The integration test would need slice #11 and #12 services present at master + a real SMTP fake; both prerequisites land at integration time. Defer documented in `tasks.md §Deferred`.

## Capabilities

### New Capabilities

- `recall`: incident lifecycle (open, dispatch, redispatch, addendum, close) + dossier generation + 86-flag dispatch to all kitchen agent surfaces + email pipeline. All evidence persisted to `audit_log` as the canonical chain.
- `recall-mcp`: MCP write capabilities `recall.dispatch-86-flag` + `recall.generate-dossier` per ADR-MCP-W-REGISTRY.

### Modified Capabilities

- `m2-audit-log`: extends `AuditEventType` with 5 M3-recall entries + matching `@OnEvent` handlers + retention-class regulatory pinning. Read surface (`/audit-log`) unchanged.
- `m2-mcp-write-capabilities`: adds `RECALL_WRITE_CAPABILITIES` to the WRITE_CAPABILITIES barrel.

## Impact

- **Prerequisites**:
  - Slice #21 m3-audit-log-hash-chain-hardening — MERGED at master `c8ed76b`. The dossier signature block calls into the hash chain validator at generation time.
  - Slice #22 m3-email-dispatch-di — MERGED at master `c8ed76b`. The dispatch service injects `EMAIL_DISPATCH_SERVICE` and calls `dispatch()` per recipient.
- **Parallel siblings (do NOT import — merge at master)**:
  - Slice #11 m3-incident-search-multi-anchor — creates `apps/api/src/recall/` BC scaffold + `IncidentSearchField` ui-kit component. If slice #11 has not landed by merge time, this slice CREATES `recall.module.ts` + `constants.ts`. If it has landed, those files are extended.
  - Slice #12 m3-trace-tree-forward-reverse — creates `TraceService` + `RecallTraceTree` ui-kit component. We define `TraceNode` inline in `recall/types.ts` and consume the real service via DI lookup at merge time. Tests mock the dependency.
- **Code**:
  - Backend recall BC: ~1100 LOC across 8 files.
  - Audit-log types + subscriber extension: ~70 LOC delta.
  - MCP capabilities: ~120 LOC.
  - Frontend (7 ui-kit components + 2 screens + layout + api + hooks): ~2200 LOC.
  - Tests: ~1500 LOC across ~12 spec files.
- **Performance**:
  - Dossier PDF generation: synchronous `@react-pdf/renderer` call, expected ≤1.5 s for typical incident (≤50 chronology rows + lot provenance tree depth ≤10). Within NFR-PERF for dispatch endpoints (≤2 s p95 end-to-end including email enqueue).
  - 86-flag dispatch: bus emission is O(1); email dispatch is async (returns 200 from API once events are emitted; final delivery surfaces via the EmailFailureAlerter cascade per slice #22).
  - Chronology query: bounded by the existing `ix_audit_log_aggregate` index. p95 ≤50 ms at 100 chronology entries.
- **Storage growth**:
  - Per incident: ~5–8 audit_log rows (open + 86-flag + dossier + N redispatch + M addenda). Each row ≤2 KB JSONB (the dispatch row carries the dossier hash + recipient list; the dossier bytes themselves are NOT stored in `audit_log` — they regenerate deterministically from the chronology and lot graph on demand).
  - **Decision**: dossier PDF is *derived* (regenerable). Long-term archival of the as-dispatched bytes is a follow-up tied to ADR-029 retention archival.
- **Audit**: every operator action on this surface emits an envelope. Hash chain validation gates dossier sealing.
- **Rollback**:
  - REST endpoints: drop the controller; the recall BC becomes read-only.
  - Audit event types: the 5 new `@OnEvent` handlers can be removed without breaking existing readers (the events keep firing on the bus and become no-ops at the audit-log side).
  - Frontend: routes `/recall/investigate` + `/recall/incidents/:id` 404 if the components are removed.
  - **No migration to roll back.**
- **Out of scope**:
  - Trace-tree backend (owned by slice #12).
  - Multi-anchor search backend (owned by slice #11).
  - Long-term PDF archival to cold storage (ADR-029 retention archival follow-up).
  - Cryptographic signature over the dossier root (M4+ regulatory follow-up).
  - APPCC export bundle (slice #14).
- **Parallelism**: file-path scope = `apps/api/src/recall/**` (except files claimed by slices #11/#12) + `apps/api/src/audit-log/application/types.ts` (extends) + `apps/api/src/audit-log/application/audit-log.subscriber.ts` (extends) + `apps/api/src/app.module.ts` (one-line uncomment) + `packages/mcp-server-nexandro/src/capabilities/write/recall.ts` (new) + `apps/web/src/screens/RecallInvestigateJ6Screen.tsx` + `apps/web/src/screens/RecallDossierJ7Screen.tsx` + `apps/web/src/layouts/CrisisLayout.tsx` + `apps/web/src/api/recall.ts` + `apps/web/src/hooks/useRecallIncident.ts` + `packages/ui-kit/src/components/{RecallActionBar,RecallConfirmationStrip,DispatchReceiptCard,DossierPreview,AddendumComposer,IncidentChronologyRail,RecipientList}/**`. Conflicts with slice #11 are limited to `recall.module.ts` + `constants.ts` + `recall/types.ts`; conflicts with slice #12 are limited to `recall.module.ts`. Both are mechanical rebase targets.
- **Effort estimate**: L (~3800 LOC application + ~1500 LOC tests; matches gate-c slice list "L" sizing for slice #13 at ~15 days nominal).
