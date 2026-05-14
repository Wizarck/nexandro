## 1. Migration 0030 — purchase_orders + purchase_order_lines + po_counters

- [ ] 1.1 `apps/api/src/migrations/0030_create_purchase_orders.ts` — create `purchase_orders` (15 cols) per design.md ADR-PO-VAT-MONEY-FIELDS; CHECK on `state`, `currency`, FK to `organizations`/`suppliers`/`users`
- [ ] 1.2 Same migration: create `purchase_order_lines` (11 cols); FK to `purchase_orders` (CASCADE) + `ingredients`; CHECK on `unit`; UNIQUE `(purchase_order_id, line_number)`; CHECK `quantity_ordered > 0` + `unit_price >= 0`
- [ ] 1.3 Same migration: create `po_counters` (3 cols); PRIMARY KEY `(organization_id, year)`
- [ ] 1.4 Same migration: create `idx_po_org_supplier_created` on `(organization_id, supplier_id, created_at DESC)`
- [ ] 1.5 Same migration: create `idx_po_org_state_expected_delivery` on `(organization_id, state, expected_delivery_date) WHERE state IN ('sent','partially_received')`
- [ ] 1.6 Same migration: create UNIQUE index `idx_po_org_number_unique` on `(organization_id, po_number)`
- [ ] 1.7 Down migration drops `purchase_order_lines` → `purchase_orders` → `po_counters` in dependency order

## 2. Domain layer — entities + types module

- [ ] 2.1 `apps/api/src/procurement/po/domain/types.ts` — inline types (`PoState`, `MoneyUnit`, `CurrencyCode`, `CreatePoInput`, `CreatePoLineInput`); per Wave 2.1 pattern, NOT split across multiple files
- [ ] 2.2 `apps/api/src/procurement/po/domain/numeric.transformer.ts` — `numericTransformer` const; export from a top-level const so entity files can import it ABOVE class declarations (avoids TS2448 hoist hazard from [[feedback_subagent_apply_typing_fix_cascade]])
- [ ] 2.3 `apps/api/src/procurement/po/domain/purchase-order.entity.ts` — TypeORM entity matching migration 0030 `purchase_orders` columns; numericTransformer imported and used; relations declared but lazy
- [ ] 2.4 `apps/api/src/procurement/po/domain/purchase-order-line.entity.ts` — same shape for `purchase_order_lines`
- [ ] 2.5 `apps/api/src/procurement/po/domain/state-machine.ts` — pure module exporting `canTransition(from: PoState, to: PoState): boolean` and `assertTransition(from, to): void`; the legal-transition table is a frozen `Map<PoState, ReadonlySet<PoState>>` defined at module top; NO `@Injectable()`, NO NestJS imports
- [ ] 2.6 `apps/api/src/procurement/po/domain/errors.ts`:
  - `IllegalStateTransitionError extends Error` (carries `from` + `to`)
  - `PoMustHaveAtLeastOneLineError`
  - `SupplierNotFoundError`
  - `InvalidCurrencyCodeError`
  - `PoLineImmutableAfterSendError`
  - `PoNumberAllocationDeadlockError` (raised by counter service on lock timeout)

## 3. State-machine exhaustive transition table + tests

- [ ] 3.1 `apps/api/src/procurement/po/domain/state-machine.spec.ts`:
  - Enumerate all 36 (from, to) pairs from the 6-state set
  - Compare against the design.md ADR-PO-STATE-MACHINE matrix (10 legal, 26 illegal)
  - Assert error message names both states for illegal pairs
- [ ] 3.2 State-machine smoke test: `canTransition` is a pure function (same inputs → same outputs; no side effects observable from a stubbed performance.now())

## 4. PurchaseOrderRepository (multi-tenant gated)

- [ ] 4.1 `apps/api/src/procurement/po/infrastructure/purchase-order.repository.ts`:
  - `findById(organizationId, poId): Promise<PurchaseOrder | null>`
  - `findByNumber(organizationId, poNumber): Promise<PurchaseOrder | null>`
  - `findActiveBySupplier(organizationId, supplierId, limit, offset): Promise<PurchaseOrder[]>` — uses `idx_po_org_supplier_created`
  - `findActiveOps(organizationId, limit, offset): Promise<PurchaseOrder[]>` — filters `state IN ('sent','partially_received')` ordered by `expected_delivery_date`; uses partial index
  - `save(po: PurchaseOrder): Promise<PurchaseOrder>` — checks state immutability rule before allowing updates to nested lines
  - **Every** method takes `organizationId` as the first param

- [ ] 4.2 `apps/api/src/procurement/po/infrastructure/purchase-order-line.repository.ts`:
  - `findByPo(organizationId, poId): Promise<PurchaseOrderLine[]>`
  - `update(organizationId, lineId, patch)`: throws `PoLineImmutableAfterSendError` if parent PO not in `draft`
  - `delete(organizationId, lineId)`: same guard

## 5. PoCounterService — row-locked monotonic counter

- [ ] 5.1 `apps/api/src/procurement/po/infrastructure/po-counter.service.ts`:
  - Single public method: `allocateNext(organizationId, year): Promise<number>`
  - Implementation: wrap in DB transaction; `SELECT next_value FROM po_counters WHERE organization_id=$1 AND year=$2 FOR UPDATE`; INSERT if missing (claim 1, return 1); else UPDATE `next_value = next_value + 1` and return the old value
  - Catch DB lock-timeout (Postgres `55P03`) and re-throw as `PoNumberAllocationDeadlockError`
- [ ] 5.2 INT test: 8 concurrent `allocateNext(orgA, 2026)` calls; assert 8 distinct numbers in `[1..8]`, no deadlock within 5 seconds

## 6. PoNumberService — counter + format

- [ ] 6.1 `apps/api/src/procurement/po/application/po-number.service.ts`:
  - `allocate(organizationId, asOf: Date): Promise<string>` — extracts year from `asOf`, calls `PoCounterService.allocateNext`, formats as `PO-{YYYY}-{nnnn}` with `padStart(4, '0')`
  - `parse(poNumber: string): { year: number; sequence: number } | null` — defensive parser for legacy lookups

## 7. PoFactory + Application service

- [ ] 7.1 `apps/api/src/procurement/po/application/po.factory.ts`:
  - `create(input: CreatePoInput): Promise<PurchaseOrder>` — validates input (lines non-empty, supplier exists, currency length 3); allocates PO number; computes per-line subtotals + VAT (both inclusive + exclusive paths per ADR-PO-VAT-MONEY-FIELDS) with half-even rounding; computes header totals; persists in a single transaction with the counter
- [ ] 7.2 `apps/api/src/procurement/po/application/po.service.ts`:
  - `send(organizationId, poId, userId)`: state transition `draft → sent`; sets `sent_at = now()`
  - `cancel(organizationId, poId, userId, reason)`: state transition to `cancelled` (gated by ADR-PO-STATE-MACHINE)
  - `close(organizationId, poId, userId)`: state transition `received → closed`; sets `closed_at`
  - Note: `markPartiallyReceived` + `markReceived` flows are deliberately NOT in this slice — claimed by slice #7 GR reconciliation

## 8. Errors module

- [ ] 8.1 `apps/api/src/procurement/po/domain/errors.ts` — all error classes listed in §2.6 with stable `code` strings (`PO_E_ILLEGAL_TRANSITION`, etc.) for downstream slice #8 UI mapping

## 9. Event types registration (NO emit)

- [ ] 9.1 `packages/contracts/src/m3/po.ts`:
  - Export `PurchaseOrderReadModel` (Zod schema + inferred TS type)
  - Export `PurchaseOrderLineReadModel`
  - Export 6 event envelopes typed as `AuditEventEnvelope` discriminated union: `PoCreatedEvent`, `PoSentEvent`, `PoReceivedPartialEvent`, `PoReceivedFullEvent`, `PoCancelledEvent`, `PoClosedEvent`
  - Use `z.array(...).min(1)` for required-non-empty arrays (NOT `.nonempty()`) per [[feedback_subagent_apply_typing_fix_cascade]]
- [ ] 9.2 Re-export from `packages/contracts/src/index.ts`
- [ ] 9.3 Do NOT register events in `apps/api/src/audit-log/audit-log.subscriber.ts` — claimed by slice #21

## 10. Unit tests

- [ ] 10.1 `purchase-order.entity.spec.ts` — TypeORM column mapping (names, types, nullable, defaults)
- [ ] 10.2 `purchase-order-line.entity.spec.ts` — same for lines
- [ ] 10.3 `po.factory.spec.ts`:
  - Happy path: 2-line PO produces correct subtotal/VAT/total
  - Boundary: empty `lines` → `PoMustHaveAtLeastOneLineError`
  - Boundary: `unit_price = 0` allowed; `unit_price < 0` rejected by DB CHECK in INT
  - Boundary: VAT-inclusive line reverse math (worked example from spec.md REQ-PO-8)
  - Boundary: `currency = 'EU'` → `InvalidCurrencyCodeError`
- [ ] 10.4 `po-number.service.spec.ts` — formatter padding + year-rollover (stubbed counter)
- [ ] 10.5 `po.service.spec.ts` — `cancel` from each state asserts legal vs illegal per state-machine matrix

## 11. Integration tests (against vps-postgres test fallback when Docker is down — see [[reference_vps_postgres_test]])

- [ ] 11.1 `po.repository.int-spec.ts` — uses M2 testcontainer harness OR vps-postgres fallback (`packages/test-fixtures/src/postgres-container.ts`)
- [ ] 11.2 Multi-tenant leakage test: seed orgA + orgB with overlapping PO data; iterate every public method on `PurchaseOrderRepository` + `PurchaseOrderLineRepository`; assert no method returns the wrong org's rows
- [ ] 11.3 Counter race condition: 8 concurrent `PoCounterService.allocateNext(orgA, 2026)`; assert 8 distinct numbers, no deadlock within 5s
- [ ] 11.4 Index usage assertion: `EXPLAIN ANALYZE` on 3 documented query patterns; each uses expected index (no Seq Scan)
- [ ] 11.5 Line-immutability INT: persist a PO, transition to `sent`, attempt line UPDATE → assert `PoLineImmutableAfterSendError`; attempt line DELETE → same
- [ ] 11.6 Smoke test: assert NO `audit_log` row written when `PoFactory.create()` runs (subscriber registration is slice #21's job)
- [ ] 11.7 Supplier FK NO ACTION test: create PO, attempt to DELETE the supplier → assert FK violation; M2 supplier soft-delete (`isActive=false`) still works

## 12. PoModule + app.module.ts wiring

- [ ] 12.1 `apps/api/src/procurement/po/po.module.ts` — provides entities, repos, services; exports factory + services for downstream consumption
- [ ] 12.2 `apps/api/src/procurement/procurement.module.ts` — imports `PoModule`, re-exports for future GR slice (#7)
- [ ] 12.3 `apps/api/src/app.module.ts` — add `ProcurementModule` to imports; M3 feature flag gate per M2 wave 1.x convention if applicable

## 13. Documentation + handoff

- [ ] 13.1 `apps/api/src/procurement/po/README.md` — BC purpose, public surface, what's claimed by downstream slices (one paragraph each for #7, #8, #21)
- [ ] 13.2 Update `docs/data-model.md` (M3 section) with `purchase_orders` + `purchase_order_lines` + `po_counters` ER fragment
- [ ] 13.3 Update `docs/architecture-decisions.md` with the 7 ADR-PO-* entries from design.md
- [ ] 13.4 Open follow-up tracking notes for slice #7 (GR reconciliation FK target + state-transition flow) and slice #8 (UI public surface)

## 14. CI + PR hygiene

- [ ] 14.1 `pnpm -w typecheck` passes (numericTransformer hoist verified)
- [ ] 14.2 `pnpm -w lint` passes
- [ ] 14.3 `pnpm -w test` passes (unit + INT)
- [ ] 14.4 `openspec validate m3-po-aggregate` returns 0
- [ ] 14.5 PR description cites: slice contract row (#6), migration slot claimed (0030), gotcha range claimed
- [ ] 14.6 Gate D review confirms proposal + design + spec + tasks coherent before invoking `/opsx:apply`
