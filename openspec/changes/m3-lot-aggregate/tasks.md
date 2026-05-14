## 1. Migration 0026 — lots table + 3 indexes

- [ ] 1.1 `apps/api/src/migrations/0026_create_lots_table.ts` — create `lots` table per design.md ADR-LOT-SCHEMA (11 columns, with CHECK on `unit`, FK to `organizations`/`locations`/`suppliers`)
- [ ] 1.2 Same migration: create `idx_lots_org_supplier_received` on `(organization_id, supplier_id, received_at DESC)` per design.md ADR-LOT-INDEXES
- [ ] 1.3 Same migration: create `idx_lots_org_expires_active` on `(organization_id, expires_at) WHERE expires_at IS NOT NULL`
- [ ] 1.4 Same migration: create `idx_lots_org_loc_available_fifo` on `(organization_id, location_id, quantity_remaining) WHERE quantity_remaining > 0`
- [ ] 1.5 Down migration drops the table (no reverse data movement — table is empty at this slice's landing)

## 2. Migration 0027 — stock_moves table + 1 index

- [ ] 2.1 `apps/api/src/migrations/0027_create_stock_moves_table.ts` — create `stock_moves` table (9 columns, CHECK on `move_type`, FK to `lots`/`users`/`organizations`/`locations`)
- [ ] 2.2 Same migration: create `idx_stock_moves_org_lot_created` on `(organization_id, lot_id, created_at DESC)` for depletion-history queries
- [ ] 2.3 Down migration drops the table (FK from future slices not yet present)

## 3. Domain layer — Lot + StockMove entities

- [ ] 3.1 `apps/api/src/inventory/lot/domain/lot.entity.ts` — TypeORM entity matching migration 0026 columns; `unit` typed as union `'kg'|'g'|'L'|'ml'|'un'`
- [ ] 3.2 `apps/api/src/inventory/lot/domain/stock-move.entity.ts` — TypeORM entity matching migration 0027 columns; `move_type` typed as union of 4 values
- [ ] 3.3 `apps/api/src/inventory/lot/domain/errors.ts`:
  - `LotNotFoundError`
  - `LotCrossTenantAccessError` (multi-tenant isolation invariant violation)
  - `StockMoveImmutableError` (per spec.md "StockMove is append-only")
  - `InvalidUnitError`, `InvalidMoveTypeError`

## 4. Application layer — factory + repository (read-only public surface)

- [ ] 4.1 `apps/api/src/inventory/lot/application/lot.factory.ts`:
  - `create(input: CreateLotInput): Lot` — validates input (qty > 0, unit in enum, expires_at > received_at when both present), constructs entity, sets `quantity_remaining = quantity_received`, sets timestamps
  - Does NOT persist (slice #7 wires repo.save into the GR confirmation flow)
- [ ] 4.2 `apps/api/src/inventory/lot/application/lot.repository.ts`:
  - `findById(organizationId, lotId): Promise<Lot | null>` — uses `idx_lots_org_supplier_received` for the org-scoped lookup
  - `findByLotCode(organizationId, lotCode): Promise<Lot | null>` — legacy M2 string lookup via `metadata->>'supplier_lot_code'`
  - `findAvailableFifo(organizationId, locationId, ingredientId, asOf): Promise<Lot[]>` — uses `idx_lots_org_loc_available_fifo` with FIFO+FEFO ordering per spec.md
  - **Every** method takes `organizationId` as first param; ESLint custom rule enforces no overload missing it
- [ ] 4.3 `apps/api/src/inventory/lot/application/stock-move.repository.ts`:
  - `findByLot(organizationId, lotId, limit?, offset?): Promise<StockMove[]>` — read-only; no UPDATE / DELETE methods exposed
  - Repository methods refuse to UPDATE/DELETE (throws `StockMoveImmutableError`)

## 5. Contracts package — typed event envelopes

- [ ] 5.1 `packages/contracts/src/m3/lots.ts`:
  - Export `LotReadModel` (Zod schema + inferred TS type)
  - Export `StockMoveReadModel`
  - Export `LotCreatedEvent` (typed `AuditEventEnvelope` with `aggregateType='lot'`, `eventType='LOT_CREATED'`)
  - Export `StockMoveCreatedEvent` (typed `AuditEventEnvelope` with `aggregateType='stock_move'`, `eventType='STOCK_MOVE_CREATED'`)
- [ ] 5.2 `packages/contracts/src/m3/lots.ts` re-exported from `packages/contracts/src/index.ts`
- [ ] 5.3 Storybook does NOT apply (no UI components in this slice — foundation only)

## 6. Module wiring (NestJS)

- [ ] 6.1 `apps/api/src/inventory/lot/lot.module.ts` — provides `Lot` + `StockMove` TypeORM repos, exports the factory + 2 application repositories
- [ ] 6.2 `apps/api/src/inventory/inventory.module.ts` — imports `LotModule`, re-exports for downstream M3 BCs (procurement, haccp, recall, cost-resolver) to consume
- [ ] 6.3 `apps/api/src/app.module.ts` — `InventoryModule` added (with M3 feature flag gate per M2 wave 1.x convention: `M3_ENABLED=true` env required to expose endpoints)

## 7. Unit tests

- [ ] 7.1 `lot.entity.spec.ts` — TypeORM mapping (column names, types, nullable, default values)
- [ ] 7.2 `stock-move.entity.spec.ts` — same for stock_moves
- [ ] 7.3 `lot.factory.spec.ts`:
  - happy path: valid input produces entity with correct defaults (`quantity_remaining = quantity_received`)
  - boundary: `quantity_received=0` → throws `InvalidLotQuantityError`
  - boundary: `expires_at < received_at` → throws `InvalidLotExpiryError`
  - boundary: `unit='dozen'` → throws `InvalidUnitError`
  - boundary: empty `metadata` defaults to `{}`
- [ ] 7.4 `lot.repository.spec.ts` (unit-level, mocked repo):
  - `findById` includes `organizationId` in WHERE clause
  - `findByLotCode` includes app-side JOIN against `metadata->>'supplier_lot_code'`
  - `findAvailableFifo` orders by `(received_at ASC, expires_at ASC NULLS LAST)` and filters `quantity_remaining > 0`

## 8. Integration tests (against Postgres test container)

- [ ] 8.1 `lot.repository.int-spec.ts` — uses M2 testcontainer harness (`packages/test-fixtures/src/postgres-container.ts` if exists; otherwise wire one)
- [ ] 8.2 Multi-tenant leakage test: seed orgA + orgB with overlapping Lot data; iterate every public method on `LotRepository` + `StockMoveRepository`; assert no method returns orgB data when queried with orgA
- [ ] 8.3 Index usage assertion: `EXPLAIN ANALYZE` on the 3 supported query patterns; assert each uses the expected index (no Seq Scan)
- [ ] 8.4 `findAvailableFifo` end-to-end: seed 5 lots with varying `received_at` + `expires_at`; assert FIFO+FEFO ordering matches spec
- [ ] 8.5 StockMove append-only test: persist a StockMove, attempt UPDATE/DELETE via repo, assert `StockMoveImmutableError`
- [ ] 8.6 Smoke test: assert NO `audit_log` row is written when `LotFactory.create()` is called (subscriber registration is slice #21's job)

## 9. Migration smoke + rollback verification

- [ ] 9.1 Run migrations 0026 + 0027 against a fresh M2-state database; assert `pg_indexes` shows all 4 indexes on the 2 tables
- [ ] 9.2 Assert `ingredient.lot_code` column on `ingredients` table is unchanged (col exists, type unchanged, data unchanged)
- [ ] 9.3 Run down migrations in reverse order (0027 down, 0026 down); assert tables dropped + ingredient.lot_code still intact
- [ ] 9.4 Re-run up migrations; assert idempotent (tables recreated cleanly)

## 10. Documentation + handoff to downstream slices

- [ ] 10.1 Add `apps/api/src/inventory/lot/README.md` — BC purpose, public surface, what's claimed by downstream slices (one-paragraph each for slices #2, #3, #4, #7, #21)
- [ ] 10.2 Update `docs/data-model.md` (M3 section) with `lots` + `stock_moves` ER diagram fragment
- [ ] 10.3 Update `docs/architecture-decisions.md` with ADR-LOT-SCHEMA, ADR-LOT-INDEXES, ADR-LOT-MULTITENANT-AT-REPO, ADR-LOT-NO-EVENT-EMIT-HERE entries (extending architecture-m3.md decisions into the canonical ADR doc)
- [ ] 10.4 Open follow-up tracking issues for slices #2, #3, #4, #7, #21 that depend on this slice (one issue per slice with the FK target + scope notes from the canonical slice doc)

## 11. CI + PR hygiene

- [ ] 11.1 `pnpm -w typecheck` passes
- [ ] 11.2 `pnpm -w lint` passes
- [ ] 11.3 `pnpm -w test` passes (unit + INT)
- [ ] 11.4 `openspec validate m3-lot-aggregate` returns 0 (no missing artifacts, schema lints clean)
- [ ] 11.5 PR description cites the slice contract row, the 2 migration slots claimed (0026, 0027), and the gotcha range claimed (1-9) per ai-playbook conventions
- [ ] 11.6 Gate D review: human reviewer confirms proposal.md + design.md + specs/inventory-lots/spec.md + tasks.md are coherent before invoking `/opsx:apply`
