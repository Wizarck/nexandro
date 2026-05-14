## Context

The HACCP backend BC backs three flows: Carmen's tablet capture (j10), Mikel's WhatsApp/Telegram capture via Hermes, and the future APPCC export (slice #15 reads from `audit_log` filtered by `aggregate_type='haccp_record'`). All three flows share one canonical contract: the `recordReading()` service. The j10 mock and the MCP capability surface the same shape; the controller is a thin DTO-to-service translator.

Three architectural questions drove the design:

1. Is the CCP a first-class table or a JSONB-defined child of the FSMS standard?
2. How do we pin the FSMS version that a reading was recorded against without race-conditioning on hot-swapped standards?
3. How do we enforce the "out-of-spec without corrective action" gate at the write boundary, not the UI?

This document answers each + records the rejected alternatives.

## Goals / Non-goals

**Goals**
- FR9 (CCP capture per FSMS), FR10 (corrective-action linkage), FR11 (FSMS reference inline), FR12 (in-spec validation), FR13 (audit_log envelope per reading) — backend complete.
- The j10 data shape — `recentReadings(orgId, ccpId, limit=5)` + `lastOutOfSpecUnresolved(orgId, ccpId)` — wired and queryable.
- Three MCP capabilities (`haccp.record-ccp-reading`, `haccp.record-corrective-action`, `haccp.configure-fsms-standards`) ship behind per-capability kill switches.
- FSMS standards versioned with `(effectiveFrom, effectiveUntil)` so readings pin to the version active at write time.
- Out-of-spec submissions without a `correctiveActionId` are rejected at the service layer (not the UI).

**Non-goals**
- IoT probe Bluetooth/MQTT ingestion (out per PRD-M3).
- Per-shift / per-day rollup aggregations (deferred to M3.x).
- Cross-location FSMS sharing UX (one tenant, multi-site lives in M4).
- INT tests with real Postgres (deferred to `m3.x-haccp-int-tests`).
- The j10 UI itself (slice #10 sibling owns `apps/web/src/screens/j10/` + ui-kit components).

## Decision A — CCPs are JSONB-defined children of the FSMS standard, NOT a separate `ccps` table

The CCP identifier (`ccpId`) is the operator's stable key for "cooler-meat-fridge-cooling-curve" or "abatidor-temp-T0". A naive design would shape this as a `ccps` table with FK to `fsms_standards`. We reject that pattern because:

- **CCP semantics are inseparable from the FSMS standard.** A v2-defined CCP "cooler-meat-fridge" has a different spec range than the v3-defined one; cross-version FK joins are operator-confusing. Storing CCPs as `ccpDefinitions JSONB` on the FSMS standard row means a CCP is a tuple `(fsmsStandardId, ccpId)` — exactly the relationship the auditor reasons over.
- **Mutation frequency is quarterly, not daily.** FSMS standards are updated by Owners ~4×/year. A jsonb column with a small array (~10-30 CCPs per standard) is the right granularity. A separate table would amortize zero benefit — every read of a CCP is co-located with reads of its parent standard.
- **Indexability is unaffected.** Queries pivot on `haccp_ccp_readings.ccp_id` (a denormalized text column on the reading), not the parent FSMS jsonb. The `(organization_id, ccp_id, created_at DESC)` index drives j10's `RecentReadingsStrip` and the future APPCC export per-CCP rollups.

**Schema**:
```
fsms_standards (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  name text NOT NULL,           -- e.g. 'casa-aitona-2026'
  version text NOT NULL,        -- e.g. 'v2'
  effective_from timestamptz NOT NULL,
  effective_until timestamptz NULL,   -- NULL = currently active
  ccp_definitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, version)
)

haccp_ccp_readings (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  fsms_standard_id uuid NOT NULL,
  fsms_standard_version text NOT NULL,      -- denormalized for forensic projection
  ccp_id text NOT NULL,                      -- looked up inside fsms_standards.ccp_definitions
  reading_value numeric(18,4) NULL,         -- nullable to allow checkbox/multi-select
  reading_unit text NULL,
  reading_extras jsonb NULL,                 -- carries checkbox/multi-select payload
  spec_min numeric(18,4) NULL,
  spec_max numeric(18,4) NULL,
  in_spec boolean NOT NULL,
  corrective_action_id uuid NULL,            -- nullable when in_spec=true
  actor_user_id uuid NULL,                   -- nullable for agent-recorded readings
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  FOREIGN KEY (fsms_standard_id) REFERENCES fsms_standards(id),
  FOREIGN KEY (corrective_action_id) REFERENCES haccp_corrective_actions(id),
  CONSTRAINT haccp_readings_corrective_when_out_of_spec
    CHECK (in_spec = true OR corrective_action_id IS NOT NULL)
)
```

The DB-level CHECK constraint mirrors the service-layer gate (Decision C below). Both layers enforce — defence in depth.

**Alternatives considered**

- **Separate `ccps` table with FK.** Rejected: see "Mutation frequency" above. Cost: a quarterly UPDATE on FSMS standards now requires a complex `ccps` table reconciliation; benefit: zero in M3 query paths.
- **CCP as a global enum.** Rejected: kitchens differ. "abatidor-temp-T0" is not universal; some operators don't have a blast chiller. Operator-defined ID space is the only model that respects the diversity of the deployed base.

## Decision B — FSMS version pinning at write time

When `recordReading()` runs:

1. The service resolves the FSMS standard active for the tenant at `now()` (the row where `effective_from <= now() AND (effective_until IS NULL OR effective_until > now())`, ordered by `effective_from DESC` if multiple — but the `(organization_id, name, effective_from)` index + the `effective_until` invariant should yield exactly one row).
2. It looks up the CCP definition inside `fsms_standards.ccp_definitions[]` matching the `ccpId`.
3. It snapshots both `fsms_standard_id` (FK) and `fsms_standard_version` (denormalized text) onto the new `haccp_ccp_readings` row.

Two years later, an APPCC inspector projecting `aggregate_type='haccp_record'` rows from the audit_log can reconstruct the spec range by joining `haccp_ccp_readings.fsms_standard_id` back to `fsms_standards` and reading the version-frozen `ccp_definitions` from that row. The denormalized `fsms_standard_version` is a redundant convenience for human-readable rendering (the j10 mock's "referencia FSMS-2026-v2" eyebrow).

**Race condition (FSMS hot-swap during write)**: a new FSMS version's `effective_from` is in the future when the operator activates it. `recordReading()` resolves the standard at `now()` inside a single transaction; a swap landing mid-flight either commits before the resolve (the reading pins to the new version) or after (the reading pins to the old version). Both outcomes are correct — the spec range visible to the operator when they typed the value is the one that pins. We do NOT use `effective_from = now()` to mean "active immediately"; the convention is `effective_from = future timestamp set 1 minute out`. Owner UX guidance lives in slice #10's FSMS-config screen.

**Alternatives considered**

- **No version pinning, look up live.** Rejected: violates FR11 + the j10 §Decisions "Spec range is locked to the version active at submission time".
- **Hash-pinning the entire spec range onto the reading row.** Rejected: redundant — the `(fsms_standard_id, ccp_id)` tuple is the canonical reference. Hash adds bytes for forensic equivalence that the audit-log envelope already provides via `payload_after.specMin/specMax`.

## Decision C — Out-of-spec gate enforced at the service, mirrored at the DB

Per j10 §Decisions: "Out-of-spec MUST trigger corrective-action picker BEFORE submission". The service layer enforces:

```typescript
if (!inSpec && input.correctiveActionId == null) {
  throw new OutOfSpecRequiresCorrectiveActionError(
    `Reading for CCP ${input.ccpId} is out of spec (${input.readingValue} not in [${specMin}, ${specMax}]) and no correctiveActionId was supplied.`,
  );
}
```

The DB CHECK constraint (`haccp_readings_corrective_when_out_of_spec`) mirrors the same invariant. The DB constraint is the immovable line; the service throws a typed error that the controller maps to HTTP 422 (`UnprocessableEntityException`). The agent surface (MCP) propagates the error message inside the MCP error envelope so Hermes can re-prompt Mikel: "Carmen, esta lectura está fuera de rango — ¿cuál acción correctiva?".

**Alternatives considered**

- **Soft warning, allow submission.** Rejected per j10 §Decisions.
- **Auto-create an ad-hoc corrective action with `notes='auto-generated; operator action pending'`.** Rejected: this is exactly the gap the recall investigations later uncover. The reading-without-action audit-log signal is the lapse marker that slice #11's incident search surfaces; auto-creating an action erases the signal.

## Decision D — Corrective actions can be predefined OR ad-hoc

Per j10 §Walkthrough step 5: the corrective-action picker shows "pre-defined correctives (per FSMS-standard config + free-form)". The `CorrectiveAction` entity therefore has two creation modes:

1. **Predefined**: created by the Owner via `POST /m3/haccp/corrective-actions` with explicit `name + notes`, stored once, referenced many times by readings. The FSMS standard's `ccp_definitions[].recommendedCorrectiveActionIds[]` enumerates which predefined actions surface in the picker for this CCP.
2. **Ad-hoc**: created at reading-record time by `recordReading()` when the operator supplies `correctiveActionInput` (instead of `correctiveActionId`). The service creates the `CorrectiveAction` row first, then references it from the new reading.

Both modes emit `CCP_CORRECTIVE_ACTION_RECORDED` with `payload_after.creation_mode = 'predefined' | 'ad-hoc'`. The j10 picker shows predefined first; "Otra" opens a free-form text field that triggers ad-hoc creation on submit.

## Decision E — `aggregate_type='haccp_record'` for all 3 event types

Per ADR-025 (audit_log open-set event types) and slice #21's `RETENTION_BY_EVENT_NAME` lookup, the audit envelope's `aggregateType` field is the chronology + retention axis. We choose `'haccp_record'` (singular) for all 3 event types so:

- The future APPCC export (slice #15) projects all HACCP rows in one query with `WHERE aggregate_type='haccp_record'`.
- The `ix_audit_log_aggregate` compound index (`organizationId, aggregateType, aggregateId, createdAt`) drives projections for both `getReading(id)` and `getCorrectiveAction(id)` without an extra index.
- The aggregate_id is the specific row's UUID (the reading or action or fsms-standard), so chronology for one reading does not leak chronology for an unrelated one.

**Alternatives considered**

- **`aggregate_type = 'ccp_reading' | 'corrective_action' | 'fsms_standard'`** (three values). Rejected: the APPCC export query becomes 3-row UNION; slice #15's PDF chapter rendering wants one stream sorted by `created_at`. Singular aggregate_type unifies.

## Migrations (slot 0034 + 0037)

Slot 0033 was claimed at merge time by the M3 AI obs rollup. The slot reservation table in `docs/openspec-slice-module-3.md` §Slot reservations assigns 033-034 to this slice; the "next-free at claim time" fallback rule (per `.ai-playbook/specs/migration-slot-reservation.md` §3.1) selects 0034 + 0037 (the two lowest-numbered free slots greater than the highest already-merged).

**`0034_create_haccp_records_and_corrective_actions_tables.ts`** — creates `haccp_corrective_actions` first (referenced by `haccp_ccp_readings.corrective_action_id` FK), then `haccp_ccp_readings`. Indexes:
- `idx_haccp_readings_org_ccp_created` ON `haccp_ccp_readings (organization_id, ccp_id, created_at DESC)` — j10 `RecentReadingsStrip` hot path; sticky-warning probe.
- `idx_haccp_readings_org_fsms_created` ON `haccp_ccp_readings (organization_id, fsms_standard_id, created_at DESC)` — APPCC export per-standard rollup.
- `idx_haccp_corrective_actions_org_fsms_ccp` ON `haccp_corrective_actions (organization_id, fsms_standard_id, ccp_id)` — picker query.

**`0037_create_fsms_standards_table.ts`** — creates `fsms_standards` table. Indexes:
- `idx_fsms_standards_org_name_effective_from` ON `fsms_standards (organization_id, name, effective_from DESC)` — `getActiveStandard(orgId, at)` resolution.

The FK from `haccp_ccp_readings.fsms_standard_id` to `fsms_standards(id)` is created in migration 0037 via `ALTER TABLE` to avoid forward-FK referencing across migrations. (Alternatively the FK could be added at the end of `0037_create_fsms_standards_table.ts` — we adopt that pattern for clarity.)

**Down migrations** drop in reverse order; we ship both `up()` and `down()` per the existing migration template.

## Service contract surface

**`recordReading(orgId, input: RecordReadingInput): Promise<CcpReading>`**
- Resolves FSMS standard active at `now()` for `orgId`.
- Looks up CCP definition by `input.ccpId`.
- Computes `inSpec` (numeric: `specMin <= value <= specMax`; checkbox: `value === expected`; multi-select: `every(expected, has)`; range: `specMin <= value.start && value.end <= specMax`).
- Throws `OutOfSpecRequiresCorrectiveActionError` if `!inSpec && input.correctiveActionId == null && input.correctiveActionInput == null`.
- If `input.correctiveActionInput`, calls `correctiveActionService.recordCorrectiveAction()` first; uses the resulting id.
- Persists `CcpReading` row with snapshot fields.
- Emits `CCP_READING_RECORDED` envelope via `emitAsync`.
- Returns the saved entity.

**`recordCorrectiveAction(orgId, input: RecordCorrectiveActionInput): Promise<CorrectiveAction>`**
- If `input.id` provided, resolves an existing predefined action (validates same org).
- Otherwise creates a new ad-hoc action; emits `CCP_CORRECTIVE_ACTION_RECORDED` with `creation_mode = 'ad-hoc'`.

**`configureFsmsStandards(orgId, input: ConfigureFsmsStandardInput): Promise<FsmsStandard>`**
- Validates `ccpDefinitions[]` shape.
- If `terminatesPrior=true`, sets `effective_until = input.effectiveFrom` on the current active standard with the same `name`.
- Persists new row.
- Emits `FSMS_STANDARD_CONFIGURED`.

**`recentReadings(orgId, ccpId, limit=5): Promise<CcpReading[]>`**
- WHERE `organization_id=$1 AND ccp_id=$2 AND deleted_at IS NULL`.
- ORDER BY `created_at DESC`.
- LIMIT `min(limit, 50)`.

**`lastOutOfSpecUnresolved(orgId, ccpId): Promise<CcpReading | null>`**
- WHERE `organization_id=$1 AND ccp_id=$2 AND in_spec=false AND corrective_action_id IS NULL AND deleted_at IS NULL`.
- ORDER BY `created_at DESC`.
- LIMIT 1.

## RBAC

| Endpoint | Roles |
|---|---|
| `POST /m3/haccp/readings` | OWNER, MANAGER |
| `GET  /m3/haccp/readings` | OWNER, MANAGER |
| `GET  /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved` | OWNER, MANAGER |
| `POST /m3/haccp/corrective-actions` | OWNER, MANAGER |
| `GET  /m3/haccp/corrective-actions` | OWNER, MANAGER |
| `POST /m3/haccp/fsms-standards` | OWNER |
| `PUT  /m3/haccp/fsms-standards/:id` | OWNER |
| `GET  /m3/haccp/fsms-standards` | OWNER |

The j10 mock surfaces Carmen (Head Chef) recording readings on the tablet. The `HEAD_CHEF` role from PRD-M3 §RBAC is rendered as a custom role at the IAM layer in a future slice (`m3-iam-staff-headchef-roles` reserved for M3.x); meanwhile MANAGER carries Carmen's permission set. STAFF logging via Hermes (Mikel's flow) is handled via the agent context propagation — the agent acts on behalf of the staff user, and `RolesGuard` evaluates the user's role attached to the JWT. Staff RBAC for direct REST is a follow-up; for this slice MCP via agent is the staff path.

## Test plan

**Unit (this slice)**
- `ccp-reading.service.spec.ts` — 6+ tests: in-spec records, out-of-spec with corrective-id records, out-of-spec without action throws, in-spec for checkbox / multi-select / range types, FSMS version pinning, multi-tenant scope.
- `corrective-action.service.spec.ts` — 4 tests: predefined resolves, ad-hoc creates, duplicate-name allowed (text not enforced), multi-tenant.
- `fsms-standard.service.spec.ts` — 4 tests: active-window resolution by `now()`, prior-version termination via `effective_until`, listVersions ordering, multi-tenant.
- `recent-readings.query.spec.ts` — 3 tests: limit applied, DESC order, tenant scope.
- `out-of-spec-without-action.query.spec.ts` — 3 tests: returns most recent unresolved, returns null when all resolved, multi-tenant.
- `ccp-reading.controller.spec.ts` — 3+ tests: RBAC metadata correct, DTO validation, cross-org rejection.

**Deferred to INT followup** — testcontainers Postgres with real migrations:
- DB CHECK constraint enforcement (`haccp_readings_corrective_when_out_of_spec`).
- FK cascade behaviour on FSMS standard delete (which is forbidden — version termination only).
- Concurrent FSMS swap race (commit ordering).
- Audit envelope persistence + retention class verification.

## Open questions

None — design decisions A through E are firm. The FSMS schema is operator-defined-per-org, not centrally curated; that's the M3 promise and stays in M4 unchanged.

## Risks + mitigations

- **Risk**: `haccp_corrective_actions` accumulates ad-hoc rows over time, polluting the picker. **Mitigation**: the picker query (`GET /m3/haccp/corrective-actions`) returns predefined first + only the 10 most-recent ad-hoc actions for the CCP. Pagination + archival deferred to M3.x.
- **Risk**: an Owner deletes an in-use FSMS standard, breaking the FK from prior readings. **Mitigation**: `fsms-standard.service.ts` refuses delete; only `effective_until` updates are allowed. The "Risk" is purely a misuse path; the service contract is `terminate-then-supersede`, never `delete`.
- **Risk**: a malicious Manager records readings for a different tenant's CCP. **Mitigation**: every WHERE clause is `organization_id = $orgId`, taken from `req.user.organizationId`; the DTO's `organizationId` is asserted to match (cross-org rejection). This is the pattern from slice #13's recall controller.
- **Risk**: the audit_log row for `CCP_READING_RECORDED` exceeds the 100-char `event_type` CHECK or the snippet 500-char cap. **Mitigation**: event_type strings are pre-validated by the `AuditEventTypeName` map (max 30 chars); the snippet is computed from `ccpId + readingValue + readingUnit` (typically <50 chars).

## Migration safety

The two migrations are forward-only and idempotent (use `CREATE TABLE IF NOT EXISTS` not applicable on Postgres; we use `CREATE TABLE` and rely on the migration framework's "run once" semantics). `down()` drops in reverse FK order. No production data exists yet; the slice ships before the Pilot-1 deployment.
