## 1. Migration 0037 — two traversal indexes

- [ ] 1.1 `apps/api/src/migrations/0037_add_lot_compound_and_traversal_indexes.ts` — create both new indexes per design.md ADR-CONSUMPTION-TRAVERSAL-INDEX
- [ ] 1.2 Create `idx_stock_moves_org_lot_outbound` on `stock_moves(organization_id, lot_id, created_at DESC) WHERE move_type='outbound'` (partial; complements slice #1's generic index)
- [ ] 1.3 Create `idx_audit_log_org_lot_consumption` on `audit_log(organization_id, (payload_after->>'lot_id'), created_at DESC) WHERE aggregate_type='lot' AND event_type='LOT_CONSUMED'` (partial; pre-emptive — sits empty until slice #21)
- [ ] 1.4 Down migration drops both indexes; tables unchanged
- [ ] 1.5 `EXPLAIN ANALYZE` snapshots for both indexes appended to `docs/architecture-decisions.md` ADR-031 section (continues slice #1's contribution)

## 2. Contracts — LotConsumed envelope + payload Zod schema

- [ ] 2.1 `packages/contracts/src/m3/consumption.ts` — define `LotConsumedPayloadSchema` (Zod), all fields per design.md ADR-CONSUMPTION-EVENT-SCHEMA table
- [ ] 2.2 Export `LotConsumedPayload` inferred TS type from the Zod schema
- [ ] 2.3 Export `LotConsumedEvent` typed `AuditEventEnvelope` with `aggregate_type='lot'`, `event_type='LOT_CONSUMED'`, payload `LotConsumedPayload`
- [ ] 2.4 Re-export from `packages/contracts/src/index.ts`
- [ ] 2.5 Verify cross-package import works from `apps/api/` without TS6059 rootDir errors (per Wave 2.1 lesson; slice #1 already proved the path works for lots.ts)

## 3. Domain layer — Consumption BC scaffolding

- [ ] 3.1 `apps/api/src/inventory/consumption/domain/events.ts` — re-export `LotConsumedEvent` from contracts; declare BC-local `LOT_CONSUMED_EVENT` injection token for EventEmitter2
- [ ] 3.2 `apps/api/src/inventory/consumption/domain/consumption-input.ts` — `RecordConsumptionInput` value object: `{ lotId, qtyConsumed, recipeId?, menuItemId?, nexandroTag?, reason?, idempotencyKey }`
- [ ] 3.3 `apps/api/src/inventory/consumption/domain/errors.ts`:
  - `InvalidConsumptionInputError` — qty <= 0, both recipe_id + menu_item_id populated, lot not found
  - `LotInsufficientQuantityError` — `qty_consumed > lot.quantity_remaining`
  - `DuplicateIdempotencyKeyError` — same key already produced a stock_moves row

## 4. Application layer — service + forward-trace query

- [ ] 4.1 `apps/api/src/inventory/consumption/application/consumption.service.ts`:
  - `recordConsumption(organizationId, actorUserId, input: RecordConsumptionInput): Promise<LotConsumedEvent>`
  - Loads lot via `LotRepository.findById()` (multi-tenant gated)
  - Validates: qty > 0, qty <= quantity_remaining, at-most-one of recipe_id/menu_item_id, idempotency key not seen
  - Appends `stock_moves` row via slice #1's `StockMoveRepository.append({ move_type: 'outbound', quantity: -qty, ... })`
  - Builds `LotConsumedEvent` envelope using the persisted move's id; validates payload via `LotConsumedPayloadSchema.parse()` at boundary
  - Emits on `EventEmitter2` (M2 Wave 1.9 bus); returns the envelope to caller
- [ ] 4.2 `apps/api/src/inventory/consumption/application/forward-trace.query.ts`:
  - `findConsumptionsByLot(organizationId, lotId, limit, offset): Promise<LotConsumedReadModel[]>`
  - Reads from `stock_moves` (uses `idx_stock_moves_org_lot_outbound`)
  - Returns shape that slices #11/#12 will consume; documented in spec.md REQ-CE-4 scenarios
- [ ] 4.3 Every public method takes `organizationId` first param (multi-tenant gate inherited from slice #1's pattern)

## 5. Module wiring

- [ ] 5.1 `apps/api/src/inventory/consumption/consumption.module.ts` — provides service + query, exports both, imports `LotModule` from slice #1
- [ ] 5.2 `apps/api/src/inventory/inventory.module.ts` (created in slice #1) — add `ConsumptionModule` to imports + re-exports list
- [ ] 5.3 `apps/api/src/app.module.ts` — no change needed; `InventoryModule` already imported by slice #1. Verify `M3_ENABLED` env gate still wraps the inventory tree

## 6. Unit tests — events shape + service logic

- [ ] 6.1 `consumption.payload.spec.ts` — Zod schema validation:
  - Happy path: full payload parses
  - Boundary: missing top-level `organization_id` → ZodError
  - Boundary: both `recipe_id` and `menu_item_id` populated → ZodError (or service-level rejection — pick one and document)
  - Boundary: `qty_consumed=0` → ZodError (positive number required)
  - Boundary: `qty_consumed` negative → ZodError (positive number required — sign normalisation happens at StockMove layer)
  - Boundary: `nexandro_tag` empty string → accepted (tag is optional and free-form)
- [ ] 6.2 `consumption.service.spec.ts` (mocked repos + bus):
  - Happy path: valid input → stock_moves.append called with correct signed qty → bus emit called with correct envelope
  - Validation: qty > quantity_remaining → throws `LotInsufficientQuantityError`; no repo write; no bus emit
  - Validation: both recipe_id + menu_item_id → throws `InvalidConsumptionInputError`; no side effects
  - Validation: lot not found in org → throws `InvalidConsumptionInputError` (treats cross-tenant access as not-found)
  - Idempotency: same key replayed → returns the original event without writing a duplicate StockMove
  - Envelope shape: `aggregate_type='lot'`, `event_type='LOT_CONSUMED'`, `aggregate_id=lot.id`, `actor_user_id=actorUserId`, payload `organization_id` matches gate, `qty_consumed` is positive in payload (sign normalised)

## 7. Integration tests — Postgres (vps-postgres tunnel or testcontainer)

- [ ] 7.1 `consumption.service.int-spec.ts` — uses M2 testcontainer harness (or vps-postgres fallback per [[reference_vps_postgres_test]] when Docker Desktop is down):
  - Seed orgA + orgB with one lot each (qty 100, same supplier).
  - Call `recordConsumption(orgA, userA, { lotId, qty: 30, ... })` and assert:
    - Exactly one `stock_moves` row created with `move_type='outbound'`, `quantity=-30`, `lot_id=lotA.id`
    - **No** `audit_log` row created (asserts ADR-CONSUMPTION-NO-EMIT-HERE invariant; test-only bus listener verifies the event WAS on the bus though)
- [ ] 7.2 Multi-tenant leakage test: `recordConsumption(orgA, userA, { lotId: lotB.id })` → `InvalidConsumptionInputError` ("not found in this org"). Assert orgB's lot is untouched.
- [ ] 7.3 Forward-trace query: seed 5 consumption events against one lot over the past week; `findConsumptionsByLot(orgA, lotId, 10, 0)` returns all 5 ordered by `created_at DESC`.
- [ ] 7.4 Idempotency: `recordConsumption` called twice with identical `idempotencyKey` → single `stock_moves` row, single bus emission, second call returns the original envelope.
- [ ] 7.5 Index usage assertion: `EXPLAIN ANALYZE` on the forward-trace query; assert plan uses `idx_stock_moves_org_lot_outbound` (no Seq Scan).
- [ ] 7.6 Index usage assertion (audit-log side, simulated): manually INSERT a row into `audit_log` matching the partial index predicate; `EXPLAIN ANALYZE` on the audit-log forward-trace query asserts `idx_audit_log_org_lot_consumption` is used.
- [ ] 7.7 NFR-PERF-1 sub-budget: seed 100k stock_moves + 100k audit_log rows across two orgs; assert forward-trace p95 < 50ms on both sides.

## 8. Migration smoke + rollback verification

- [ ] 8.1 Run migration 0037 against a fresh post-slice-#1 database; assert `pg_indexes` shows both new indexes
- [ ] 8.2 Assert slice #1's `idx_stock_moves_org_lot_created` still exists (no regression)
- [ ] 8.3 Run down migration; assert both new indexes removed, slice #1 indexes intact
- [ ] 8.4 Re-run up migration; assert idempotent (re-creation succeeds)

## 9. Documentation + handoff

- [ ] 9.1 `apps/api/src/inventory/consumption/README.md` — BC purpose, public surface (`ConsumptionService.recordConsumption`, `ForwardTraceQuery.findConsumptionsByLot`), what's claimed by downstream slices (one paragraph each for slices #11, #12, #13, #21)
- [ ] 9.2 Update `docs/data-model.md` (M3 section) — note the two new indexes on `stock_moves` + `audit_log`; reference ADR-031 line numbers
- [ ] 9.3 Update `docs/architecture-decisions.md` with the 6 local ADRs from design.md:
  - ADR-CONSUMPTION-EVENT-SCHEMA
  - ADR-CONSUMPTION-EMITTER-LOCATION
  - ADR-CONSUMPTION-NO-EMIT-HERE
  - ADR-CONSUMPTION-TRAVERSAL-INDEX
  - ADR-CONSUMPTION-MULTI-TENANT-PAYLOAD
  - ADR-CONSUMPTION-RECIPE-MENU-NULLABLE
- [ ] 9.4 Open follow-up tracking issues for slices #11, #12, #13, #21 that depend on this slice; each cites the contract row + the specific symbol they consume (`LotConsumedEvent`, `findConsumptionsByLot`, the audit-log partial index)

## 10. CI + PR hygiene

- [ ] 10.1 `pnpm -w typecheck` passes
- [ ] 10.2 `pnpm -w lint` passes (project convention: `--max-warnings=0`)
- [ ] 10.3 `pnpm -w test` passes (unit + INT)
- [ ] 10.4 `openspec validate m3-lot-consumption-events --strict` returns 0
- [ ] 10.5 Gitleaks scan clean over PR history (per [[feedback_gitleaks_placeholders]] — no `KEY=<placeholder>` syntax in markdown; bullet lists for any secret-shaped strings)
- [ ] 10.6 PR description cites: slice contract row (gate-c-slice-list-m3 row #2), 1 migration slot claimed (0037), ADR list, dependency chain (depends on m3-lot-aggregate; blocks #11, #12, #13), CI expectations
- [ ] 10.7 Gate D review: human reviewer confirms proposal + design + spec + tasks are coherent before invoking `/opsx:apply`
