## ADDED Requirements

### Requirement: GoodsReceipt aggregate closes the procurement loop by materializing Lot rows on confirmation

The system SHALL provide a `GoodsReceipt` aggregate (header + lines) that, when confirmed, creates exactly one `lots` row per `goods_receipt_lines` row via the slice-#1 `LotFactory.create()` seam. The entire confirmation SHALL run in a single database transaction; partial success across lines is NOT permitted. The `GoodsReceiptAggregate` SHALL transition through states `draft → confirmed → cancelled` with the `cancelled` transition reachable only from `draft`.

#### Scenario: Confirm a GR with 3 lines creates 3 lots atomically
- **WHEN** `GrConfirmationService.confirm(grId, actor)` is invoked on a `draft` GR with 3 lines (each with a valid `product_id` and `qty_received_actual > 0`)
- **THEN** the database contains exactly 3 new `lots` rows (one per line) AND the GR row's `state='confirmed'` AND each `goods_receipt_lines.lot_id_created` is populated with the corresponding new lot UUID

#### Scenario: Failed Lot creation rolls back the whole confirmation
- **WHEN** `confirm()` is invoked on a GR with 5 lines and a SQL fault occurs creating the 3rd Lot (e.g., a CHECK constraint violation triggered by a malformed unit)
- **THEN** zero `lots` rows are inserted AND the GR row remains in `state='draft'` AND no `goods_receipt_lines.lot_id_created` is populated

#### Scenario: Cancelling a confirmed GR is rejected
- **WHEN** a caller attempts to transition a `confirmed` GR to `cancelled` via the state-machine method
- **THEN** the service raises `IllegalGrTransition` with message indicating cancellation is only valid from `draft`

#### Scenario: One Lot per line (no aggregation across same product_id)
- **WHEN** a GR has 3 lines all with `product_id = X` (same product, 3 physical crates)
- **THEN** confirmation creates 3 distinct `lots` rows (each with its own `id`, `quantity_received`, and metadata) — NOT 1 aggregated lot

### Requirement: GR confirmation transitions linked PurchaseOrder state through the slice-#6 state machine

When a confirmed GR has `po_id IS NOT NULL`, the system SHALL invoke `PoStateMachine.transitionFromGrConfirmation(poId, grLines)` (slice #6 surface) as part of the same transaction. The state machine SHALL receive the full set of confirmed GR lines (this GR + all prior confirmed GRs against the same PO) and SHALL transition the PO to `received` when every PO line has cumulative `qty_received >= qty_ordered`; otherwise SHALL transition to (or remain at) `partially_received`. When `M3_PO_AGGREGATE_ENABLED=false` (slice-#6 not yet deployed), any GR with `po_id IS NOT NULL` SHALL be rejected with a clear feature-flag error.

#### Scenario: Single full-quantity GR transitions PO to received
- **WHEN** a PO has one line with `qty_ordered=100` and a GR is confirmed with `qty_received_actual=100` against that line
- **THEN** the PO state transitions from `sent` (or `partially_received`) to `received` AND the state transition emits a `PO_STATE_CHANGED` event (slice #6 owns the emission shape)

#### Scenario: Partial GR leaves PO in partially_received
- **WHEN** a PO has one line with `qty_ordered=100` and a GR is confirmed with `qty_received_actual=40`
- **THEN** the PO state is `partially_received` (transitioned from `sent`, or unchanged if already partially_received)

#### Scenario: Feature flag disables PO-linked confirmations when slice #6 not deployed
- **WHEN** `M3_PO_AGGREGATE_ENABLED=false` and `confirm()` is invoked on a GR with `po_id IS NOT NULL`
- **THEN** the service raises an error containing the literal string `'PO aggregate not yet enabled in this deployment'` AND no Lots are created AND the GR stays in `state='draft'`

#### Scenario: Feature flag does not block independent GRs
- **WHEN** `M3_PO_AGGREGATE_ENABLED=false` and `confirm()` is invoked on a GR with `po_id IS NULL` (independent receipt)
- **THEN** the confirmation succeeds normally; the PO state machine is NOT invoked

### Requirement: Idempotency on PO-line receipt within a single GR

The `goods_receipt_lines` table SHALL enforce `UNIQUE (gr_id, po_line_id) WHERE po_line_id IS NOT NULL` at the database level. The `GrConfirmationService.confirm()` method SHALL accept an `Idempotency-Key` header per the M2 Wave 1.13 [3a] write-envelope pattern; on retry with the same key, the service SHALL return the prior result envelope without re-inserting rows.

#### Scenario: Duplicate po_line_id within the same GR is rejected at DB level
- **WHEN** a caller attempts to insert two `goods_receipt_lines` rows with the same `(gr_id, po_line_id)` where `po_line_id IS NOT NULL`
- **THEN** the database raises a UNIQUE constraint violation; the second insert is rolled back

#### Scenario: Same po_line_id allowed across different GRs (partial receipt across GRs)
- **WHEN** GR_A is confirmed with a line referencing `po_line_id=L1`, then GR_B is created with a different line also referencing `po_line_id=L1`
- **THEN** both rows persist (cross-GR partial receipt is allowed per ADR-GR-PARTIAL-RECEIPT)

#### Scenario: Retry with same Idempotency-Key returns prior result
- **WHEN** `confirm()` is called with `Idempotency-Key=K1`, then called again with the same `K1` and identical body
- **THEN** the second call returns the same response envelope as the first (same `grId`, same lot IDs) AND no additional rows are inserted

### Requirement: Cumulative receipt across multiple GRs respects over-receipt tolerance

The system SHALL track cumulative `qty_received` per PO line by summing `goods_receipt_lines.qty_received_actual` across all `goods_receipts.state='confirmed'` rows for the same `po_line_id`. New GR confirmations SHALL be rejected when the cumulative would exceed `qty_ordered * (1 + tolerance)`, where `tolerance` is read from `organizations.metadata->>'gr_over_receipt_tolerance_pct'` (default 0.05 for bulk units kg/g/L/ml, 0.00 for discrete units `un`).

#### Scenario: Two partial GRs sum to full quantity
- **WHEN** a PO line has `qty_ordered=100`; GR_A is confirmed with `qty_received_actual=60`; then GR_B is confirmed with `qty_received_actual=40`
- **THEN** both confirmations succeed (cumulative = 100 = qty_ordered) AND the PO transitions to `received` after GR_B

#### Scenario: Over-tolerance receipt is rejected with OverReceiptError
- **WHEN** a PO line has `qty_ordered=100` (unit `kg`, default tolerance 5%); GR_A confirmed with 95; GR_B attempts confirmation with `qty_received_actual=15` (would bring cumulative to 110, exceeding 105 limit)
- **THEN** `confirm()` raises `OverReceiptError` with the cumulative + limit values in the error payload; no rows are inserted; the GR stays in `state='draft'`

#### Scenario: Discrete-unit tolerance is zero
- **WHEN** a PO line has `qty_ordered=10` with unit `un`; a GR attempts `qty_received_actual=11` (cumulative 11 > 10 + 0)
- **THEN** `OverReceiptError` is raised even though 11 is only 10% over (no tolerance applies for `un`)

#### Scenario: Per-org tolerance override is respected
- **WHEN** an organization has `metadata->>'gr_over_receipt_tolerance_pct' = 0.10`; a GR attempts to push cumulative to 109% of qty_ordered for a `kg` line
- **THEN** the confirmation succeeds (109 < 110 = limit with org override applied)

### Requirement: Quantity variance event emission above configurable threshold

The system SHALL emit a `GR_LINE_QTY_VARIANCE` event on each `goods_receipt_lines` row where `|qty_received_actual - qty_ordered| / qty_ordered > threshold_qty`, with `threshold_qty` defaulting to `0.01` (1%) and overridable via `organizations.metadata->>'gr_variance_thresholds'->>'qty'`. The event payload SHALL include `gr_line_id`, `po_line_id`, `qty_ordered`, `qty_received_actual`, `delta_pct`, and `threshold_pct`. Lines with `po_line_id IS NULL` (independent GR) SHALL NOT emit variance events.

#### Scenario: 0.5% variance does not emit event at default threshold
- **WHEN** a PO line has `qty_ordered=200`; a GR line has `qty_received_actual=201` (0.5% delta < 1% threshold)
- **THEN** no `GR_LINE_QTY_VARIANCE` event is emitted for this line; `GR_CONFIRMED` is still emitted for the parent GR

#### Scenario: 2% variance emits event at default threshold
- **WHEN** a PO line has `qty_ordered=200`; a GR line has `qty_received_actual=204` (2% delta > 1% threshold)
- **THEN** a `GR_LINE_QTY_VARIANCE` event is emitted with `delta_pct=0.02` and `threshold_pct=0.01`

#### Scenario: Independent GR does not emit qty variance
- **WHEN** a GR with `po_id IS NULL` is confirmed (no PO line to compare)
- **THEN** no `GR_LINE_QTY_VARIANCE` event is emitted for any of its lines (regardless of `qty_received_actual` value)

#### Scenario: Absolute-floor protects against small-quantity noise
- **WHEN** a PO line has `qty_ordered=3` (small order, default abs floor 1.0 unit); a GR line has `qty_received_actual=3.05` (relative 1.67% > 1% threshold, but abs delta 0.05 < 1.0)
- **THEN** no variance event is emitted (abs floor suppresses)

### Requirement: Price variance event emission above configurable threshold

The system SHALL emit a `GR_LINE_PRICE_VARIANCE` event on each `goods_receipt_lines` row where `|unit_price_actual - unit_price_ordered| / unit_price_ordered > threshold_price`, with `threshold_price` defaulting to `0.01` (1%) and overridable via `organizations.metadata->>'gr_variance_thresholds'->>'price'`. The event payload SHALL include `gr_line_id`, `po_line_id`, `unit_price_ordered`, `unit_price_actual`, `delta_pct`, `threshold_pct`. Lines with `po_line_id IS NULL` SHALL NOT emit price variance events.

#### Scenario: 0.5% price variance does not emit event
- **WHEN** a PO line has `unit_price_ordered=2.0000`; a GR line has `unit_price_actual=2.0100` (0.5% delta)
- **THEN** no `GR_LINE_PRICE_VARIANCE` event is emitted

#### Scenario: 5% price variance emits event
- **WHEN** a PO line has `unit_price_ordered=2.0000`; a GR line has `unit_price_actual=2.1000` (5% delta)
- **THEN** a `GR_LINE_PRICE_VARIANCE` event is emitted with the payload populated

#### Scenario: Both qty and price variance emit two events
- **WHEN** a GR line crosses both qty and price thresholds
- **THEN** both `GR_LINE_QTY_VARIANCE` and `GR_LINE_PRICE_VARIANCE` events are emitted (two separate envelopes, not a single combined event)

### Requirement: Independent GR (no PO link) creates Lots without variance reconciliation

The system SHALL accept GoodsReceipts where `po_id IS NULL` (direct purchase / petty cash / market stall). All lines of such a GR SHALL have `po_line_id IS NULL`; mixed mode (some lines linked, some not) SHALL be rejected. Independent GRs SHALL still create Lots, still require `supplier_id`, still require `product_id` per line, and SHALL emit `GR_CONFIRMED`. They SHALL NOT emit variance events (no PO baseline).

#### Scenario: Independent GR creates Lots
- **WHEN** a GR with `po_id=NULL` and 2 lines (both `po_line_id=NULL`, both with valid `product_id` and `qty_received_actual>0`) is confirmed
- **THEN** 2 new `lots` rows are created; the GR transitions to `confirmed`; `GR_CONFIRMED` is emitted

#### Scenario: Mixed-mode GR is rejected
- **WHEN** a GR has `po_id=NULL` but one of its lines has `po_line_id IS NOT NULL`
- **THEN** `confirm()` raises `IndependentGrMissingSupplierError` (despite the name, this error covers shape inconsistency); no rows are persisted

#### Scenario: Independent GR still requires supplier_id
- **WHEN** a caller attempts to create an independent GR with `supplier_id=NULL`
- **THEN** the database rejects with NOT NULL constraint violation (supplier is always required, even for petty cash — use the org's "Local Market" generic supplier seed)

### Requirement: Multi-tenant isolation gates every GR query on organization_id

The system SHALL expose `GrRepository` and `GrConfirmationService` such that every method takes `organizationId` as its first parameter and includes it in the WHERE clause of every database query. No method SHALL provide a global find / list surface.

#### Scenario: Cross-tenant findById returns null
- **WHEN** `GrRepository.findById(orgA, grId)` is called with a `grId` that belongs to orgB
- **THEN** the method returns `null` (not the orgB GR)

#### Scenario: Cross-tenant confirm raises error
- **WHEN** `GrConfirmationService.confirm(orgA, grId, actor)` is called with a `grId` belonging to orgB
- **THEN** the service raises a not-found error (does not leak that the row exists in another tenant)

#### Scenario: INT cross-tenant fixture passes on every public method
- **WHEN** the INT test suite seeds two organizations with overlapping GR data and runs every public method on `GrRepository` + `GrConfirmationService`
- **THEN** no method returns or mutates data belonging to the non-queried organization (assertion runs against ALL public methods, not a hand-picked subset)

### Requirement: unit_price_actual uses numeric(12,4) precision

The `goods_receipt_lines.unit_price_actual` column SHALL use Postgres type `numeric(12,4)` (8 integer digits + 4 fractional). The application layer SHALL preserve full precision when reading and writing, using the slice-#1 `numericTransformer` pattern (hoisted ABOVE class declarations per Wave 2.1 TS2448 lesson). The currency SHALL be implicit per organization (single-currency MVP).

#### Scenario: Trailing fractional digits preserved on round-trip
- **WHEN** a GR line is created with `unit_price_actual=2.1234`, persisted, and read back
- **THEN** the read returns exactly `2.1234` (not `2.12` due to JS float rounding)

#### Scenario: Negative price rejected by CHECK constraint
- **WHEN** any caller attempts to insert a `goods_receipt_lines` row with `unit_price_actual=-1.0000`
- **THEN** the database raises a CHECK-constraint violation (`unit_price_actual >= 0`)

#### Scenario: numericTransformer is hoisted above class declarations
- **WHEN** TypeScript compiles `apps/api/src/procurement/gr/domain/goods-receipt-line.entity.ts`
- **THEN** no TS2448 "used before declaration" error is raised; the `numericTransformer` const is declared at module scope above the `@Entity` class (per Wave 2.1 cascade pattern)

### Requirement: Event types registered for downstream slice consumption

The system SHALL declare three new event types in the `AuditEventEnvelope` union exported from `packages/contracts/src/m3/procurement-gr.ts`:
1. `GR_CONFIRMED` with payload `{ grId, organizationId, poId | null, supplierId, receivedAt, lines: GrLineReadModel[] }`.
2. `GR_LINE_QTY_VARIANCE` with payload `{ grLineId, poLineId, qtyOrdered, qtyReceivedActual, deltaPct, thresholdPct }`.
3. `GR_LINE_PRICE_VARIANCE` with payload `{ grLineId, poLineId, unitPriceOrdered, unitPriceActual, deltaPct, thresholdPct }`.

This slice SHALL NOT register these events with `apps/api/src/audit-log/audit-log.subscriber.ts`. Subscriber registration is reserved for slice #21 (`m3-audit-log-hash-chain-hardening`), per the slice-#1 ADR-LOT-NO-EVENT-EMIT-HERE pattern.

#### Scenario: Event types exported from contracts package
- **WHEN** a downstream slice imports `import { GrConfirmedEvent, GrLineQtyVarianceEvent, GrLinePriceVarianceEvent } from '@nexandro/contracts/m3/procurement-gr'`
- **THEN** the imports resolve; each event type includes `eventType`, `aggregateType='goods_receipt'`, `aggregateId`, and a typed payload

#### Scenario: No audit_log row written by this slice
- **WHEN** `GrConfirmationService.confirm()` is invoked end-to-end in the INT suite
- **THEN** `SELECT COUNT(*) FROM audit_log WHERE aggregate_type='goods_receipt'` returns 0 (subscriber wiring is slice #21's responsibility)

#### Scenario: Zod schema validates payload shape
- **WHEN** a malformed `GR_CONFIRMED` payload is passed to the Zod schema (e.g., missing `lines` array)
- **THEN** validation fails with a clear field-path error (`.min(1)` on the lines array per Wave 2.1 Zod lesson — NOT `.nonempty()`)

### Requirement: Indexes per ADR-GR-INDEXES land with migration 0031

Migration 0031 SHALL create 3 indexes on `goods_receipts` and 2 on `goods_receipt_lines`:
1. `idx_gr_org_received` on `goods_receipts (organization_id, received_at DESC)`.
2. `idx_gr_org_po` on `goods_receipts (organization_id, po_id) WHERE po_id IS NOT NULL`.
3. `idx_gr_org_supplier_received` on `goods_receipts (organization_id, supplier_id, received_at DESC)`.
4. `uniq_gr_line_po_line` UNIQUE on `goods_receipt_lines (gr_id, po_line_id) WHERE po_line_id IS NOT NULL`.
5. `idx_gr_line_gr` on `goods_receipt_lines (gr_id)`.

#### Scenario: Indexes exist after migration runs
- **WHEN** migration 0031 runs against a database with slice-#1 + slice-#6 schemas already applied
- **THEN** `pg_indexes` shows all five indexes on the two tables with the documented column lists and WHERE clauses

#### Scenario: Ops dashboard query uses the org+received index
- **WHEN** EXPLAIN ANALYZE runs on `SELECT * FROM goods_receipts WHERE organization_id=? ORDER BY received_at DESC LIMIT 50`
- **THEN** the plan uses `idx_gr_org_received` (no sequential scan); p95 latency at 100k rows/org < 50ms

#### Scenario: PO drill-down query uses the partial po index
- **WHEN** EXPLAIN ANALYZE runs on `SELECT * FROM goods_receipts WHERE organization_id=? AND po_id=?`
- **THEN** the plan uses `idx_gr_org_po` (partial index, smaller footprint than full index)

#### Scenario: Idempotency UNIQUE constraint catches duplicate
- **WHEN** an INSERT attempts a second row with the same `(gr_id, po_line_id)` (both non-null)
- **THEN** the DB raises `23505 unique_violation` referencing `uniq_gr_line_po_line`

### Requirement: Atomic transaction wraps lot creation, GR persist, and PO state transition

The `GrConfirmationService.confirm()` method SHALL execute all of the following inside a single Postgres transaction (BEGIN…COMMIT):
1. Validate input (shape, multi-tenancy, over-receipt tolerance).
2. Read PO line data for variance + cumulative checks (if PO linked).
3. Create N `lots` rows via `LotFactory.create()` + repository save.
4. Insert N `goods_receipt_lines` rows with populated `lot_id_created`.
5. Update the `goods_receipts` header to `state='confirmed'`.
6. Call `PoStateMachine.transitionFromGrConfirmation()` (if PO linked).

#### Scenario: Failure in step 4 rolls back steps 3 and 5
- **WHEN** a SQL fault occurs while inserting `goods_receipt_lines` row 3 of 5 (e.g., FK violation on a deleted product)
- **THEN** all `lots` rows created in step 3 are rolled back; the GR header stays in `state='draft'`; the PO state is unchanged

#### Scenario: Failure in step 6 rolls back steps 3–5
- **WHEN** `PoStateMachine.transitionFromGrConfirmation()` raises (e.g., illegal state transition)
- **THEN** the entire transaction rolls back; no Lots persisted, no GR confirmed, no PO state change

#### Scenario: Latency budget for typical GR
- **WHEN** `confirm()` runs against a GR with 20 lines on Postgres with the documented indexes
- **THEN** p95 end-to-end latency is < 200ms (asserted by INT benchmark fixture)
