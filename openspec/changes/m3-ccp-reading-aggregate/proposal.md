## Why

Module 3's HACCP capability surface — FR9 (CCP capture per FSMS standard), FR10 (corrective-action linkage), FR11 (FSMS reference inline), FR12 (in-spec validation), FR13 (audit_log envelope per reading) — is the regulatory spine of the kitchen flow. Carmen (Head Chef) and Mikel (Staff) log temperatures, cooling curves, and cleaning checks dozens of times per shift; the records they write are read months later by APPCC inspectors who treat the audit_log as canon. This slice lands the backend bounded context (apps/api/src/haccp/) that backs every CCP-related interaction across the agent surface (WhatsApp, Telegram, AgentChatWidget) and the j10 tablet UI (slice #10, sibling parallel).

Three regulatory + UX facts pin this slice's design:

1. **The FSMS standard is the spec authority and must be versioned.** Per EU 852/2004 + national APPCC rules, the operator's documented Food Safety Management System (FSMS) defines what counts as a CCP, what range is in-spec, and what corrective verbs are pre-approved. Operators amend their FSMS quarterly (new equipment, new recipes, regulator feedback). A reading recorded in March under FSMS-2026-v2 must, two years later, project back to the v2 spec range — NOT the current v3. We therefore ship `fsms_standards` with `(name, version, effectiveFrom, effectiveUntil)` and pin `fsmsStandardVersion` on every `haccp_ccp_readings` row at write time. The j10 mock surfaces this version inline on the eyebrow (`referencia FSMS-2026-v2`) so Carmen knows which standard she is recording against.

2. **Out-of-spec without a linked corrective action is a recall vector.** Per j10 §Decisions: "out-of-spec MUST trigger corrective-action picker BEFORE submission. Allowing a free-form out-of-spec submission decouples the reading from the response — exactly the gap that recall investigations later uncover." The service refuses to persist an out-of-spec reading unless `correctiveActionId` is supplied. The j10 UI enforces by surfacing the picker; the backend enforces by throwing `OutOfSpecRequiresCorrectiveActionError`. Slice #10 wires the picker; this slice wires the gate.

3. **`retention_class = 'regulatory'` is non-negotiable.** Every new event type — `CCP_READING_RECORDED`, `CCP_CORRECTIVE_ACTION_RECORDED`, `FSMS_STANDARD_CONFIGURED` — carries regulator-facing data (PCC reading, version pin, actor, timestamp, spec range). They register in the `RETENTION_BY_EVENT_NAME` map slice #21 introduced. All three share `aggregate_type = 'haccp_record'` so the existing `ix_audit_log_aggregate` index drives chronology projections for the future APPCC export (slice #15).

The slice also stages the j10 data shape: the `recentReadings(orgId, ccpId, limit=5)` query backs j10's `RecentReadingsStrip`; the `lastOutOfSpecUnresolved(orgId, ccpId)` query backs j10's sticky-warning probe at the top of the surface. Slice #10 will consume both via its own `apps/web/src/api/haccp.ts` adapter; this slice exposes them under `GET /m3/haccp/readings` + `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved`.

Per the slot-reservation table in `docs/openspec-slice-module-3.md` §3 the slice is allotted slots `033-034`. Slot 033 was claimed at merge time by the M3 AI obs rollup (slice #19) and slot 035-036 by the recall slices (#11+#12), so this slice consumes the next-free pair `0034` + `0037` per the migration-slot-reservation contract's "next-free at claim time" fallback rule. The gotcha range stays 80-89 unchanged.

## What Changes

### Backend (apps/api/src/haccp/)

- **`apps/api/src/haccp/haccp.module.ts`** — `HaccpModule` (new BC scaffold). Wires controllers, services, queries, and imports `AuditLogModule` (for the BC's chronology projections), `EventEmitterModule` (singleton at app root), and `TypeOrmModule.forFeature([CcpReading, CorrectiveAction, FsmsStandard])`.
- **`apps/api/src/haccp/types.ts`** — slice-local inline types: `CcpInputType`, `CcpDefinition`, `CcpReadingInput`, `RecordReadingInput`, `RecordCorrectiveActionInput`, `ConfigureFsmsStandardInput`, plus error class names. No imports from `packages/contracts`.
- **`apps/api/src/haccp/domain/ccp-reading.entity.ts`** — `CcpReading` entity. Tenant-scoped (`organization_id`) + soft-delete (`deleted_at` nullable per ADR-009). Pins `fsms_standard_id` + `fsms_standard_version` at write time.
- **`apps/api/src/haccp/domain/corrective-action.entity.ts`** — `CorrectiveAction`. Pre-defined per FSMS-standard config or ad-hoc per reading.
- **`apps/api/src/haccp/domain/fsms-standard.entity.ts`** — `FsmsStandard`. `ccpDefinitions` jsonb stores the array of `{ id, label, inputType: 'numeric'|'checkbox'|'multi-select'|'range', unit?, specMin?, specMax?, recommendedCorrectiveActionIds: string[] }`.
- **`apps/api/src/haccp/domain/errors.ts`** — `OutOfSpecRequiresCorrectiveActionError`, `CcpNotInFsmsStandardError`, `FsmsStandardNotFoundError`.
- **`apps/api/src/haccp/domain/events.ts`** — inline event classes + channel constants used at emit-side.
- **`apps/api/src/haccp/application/ccp-reading.service.ts`** — `recordReading(orgId, input) → CcpReading`. Resolves FSMS standard active at `now()`. Validates against the matching CCP definition. Marks `inSpec` boolean (range check for numeric/range, presence check for checkbox/multi-select). Refuses if out-of-spec + no `correctiveActionId` supplied. Emits `CCP_READING_RECORDED` via `emitAsync`.
- **`apps/api/src/haccp/application/corrective-action.service.ts`** — `recordCorrectiveAction(orgId, input)`. Resolves a predefined action (by id) or creates an ad-hoc CorrectiveAction. Emits `CCP_CORRECTIVE_ACTION_RECORDED`.
- **`apps/api/src/haccp/application/fsms-standard.service.ts`** — `configureFsmsStandards(orgId, input)`, `getActiveStandard(orgId, at)`, `listVersions(orgId, name)`. Owner-only at the controller layer. Emits `FSMS_STANDARD_CONFIGURED`.
- **`apps/api/src/haccp/application/recent-readings.query.ts`** — `recentReadings(orgId, ccpId, limit=5)` for the j10 `RecentReadingsStrip`.
- **`apps/api/src/haccp/application/out-of-spec-without-action.query.ts`** — `lastOutOfSpecUnresolved(orgId, ccpId)` for the j10 sticky warning at top.
- **`apps/api/src/haccp/interface/ccp-reading.controller.ts`** — REST surface, `OWNER + MANAGER` roles:
  - `POST /m3/haccp/readings` — record reading.
  - `GET /m3/haccp/readings?ccpId=…&limit=…` — recent readings for a CCP.
  - `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved` — sticky-warning probe.
- **`apps/api/src/haccp/interface/corrective-action.controller.ts`** — `OWNER + MANAGER`:
  - `POST /m3/haccp/corrective-actions` — record corrective action.
  - `GET /m3/haccp/corrective-actions?ccpId=…` — list available pre-defined + recent ad-hoc actions for the CCP.
- **`apps/api/src/haccp/interface/fsms-standard.controller.ts`** — `OWNER` only:
  - `POST /m3/haccp/fsms-standards` — create new version.
  - `PUT /m3/haccp/fsms-standards/:id` — update (terminates effective window if scope warrants).
  - `GET /m3/haccp/fsms-standards` — list all versions for the org.
- **`apps/api/src/haccp/interface/dto/`** — class-validator DTOs.
- **`apps/api/src/migrations/0034_create_haccp_records_and_corrective_actions_tables.ts`** — `haccp_ccp_readings` table (with 2 indexes per ADR-031: `(organization_id, ccp_id, created_at DESC)` + `(organization_id, fsms_standard_id, created_at DESC)`) + `haccp_corrective_actions` table (index `(organization_id, fsms_standard_id, ccp_id)`).
- **`apps/api/src/migrations/0037_create_fsms_standards_table.ts`** — `fsms_standards` table + index `(organization_id, name, effective_from DESC)`.
- **`apps/api/src/audit-log/application/types.ts`** — extend `AuditEventType` + `AuditEventTypeName` + `RETENTION_BY_EVENT_NAME` with 3 new entries (all `regulatory`):
  - `CCP_READING_RECORDED` ↔ `haccp.ccp-reading-recorded`.
  - `CCP_CORRECTIVE_ACTION_RECORDED` ↔ `haccp.corrective-action-recorded`.
  - `FSMS_STANDARD_CONFIGURED` ↔ `haccp.fsms-standard-configured`.
- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — 3 new `@OnEvent` handlers (envelope-shaped; persisted via `persistEnvelope`). Pattern lifted from slice #13's recall handlers.
- **`apps/api/src/app.module.ts`** — uncomments `HaccpModule` from the "Future Bounded Contexts" list near the bottom of the imports.

### MCP capabilities (packages/mcp-server-nexandro/)

- **`src/capabilities/haccp.ts`** — read-only registrar (mirrors recall.ts pattern). Plus 3 new write entries in `HACCP_WRITE_CAPABILITIES`:
  - `haccp.record-ccp-reading` → `POST /m3/haccp/readings`.
  - `haccp.record-corrective-action` → `POST /m3/haccp/corrective-actions`.
  - `haccp.configure-fsms-standards` → `POST /m3/haccp/fsms-standards`.
- **`src/capabilities/write/haccp.ts`** — `HACCP_WRITE_CAPABILITIES` array (3 entries).
- **`src/capabilities/write/index.ts`** — spread `HACCP_WRITE_CAPABILITIES`.
- **`src/index.ts`** — wire any read-only haccp registrar (none in this slice — all 3 capabilities are writes).
- **`test/smoke.spec.ts`** — capability count: `52 → 55` (52 after Wave 2.5 + 3 haccp writes).
- **`src/capabilities/write/index.spec.ts`** — `WRITE_CAPABILITIES` length: `45 → 48` + add `'haccp'` to the expected namespace set (size `13 → 14`).
- Per-capability kill switches: `NEXANDRO_AGENT_HACCP_RECORD_CCP_READING_ENABLED` + `NEXANDRO_AGENT_HACCP_RECORD_CORRECTIVE_ACTION_ENABLED` + `NEXANDRO_AGENT_HACCP_CONFIGURE_FSMS_STANDARDS_ENABLED` (env-flag pattern from M2 ADR-MCP-W-PERCAP-FLAGS).

### Frontend

This slice is backend-only. Slice #10 (`m3-haccp-ui`, parallel sibling) owns:
- `packages/ui-kit/src/components/{CcpPicker,ReadingInput,SpecRangeReadback,CorrectiveActionPicker,RecentReadingsStrip,OutOfSpecStickyWarning}/`
- `apps/web/src/screens/j10/HaccpRecordScreen.tsx`
- `apps/web/src/api/haccp.ts` + `apps/web/src/hooks/useHaccp.ts`

This slice MUST NOT pre-empt those files.

### Tests

- `apps/api/src/haccp/application/ccp-reading.service.spec.ts` — in-spec / out-of-spec / corrective-required gate / FSMS version pinning / multi-tenant scope.
- `apps/api/src/haccp/application/corrective-action.service.spec.ts` — predefined-vs-ad-hoc resolution / duplicate-name handling / FSMS validation.
- `apps/api/src/haccp/application/fsms-standard.service.spec.ts` — versioning + effective_from window resolution / Owner gate at service entry.
- `apps/api/src/haccp/application/recent-readings.query.spec.ts` — order + limit + tenant scope.
- `apps/api/src/haccp/application/out-of-spec-without-action.query.spec.ts` — sticky-warning probe semantics.
- `apps/api/src/haccp/interface/ccp-reading.controller.spec.ts` — RBAC enforcement via `Reflect.getMetadata(ROLES_METADATA_KEY, proto[name])` + DTO validation.

INT tests (testcontainers Postgres) DEFERRED to followup `m3.x-haccp-int-tests` — see tasks.md §Deferred.

## Impact

### Affected specs

NEW: `openspec/changes/m3-ccp-reading-aggregate/specs/haccp/spec.md` — 11 Given/When/Then ACs covering: in-spec recording, out-of-spec with corrective action, refused-without-action, FSMS version pinning at write time, RBAC (Owner+Manager / Owner-only fsms), recent-readings query order + limit, sticky-warning probe semantics, multi-tenant isolation, audit envelopes (3 event types), ad-hoc-vs-predefined corrective resolution, FSMS effective-window selection.

### Affected code

- `apps/api/src/haccp/**` (new BC, ~22 files including 6 specs).
- `apps/api/src/migrations/0034_create_haccp_records_and_corrective_actions_tables.ts` (new).
- `apps/api/src/migrations/0037_create_fsms_standards_table.ts` (new).
- `apps/api/src/audit-log/application/types.ts` (extend `AuditEventType` + `AuditEventTypeName` + `RETENTION_BY_EVENT_NAME`).
- `apps/api/src/audit-log/application/audit-log.subscriber.ts` (3 new `@OnEvent` handlers).
- `apps/api/src/app.module.ts` (wire `HaccpModule`).
- `packages/mcp-server-nexandro/src/capabilities/write/haccp.ts` (new).
- `packages/mcp-server-nexandro/src/capabilities/write/index.ts` (spread).
- `packages/mcp-server-nexandro/src/capabilities/write/index.spec.ts` (count + namespace expectations).
- `packages/mcp-server-nexandro/test/smoke.spec.ts` (count expectation: `55`).

### Backward compatibility

Forward-only. No existing routes / aggregates / events are modified. New `audit_log` event types extend the open-set `event_type` column (per ADR-025); no migration required to extend `AuditEventType` (it's a TS const, not a DB enum). The `RETENTION_BY_EVENT_NAME` map gains 3 new entries; the map default is `'operational'` so any pre-merge audit_log writer that emits one of the new event types pre-deploy would silently demote to `operational` — not a correctness issue, only a retention-class drift that the next deploy fixes.

### Out of scope (deferred to follow-ups)

- INT tests against real Postgres (testcontainers) — deferred to `m3.x-haccp-int-tests`.
- Performance benchmarking of `recentReadings` against synthetic 1M-row dataset — deferred.
- Cross-location FSMS sharing (one tenant, multiple sites) — relies on `location_id` scoping but UX doesn't surface this in M3.
- Sliding window aggregations ("avg cooler temp over last 24h") — deferred to M3.x analytics.
- IoT probe ingestion — explicitly out per PRD-M3 §"Out of Scope".

### Slot reservation

Per `docs/openspec-slice-module-3.md` §Slot reservations: `m3-ccp-reading-aggregate` is allotted migrations `033-034` and gotcha range `80-89`. Slot 0033 was claimed by the M3 AI obs rollup at merge time (slice #19), so this slice consumes the next-free pair **0034 + 0037** per the migration-slot-reservation contract's "next-free at claim time" rule. Gotcha range 80-89 remains unchanged.
