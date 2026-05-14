## ADDED Requirements

### Requirement: Cost snapshot persisted on every LotConsumed event

The system SHALL append exactly one `cost_snapshots` row whenever the `LOT_CONSUMED` event emitted by the consumption-events bounded context (slice #2) is received by the `CostSnapshotSubscriber`. The subscriber SHALL call the `InventoryCostResolver` port (slice #4 implementation) to compute the `CostResolution`, build a `cost_snapshot` row from the resolution + the originating `stock_move_id`, and persist it via `CostSnapshotRepository.append()`. The subscriber SHALL emit a `COST_SNAPSHOT_RECORDED` event on the in-process bus after the INSERT commits.

#### Scenario: LotConsumed produces exactly one cost_snapshots row
- **WHEN** the consumption-events bounded context emits a `LOT_CONSUMED` event for a `stock_moves` row with `qty=2.5kg` of ingredient X across 2 lots
- **THEN** `cost_snapshots` gains exactly one row whose `stock_move_id` references the originating stock_move, whose `qty_consumed=2.5`, and whose `breakdown` JSONB contains 2 entries (one per contributing lot)

#### Scenario: Subscriber waits for resolver before persisting
- **WHEN** the resolver port returns a `CostResolution`
- **THEN** the subscriber INSERTs the snapshot only after the resolver returns successfully; if the resolver throws, no snapshot is written and the subscriber re-throws so the upstream bus dispatcher logs the failure

#### Scenario: COST_SNAPSHOT_RECORDED emitted after INSERT commits
- **WHEN** `CostSnapshotRepository.append()` commits successfully
- **THEN** the subscriber emits `COST_SNAPSHOT_RECORDED` on the bus with the persisted row as `payload_after`; a test-only listener observes the emission

### Requirement: cost_snapshots row schema is Zod-validated at the boundary

The system SHALL validate every `cost_snapshots` row against `CostSnapshotReadModel` Zod schema before INSERT. The schema SHALL require all 11 columns (snapshot_id, organization_id, stock_move_id, lot_id, product_id, strategy, qty_consumed, total_cost, breakdown, correlation_id, created_at) per design.md ADR-SNAPSHOT-SCHEMA. The `breakdown` field SHALL be validated as `CostBreakdownEntrySchema.array().min(1)` (at least one contributing lot). The `strategy` field SHALL be validated against the enum `['fifo','fefo','manual']`.

#### Scenario: Missing required column rejected at boundary
- **WHEN** `CostSnapshotRepository.append()` is called with input missing `strategy`
- **THEN** Zod throws a validation error; no INSERT occurs

#### Scenario: Invalid strategy enum rejected
- **WHEN** input arrives with `strategy='lifo'`
- **THEN** Zod rejects with a constraint message naming the allowed enum values

#### Scenario: Empty breakdown array rejected
- **WHEN** input arrives with `breakdown=[]`
- **THEN** Zod rejects per the `.min(1)` constraint; the snapshot would have no contributing lot, which violates the invariant that consumption always draws from at least one lot

#### Scenario: total_cost is Euros (implicit)
- **WHEN** `total_cost` is computed
- **THEN** the value SHALL be in Euros; multi-currency is out of scope for this slice per design.md Open Questions

### Requirement: cost_snapshots is append-only at the repository layer

The system SHALL expose `CostSnapshotRepository` with the methods `append(input): Promise<CostSnapshot>`, `findByStockMoveId(organizationId, stockMoveId): Promise<CostSnapshot | null>`, and `findByProductSince(organizationId, productId, since, limit, offset): Promise<CostSnapshot[]>`. The repository SHALL NOT expose `update`, `updateMany`, `delete`, or `deleteMany` methods. Any code path attempting to mutate an existing row via the repository SHALL throw `CostSnapshotImmutableError`. Corrections SHALL be appended as a new row with `strategy='manual'` referencing the same `stock_move_id`.

#### Scenario: Attempted UPDATE throws
- **WHEN** test code attempts to UPDATE an existing `cost_snapshots` row via the repository
- **THEN** the repository throws `CostSnapshotImmutableError`; the row in the database is unchanged

#### Scenario: Attempted DELETE throws
- **WHEN** test code attempts to DELETE an existing `cost_snapshots` row via the repository
- **THEN** the repository throws `CostSnapshotImmutableError`; the row in the database is unchanged

#### Scenario: Manual correction appends new row with same stock_move_id
- **WHEN** an operator submits a manual cost correction for an existing consumption event
- **THEN** a new `cost_snapshots` row is appended with `strategy='manual'` and `stock_move_id` matching the original; both rows are preserved; queries that need the latest cost basis ORDER BY `created_at DESC` LIMIT 1

### Requirement: Rollup-drift reconciliation INT test passes per NFR-TEST line 79

The system SHALL ship a rollup-drift integration test at `apps/api/src/inventory/cost/snapshot/__tests__/cost-snapshot.rollup-drift.int-spec.ts` that seeds 30 days of synthetic data (≥1,000 snapshots), queries `SUM(cost_snapshots.total_cost) GROUP BY product_id`, reconstructs the expected total from the seeded `stock_moves` + `lots` state by replaying FIFO depletion in test code, and asserts per-product `|rollup_total - reconstructed_total| / reconstructed_total < 0.005` (<0.5% drift). The test SHALL run against a real Postgres test container on every PR.

#### Scenario: 1,000 synthetic snapshots reconcile within 0.5%
- **WHEN** the rollup-drift INT test seeds 1,500 lots across 30 days and writes 1,000 outbound stock_moves with FIFO depletion
- **THEN** the SUM rollup matches the reconstructed total per product within 0.5% absolute drift; no product reports >0.5% drift; the assertion fails the test if any does

#### Scenario: Arithmetic regression caught
- **WHEN** a regression in the resolver causes a 1% systematic over-charge per consumption
- **THEN** the rollup-drift test fails on every product because cumulative drift exceeds 0.5%; CI blocks merge

### Requirement: Multi-tenant isolation at the repository layer

The system SHALL gate every `CostSnapshotRepository` public method on `organizationId` as the first parameter. No method SHALL provide a "global" find or list surface. An integration test against a real Postgres test container SHALL seed two organizations with overlapping data and assert no cross-tenant leakage across every public repository method.

#### Scenario: Cross-tenant lookup returns null
- **WHEN** `CostSnapshotRepository.findByStockMoveId(orgA, stockMoveId)` is called with a stock_move_id belonging to orgB
- **THEN** the method returns `null` (not the orgB snapshot)

#### Scenario: findByProductSince scoped per organization
- **WHEN** `CostSnapshotRepository.findByProductSince(orgA, productId, since, 100, 0)` is called and orgB has snapshots for the same productId
- **THEN** the result contains zero rows from orgB

#### Scenario: Cross-tenant fixture leakage INT test passes
- **WHEN** the leakage INT test seeds orgA and orgB with overlapping data and iterates every public method on `CostSnapshotRepository`
- **THEN** no method returns rows belonging to the non-queried organization

### Requirement: correlation_id propagated from LotConsumed envelope or generated defensively

The system SHALL store a `correlation_id uuid NOT NULL` on every `cost_snapshots` row. When the originating `LOT_CONSUMED` event payload includes a `correlation_id`, the subscriber SHALL propagate it unchanged. When the payload does not include one (defensive case), the subscriber SHALL generate a fresh `crypto.randomUUID()`. The `correlation_id` SHALL match the OpenTelemetry trace context if the consumption was executed within an active OTel span (per ADR-030 NFR-OBS-2).

#### Scenario: correlation_id propagated from LotConsumed
- **WHEN** the `LOT_CONSUMED` event payload includes `correlation_id='abc-123'`
- **THEN** the persisted `cost_snapshots` row has `correlation_id='abc-123'`

#### Scenario: correlation_id generated when missing
- **WHEN** the `LOT_CONSUMED` event payload has no `correlation_id` field
- **THEN** the persisted row has a fresh UUID; the value is logged at info level for traceability debugging

#### Scenario: correlation_id matches active OTel trace
- **WHEN** the consumption flow is executed within an OpenTelemetry trace span
- **THEN** the `correlation_id` matches the active trace's trace_id (or a deterministic derivative); slice #20 dashboard can JOIN snapshots to OTel spans by `correlation_id`

### Requirement: breakdown JSONB sum-of-subtotals matches total_cost within rounding

The system SHALL enforce, at the application layer prior to INSERT, that `SUM(breakdown[i].subtotal) ≈ total_cost` within ±€0.01 tolerance. The check SHALL run inside `CostSnapshotService.snapshotConsumption()` before calling `repository.append()`. A violation SHALL throw `CostSnapshotBreakdownInvariantError` and prevent the INSERT.

#### Scenario: Sum matches total within €0.01
- **WHEN** `breakdown=[{subtotal: 4.50}, {subtotal: 2.30}]` and `total_cost=6.80`
- **THEN** the invariant check passes; the row is persisted

#### Scenario: Sum mismatches total above tolerance
- **WHEN** `breakdown=[{subtotal: 4.50}, {subtotal: 2.30}]` and `total_cost=7.00`
- **THEN** `CostSnapshotBreakdownInvariantError` is thrown with the delta (€0.20); no INSERT occurs

#### Scenario: Rounding within tolerance accepted
- **WHEN** `breakdown` floating arithmetic yields `total_cost - SUM(subtotal) = 0.0001`
- **THEN** the invariant check passes (within the 0.01 tolerance); the row is persisted

### Requirement: Idempotency by stock_move_id for non-manual strategies

The system SHALL refuse to write a second `cost_snapshots` row with `strategy IN ('fifo','fefo')` for an already-snapshotted `stock_move_id`. The subscriber SHALL look up the existing snapshot via `findByStockMoveId(organizationId, stockMoveId)` before appending; if a non-manual snapshot already exists, the subscriber SHALL skip the INSERT and log at warn level (the `LOT_CONSUMED` event was double-emitted). Manual corrections (`strategy='manual'`) ARE permitted as additional rows for the same `stock_move_id`.

#### Scenario: Duplicate LotConsumed event produces only one snapshot
- **WHEN** `LOT_CONSUMED` is emitted twice for the same `stock_move_id` (bus replay or upstream bug)
- **THEN** `cost_snapshots` contains exactly one row with `strategy='fifo'` (or `'fefo'`); the second emission is logged at warn and skipped

#### Scenario: Manual correction permitted after auto snapshot
- **WHEN** an operator submits a manual cost correction for a stock_move that already has an auto-generated FIFO snapshot
- **THEN** a second row with `strategy='manual'` is appended for the same `stock_move_id`; both rows coexist; latest-cost-basis queries ORDER BY `created_at DESC` LIMIT 1 return the manual row

### Requirement: Index plan verified by EXPLAIN ANALYZE in INT

The system SHALL create exactly two indexes on `cost_snapshots` per design.md ADR-SNAPSHOT-INDEX: `idx_cost_snapshots_org_move_created` on `(organization_id, stock_move_id, created_at DESC)` and `idx_cost_snapshots_org_product_created` partial on `(organization_id, product_id, created_at DESC) WHERE total_cost > 0`. An INT test SHALL run `EXPLAIN ANALYZE` against the two canonical query patterns and assert each uses the expected index (no sequential scan).

#### Scenario: Both indexes exist after migration runs
- **WHEN** migration 0039 runs against an empty database
- **THEN** `pg_indexes` shows both indexes on the `cost_snapshots` table with the documented column lists and partial WHERE clause

#### Scenario: findByStockMoveId uses the move index
- **WHEN** EXPLAIN ANALYZE runs on `SELECT * FROM cost_snapshots WHERE organization_id=? AND stock_move_id=? ORDER BY created_at DESC LIMIT 1`
- **THEN** the query plan uses `idx_cost_snapshots_org_move_created` with no sequential scan; p95 latency at 1M rows/org < 5ms

#### Scenario: Product rollup uses the product index
- **WHEN** EXPLAIN ANALYZE runs on `SELECT product_id, SUM(total_cost) FROM cost_snapshots WHERE organization_id=? AND product_id=? AND created_at > now() - interval '30 days' AND total_cost > 0 GROUP BY product_id`
- **THEN** the query plan uses `idx_cost_snapshots_org_product_created` with no sequential scan; p95 latency at 1M rows/org < 30ms

### Requirement: Event type registered in contracts; no AuditLogSubscriber wiring

The system SHALL export `CostSnapshotRecordedEvent` (typed `AuditEventEnvelope` with `aggregateType='cost_snapshot'`, `eventType='COST_SNAPSHOT_RECORDED'`, `capability_used='inventory.cost-resolve'`) from `packages/contracts/src/m3/cost-snapshot.ts`. This slice SHALL NOT update `AuditLogSubscriber.KNOWN_EVENTS` — that registration is claimed by slice #21 `m3-audit-log-hash-chain-hardening`. A smoke INT test SHALL assert that calling `snapshotConsumption()` produces NO `audit_log` row.

#### Scenario: Event type importable from contracts
- **WHEN** a downstream slice imports `import { CostSnapshotRecordedEvent } from '@opentrattos/contracts/m3/cost-snapshot'`
- **THEN** the import resolves; the schema validates an envelope with the documented field set

#### Scenario: No audit_log row written by this slice
- **WHEN** the INT test runs the full pipeline (LotConsumed → resolver → snapshot → bus emit)
- **THEN** the `audit_log` table has zero new rows attributable to this slice; the smoke test runs `SELECT COUNT(*) FROM audit_log WHERE aggregate_type='cost_snapshot'` and asserts 0
