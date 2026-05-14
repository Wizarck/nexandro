# HACCP CCP Reading Aggregate Spec

Module: `apps/api/src/haccp/`
Slice: `m3-ccp-reading-aggregate` (Wave 2.6, slice #9/22)
FRs covered: FR9, FR10, FR11, FR12, FR13.

## ADDED Requirements

### Requirement: Record an in-spec CCP reading

The system SHALL persist a `haccp_ccp_readings` row whenever a Manager/Owner records a reading whose value falls inside the FSMS-standard's `(specMin, specMax)` interval, mark `in_spec=true`, snapshot the FSMS standard id + version, and emit a `CCP_READING_RECORDED` envelope with `aggregate_type='haccp_record'` + `retention_class='regulatory'`.

#### Scenario: Manager records a cooler temp reading inside spec

- **GIVEN** an organization `org-1` with an active FSMS standard `fsms-2026-v2` whose CCP `cooler-meat-fridge` defines `specMin=-2, specMax=2, unit='°C'`
- **AND** a Manager `mgr-1` is authenticated for `org-1`
- **WHEN** the Manager calls `POST /m3/haccp/readings` with `{ organizationId: 'org-1', ccpId: 'cooler-meat-fridge', readingValue: 1.4 }`
- **THEN** a new `haccp_ccp_readings` row is persisted with `in_spec=true`, `spec_min=-2`, `spec_max=2`, `fsms_standard_id='fsms-2026-v2-uuid'`, `fsms_standard_version='v2'`, `corrective_action_id=null`
- **AND** an `audit_log` row is written with `event_type='CCP_READING_RECORDED'`, `aggregate_type='haccp_record'`, `aggregate_id=<reading.id>`, `actor_kind='user'`, `actor_user_id='mgr-1'`, `retention_class='regulatory'`
- **AND** the response carries the persisted reading shape with `inSpec: true`

### Requirement: Record an out-of-spec reading with a corrective-action link

The system SHALL accept an out-of-spec reading when the operator supplies either `correctiveActionId` (referencing a predefined `haccp_corrective_actions` row) or `correctiveActionInput` (carrying ad-hoc `name + notes`). Both modes MUST emit `CCP_CORRECTIVE_ACTION_RECORDED` AND `CCP_READING_RECORDED` envelopes.

#### Scenario: Head Chef logs out-of-spec cooling curve and picks "Dividir" corrective action

- **GIVEN** an organization `org-1` with FSMS standard `fsms-2026-v2` whose CCP `cooling-curve-2h` defines `specMin=null, specMax=21, unit='°C'`
- **AND** a predefined corrective action `act-divide-batch` exists for that CCP
- **WHEN** the operator calls `POST /m3/haccp/readings` with `{ organizationId: 'org-1', ccpId: 'cooling-curve-2h', readingValue: 24.3, correctiveActionId: 'act-divide-batch' }`
- **THEN** a `haccp_ccp_readings` row is persisted with `in_spec=false`, `corrective_action_id='act-divide-batch'`, `fsms_standard_version='v2'`
- **AND** an `audit_log` envelope `CCP_READING_RECORDED` is written with `payload_after.correctiveActionId='act-divide-batch'`
- **AND** no second corrective-action audit event is emitted (the predefined action already had its audit row at create time)

#### Scenario: Operator submits out-of-spec reading with ad-hoc free-form action

- **GIVEN** an organization `org-1` with FSMS standard `fsms-2026-v2`
- **WHEN** the operator calls `POST /m3/haccp/readings` with `{ organizationId, ccpId, readingValue: 30, correctiveActionInput: { name: 'Descartar lote', notes: 'demasiado caliente' } }`
- **THEN** a new `haccp_corrective_actions` row is created with `name='Descartar lote'`, `notes='demasiado caliente'`
- **AND** a `CCP_CORRECTIVE_ACTION_RECORDED` envelope is emitted with `payload_after.creation_mode='ad-hoc'`
- **AND** the `haccp_ccp_readings` row references the new corrective-action id

### Requirement: Refuse out-of-spec reading without a corrective action

The service SHALL throw `OutOfSpecRequiresCorrectiveActionError` and the controller SHALL respond with HTTP 422 if a reading is out-of-spec AND neither `correctiveActionId` nor `correctiveActionInput` is supplied. No `haccp_ccp_readings` row is persisted; no `audit_log` envelope is emitted.

#### Scenario: Operator attempts to submit a temperature out of range without corrective action

- **GIVEN** an organization `org-1` with FSMS standard whose CCP `cooler-meat-fridge` defines `specMin=-2, specMax=2`
- **WHEN** the operator calls `POST /m3/haccp/readings` with `{ organizationId, ccpId: 'cooler-meat-fridge', readingValue: 6.5 }` and NO corrective action
- **THEN** the response is HTTP 422 with body `{ message: "Reading for CCP cooler-meat-fridge is out of spec (6.5 not in [-2, 2]) and no correctiveActionId was supplied.", error: 'OUT_OF_SPEC_REQUIRES_CORRECTIVE_ACTION' }`
- **AND** no `haccp_ccp_readings` row is persisted
- **AND** no `CCP_READING_RECORDED` audit envelope is emitted

### Requirement: Pin the FSMS standard version active at write time

Each `haccp_ccp_readings` row MUST snapshot the `fsms_standard_id` AND `fsms_standard_version` of the FSMS standard active at `now()` for the recording tenant. Subsequent FSMS-standard updates SHALL NOT mutate prior readings' spec ranges.

#### Scenario: FSMS standard is upgraded after a reading is recorded

- **GIVEN** an organization `org-1` with FSMS standard `fsms-2026-v2` active since 2026-01-01
- **AND** a reading `R1` recorded on 2026-03-15 with `fsms_standard_version='v2'`
- **WHEN** the Owner activates `fsms-2026-v3` on 2026-04-01 (by `POST /m3/haccp/fsms-standards` with `terminatesPrior=true`)
- **AND** a new reading `R2` is recorded on 2026-04-15
- **THEN** `R1.fsms_standard_version` is still `'v2'` (unchanged)
- **AND** `R2.fsms_standard_version='v3'`

### Requirement: RBAC enforcement on HACCP endpoints

The system SHALL enforce role-based access via `@Roles()` decorators read by the global `RolesGuard`:

- `POST /m3/haccp/readings`, `GET /m3/haccp/readings`, `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved`, `POST /m3/haccp/corrective-actions`, `GET /m3/haccp/corrective-actions`: `OWNER` + `MANAGER`.
- `POST /m3/haccp/fsms-standards`, `PUT /m3/haccp/fsms-standards/:id`, `GET /m3/haccp/fsms-standards`: `OWNER` only.
- `STAFF` SHALL receive HTTP 403 on all HACCP REST endpoints.

#### Scenario: STAFF user is blocked from recording a reading via REST

- **GIVEN** a STAFF user `staff-1` authenticated for `org-1`
- **WHEN** the user calls `POST /m3/haccp/readings`
- **THEN** the response is HTTP 403 Forbidden (the `RolesGuard` blocks before the controller is invoked)

#### Scenario: MANAGER is blocked from configuring FSMS standards

- **GIVEN** a MANAGER user authenticated for `org-1`
- **WHEN** the user calls `POST /m3/haccp/fsms-standards`
- **THEN** the response is HTTP 403 Forbidden

### Requirement: Recent-readings query returns last N readings for a CCP

The system SHALL expose `GET /m3/haccp/readings?ccpId=…&limit=…` returning readings sorted `created_at DESC`, with a default limit of 5 and hard maximum of 50. Soft-deleted rows (`deleted_at IS NOT NULL`) MUST NOT appear.

#### Scenario: Manager fetches the 5 most-recent readings for a CCP

- **GIVEN** 7 `haccp_ccp_readings` rows for `(org-1, cooler-meat-fridge)` with `created_at` spanning 2026-05-12T08:00 to 2026-05-13T08:00
- **WHEN** the Manager calls `GET /m3/haccp/readings?ccpId=cooler-meat-fridge&limit=5`
- **THEN** the response carries 5 readings sorted `created_at DESC`
- **AND** the first reading's `created_at` is 2026-05-13T08:00 (latest)

### Requirement: Sticky-warning probe returns last unresolved out-of-spec reading

The system SHALL expose `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved` returning the most-recent reading where `in_spec=false AND corrective_action_id IS NULL`, scoped to the requesting tenant. If no such reading exists, the response carries `{ reading: null }`.

#### Scenario: j10 sticky warning fires after an unresolved out-of-spec reading

- **GIVEN** a reading `R1` recorded for `(org-1, cooler-meat-fridge)` with `in_spec=false, corrective_action_id=null` at 2026-05-13T12:00
- **AND** a subsequent reading `R2` recorded at 2026-05-13T18:00 with `in_spec=true`
- **WHEN** Carmen lands on the j10 screen and the UI calls `GET /m3/haccp/ccps/cooler-meat-fridge/last-out-of-spec-unresolved`
- **THEN** the response carries `R1` (the unresolved one), NOT `R2`
- **AND** the j10 surface mounts the sticky `--destructive` warning at the top of the screen (slice #10 owns the UI)

#### Scenario: No unresolved reading exists

- **GIVEN** all out-of-spec readings for `(org-1, cooler-meat-fridge)` have a non-null `corrective_action_id`
- **WHEN** the probe endpoint is called
- **THEN** the response carries `{ reading: null }`

### Requirement: Multi-tenant isolation

Every HACCP read + write SHALL gate WHERE clauses on `organization_id`. A user from `org-A` SHALL NOT receive any data belonging to `org-B`.

#### Scenario: Cross-org read attempt

- **GIVEN** a Manager authenticated for `org-A`
- **WHEN** they call `GET /m3/haccp/readings?organizationId=org-B&ccpId=cooler-meat-fridge`
- **THEN** the controller asserts `req.user.organizationId !== dto.organizationId` and responds with HTTP 403
- **AND** no DB query is executed for `org-B`

### Requirement: Audit envelopes for FSMS-standard configuration

`POST /m3/haccp/fsms-standards` and `PUT /m3/haccp/fsms-standards/:id` SHALL emit `FSMS_STANDARD_CONFIGURED` envelopes carrying `aggregate_type='haccp_record'`, `aggregate_id=<fsmsStandard.id>`, `retention_class='regulatory'`, and `payload_after = { name, version, effectiveFrom, effectiveUntil, ccpDefinitionsCount }` (NOT the full ccpDefinitions array; rendered separately to keep the audit row size bounded).

#### Scenario: Owner publishes a new FSMS version

- **GIVEN** an Owner authenticated for `org-1`
- **WHEN** the Owner calls `POST /m3/haccp/fsms-standards` with a new FSMS version `v3`
- **THEN** a `fsms_standards` row is persisted with `version='v3'`
- **AND** an `audit_log` envelope is emitted with `event_type='FSMS_STANDARD_CONFIGURED'`, `aggregate_type='haccp_record'`, `aggregate_id=<fsmsStandard.id>`, `retention_class='regulatory'`
- **AND** if `terminatesPrior=true` is supplied, the previously active standard with the same `name` has its `effective_until` set to the new `effective_from`

### Requirement: Predefined-vs-ad-hoc corrective action resolution

The system SHALL distinguish corrective actions created via `POST /m3/haccp/corrective-actions` (predefined) from corrective actions created inline via `recordReading()` (ad-hoc). The `payload_after.creation_mode` field on the `CCP_CORRECTIVE_ACTION_RECORDED` audit envelope SHALL carry `'predefined'` or `'ad-hoc'`.

#### Scenario: Predefined corrective action is created via the dedicated endpoint

- **GIVEN** an Owner authenticated for `org-1`
- **WHEN** the Owner calls `POST /m3/haccp/corrective-actions` with `{ ccpId, fsmsStandardId, name: 'Dividir lote', notes: '...' }`
- **THEN** a `haccp_corrective_actions` row is persisted
- **AND** a `CCP_CORRECTIVE_ACTION_RECORDED` envelope is emitted with `payload_after.creation_mode='predefined'`

### Requirement: FSMS effective-window selection

`fsmsStandardService.getActiveStandard(orgId, name, at?)` SHALL return the FSMS standard for the tenant whose `effective_from <= at` AND (`effective_until IS NULL OR effective_until > at`), defaulting `at` to `now()`. If multiple rows qualify (a degenerate state that should not occur), the most-recent `effective_from` wins.

#### Scenario: Active standard resolution at a specific timestamp

- **GIVEN** an FSMS standard `name='casa-aitona-2026'` has 3 versions: `v1` (`effective_from=2026-01-01`, `effective_until=2026-04-01`), `v2` (`effective_from=2026-04-01`, `effective_until=2026-07-01`), `v3` (`effective_from=2026-07-01`, `effective_until=NULL`)
- **WHEN** the service is called with `at=2026-05-15`
- **THEN** the returned standard is `v2`
