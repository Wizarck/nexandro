## 1. Migration 0031 — goods_receipts + goods_receipt_lines tables + 5 indexes

- [ ] 1.1 `apps/api/src/migrations/0031_create_goods_receipts_tables.ts` — create `goods_receipts` table per design.md ADR-GR-LOT-CREATION-SEAM + ADR-GR-INDEPENDENT-LOT-NO-PO:
  - Columns: `id uuid PK`, `organization_id uuid NOT NULL`, `po_id uuid NULL FK purchase_orders`, `supplier_id uuid NOT NULL FK suppliers`, `received_at timestamptz NOT NULL`, `received_at_location_id uuid NOT NULL FK locations`, `receiving_user_id uuid NOT NULL FK users`, `supplier_invoice_ref text NULL`, `state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','confirmed','cancelled'))`, `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`.
  - FK to `purchase_orders.id` declared as `ON DELETE SET NULL` (cancellation of a PO does NOT cascade-delete its GRs — historical record preserved).
- [ ] 1.2 Same migration: create `goods_receipt_lines` table:
  - Columns: `id uuid PK`, `gr_id uuid NOT NULL FK goods_receipts ON DELETE CASCADE`, `po_line_id uuid NULL FK purchase_order_lines`, `product_id uuid NOT NULL FK products`, `qty_received_actual numeric(18,4) NOT NULL CHECK (qty_received_actual >= 0)`, `unit_price_actual numeric(12,4) NOT NULL CHECK (unit_price_actual >= 0)`, `lot_id_created uuid NULL FK lots`, `expires_at_override timestamptz NULL`, `created_at`/`updated_at`.
- [ ] 1.3 Same migration: create `idx_gr_org_received` on `goods_receipts (organization_id, received_at DESC)` per design.md ADR-GR-INDEXES.
- [ ] 1.4 Same migration: create `idx_gr_org_po` on `goods_receipts (organization_id, po_id) WHERE po_id IS NOT NULL`.
- [ ] 1.5 Same migration: create `idx_gr_org_supplier_received` on `goods_receipts (organization_id, supplier_id, received_at DESC)`.
- [ ] 1.6 Same migration: create UNIQUE `uniq_gr_line_po_line` on `goods_receipt_lines (gr_id, po_line_id) WHERE po_line_id IS NOT NULL`.
- [ ] 1.7 Same migration: create `idx_gr_line_gr` on `goods_receipt_lines (gr_id)`.
- [ ] 1.8 Down migration drops `goods_receipt_lines` first, then `goods_receipts` (FK order).
- [ ] 1.9 Migration MUST be skipped at boot if `M3_ENABLED=false` (per M2 wave-1.x convention); INT smoke test verifies idempotent up-down-up.
- [ ] 1.10 At rebase time, verify migration number 0031 is still available (architecture-m3 line 511 also numbered `0031_create_ai_pricing_table`; AI-obs slice can re-number to 0032+ since it lands later). Document the claim in the PR description.

## 2. Domain layer — GoodsReceipt + GoodsReceiptLine entities

- [ ] 2.1 `apps/api/src/procurement/gr/domain/goods-receipt.entity.ts` — TypeORM entity matching migration 0031 columns; `state` typed as union `'draft'|'confirmed'|'cancelled'`.
- [ ] 2.2 `apps/api/src/procurement/gr/domain/goods-receipt-line.entity.ts` — TypeORM entity matching migration 0031 columns. **CRITICAL**: hoist `numericTransformer` const ABOVE the `@Entity` class declaration per Wave 2.1 TS2448 lesson (avoid "used before declaration" cascade).
- [ ] 2.3 `apps/api/src/procurement/gr/domain/errors.ts`:
  - `IllegalGrTransition` (state machine violation)
  - `OverReceiptError` (cumulative > qty_ordered * (1 + tolerance))
  - `PoLineAlreadyReceivedError` (DB UNIQUE caught + translated to typed error)
  - `GrLineInvariantError` (validation: qty>=0, price>=0, product_id non-null)
  - `IndependentGrMissingSupplierError` (mixed-mode shape: some lines linked, some not — covers shape inconsistency despite name)
  - `PoAggregateNotEnabledError` (M3_PO_AGGREGATE_ENABLED=false + po_id IS NOT NULL)

## 3. Repository — multi-tenant by organizationId

- [ ] 3.1 `apps/api/src/procurement/gr/application/gr.repository.ts`:
  - `findById(organizationId, grId): Promise<GoodsReceipt | null>` — gates on `organization_id`.
  - `findByPoId(organizationId, poId, limit?, offset?): Promise<GoodsReceipt[]>` — uses `idx_gr_org_po`.
  - `findBySupplierAndDateRange(organizationId, supplierId, from, to): Promise<GoodsReceipt[]>` — uses `idx_gr_org_supplier_received`.
  - `findRecent(organizationId, limit, offset?): Promise<GoodsReceipt[]>` — uses `idx_gr_org_received`.
  - **Every** method takes `organizationId` as first param; reused ESLint custom rule from slice #1 enforces.
- [ ] 3.2 `apps/api/src/procurement/gr/application/gr-line.repository.ts`:
  - `findByGr(grId): Promise<GoodsReceiptLine[]>` — uses `idx_gr_line_gr`; org check via header join.
  - `sumQtyReceivedByPoLine(organizationId, poLineId): Promise<number>` — for over-receipt accumulator (ADR-GR-PARTIAL-RECEIPT).
- [ ] 3.3 Storybook does NOT apply (no UI components in this slice — slice #8 owns UI).

## 4. Application layer — GrConfirmationService orchestrator

- [ ] 4.1 `apps/api/src/procurement/gr/application/gr-confirmation.service.ts`:
  - Public method `confirm(organizationId, grId, actor): Promise<GrConfirmationResult>`.
  - Wraps all 6 steps in a single TypeORM `dataSource.transaction()` callback (per design.md ADR-GR-LOT-CREATION-SEAM atomicity invariant).
  - Step 1 — validate: shape check, multi-tenant check, mixed-mode rejection (po_id NULL ↔ all po_line_id NULL).
  - Step 2 — read PO line data + cumulative `sumQtyReceivedByPoLine` per line; over-receipt tolerance check (reads `organizations.metadata->>'gr_over_receipt_tolerance_pct'`, default 0.05 for bulk / 0.00 for `un`).
  - Step 3 — for each line, call `LotFactory.create(input)` (slice #1 surface); persist via slice #1's `LotRepository.save()` (internal seam reserved in slice #1 design).
  - Step 4 — insert N `goods_receipt_lines` rows with `lot_id_created` populated.
  - Step 5 — UPDATE `goods_receipts` SET `state='confirmed'`.
  - Step 6 — if `po_id IS NOT NULL` and `M3_PO_AGGREGATE_ENABLED=true`, call `PoStateMachine.transitionFromGrConfirmation(poId, confirmedLines)` (slice #6 surface); else if `po_id IS NOT NULL` and flag is false, raise `PoAggregateNotEnabledError` BEFORE step 3 starts.
- [ ] 4.2 Idempotency: accept `idempotencyKey` parameter; on retry, look up prior result via the M2 Wave 1.13 [3a] idempotency-store seam; return cached envelope without re-running steps.
- [ ] 4.3 Cache the org tolerance + thresholds in a request-scoped NestJS provider (LRU is overkill at this slice's scale; request-scope is enough). Per design.md Risks.
- [ ] 4.4 Result envelope shape: `{ grId, state: 'confirmed', lots: LotReadModel[], varianceEvents: VarianceEventEnvelope[] }`.

## 5. Variance detection — pure logic

- [ ] 5.1 `apps/api/src/procurement/gr/application/variance-detector.ts`:
  - Pure function `detectVariance(poLine, grLine, thresholds): VarianceResult` returning `{ kind: 'none' | 'qty' | 'price' | 'both', qtyDeltaPct?, priceDeltaPct? }`.
  - Threshold logic per design.md ADR-GR-VARIANCE-THRESHOLDS (1% relative default; abs floor on small qty/price).
  - Independent-GR short-circuit: if `grLine.po_line_id IS NULL`, return `{ kind: 'none' }` immediately (no variance possible).
- [ ] 5.2 `apps/api/src/procurement/gr/application/variance-event-builder.ts`:
  - `buildEvents(grId, grLines, varianceResults): VarianceEventEnvelope[]` — produces 0, 1, or 2 events per offending line per ADR-GR-VARIANCE-THRESHOLDS.

## 6. Shared inline types (avoid TS2448 cascade)

- [ ] 6.1 `apps/api/src/procurement/gr/types.ts` — per Wave 2.1 lesson, inline types co-located with the BC (NOT cross-imported from contracts at the entity layer):
  - `CreateGrInput`, `GrLineInput`, `VarianceResult`, `VarianceThresholds`, `OverReceiptToleranceConfig`, `GrConfirmationResult`.
  - Use Zod `.min(1)` on array validators (NOT `.nonempty()` — per Wave 2.1 Zod lesson).

## 7. Contracts package — typed event envelopes + read DTOs

- [ ] 7.1 `packages/contracts/src/m3/procurement-gr.ts`:
  - Export `GoodsReceiptReadModel` (Zod schema + inferred TS type) — header + nested lines.
  - Export `GoodsReceiptLineReadModel`.
  - Export `GrConfirmedEvent` (typed `AuditEventEnvelope` with `aggregateType='goods_receipt'`, `eventType='GR_CONFIRMED'`).
  - Export `GrLineQtyVarianceEvent`, `GrLinePriceVarianceEvent` (aggregateType='goods_receipt_line').
  - Re-export from `packages/contracts/src/index.ts`.
- [ ] 7.2 Schema-driven type inference (Zod `.infer<typeof ...>`) — no hand-typed TS interfaces that drift from Zod schemas.

## 8. Module wiring (NestJS)

- [ ] 8.1 `apps/api/src/procurement/gr/gr.module.ts` — providers: `GoodsReceiptRepository`, `GoodsReceiptLineRepository`, `GrConfirmationService`, `VarianceDetector`, `VarianceEventBuilder`. Imports: slice-#1's `InventoryLotModule`. Conditional import of slice-#6's `PoModule` when `M3_PO_AGGREGATE_ENABLED=true`.
- [ ] 8.2 `apps/api/src/procurement/procurement.module.ts` (new wrapper) — re-exports `GrModule`. Slice #6's `PoModule` is imported here too (when its slice lands).
- [ ] 8.3 `apps/api/src/app.module.ts` — `ProcurementModule` added behind `M3_ENABLED=true` env gate (per M2 wave-1.x convention).

## 9. Unit tests

- [ ] 9.1 `goods-receipt.entity.spec.ts` — TypeORM mapping (column names, types, nullable, default values).
- [ ] 9.2 `goods-receipt-line.entity.spec.ts` — same + verify `numericTransformer` is hoisted correctly (no TS2448 at compile).
- [ ] 9.3 `variance-detector.spec.ts`:
  - Happy paths: no variance, qty only, price only, both.
  - Boundary at exactly 1.0% (uses IEEE 754 fencepost floats — `0.0099999...` should NOT trigger; `0.0100001...` should).
  - Abs floor: small qty doesn't trigger via relative delta alone.
  - Independent line (po_line_id NULL) always returns `'none'`.
  - Org override read: when org sets `qty=0.05`, a 3% delta does NOT trigger.
- [ ] 9.4 `gr-confirmation.service.spec.ts` (unit-level, mocked repo + mocked LotFactory + mocked PoStateMachine):
  - Happy path: 3-line GR confirms, 3 Lots created, GR `state='confirmed'`.
  - Atomicity: mock LotFactory to throw on line 3; assert NO Lots persisted + GR stays `draft`.
  - Feature flag: `M3_PO_AGGREGATE_ENABLED=false` + `po_id IS NOT NULL` → `PoAggregateNotEnabledError` BEFORE step 3.
  - Mixed mode: `po_id=NULL` but a line has `po_line_id=X` → `IndependentGrMissingSupplierError`.
  - Idempotency: same key + body → returns cached envelope, no second insert.
  - Over-receipt: cumulative + new line > qty_ordered × (1 + tolerance) → `OverReceiptError`.

## 10. Integration tests (against vps-postgres or Docker Postgres testcontainer)

- [ ] 10.1 `gr-confirmation.service.int-spec.ts` — uses the M2 testcontainer harness OR vps-postgres fallback per `[[reference_vps_postgres_test]]`.
- [ ] 10.2 End-to-end happy path: seed org + supplier + product + 3-line draft GR; call `confirm()`; assert 3 `lots` rows + 3 `goods_receipt_lines` with `lot_id_created` populated + GR `state='confirmed'` + `GR_CONFIRMED` event emitted (captured via test EventEmitter spy).
- [ ] 10.3 Idempotency on duplicate `(gr_id, po_line_id)`: attempt 2 inserts with same pair; assert `23505` UNIQUE violation referencing `uniq_gr_line_po_line`.
- [ ] 10.4 Partial receipt across multiple GRs: seed PO line `qty_ordered=100`; confirm GR_A with 40, GR_B with 60; assert PO transitions to `received` after GR_B (via `PoStateMachine` mock; INT also verifies cumulative SUM query uses the correct index).
- [ ] 10.5 Over-receipt tolerance: seed PO line `qty_ordered=100` (unit `kg`); GR_A confirms 95, GR_B tries 15 (cumulative 110 > 105 limit) → `OverReceiptError`; assert no rows persisted.
- [ ] 10.6 Discrete-unit zero tolerance: seed PO line `qty_ordered=10` (unit `un`); GR_A tries 11 → `OverReceiptError`.
- [ ] 10.7 Per-org tolerance override: seed org with `metadata.gr_over_receipt_tolerance_pct=0.10`; same scenario as 10.5 but cumulative 109 succeeds.
- [ ] 10.8 Variance threshold INT: seed PO line + GR line crossing each threshold (qty-only, price-only, both, neither); assert event-emitter spy captures correct envelope count + payload.
- [ ] 10.9 Independent GR: confirm GR with `po_id=NULL`; assert Lots created, no variance events, `GR_CONFIRMED` emitted with `poId=null` in payload.
- [ ] 10.10 Multi-tenant leakage test: seed orgA + orgB with overlapping GR data; iterate every public method on `GrRepository` + `GrConfirmationService`; assert no method returns/mutates orgB data when invoked with orgA.
- [ ] 10.11 Index usage assertion: `EXPLAIN ANALYZE` on each of the 4 supported query patterns + the over-receipt SUM; assert each uses the expected index (no Seq Scan).
- [ ] 10.12 Atomicity / rollback test: force a SQL fault mid-transaction (e.g., temporarily revoke INSERT permission on `goods_receipt_lines`); call `confirm()`; assert NO Lots created + GR `state='draft'`.
- [ ] 10.13 Smoke test: assert NO `audit_log` row is written when `confirm()` succeeds (subscriber registration is slice #21's job — same pattern as slice #1's smoke test).
- [ ] 10.14 Latency benchmark: confirm a 20-line GR + assert p95 < 200ms (per design.md trade-off note).

## 11. CI + PR hygiene

- [ ] 11.1 `pnpm -w typecheck` passes — verify no TS2448 (numericTransformer hoist), no Zod tuple drift, no CJS interop break.
- [ ] 11.2 `pnpm -w lint` passes — ESLint custom rule for organizationId-first repo signature checks `GrRepository` + `GrLineRepository`.
- [ ] 11.3 `pnpm -w test` passes (unit + INT).
- [ ] 11.4 `openspec validate m3-gr-aggregate-reconciliation` returns 0.
- [ ] 11.5 PR description cites the slice contract row (gate-c-slice-list-m3-2026-05-14.md line 71), the migration slot claimed (0031), the gotcha range claimed (next available per ai-playbook conventions), and the feature flag (`M3_PO_AGGREGATE_ENABLED`).
- [ ] 11.6 Verify file-path disjointness with parallel Wave 2.2 slices: we own `apps/api/src/procurement/gr/`, migration 0031, `packages/contracts/src/m3/procurement-gr.ts`. No overlap.

## 12. Documentation + handoff to downstream slices

- [ ] 12.1 Add `apps/api/src/procurement/gr/README.md` — BC purpose, public surface (the `GrConfirmationService.confirm()` seam), what's claimed by downstream slices (one-paragraph each for slices #8, #11, #14, #21).
- [ ] 12.2 Update `docs/data-model.md` (M3 section) with `goods_receipts` + `goods_receipt_lines` ER diagram fragment showing FKs into `purchase_orders` (slice #6), `lots` (slice #1), `suppliers`/`products`/`users` (M2).
- [ ] 12.3 Update `docs/architecture-decisions.md` with ADR-GR-LOT-CREATION-SEAM, ADR-GR-IDEMPOTENCY, ADR-GR-PARTIAL-RECEIPT, ADR-GR-OVER-RECEIPT, ADR-GR-VARIANCE-THRESHOLDS, ADR-GR-INDEPENDENT-LOT-NO-PO, ADR-GR-PO-STATE-TRANSITION, ADR-GR-INDEXES, ADR-GR-MONEY-PRECISION entries.
- [ ] 12.4 If migration 0031 collides with a later-merged AI-obs slice, document the rebase to 0032 in the PR description + bump the file name.
- [ ] 12.5 Open follow-up tracking issues for slices #8 (UI consumer), #11 (incident search anchor), #14 (APPCC bundle reference), #21 (audit subscriber wiring) — one issue per slice with the FK target + scope notes.

## 13. Gate D review checklist (human reviewer)

- [ ] 13.1 Confirm proposal.md + design.md + specs/procurement-gr-reconciliation/spec.md + tasks.md are coherent.
- [ ] 13.2 Confirm slice-#1 `LotFactory.create()` seam is correctly identified (no duplicated lot-creation logic).
- [ ] 13.3 Confirm slice-#6 `PoStateMachine` integration is gated behind `M3_PO_AGGREGATE_ENABLED` (mergeable independently).
- [ ] 13.4 Confirm migration 0031 number is still available at merge time (rebase check).
- [ ] 13.5 Confirm event types `GR_CONFIRMED`, `GR_LINE_QTY_VARIANCE`, `GR_LINE_PRICE_VARIANCE` are NOT yet wired to the audit subscriber (slice #21 reserves this).
- [ ] 13.6 Approve for `/opsx:apply` — Wave 2.2 babysit budget: ~30–45 min CI babysit per fix-commit, 5–10 fix commits expected.
