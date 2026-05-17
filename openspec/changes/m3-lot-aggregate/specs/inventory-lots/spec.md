## ADDED Requirements

### Requirement: Canonical Lot entity anchors batch-level traceability across M3 BCs

The system SHALL provide a canonical `lots` table that represents a discrete batch of stock received at one location at one time from one supplier. The table SHALL store the supplier identity, received timestamp, expiry timestamp, received and remaining quantities, unit of measure, and an open-shape metadata jsonb for supplier-specific fields. The table SHALL serve as the foreign-key target for procurement, HACCP, recall, and cost-resolver bounded contexts.

#### Scenario: Lot row stores all required fields on creation
- **WHEN** a Lot is created via `LotFactory.create()` with valid input
- **THEN** the persisted row contains non-null `id`, `organization_id`, `location_id`, `received_at`, `quantity_received`, `quantity_remaining`, `unit`, `created_at`, `updated_at`; `supplier_id` is non-null (app-side validator enforced); `expires_at` and `metadata` MAY be null

#### Scenario: Unit enum is enforced at the database level
- **WHEN** any caller (NestJS service or direct SQL fixture) attempts to insert a Lot row with `unit='dozen'` (not in the allowed set)
- **THEN** the database raises a CHECK-constraint violation and the row is not inserted

#### Scenario: quantity_remaining starts equal to quantity_received
- **WHEN** a fresh Lot is created with `quantity_received=18.0`
- **THEN** `quantity_remaining` is also `18.0` (decremented only by future `stock_moves` outbound rows, claimed by slice #2)

### Requirement: StockMove rows track signed quantity flows against a Lot

The system SHALL provide a canonical `stock_moves` table that records every quantity change against a Lot. Each row SHALL specify a move type (`inbound`, `outbound`, `adjustment`, `waste`), a signed quantity (positive for inbound; negative for outbound and waste; positive or negative for adjustment), the actor user who initiated the move, and an optional reason. StockMoves SHALL be append-only.

#### Scenario: Outbound move quantity is signed negative
- **WHEN** slice #2 (consumption events) creates a StockMove with `move_type='outbound'`
- **THEN** the persisted `quantity` is negative; the application SHALL refuse to persist an `outbound` move with positive quantity

#### Scenario: StockMove FK to Lot enforces referential integrity
- **WHEN** a caller attempts to create a StockMove referencing a non-existent `lot_id`
- **THEN** the database raises a foreign-key violation and the row is not inserted

#### Scenario: StockMove is append-only at the application layer
- **WHEN** any code path attempts to UPDATE or DELETE an existing `stock_moves` row via the repository
- **THEN** the repository SHALL throw `StockMoveImmutableError`; corrections happen via a new `adjustment` row

### Requirement: LotRepository gates every query on organizationId for multi-tenant isolation

The system SHALL expose a `LotRepository` whose every public method takes `organizationId` as its first parameter and includes it in every database query. No method SHALL provide a "global" find or list surface. The same rule applies to `StockMoveRepository`.

#### Scenario: Cross-tenant lookup returns null
- **WHEN** `LotRepository.findById(orgA, lotId)` is called with a `lotId` that belongs to orgB
- **THEN** the method returns `null` (not the orgB Lot)

#### Scenario: Repository method signature requires organizationId first
- **WHEN** a developer attempts to call `LotRepository.findById(lotId)` without `organizationId` (TypeScript compile-time check)
- **THEN** the build SHALL fail with a type error; the repository SHALL NOT expose any overload missing the organizationId parameter

#### Scenario: Cross-tenant fixture leakage test passes
- **WHEN** the INT test suite seeds two organizations with overlapping data and runs every public repository method
- **THEN** no method returns rows belonging to the non-queried organization; assertion runs against ALL repository methods (not a hand-picked subset)

### Requirement: LotRepository provides read-only FIFO/FEFO query for downstream cost resolver

The system SHALL expose `LotRepository.findAvailableFifo(organizationId, locationId, ingredientId, asOf)` that returns Lot rows with `quantity_remaining > 0` for the given organization + location, ordered by `received_at` ascending (oldest first — FIFO) with `expires_at` ascending as tiebreaker (earliest-expiring first — FEFO). The method SHALL use the `idx_lots_org_loc_available_fifo` partial index for sub-10ms response time at 100k lots/org.

#### Scenario: FIFO ordering returns oldest first
- **WHEN** three Lots exist for the same ingredient with `received_at` 2026-05-01, 2026-05-02, 2026-05-03
- **THEN** `findAvailableFifo` returns them in order [2026-05-01, 2026-05-02, 2026-05-03]

#### Scenario: FEFO tiebreaker prefers earliest expiry
- **WHEN** two Lots received same day have `expires_at` 2026-06-01 and 2026-06-15
- **THEN** `findAvailableFifo` returns the 2026-06-01 lot first

#### Scenario: Exhausted lots are excluded
- **WHEN** a Lot has `quantity_remaining=0`
- **THEN** `findAvailableFifo` does NOT include it in the result set

#### Scenario: asOf parameter respects historical queries
- **WHEN** `findAvailableFifo` is called with `asOf='2026-04-15'` and a Lot was received on `2026-05-01`
- **THEN** that Lot is NOT in the result (it didn't exist at the asOf timestamp)

### Requirement: Three indexes per ADR-031 land with the table

The system SHALL create three indexes on the `lots` table within migration 0026:
1. `idx_lots_org_supplier_received` on `(organization_id, supplier_id, received_at DESC)` for supplier-anchored recall queries.
2. `idx_lots_org_expires_active` on `(organization_id, expires_at) WHERE expires_at IS NOT NULL` for expiry-proximity scans.
3. `idx_lots_org_loc_available_fifo` on `(organization_id, location_id, quantity_remaining) WHERE quantity_remaining > 0` for FIFO/FEFO lookups.

#### Scenario: Indexes exist after migration runs
- **WHEN** migration 0026 runs against an empty database
- **THEN** `pg_indexes` shows all three indexes on the `lots` table with the documented column lists and WHERE clauses

#### Scenario: Recall query uses the supplier-received index
- **WHEN** an EXPLAIN ANALYZE runs on `SELECT * FROM lots WHERE organization_id=? AND supplier_id=? AND received_at > now() - interval '7 days' ORDER BY received_at DESC`
- **THEN** the query plan uses `idx_lots_org_supplier_received` (no sequential scan); p95 latency at 100k rows/org < 50ms per NFR-PERF-1 sub-budget

### Requirement: Event types registered for downstream slice consumption

The system SHALL declare two new event types in the `AuditEventEnvelope` union: `LOT_CREATED` (payload: full Lot read model) and `STOCK_MOVE_CREATED` (payload: full StockMove read model). The types SHALL be exported from `packages/contracts/src/m3/lots.ts` for use by downstream slices. This slice SHALL NOT register the events with the M2 `AuditLogSubscriber` — that registration is claimed by slice #21 (`m3-audit-log-hash-chain-hardening`).

#### Scenario: Event types are exported from contracts package
- **WHEN** a downstream slice imports `import { LotCreatedEvent, StockMoveCreatedEvent } from '@nexandro/contracts/m3/lots'`
- **THEN** the import resolves; the types include `eventType`, `aggregateType`, `aggregateId`, and the typed payload

#### Scenario: Subscriber registration is NOT in this slice
- **WHEN** a Lot is created via `LotFactory.create()` in this slice
- **THEN** no `audit_log` row is written (intentionally — slice #21 wires this); a smoke test asserts the absence of the row for the slice's INT suite

### Requirement: Legacy M2 ingredient.lot_code string column compatibility preserved

The system SHALL preserve the existing M2 `ingredient.lot_code text NULLABLE` column unchanged. Lookups against the legacy string column SHALL continue to work via `LotRepository.findByLotCode(organizationId, lotCode)`, which performs an app-side JOIN against `lots.metadata->>'supplier_lot_code'` when available. The legacy column SHALL NOT be dropped, renamed, or backfilled in this slice.

#### Scenario: findByLotCode resolves legacy strings via metadata lookup
- **WHEN** an M2 caller invokes `LotRepository.findByLotCode(orgId, 'L-2026-0042')` and a Lot exists with `metadata->>'supplier_lot_code' = 'L-2026-0042'`
- **THEN** the method returns the Lot row

#### Scenario: M2 ingredient table is untouched
- **WHEN** migrations 0026 and 0027 run against a fresh M2-state database
- **THEN** `ingredient.lot_code` column still exists with the same type, nullability, and any existing data

### Requirement: Multi-tenant invariant verified by INT test against real Postgres

The system SHALL provide an integration test that runs against a real Postgres test container (per `m2-data-model` convention), seeds two organizations with overlapping lot data, and asserts that every public repository method gates on `organizationId`. The test SHALL run on every PR via the project CI pipeline.

#### Scenario: Test fails when a new public method skips organizationId
- **WHEN** a developer adds a new public method to `LotRepository` without including `organizationId` in the WHERE clause
- **THEN** the leakage test runs that method against the cross-tenant fixture and fails; CI blocks merge
