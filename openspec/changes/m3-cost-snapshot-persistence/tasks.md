## 1. Migration 0039 — cost_snapshots table + 2 indexes

- [ ] 1.1 `apps/api/src/migrations/0039_create_cost_snapshots_table.ts` — create `cost_snapshots` table per design.md ADR-SNAPSHOT-SCHEMA (11 columns; CHECK on `strategy` enum; CHECK on `qty_consumed > 0`; CHECK on `total_cost >= 0`; FK to `lots(id)` and `stock_moves(id)`; soft FK on `product_id` validated app-side per design rationale)
- [ ] 1.2 Same migration: create `idx_cost_snapshots_org_move_created` on `(organization_id, stock_move_id, created_at DESC)` per design.md ADR-SNAPSHOT-INDEX
- [ ] 1.3 Same migration: create `idx_cost_snapshots_org_product_created` partial on `(organization_id, product_id, created_at DESC) WHERE total_cost > 0`
- [ ] 1.4 Down migration drops the table (no reverse data movement — slice #20 dashboard degrades gracefully per design.md Migration Plan stage 4)

## 2. Domain layer — CostSnapshot entity + errors

- [ ] 2.1 `apps/api/src/inventory/cost/snapshot/domain/cost-snapshot.entity.ts` — TypeORM entity matching migration 0039 columns; `strategy` typed as union `'fifo'|'fefo'|'manual'`
- [ ] 2.2 `apps/api/src/inventory/cost/snapshot/domain/errors.ts`:
  - `CostSnapshotImmutableError` (append-only invariant violation — REQ-SS-3)
  - `CostSnapshotBreakdownInvariantError` (sum-of-subtotals mismatch — REQ-SS-7; carries the delta in error.message)
  - `CostSnapshotCrossTenantAccessError` (multi-tenant isolation violation — REQ-SS-5)
- [ ] 2.3 `apps/api/src/inventory/cost/snapshot/types.ts` — inline TS types per [[feedback_subagent_apply_typing_fix_cascade]] Wave 2.1 codification (CJS interop avoidance, no re-export chains from non-existent siblings)

## 3. Contracts package — Zod schemas + typed event envelope

- [ ] 3.1 `packages/contracts/src/m3/cost-snapshot.ts`:
  - Export `CostBreakdownEntrySchema` (Zod: `{ lot_id: uuid, qty: number positive, unit_cost: number nonnegative, subtotal: number nonnegative }`)
  - Export `CostSnapshotReadModel` (Zod schema + inferred TS type; matches DB row shape)
  - Export `CostResolution` (forward-reference schema for slice #4 to import; declared here to break circular dep — per design.md ADR-SNAPSHOT-AUDIT-ENVELOPE)
  - Export `CostSnapshotRecordedEvent` (typed `AuditEventEnvelope` with `aggregateType='cost_snapshot'`, `eventType='COST_SNAPSHOT_RECORDED'`, `capability_used='inventory.cost-resolve'`)
  - **Note**: use `.min(1)` over `.nonempty()` per [[feedback_subagent_apply_typing_fix_cascade]] Wave 2.1 lesson
- [ ] 3.2 `packages/contracts/src/index.ts` re-exports the new module
- [ ] 3.3 Storybook does NOT apply (no UI components in this slice — backend only)

## 4. Application layer — repository (append-only)

- [ ] 4.1 `apps/api/src/inventory/cost/snapshot/application/cost-snapshot.repository.ts`:
  - `append(input: CostSnapshotInput): Promise<CostSnapshot>` — Zod-validates input via `CostSnapshotReadModel`, persists row, returns the saved entity
  - `findByStockMoveId(organizationId, stockMoveId): Promise<CostSnapshot | null>` — uses `idx_cost_snapshots_org_move_created`
  - `findByProductSince(organizationId, productId, since, limit, offset): Promise<CostSnapshot[]>` — uses `idx_cost_snapshots_org_product_created`
  - `update()` and `delete()` methods explicitly throw `CostSnapshotImmutableError`
  - Every public method takes `organizationId` as first param; ESLint custom rule (slice #1 precedent) enforces no overload missing it

## 5. Application layer — service

- [ ] 5.1 `apps/api/src/inventory/cost/snapshot/application/cost-snapshot.service.ts`:
  - `snapshotConsumption(input: SnapshotConsumptionInput): Promise<CostSnapshot>`
  - Validates `SUM(breakdown[i].subtotal) ≈ total_cost ± 0.01` per REQ-SS-7; throws `CostSnapshotBreakdownInvariantError` on mismatch
  - Performs idempotency check via `repository.findByStockMoveId()` per REQ-SS-8; if a non-manual snapshot exists for this `stock_move_id`, logs warn + returns the existing row (no double-insert)
  - Calls `repository.append()` to persist
  - Emits `COST_SNAPSHOT_RECORDED` event on bus (EventEmitter2) post-commit
- [ ] 5.2 `apps/api/src/inventory/cost/snapshot/application/ports/cost-resolver.port.ts`:
  - Local TS interface `InventoryCostResolverPort` with `resolve(input: ResolveCostInput): Promise<CostResolution>`
  - Slice #4 implements via NestJS DI; this slice owns the port shape

## 6. Application layer — subscriber

- [ ] 6.1 `apps/api/src/inventory/cost/snapshot/application/cost-snapshot.subscriber.ts`:
  - `@OnEvent('LOT_CONSUMED')` listener method `handleLotConsumed(event: LotConsumedEvent)`
  - Loads the consumption context (org, productId, qty, stockMoveId, correlation_id) from the event envelope
  - Calls `resolver.resolve()` to compute the `CostResolution`
  - Falls back to `crypto.randomUUID()` for `correlation_id` when missing (REQ-SS-6 defensive case)
  - Calls `costSnapshotService.snapshotConsumption()` to persist + emit
  - Re-throws on resolver failure so the upstream bus dispatcher logs (REQ-SS-1 scenario)

## 7. Event type registration (no AuditLogSubscriber wiring)

- [ ] 7.1 Verify `packages/contracts/src/m3/cost-snapshot.ts` exports `CostSnapshotRecordedEvent` per REQ-SS-9
- [ ] 7.2 Confirm NO change to `apps/api/src/audit-log/audit-log.subscriber.ts` — slice #21 owns that batch
- [ ] 7.3 Add smoke test asserting `SELECT COUNT(*) FROM audit_log WHERE aggregate_type='cost_snapshot' = 0` after running this slice's INT suite

## 8. Module wiring (NestJS)

- [ ] 8.1 `apps/api/src/inventory/cost/snapshot/cost-snapshot.module.ts` — provides repository + service + subscriber; imports the cost-resolver port via DI symbol; imports `EventEmitterModule.forFeature()` for the `@OnEvent` decorator
- [ ] 8.2 `apps/api/src/inventory/inventory.module.ts` — imports `CostSnapshotModule`; sibling to existing `LotModule` (slice #1) and `ConsumptionModule` (slice #2)
- [ ] 8.3 `apps/api/src/app.module.ts` — already imports `InventoryModule`; no app-level wiring change needed
- [ ] 8.4 Feature flag: `M3_ENABLED=true` env required (slice #1 convention)

## 9. Unit tests

- [ ] 9.1 `cost-snapshot.entity.spec.ts` — TypeORM mapping (column names, types, nullable, default values, CHECK constraint behavior under direct fixture inserts)
- [ ] 9.2 `cost-snapshot.repository.spec.ts` (mocked datasource):
  - `append` validates input via Zod before INSERT
  - `findByStockMoveId` includes `organizationId` in WHERE clause
  - `findByProductSince` includes `organizationId` + `since` lower bound + `total_cost > 0` filter
  - `update()` throws `CostSnapshotImmutableError`
  - `delete()` throws `CostSnapshotImmutableError`
- [ ] 9.3 `cost-snapshot.service.spec.ts` (mocked repository):
  - Happy path: persists + emits
  - Breakdown invariant: subtotal sum mismatch → throws `CostSnapshotBreakdownInvariantError`
  - Idempotency: duplicate `stock_move_id` with `fifo` strategy → no double-insert, returns existing row
  - Idempotency: `manual` strategy bypasses the idempotency check
  - Rounding tolerance: 0.0001€ delta accepted
- [ ] 9.4 `cost-snapshot.subscriber.spec.ts` (mocked resolver + service):
  - Subscriber calls resolver before calling service
  - Subscriber propagates `correlation_id` from event payload
  - Subscriber generates `correlation_id` via `crypto.randomUUID()` when payload field missing
  - Resolver throws → subscriber re-throws (no silent failure)

## 10. Integration tests (Postgres test container)

- [ ] 10.1 `cost-snapshot.repository.int-spec.ts` — uses slice #1's testcontainer harness:
  - `append + findByStockMoveId` roundtrip
  - Multi-tenant leakage: seed orgA + orgB with overlapping data; iterate every public method on `CostSnapshotRepository`; assert no cross-tenant returns (REQ-SS-5)
  - Index usage: `EXPLAIN ANALYZE` on `findByStockMoveId` query — assert uses `idx_cost_snapshots_org_move_created` (no Seq Scan) per REQ-SS-9
  - Index usage: `EXPLAIN ANALYZE` on `findByProductSince` query — assert uses `idx_cost_snapshots_org_product_created` (no Seq Scan)
- [ ] 10.2 `cost-snapshot.append-only.int-spec.ts` — persist a snapshot, attempt UPDATE/DELETE via repo, assert `CostSnapshotImmutableError`; assert DB row unchanged after the failed attempts
- [ ] 10.3 `cost-snapshot.rollup-drift.int-spec.ts` — THE HEAVY TEST (REQ-SS-4):
  - Seed 1,500 lots across 30 days
  - Seed 1,000 outbound stock_moves with FIFO depletion
  - For each stock_move, compute expected `CostResolution` directly in test code (golden value), call `CostSnapshotService.snapshotConsumption()`, assert persisted row matches
  - Run rollup query: `SELECT product_id, SUM(total_cost) FROM cost_snapshots WHERE organization_id=$1 AND created_at > now() - interval '30 days' GROUP BY product_id`
  - Reconstruct expected totals from seeded state by replaying FIFO depletion in test code
  - Assert per-product `|rollup - reconstruction| / reconstruction < 0.005` for every product
  - Expected runtime ~12s; gated behind `pnpm -w test:int`
- [ ] 10.4 `cost-snapshot.subscriber.int-spec.ts` — wire real `EventEmitter2`, emit a `LOT_CONSUMED` event, assert one `cost_snapshots` row is INSERTed + one `COST_SNAPSHOT_RECORDED` event is observed on the bus
- [ ] 10.5 `cost-snapshot.no-audit-log.int-spec.ts` — assert NO `audit_log` row is written when this slice's full pipeline runs (REQ-SS-9 smoke; slice #21 will wire this later)
- [ ] 10.6 `cost-snapshot.correlation-id.int-spec.ts` — emit `LOT_CONSUMED` with + without `correlation_id` field; assert propagation vs. defensive generation (REQ-SS-6)

## 11. Migration smoke + rollback verification

- [ ] 11.1 Run migration 0039 against an M2-state database with slice #1 + slice #2 + slice #4 migrations applied; assert `pg_indexes` shows both indexes with documented column lists and partial WHERE clause
- [ ] 11.2 Run down migration 0039 down; assert table dropped; assert M3 slices #1/#2/#4 surfaces still operational (no FK cascade damage)
- [ ] 11.3 Re-run up migration 0039; assert idempotent (table recreated cleanly)

## 12. Documentation + handoff

- [ ] 12.1 `apps/api/src/inventory/cost/snapshot/README.md` — BC purpose, public surface, ADR pointers (one-paragraph each for the 7 local ADRs), what's claimed by downstream slices (#20, #21, future archival)
- [ ] 12.2 Update `docs/data-model.md` (M3 section) with `cost_snapshots` ER diagram fragment + relationship arrows to `stock_moves` (FK) and `lots` (FK)
- [ ] 12.3 Update `docs/architecture-decisions.md` with the 7 ADR-SNAPSHOT-* entries (extending architecture-m3.md decisions into the canonical ADR doc)
- [ ] 12.4 Add one-paragraph to `docs/runbooks/` for the rare-case operator recovery procedure: "How to recover from a corrupted cost_snapshot row" (DB-direct DELETE bypassing the repo; logged as one-off)
- [ ] 12.5 Open follow-up tracking issue for `m3.x-cost-snapshot-archival` (7-year cold-storage pattern per ADR-SNAPSHOT-RETENTION)

## 13. CI + PR hygiene

- [ ] 13.1 `pnpm -w typecheck` passes
- [ ] 13.2 `pnpm -w lint` passes
- [ ] 13.3 `pnpm -w test` passes (unit suite — fast)
- [ ] 13.4 `pnpm -w test:int` passes (INT suite — includes the ~12s rollup-drift reconciliation)
- [ ] 13.5 `openspec validate m3-cost-snapshot-persistence` returns 0
- [ ] 13.6 PR description cites the slice contract row (gate-c-slice-list-m3-2026-05-14.md line 64), the migration slot claimed (0039), and the 7 ADRs introduced
- [ ] 13.7 Gate D review: human reviewer confirms proposal.md + design.md + specs/inventory-cost-snapshot/spec.md + tasks.md are coherent before invoking `/opsx:apply`
