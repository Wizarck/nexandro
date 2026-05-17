## ADDED Requirements

### Requirement: ConsumptionService emits a typed LotConsumed event on every outbound lot consumption

The system SHALL provide a `ConsumptionService.recordConsumption(organizationId, actorUserId, input)` method that, on successful execution, persists exactly one `stock_moves` row with `move_type='outbound'` AND emits exactly one `LotConsumedEvent` on the in-process event bus. The event SHALL conform to the `LotConsumedEvent` envelope shape exported from `packages/contracts/src/m3/consumption.ts`. The service SHALL be the sole canonical seam for emitting `LOT_CONSUMED` events; no other code path SHALL emit this event type.

#### Scenario: Successful consumption emits one event and persists one stock_moves row
- **WHEN** a caller invokes `recordConsumption(orgA, userA, { lotId, qtyConsumed: 30, recipeId, idempotencyKey })` against a lot with `quantity_remaining=100`
- **THEN** the database has exactly one new `stock_moves` row with `move_type='outbound'`, `quantity=-30`, `lot_id=lotId`, `organization_id=orgA`; AND the event bus receives exactly one `LotConsumedEvent` whose payload `qty_consumed=30` (positive), `lot_id=lotId`, `organization_id=orgA`

#### Scenario: Service is the sole emitter of LOT_CONSUMED
- **WHEN** a developer attempts to emit a `LotConsumedEvent` from outside `ConsumptionService` (e.g. directly from a controller or another BC's service)
- **THEN** code review and a custom ESLint rule SHALL flag the emission; only `ConsumptionService` is permitted to construct and emit `LotConsumedEvent`

### Requirement: LotConsumed event payload is Zod-validated at the boundary

The system SHALL define `LotConsumedPayloadSchema` (Zod) in `packages/contracts/src/m3/consumption.ts` with these fields: `organization_id (uuid, required)`, `lot_id (uuid, required)`, `stock_move_id (uuid, required)`, `qty_consumed (positive number, required)`, `unit (enum kg|g|L|ml|un, required)`, `recipe_id (uuid, nullable)`, `menu_item_id (uuid, nullable)`, `consumed_at (datetime, required)`, `consumed_by_user_id (uuid, required)`, `nexandro_tag (string, nullable)`, `reason (string, nullable)`. The service SHALL invoke `LotConsumedPayloadSchema.parse(payload)` BEFORE emitting on the bus. Malformed payloads SHALL throw `ZodError`, which the controller layer SHALL surface as HTTP 400.

#### Scenario: Missing top-level organization_id rejects at boundary
- **WHEN** a payload omits `organization_id` and `LotConsumedPayloadSchema.parse()` runs
- **THEN** a `ZodError` is thrown listing `organization_id` as the missing field; the event is NOT emitted on the bus

#### Scenario: qty_consumed must be strictly positive
- **WHEN** a payload sets `qty_consumed = 0` or `qty_consumed = -5`
- **THEN** Zod validation fails with a "positive number" error message; the event is NOT emitted

#### Scenario: unit must be in the canonical enum set
- **WHEN** a payload sets `unit = 'dozen'` or any value not in `{kg, g, L, ml, un}`
- **THEN** Zod validation fails; the event is NOT emitted

#### Scenario: Optional fields accept null but reject malformed types
- **WHEN** a payload sets `recipe_id = null` or `nexandro_tag = null`
- **THEN** validation passes; AND **WHEN** the same fields are set to a non-uuid string or a number, validation fails

### Requirement: Every event payload carries organization_id at the top level for multi-tenant isolation

The system SHALL include `organization_id` as a top-level field on every `LotConsumedPayload`, duplicated from the `LotConsumedEvent` envelope. Downstream consumers (cost-rollup, recall, AI-obs dashboard, audit-log exports per FR21-FR25) SHALL filter by the payload-level `organization_id`, not the envelope wrapper. This convention SHALL match the `audit_log` partial index predicate `WHERE aggregate_type='lot' AND event_type='LOT_CONSUMED'` keyed on `(organization_id, payload_after->>'lot_id')`.

#### Scenario: Cross-tenant payload consumption is blocked at the query layer
- **WHEN** a consumer queries `audit_log` for `LotConsumed` events filtered by `payload_after->>'organization_id' = orgA`
- **THEN** no rows belonging to orgB are returned, even though both orgs share the same audit_log table

#### Scenario: Payload organization_id matches envelope organization_id
- **WHEN** `recordConsumption(orgA, ...)` runs successfully
- **THEN** both the envelope's `organization_id` field AND `payload_after.organization_id` equal `orgA`; an INT test asserts equality on every emitted event

### Requirement: Forward-trace query findConsumptionsByLot returns consumption events ordered DESC

The system SHALL expose `ConsumptionService.findConsumptionsByLot(organizationId, lotId, limit, offset): Promise<LotConsumedReadModel[]>` that returns all `LotConsumed` events for the given lot, ordered by `created_at DESC` (most recent first). The query SHALL use the `idx_stock_moves_org_lot_outbound` partial index on `stock_moves(organization_id, lot_id, created_at DESC) WHERE move_type='outbound'`. The query SHALL p95 < 50ms at 100k stock_moves rows per organization per the NFR-PERF-1 sub-budget.

#### Scenario: Forward-trace returns all consumption events DESC
- **WHEN** 5 consumption events are recorded against `lotId` over the past 7 days, then `findConsumptionsByLot(orgA, lotId, 10, 0)` is called
- **THEN** the result has length 5, ordered by `created_at` descending (most recent first)

#### Scenario: Limit + offset paginate correctly
- **WHEN** 5 consumption events exist and `findConsumptionsByLot(orgA, lotId, 2, 2)` is called
- **THEN** the result has length 2 containing the 3rd and 4th most-recent events (zero-indexed offset)

#### Scenario: Cross-tenant query returns empty
- **WHEN** `findConsumptionsByLot(orgA, lotIdBelongingToOrgB, 10, 0)` is called
- **THEN** the result is an empty array (no exception — same "not-found at this org" semantics as `LotRepository.findById`)

#### Scenario: EXPLAIN ANALYZE confirms index usage
- **WHEN** the INT test seeds 100k stock_moves rows and runs `EXPLAIN ANALYZE` on the forward-trace query
- **THEN** the plan shows `Index Scan using idx_stock_moves_org_lot_outbound` (NOT `Seq Scan`); execution time p95 < 50ms across 100 runs

### Requirement: Idempotency key prevents duplicate stock_moves rows on retry

The system SHALL accept an `idempotencyKey` (uuid) on every `RecordConsumptionInput`. When `recordConsumption()` is called twice with the same `idempotencyKey` for the same organization, the second call SHALL NOT produce a duplicate `stock_moves` row and SHALL NOT emit a second `LotConsumedEvent`. The second call SHALL return the same `LotConsumedEvent` envelope returned by the first call. Idempotency keys SHALL be scoped per organization (orgA's key X and orgB's key X are independent).

#### Scenario: Same idempotency key replayed returns original event
- **WHEN** `recordConsumption(orgA, userA, { lotId, qty: 30, idempotencyKey: K })` succeeds and returns event E1, then the same call is invoked again with key K
- **THEN** only one `stock_moves` row exists; the second invocation returns event E1 (same envelope); the bus emits the event exactly once

#### Scenario: Different idempotency keys produce distinct events
- **WHEN** two calls with keys K1 and K2 against the same lot run in sequence
- **THEN** two `stock_moves` rows exist; two distinct events on the bus

### Requirement: Order stability — events ordered by stock-move created_at

The system SHALL order `LotConsumedEvent` consumers (forward-trace queries, recall traversals) by `stock_moves.created_at` (the server-side persistence timestamp). The system SHALL NOT use the `consumed_at` payload field for ordering (it MAY differ from the persistence timestamp under retry scenarios or future async-emission paths).

#### Scenario: Events ordered by persistence time, not payload time
- **WHEN** 3 events are persisted in close succession where `payload.consumed_at` values are interleaved (event #2's `consumed_at` precedes event #1's due to clock skew or backdated correction)
- **THEN** forward-trace returns them in `stock_moves.created_at` order (the actual persistence order), not `consumed_at` order

### Requirement: Append-only enforcement — events are facts, never edited

The system SHALL NOT expose any UPDATE or DELETE surface on persisted `stock_moves` rows produced by `ConsumptionService`. Corrections SHALL be a new `stock_moves` row with `move_type='adjustment'` and a `reason` explaining the correction. The `audit_log` envelopes for `LotConsumed` (once slice #21 wires them) SHALL inherit the same immutability via the existing audit-log hash-chain (ADR-032).

#### Scenario: Direct UPDATE attempt fails
- **WHEN** code path attempts to UPDATE an existing `stock_moves` row through the application repository
- **THEN** the repository throws `StockMoveImmutableError` (inherited from slice #1)

#### Scenario: Correction via adjustment row
- **WHEN** an operator needs to correct a previously-recorded consumption (e.g., over-consumption by 5g)
- **THEN** the system records a new `stock_moves` row with `move_type='adjustment'`, `quantity=+5` (positive to credit back), `reason='correction: over-consumption'`; the original outbound row is untouched

### Requirement: At most one of recipe_id and menu_item_id populated per event

The system SHALL enforce — at the `ConsumptionService.recordConsumption()` boundary — that at most one of `recipe_id` and `menu_item_id` is populated per `RecordConsumptionInput`. Both populated SHALL throw `InvalidConsumptionInputError`. Both null SHALL be accepted (manual depletion case) provided `reason` is populated with a non-empty explanation.

#### Scenario: Both recipe_id and menu_item_id rejected
- **WHEN** `recordConsumption(..., { recipeId: r1, menuItemId: m1, ... })` is called
- **THEN** the service throws `InvalidConsumptionInputError`; no `stock_moves` row; no bus emission

#### Scenario: Manual depletion (both null) requires a reason
- **WHEN** `recordConsumption(..., { recipeId: null, menuItemId: null, reason: 'dropped pan' })` is called
- **THEN** the service accepts the input and persists the event; AND **WHEN** the same call is made with `reason: null` or `reason: ''`, the service throws `InvalidConsumptionInputError`

### Requirement: Subscriber registration is NOT in this slice (deferred to slice #21)

The system SHALL emit `LotConsumedEvent` on the in-process event bus but SHALL NOT register `LOT_CONSUMED` in the `AuditLogSubscriber.persistEnvelope()` `KNOWN_EVENTS` set. As a consequence, calls to `ConsumptionService.recordConsumption()` in this slice SHALL NOT produce any `audit_log` row. A smoke INT test SHALL assert this absence to catch accidental coupling. Slice #21 (`m3-audit-log-hash-chain-hardening`) wires the subscriber and flips the assertion.

#### Scenario: No audit_log row produced in this slice
- **WHEN** `recordConsumption()` is called in the INT suite
- **THEN** the count of `audit_log` rows with `event_type='LOT_CONSUMED'` remains 0; a test-only bus listener confirms the event WAS dispatched on the bus

#### Scenario: Bus emission verified without audit-log coupling
- **WHEN** the INT test attaches a one-shot listener for `LOT_CONSUMED` on `EventEmitter2` and calls `recordConsumption()`
- **THEN** the listener receives exactly one event matching the envelope shape; `audit_log` row count remains unchanged

### Requirement: Migration 0037 creates two traversal indexes per ADR-031

The system SHALL create two partial indexes within migration `0037_add_lot_compound_and_traversal_indexes`:

1. `idx_stock_moves_org_lot_outbound` on `stock_moves(organization_id, lot_id, created_at DESC) WHERE move_type='outbound'` — for forward-trace queries (consumption side).
2. `idx_audit_log_org_lot_consumption` on `audit_log(organization_id, (payload_after->>'lot_id'), created_at DESC) WHERE aggregate_type='lot' AND event_type='LOT_CONSUMED'` — for forward-trace queries (audit-log side); created pre-emptively for slice #21.

The migration SHALL be reversible. The down migration SHALL drop both indexes; the underlying tables SHALL NOT be altered.

#### Scenario: Indexes exist after migration runs
- **WHEN** migration 0037 runs against a post-slice-#1 database
- **THEN** `pg_indexes` shows both indexes with the documented column lists and WHERE predicates

#### Scenario: Down migration is clean
- **WHEN** the down migration is run after the up migration
- **THEN** both indexes are dropped; slice #1's `idx_stock_moves_org_lot_created` is unaffected; tables `stock_moves` and `audit_log` are unchanged

#### Scenario: Forward-trace query plan uses the new partial index
- **WHEN** the INT test runs `EXPLAIN ANALYZE` on `SELECT * FROM stock_moves WHERE organization_id=? AND lot_id=? AND move_type='outbound' ORDER BY created_at DESC LIMIT 50`
- **THEN** the plan uses `idx_stock_moves_org_lot_outbound` (no Seq Scan); p95 < 50ms at 100k rows per organization
