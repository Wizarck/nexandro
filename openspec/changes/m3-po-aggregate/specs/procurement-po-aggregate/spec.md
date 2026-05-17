## ADDED Requirements

### Requirement: PurchaseOrder is created with a valid supplier and at least one line

The system SHALL provide a `PoFactory.create()` seam that constructs a `PurchaseOrder` aggregate. Creation SHALL require a non-null `supplier_id` (resolved against the `suppliers` table), a non-empty array of lines, and a valid ISO 4217 `currency` code. Newly created POs SHALL be persisted in state `draft`.

#### Scenario: Happy path — PO with two lines persists
- **WHEN** `PoFactory.create({ organizationId, supplierId, currency: 'EUR', lines: [{ ingredientId, quantityOrdered: 5, unit: 'kg', unitPrice: 8.5, vatRate: 0.21, vatInclusive: false }, ...] })` is called with two valid lines
- **THEN** the persisted PO row has `state='draft'`, `currency='EUR'`, `subtotal`, `vat_total`, `total` computed from the line sums; two `purchase_order_lines` rows exist with `line_number=1` and `line_number=2`

#### Scenario: Empty lines array rejected
- **WHEN** `PoFactory.create(...)` is called with `lines: []`
- **THEN** the factory throws `PoMustHaveAtLeastOneLineError` and no row is persisted

#### Scenario: Unknown supplier_id rejected
- **WHEN** `PoFactory.create(...)` is called with a `supplierId` that does not exist for the organization
- **THEN** the factory throws `SupplierNotFoundError`; no PO row persisted

#### Scenario: Invalid currency code rejected
- **WHEN** `PoFactory.create(...)` is called with `currency: 'EU'` (length 2) or `currency: 'EURO'` (length 4)
- **THEN** the factory throws `InvalidCurrencyCodeError` and no row is persisted; database CHECK constraint also rejects direct SQL inserts with the same shape

### Requirement: PO state machine accepts only legal transitions

The system SHALL encode the PurchaseOrder state machine as a pure function exposing `canTransition(from, to): boolean` and `assertTransition(from, to): void`. Legal transitions SHALL match the matrix declared in design.md ADR-PO-STATE-MACHINE.

#### Scenario: draft → sent is legal
- **WHEN** `assertTransition('draft', 'sent')` is called
- **THEN** no error is thrown

#### Scenario: sent → partially_received is legal
- **WHEN** `assertTransition('sent', 'partially_received')` is called
- **THEN** no error is thrown

#### Scenario: partially_received → received is legal
- **WHEN** `assertTransition('partially_received', 'received')` is called
- **THEN** no error is thrown

#### Scenario: partially_received → partially_received is legal (additional partial GR)
- **WHEN** `assertTransition('partially_received', 'partially_received')` is called
- **THEN** no error is thrown (slice #7 reuses this on every additional partial delivery)

#### Scenario: received → closed is legal
- **WHEN** `assertTransition('received', 'closed')` is called
- **THEN** no error is thrown

#### Scenario: draft → cancelled is legal
- **WHEN** `assertTransition('draft', 'cancelled')` is called
- **THEN** no error is thrown

#### Scenario: sent → cancelled is legal
- **WHEN** `assertTransition('sent', 'cancelled')` is called
- **THEN** no error is thrown

### Requirement: PO state machine rejects every illegal transition

The system SHALL reject illegal state transitions by throwing `IllegalStateTransitionError`. The error message SHALL name both the source and target states.

#### Scenario: draft → received is illegal (must pass through sent)
- **WHEN** `assertTransition('draft', 'received')` is called
- **THEN** the function throws `IllegalStateTransitionError` with message mentioning `draft` and `received`

#### Scenario: received → cancelled is illegal (cannot cancel after full receipt)
- **WHEN** `assertTransition('received', 'cancelled')` is called
- **THEN** the function throws `IllegalStateTransitionError`

#### Scenario: closed is terminal — no outgoing transitions
- **WHEN** `assertTransition('closed', X)` is called for any X in the state set (including `closed` itself)
- **THEN** the function throws `IllegalStateTransitionError`

#### Scenario: cancelled is terminal — no outgoing transitions
- **WHEN** `assertTransition('cancelled', X)` is called for any X
- **THEN** the function throws `IllegalStateTransitionError`

#### Scenario: Exhaustive transition matrix matches design.md table
- **WHEN** the unit test enumerates all 36 (from, to) pairs from the state set
- **THEN** the set of legal pairs matches design.md ADR-PO-STATE-MACHINE exactly (9 legal pairs; 27 illegal)

### Requirement: PO lines are immutable once the parent PO transitions past draft

The system SHALL refuse to UPDATE or DELETE `purchase_order_lines` rows whose parent PO is in any state other than `draft`. The repository SHALL enforce this invariant; attempts SHALL raise `PoLineImmutableAfterSendError`.

#### Scenario: Update on a sent PO line is rejected
- **GIVEN** a PO in state `sent` with line `L1`
- **WHEN** `PoLineRepository.update(L1, { unitPrice: 9.0 })` is called
- **THEN** the repository throws `PoLineImmutableAfterSendError`; the `unit_price` column is unchanged

#### Scenario: Delete on a partially_received PO line is rejected
- **GIVEN** a PO in state `partially_received` with line `L2`
- **WHEN** `PoLineRepository.delete(L2)` is called
- **THEN** the repository throws `PoLineImmutableAfterSendError`; the row still exists

#### Scenario: Edit on a draft PO line is allowed
- **GIVEN** a PO in state `draft` with line `L3`
- **WHEN** `PoLineRepository.update(L3, { quantityOrdered: 12 })` is called
- **THEN** the update succeeds; subtotal/total recomputed by the factory wrapper

### Requirement: PO numbers are per-org monotonic within a calendar year

The system SHALL allocate PO numbers via the `po_counters` table with a row-level `SELECT ... FOR UPDATE` lock. PO numbers SHALL match the format `PO-{YYYY}-{nnnn}` (4-digit zero-padded counter) and SHALL be unique within `(organization_id, po_number)`.

#### Scenario: First PO of the year gets number 0001
- **WHEN** `PoNumberService.allocate(orgA, 2026)` is called on a fresh `po_counters` table
- **THEN** the returned number is `PO-2026-0001`; `po_counters` row exists for (orgA, 2026) with `next_value = 2`

#### Scenario: Second PO same year gets 0002
- **WHEN** `PoNumberService.allocate(orgA, 2026)` is called after the first allocation
- **THEN** the returned number is `PO-2026-0002`

#### Scenario: Different orgs allocate independently
- **WHEN** `PoNumberService.allocate(orgA, 2026)` returns `PO-2026-0001`, then `PoNumberService.allocate(orgB, 2026)` is called
- **THEN** orgB's first PO is also `PO-2026-0001` (no cross-org collision; UNIQUE is per-org)

#### Scenario: Year rollover resets counter
- **WHEN** `PoNumberService.allocate(orgA, 2027)` is called after orgA already has `PO-2026-0042`
- **THEN** the returned number is `PO-2027-0001`; a new `po_counters` row exists for (orgA, 2027)

#### Scenario: Concurrent allocations within an org produce no duplicates
- **WHEN** an INT test fires 8 concurrent `PoNumberService.allocate(orgA, 2026)` calls
- **THEN** the 8 returned numbers are distinct, in the range `PO-2026-0001` to `PO-2026-0008`, and no deadlock occurs within 5 seconds

### Requirement: PurchaseOrderRepository gates every query on organizationId

The system SHALL expose a `PurchaseOrderRepository` whose every public method takes `organizationId` as its first parameter and includes it in every database query. No method SHALL provide a tenant-unaware surface.

#### Scenario: Cross-tenant findById returns null
- **WHEN** `PurchaseOrderRepository.findById(orgA, poId)` is called with a `poId` that belongs to orgB
- **THEN** the method returns `null`

#### Scenario: Cross-tenant findByNumber returns null
- **WHEN** `PurchaseOrderRepository.findByNumber(orgA, 'PO-2026-0001')` is called and a PO with that number exists in orgB
- **THEN** the method returns `null` (orgB's row is not leaked)

#### Scenario: Multi-tenant INT leakage suite passes for all public methods
- **WHEN** the leakage INT suite seeds orgA and orgB with overlapping PO data and iterates every public repository method
- **THEN** no method returns rows belonging to the non-queried organization

### Requirement: Money fields use numeric(18,4); never float

The system SHALL store every monetary value (`unit_price`, `line_subtotal`, `line_vat`, `line_total`, `subtotal`, `vat_total`, `total`) as `numeric(18,4)`. `vat_rate` SHALL be `numeric(5,4)`. The system SHALL NOT use `float`, `real`, `double precision`, or JavaScript `number` for persisted values.

#### Scenario: Migration creates money columns as numeric(18,4)
- **WHEN** migration 0030 runs against a fresh database
- **THEN** `information_schema.columns` reports `numeric_precision=18, numeric_scale=4` for every documented money column

#### Scenario: numericTransformer hoisted above class declarations
- **WHEN** the TypeORM entity files are compiled with `tsc`
- **THEN** the build succeeds with no TS2448 "block-scoped variable used before its declaration" error; the `numericTransformer` const is declared above the `@Entity()` class as proven by static-import order in the file

### Requirement: VAT computation on lines and totals is exact (per ADR-PO-VAT-MONEY-FIELDS)

The system SHALL compute `line_subtotal`, `line_vat`, and `line_total` from `quantity_ordered`, `unit_price`, `vat_rate`, and `vat_inclusive` at factory time. PO header `subtotal`, `vat_total`, `total` SHALL be the sum of the corresponding line values. Rounding SHALL be half-even (banker's rounding) at `numeric(18,4)` precision.

#### Scenario: VAT-exclusive line — basic math
- **GIVEN** `quantity_ordered = 5`, `unit_price = 8.50`, `vat_rate = 0.21`, `vat_inclusive = false`
- **WHEN** the factory computes the line
- **THEN** `line_subtotal = 42.5000`, `line_vat = 8.9250`, `line_total = 51.4250`

#### Scenario: VAT-inclusive line — reverse math
- **GIVEN** `quantity_ordered = 5`, `unit_price = 10.285` (gross), `vat_rate = 0.21`, `vat_inclusive = true`
- **WHEN** the factory computes the line
- **THEN** `line_total = 51.4250`, `line_subtotal = 42.5000` (within ±0.0001 tolerance), `line_vat = 8.9250`

#### Scenario: PO header sums match line sums
- **GIVEN** a PO with three lines whose subtotals sum to `100.0000` and VAT sums to `21.0000`
- **WHEN** the factory persists the PO
- **THEN** the PO header `subtotal = 100.0000`, `vat_total = 21.0000`, `total = 121.0000`

### Requirement: Cancellation transitions are correctly gated by state

The system SHALL allow cancellation only from `draft`, `sent`, or `partially_received`. The system SHALL reject cancellation from `received` or `closed`.

#### Scenario: Cancel from draft succeeds
- **GIVEN** a PO in state `draft`
- **WHEN** `PurchaseOrderService.cancel(poId, reason)` is called
- **THEN** the PO state becomes `cancelled`; no PO_CANCELLED audit row is written (deferred to slice #21)

#### Scenario: Cancel from received is rejected
- **GIVEN** a PO in state `received`
- **WHEN** `PurchaseOrderService.cancel(poId, reason)` is called
- **THEN** the call throws `IllegalStateTransitionError`; the PO state stays `received`

#### Scenario: Cancel from closed is rejected
- **GIVEN** a PO in state `closed`
- **WHEN** `PurchaseOrderService.cancel(poId, reason)` is called
- **THEN** the call throws `IllegalStateTransitionError`

### Requirement: Six PO event types registered in contracts, NOT emitted in this slice

The system SHALL declare six new event types in the `AuditEventEnvelope` union under `packages/contracts/src/m3/po.ts`: `PO_CREATED`, `PO_SENT`, `PO_RECEIVED_PARTIAL`, `PO_RECEIVED_FULL`, `PO_CANCELLED`, `PO_CLOSED`. This slice SHALL NOT register these events with the M2 `AuditLogSubscriber` — that registration is claimed by slice #21.

#### Scenario: Event types are exported from contracts package
- **WHEN** a downstream slice imports `import { PoCreatedEvent, PoSentEvent, PoCancelledEvent } from '@nexandro/contracts/m3/po'`
- **THEN** the imports resolve; each event type carries `eventType`, `aggregateType='purchase_order'`, `aggregateId`, and the typed payload defined in design.md

#### Scenario: Subscriber registration is NOT in this slice
- **WHEN** `PoFactory.create()` runs in the INT suite
- **THEN** no row is written to `audit_log` for the PO_CREATED event type (slice #21 wires this later)

#### Scenario: Zod schemas use .min(1) not .nonempty() for arrays
- **WHEN** the contracts package is linted
- **THEN** no Zod schema in `packages/contracts/src/m3/po.ts` uses `.nonempty()`; arrays-required-to-be-non-empty use `z.array(...).min(1)` per Wave 2.1 typing pattern

### Requirement: Indexes land with migration 0030 and serve the documented query patterns

The system SHALL create three indexes on `purchase_orders` within migration 0030:

1. `idx_po_org_supplier_created` on `(organization_id, supplier_id, created_at DESC)`.
2. `idx_po_org_state_expected_delivery` on `(organization_id, state, expected_delivery_date) WHERE state IN ('sent', 'partially_received')`.
3. UNIQUE `(organization_id, po_number)`.

#### Scenario: Indexes exist after migration runs
- **WHEN** migration 0030 runs against an empty database
- **THEN** `pg_indexes` shows all three indexes on `purchase_orders` with the documented column lists and WHERE clauses

#### Scenario: Ops dashboard query uses the partial index
- **WHEN** an EXPLAIN ANALYZE runs on `SELECT * FROM purchase_orders WHERE organization_id=? AND state IN ('sent','partially_received') ORDER BY expected_delivery_date`
- **THEN** the query plan uses `idx_po_org_state_expected_delivery` (no Seq Scan); p95 latency at 10k rows/org is below 50ms

#### Scenario: Buyer-history query uses the supplier index
- **WHEN** an EXPLAIN ANALYZE runs on `SELECT * FROM purchase_orders WHERE organization_id=? AND supplier_id=? ORDER BY created_at DESC LIMIT 20`
- **THEN** the query plan uses `idx_po_org_supplier_created`

#### Scenario: Duplicate per-org PO numbers rejected at the DB layer
- **WHEN** two INSERTs with the same `(organization_id, po_number)` arrive concurrently
- **THEN** the second INSERT fails with a UNIQUE-constraint violation (defense in depth beyond the counter logic)
