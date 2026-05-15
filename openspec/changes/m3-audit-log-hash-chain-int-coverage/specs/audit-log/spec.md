## ADDED Requirements

### Requirement: Hash chain integrity verified end-to-end against real Postgres

The system SHALL ship Postgres-backed INT coverage proving the rowHash/prevHash chain wires correctly under `AuditLogService.record()` against a database with migrations 0023 + 0024 applied.

#### Scenario: AC-CHAIN-1 — rowHash/prevHash wire correctly across two consecutive emits
- **GIVEN** a Postgres database with migrations through 0024 applied
- **AND** the `audit_log` table is empty (`TRUNCATE` in `beforeEach`)
- **WHEN** `AuditLogService.record()` is called twice with distinct envelopes for the same tenant
- **THEN** the first row's `prev_hash IS NULL` and its `row_hash = SHA-256('' || canonicaliseRow(row1))`
- **AND** the second row's `prev_hash = row1.row_hash` and its `row_hash = SHA-256(row1.row_hash || canonicaliseRow(row2))`
- **AND** `validateChainIntegrity([row1, row2])` returns `{ ok: true }`

#### Scenario: AC-CHAIN-2 — 100-row lookback bound holds at chain length 200
- **GIVEN** 200 valid rows seeded for a single tenant via `record()`
- **WHEN** a 201st `record()` is called
- **THEN** the call succeeds (chain remains valid; lookback validator runs against the most recent 100 rows only)
- **AND** the resulting `audit_log` row count is 201

#### Scenario: AC-CHAIN-2b — tampering a row outside the 100-row lookback window does NOT block the next emit
- **GIVEN** 200 valid rows seeded for a tenant
- **AND** a raw `UPDATE audit_log SET payload_after = '{"tampered":true}'::jsonb` on row at chain position 5 (~195 rows back, outside the 100-row window)
- **WHEN** a 201st `record()` is called
- **THEN** the call succeeds (the older tamper is outside the synchronous detection window per ADR-HASH-CHAIN-VALIDATION-PER-WRITE)
- **AND** the older tamper REMAINS detectable by an offline full-chain audit job (deferred — D1 in tasks.md)

#### Scenario: AC-CHAIN-3 — mid-chain tamper detected on next emit
- **GIVEN** 50 valid rows seeded for a tenant via `record()`
- **AND** a raw `UPDATE audit_log SET payload_after = '{"tampered":true}'::jsonb WHERE id = row25.id` (out-of-band rewrite of row at chain position 25)
- **WHEN** a 51st `record()` is called
- **THEN** the call throws `HashChainBrokenError`
- **AND** `error.firstBrokenRowId === row25.id`
- **AND** the `audit_log` row count remains 50 (no 51st row written — panic-and-stop per ADR-TAMPER-DETECTION-PANIC-OR-CONTINUE)

#### Scenario: AC-CHAIN-7 — idempotent re-emit with correlationId produces one row
- **GIVEN** `AuditLogIdempotencyCache` wired into `AuditLogService` (constructor injection)
- **WHEN** `record(eventType, envelope)` is called twice with identical `(eventType, aggregateId, correlationId)` (correlationId carried in `payloadAfter.correlation_id`)
- **THEN** exactly one `audit_log` row is persisted
- **AND** the second call returns a non-persisted marker row (the first call's return is the only DB-side state mutation)

### Requirement: retention_class CHECK constraint enforced at the DB layer

The system SHALL ship Postgres-backed INT coverage proving the `audit_log_retention_class_check` CHECK constraint rejects any value outside `('regulatory', 'operational', 'ephemeral')` and that the in-process `RETENTION_BY_EVENT_NAME` lookup table only emits values in that set.

#### Scenario: AC-CHAIN-4 — raw INSERT with unknown retention_class is rejected
- **WHEN** a raw `INSERT INTO audit_log (..., retention_class) VALUES (..., 'foobar')` is attempted
- **THEN** Postgres rejects the statement with SQLSTATE `23514` (check_violation)
- **AND** the `audit_log` table contains no row with `retention_class = 'foobar'`

#### Scenario: AC-CHAIN-4b — the three canonical retention values insert successfully
- **WHEN** raw inserts are attempted with `retention_class` set to each of `'regulatory'`, `'operational'`, `'ephemeral'`
- **THEN** all three inserts succeed
- **AND** each row's `retention_class` matches the supplied value when read back

#### Scenario: AC-CHAIN-4c — every value in RETENTION_BY_EVENT_NAME round-trips through record() to the DB
- **WHEN** `record(eventType, envelope)` is called once per distinct event-type name in `RETENTION_BY_EVENT_NAME`
- **THEN** each resulting `audit_log` row carries `retention_class` equal to `computeRetentionClass(eventTypeName)`
- **AND** every value falls in `('regulatory', 'operational', 'ephemeral')` (proves no drift between the TS lookup and the DB CHECK set)

#### Scenario: AC-CHAIN-4d — drift-surfacing: CHECK constraint definition matches the documented enum
- **WHEN** the test queries `pg_constraint` for `conname = 'audit_log_retention_class_check'`
- **THEN** exactly one row is returned
- **AND** the constraint definition (`pg_get_constraintdef`) literally contains `'regulatory'`, `'operational'`, and `'ephemeral'`

### Requirement: Multi-tenant chain isolation and per-aggregate scoping documented

The system SHALL ship Postgres-backed INT coverage proving that corrupting one tenant's chain does NOT block another tenant's emits AND that the chain is tenant-scoped (NOT aggregate-scoped), per ADR-PER-AGGREGATE-PARTITIONING.

#### Scenario: AC-CHAIN-5 — corrupting org A's chain does not block org B's next emit
- **GIVEN** 10 valid rows seeded for org A AND 10 valid rows seeded for org B
- **AND** a raw `UPDATE audit_log SET payload_after = '{"tampered":true}'::jsonb WHERE id = orgARow5.id`
- **WHEN** `record(eventType, envelopeForOrgB)` is called
- **THEN** the call succeeds and the org B `audit_log` row count increases by exactly 1
- **WHEN** `record(eventType, envelopeForOrgA)` is called immediately after
- **THEN** the call throws `HashChainBrokenError` with `firstBrokenRowId = orgARow5.id`

#### Scenario: AC-CHAIN-6a — interleaved per-aggregate emits within one tenant validate as one chain
- **GIVEN** 25 emits against lineage A (`aggregateType='recipe', aggregateId=$A`) AND 25 emits against lineage B (`aggregateType='lot', aggregateId=$B`) within ONE org, interleaved by emit time
- **WHEN** `validateChainIntegrity()` is run over the full 50-row tenant chain ordered by `(created_at, id)`
- **THEN** the result is `{ ok: true }`

#### Scenario: AC-CHAIN-6b — tampering a lineage-A row breaks the next emit on lineage B too (tenant-scoped)
- **GIVEN** the interleaved 50-row tenant chain from AC-CHAIN-6a
- **AND** a raw `UPDATE audit_log SET payload_after = '{"tampered":true}'::jsonb WHERE id = lineageARow.id`
- **WHEN** `record(eventType, envelopeForLineageB)` is called
- **THEN** the call throws `HashChainBrokenError` (the lookback is tenant-wide; any tamper in the window blocks any subsequent emit regardless of the new emit's aggregate scope)
