## ADDED Requirements

### Requirement: AuditLogSubscriber persists every M3 event type

The system SHALL extend `AuditLogSubscriber` (apps/api/src/audit-log/application/audit-log.subscriber.ts) with one `@OnEvent` handler per accumulated M3 event type: `LOT_CREATED`, `STOCK_MOVE_CREATED`, `LOT_CONSUMED`, `LOT_EXPIRY_NEAR`, `COST_SNAPSHOT_RECORDED`, `PO_CREATED`, `PO_SENT`, `PO_RECEIVED_PARTIAL`, `PO_RECEIVED_FULL`, `PO_CANCELLED`, `PO_CLOSED`, `GR_CONFIRMED`, `GR_LINE_QTY_VARIANCE`, `GR_LINE_PRICE_VARIANCE`, `EMAIL_DISPATCHED`, `EMAIL_FAILED`. Each handler SHALL map the producing slice's emitted shape to the canonical `AuditEventEnvelope` and persist via `AuditLogService.record()`.

#### Scenario: LOT_CONSUMED event persists one audit_log row
- **WHEN** `ConsumptionService.recordConsumption()` emits a `LotConsumedEvent` on the `m3.inventory.lot-consumed` channel
- **THEN** the subscriber's `onLotConsumed()` method maps the envelope (carrying `aggregateType='lot'`, `aggregateId=lotId`, `payloadAfter=LotConsumedPayload`) and `AuditLogService.record()` persists exactly one `audit_log` row with `event_type='LOT_CONSUMED'`

#### Scenario: LOT_EXPIRY_NEAR event persists with system actor
- **WHEN** `ExpiryScannerService.scan()` emits a `LotExpiryNearEvent` on the `audit.event` channel with `actorKind='system'` and `actorUserId=null`
- **THEN** the subscriber's `onLotExpiryNear()` method persists the envelope as-is via `persistEnvelope()`; the `audit_log` row carries `actor_kind='system'` and `actor_user_id IS NULL`

#### Scenario: COST_SNAPSHOT_RECORDED event persists with cost_snapshot aggregate
- **WHEN** `CostSnapshotService.snapshotConsumption()` emits a `CostSnapshotRecordedPayload`
- **THEN** the subscriber persists with `aggregate_type='cost_snapshot'`, `event_type='COST_SNAPSHOT_RECORDED'`, and `payload_after` containing the full snapshot row JSONB

#### Scenario: GR_CONFIRMED event maps GrConfirmedEventPayload to canonical envelope
- **WHEN** `GrConfirmationService.confirm()` emits `GrConfirmedEventPayload` on the `procurement-gr.confirmed` channel
- **THEN** the subscriber's `onGrConfirmed()` method translates the payload (which carries `grId`, `organizationId`, `lines[]`) into the canonical envelope shape with `aggregate_type='goods_receipt'`, `aggregate_id=grId`, and persists with `event_type='GR_CONFIRMED'`

#### Scenario: GR_LINE_QTY_VARIANCE and GR_LINE_PRICE_VARIANCE each persist one row
- **WHEN** `GrConfirmationService.confirm()` emits one qty variance + one price variance event
- **THEN** the subscriber persists exactly two `audit_log` rows, one with `event_type='GR_LINE_QTY_VARIANCE'` and one with `event_type='GR_LINE_PRICE_VARIANCE'`

#### Scenario: PO_* events wired even though emit-side is deferred
- **WHEN** the `AuditLogSubscriber` class is loaded into the Nest IoC container
- **THEN** it registers `@OnEvent` handlers for all six PO state events; even though the emit-side hooks are deferred to an ops follow-up, the subscriber side is fully wired and will activate on the first PO event emission

#### Scenario: EMAIL_DISPATCHED and EMAIL_FAILED handlers register at module load
- **WHEN** the AuditLogModule starts
- **THEN** the subscriber registers handlers for both email event channels; consumer slices (#13/#15/#19) will emit through their EmailDispatchService callers

### Requirement: Hash chain integrity validated per write

The system SHALL compute a SHA-256 hash for every new `audit_log` row covering `(prev_hash || canonicaliseRow(row))`. The system SHALL validate the previous 100 rows' chain on every append by recomputing their hashes and comparing against the stored `row_hash` column. If any mismatch is detected, the system SHALL throw `HashChainBrokenError`, fail the write with HTTP 500, and emit a structured log line `audit-log.chain-broken organizationId=… first_broken_row_id=…`.

#### Scenario: New row's hash chains to the previous row
- **WHEN** `AuditLogService.record()` is called for a tenant with at least one existing row
- **THEN** the new row's `prev_hash` SHALL equal the previous row's `row_hash`, AND the new row's `row_hash` SHALL equal `SHA-256(prev_hash || canonicaliseRow(new_row))`

#### Scenario: First row for a tenant has NULL prev_hash
- **WHEN** `record()` is called for a tenant with no existing rows
- **THEN** the new row's `prev_hash` IS NULL; `row_hash` = `SHA-256('' || canonicaliseRow(new_row))`

#### Scenario: Broken chain detected on the 51st row's append
- **GIVEN** 50 existing rows for a tenant
- **AND** an attacker has UPDATEd row #25's `payload_after` outside the audit pipeline
- **WHEN** a 51st row is appended via `record()`
- **THEN** the 100-row lookback validator recomputes hashes for rows 1-50, detects the mismatch at row #25, throws `HashChainBrokenError`, and refuses to commit the 51st row

#### Scenario: Lookback is bounded at 100 rows
- **GIVEN** 5,000 existing rows for a tenant
- **WHEN** `record()` validates the chain
- **THEN** at most 100 rows are read for validation (verified by EXPLAIN ANALYZE: rows scanned ≤ 100)

#### Scenario: Validation latency p95 ≤ 5 ms
- **GIVEN** an existing tenant with 1 M `audit_log` rows
- **WHEN** 1,000 sequential `record()` calls are timed
- **THEN** p95 of the validation phase (excluding the INSERT itself) is ≤ 5 ms

### Requirement: Retention class derived from event type at write time

The system SHALL extend `audit_log` with a `retention_class text NOT NULL` column constrained to `('regulatory','operational','ephemeral')`. The class SHALL be computed at write time from the event type via the lookup table defined in design.md ADR-AUDIT-RETENTION-CLASS. Migration 0024 SHALL backfill existing rows with the same lookup.

#### Scenario: regulatory event types tagged as 'regulatory'
- **WHEN** a row is written with `event_type` in `{AGENT_ACTION_FORENSIC, LOT_CONSUMED, LOT_EXPIRY_NEAR, GR_CONFIRMED, COST_SNAPSHOT_RECORDED, PO_RECEIVED_FULL, PO_RECEIVED_PARTIAL, LOT_CREATED, STOCK_MOVE_CREATED}`
- **THEN** `retention_class='regulatory'` is set automatically

#### Scenario: AGENT_ACTION_EXECUTED tagged as 'ephemeral'
- **WHEN** a row is written with `event_type='AGENT_ACTION_EXECUTED'` (the lean request-anchored row)
- **THEN** `retention_class='ephemeral'`

#### Scenario: unknown event type defaults to 'operational'
- **WHEN** a row is written with an event type not in the regulatory or ephemeral lookup
- **THEN** `retention_class='operational'`

#### Scenario: backfill applies the same classification to legacy rows
- **WHEN** migration 0024 runs on a database with 10 K pre-existing `audit_log` rows
- **THEN** every row gains a `retention_class` value matching the same lookup applied to its `event_type`

### Requirement: Idempotent dedup of bus retries

The system SHALL maintain an in-process LRU cache (capacity 10 000, TTL 1 hour) keyed on `(event_type, aggregate_id, correlation_id)`. When the same event arrives twice within the TTL, the subscriber SHALL log a debug-level duplicate marker and skip the second persistence. When `correlation_id` is absent, the system SHALL fall back to keying on `(event_type, aggregate_id, payload_hash)`.

#### Scenario: same (event_type, aggregate_id, correlation_id) twice → one row
- **WHEN** the same `LotConsumedEvent` is emitted twice on the bus within 1 minute
- **THEN** exactly one `audit_log` row is persisted; the second emission logs `audit-log.subscriber.duplicate` and is skipped

#### Scenario: distinct correlation_id for the same aggregate → both rows persist
- **WHEN** two `LotConsumedEvent` emissions arrive with different `correlation_id` (two distinct consumption flows for the same lot)
- **THEN** both persist as distinct `audit_log` rows

#### Scenario: missing correlation_id falls back to payload hash
- **WHEN** an envelope arrives with `correlation_id=undefined` and is emitted twice with identical payload
- **THEN** the second emission is deduped via the `payload_hash` fallback

#### Scenario: TTL expiry releases the dedup slot
- **WHEN** the same envelope is emitted 1 hour 1 second apart
- **THEN** both persist as distinct rows (TTL expired between emissions)

### Requirement: Migration 0023 adds hash chain columns and backfills

The system SHALL ship migration `0023_audit_log_hash_chain` that (a) adds `row_hash bytea NOT NULL` and `prev_hash bytea NULL` columns to `audit_log`; (b) adds index `ix_audit_log_chain` on `(organization_id, created_at DESC, id DESC)`; (c) backfills `prev_hash` and `row_hash` for every existing row in tenant-scoped chronological order; (d) is idempotent on re-run (guard via `WHERE row_hash IS NULL`).

#### Scenario: Fresh DB applies cleanly
- **WHEN** all migrations 0001-0024 run on an empty database
- **THEN** the `audit_log` table includes `row_hash` and `prev_hash` columns with the chain index; no rows to backfill

#### Scenario: Existing DB backfills chain in chronological order
- **WHEN** migration 0023 runs on a database with 1 000 existing `audit_log` rows
- **THEN** rows are visited in `(organization_id ASC, created_at ASC, id ASC)` order; the Nth row's `prev_hash` equals the (N-1)th row's `row_hash` within the same tenant; the first row per tenant has `prev_hash IS NULL`

#### Scenario: Re-run is a no-op
- **WHEN** migration 0023 runs twice
- **THEN** the second run leaves all rows unchanged (verified by hash equality before/after)

#### Scenario: Down migration drops the columns + index
- **WHEN** migration 0023 down runs
- **THEN** `row_hash`, `prev_hash`, and `ix_audit_log_chain` are dropped; reading existing rows still works (legacy reads don't reference the dropped columns)

### Requirement: Migration 0024 adds retention_class column and backfills

The system SHALL ship migration `0024_audit_log_retention_class` that (a) adds `retention_class text NOT NULL DEFAULT 'operational' CHECK (retention_class IN ('regulatory','operational','ephemeral'))`; (b) adds index `ix_audit_log_retention` on `(organization_id, retention_class, created_at DESC)`; (c) backfills regulatory + ephemeral classifications via targeted UPDATE; (d) is idempotent on re-run.

#### Scenario: Fresh DB applies cleanly with default operational
- **WHEN** migration 0024 runs on an empty audit_log
- **THEN** the column exists with the default; no rows to backfill

#### Scenario: Backfill promotes regulatory and ephemeral rows
- **WHEN** migration 0024 runs on a DB with rows of mixed event types
- **THEN** rows with `event_type IN (regulatory list)` get `retention_class='regulatory'`; rows with `event_type='AGENT_ACTION_EXECUTED'` get `'ephemeral'`; all others get the `'operational'` default

#### Scenario: Re-run is a no-op
- **WHEN** migration 0024 runs twice
- **THEN** the second run leaves all rows unchanged

### Requirement: Hash chain validation kill-switch via env var

The system SHALL honor `AUDIT_LOG_HASH_CHAIN_ENABLED=false` as an emergency kill-switch that disables per-write chain validation (but does NOT disable hash computation; new rows still get `row_hash` + `prev_hash` columns populated). The default (env unset or `=true`) keeps validation enabled.

#### Scenario: Kill-switch off → validation skipped
- **GIVEN** `AUDIT_LOG_HASH_CHAIN_ENABLED=false`
- **AND** a tampered row in the database
- **WHEN** a new row is appended
- **THEN** the append succeeds; no `HashChainBrokenError` is thrown; the new row's `row_hash` still chains correctly from the most recent stored `row_hash`

#### Scenario: Default keeps validation on
- **WHEN** the env var is unset
- **THEN** validation runs on every write per ADR-HASH-CHAIN-VALIDATION-PER-WRITE

### Requirement: AuditLogSubscriber subscriber registration in providers list

The system SHALL register `AuditLogSubscriber` in `AuditLogModule.providers` (NOT solely via `EventEmitterModule.forRoot()`). Per the project gotcha [[feedback_event_subscriber_int_specs]], `EventEmitterModule` alone does not activate `@OnEvent` handlers; the subscriber class itself must be in the providers array.

#### Scenario: AuditLogSubscriber is registered as a provider
- **WHEN** the `AuditLogModule` is loaded
- **THEN** `Test.createTestingModule({ imports: [AuditLogModule, EventEmitterModule.forRoot()] })` can resolve `AuditLogSubscriber` via `module.get(AuditLogSubscriber)`

#### Scenario: @OnEvent handlers fire when events are emitted
- **GIVEN** a Test module with `AuditLogModule` + `EventEmitterModule.forRoot()` + a mocked `AuditLogService.record`
- **WHEN** `eventEmitter.emit('m3.inventory.lot-consumed', envelope)`
- **THEN** the mocked `record` is called exactly once with the canonical envelope

### Requirement: AuditLogService.record() integrates chain + retention atomically

The system SHALL extend `AuditLogService.record()` to compute `prev_hash`, `row_hash`, and `retention_class` BEFORE the INSERT, within the same database transaction. If any of the three computations throws, the transaction SHALL roll back and no row SHALL be persisted.

#### Scenario: Chain validation failure rolls back
- **GIVEN** a corrupted chain in the lookback window
- **WHEN** `record()` is called
- **THEN** `HashChainBrokenError` is thrown; the transaction rolls back; no row is inserted

#### Scenario: Retention computation never throws
- **WHEN** `record()` is called with any event type (known or unknown)
- **THEN** retention_class is computed (defaulting to `'operational'` for unknown) without throwing
