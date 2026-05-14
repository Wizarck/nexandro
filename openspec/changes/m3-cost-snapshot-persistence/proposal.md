## Why

M3 FR7 (PRD line 532) requires the system to "compute FIFO/FEFO cost via the `InventoryCostResolver` interface, returning actual batch cost (not approximate supplier list price) for any cost rollup." Computing the cost is necessary but not sufficient — regulatory traceability (EU 178/2002) and recipe P&L drift detection both require the system to **persist** the resolved cost-at-consumption-time so that, weeks or months later, an auditor or a Manager can reconstruct *exactly which batches at exactly what unit cost* fed a given service window.

Slice #1 (`m3-lot-aggregate`, merged at `0dab33b`) shipped the foundation: `lots` + `stock_moves` tables, repository surface, factory. Slice #2 (`m3-lot-consumption-events`, in parallel) ships the `LotConsumed` event emitted whenever an outbound `stock_moves` row lands as part of a recipe execution. Slice #4 (`m3-inventory-cost-resolver-fifo-fefo`, in parallel) ships the FIFO/FEFO resolver that takes a `(organizationId, ingredientId, quantityToConsume, asOf)` request and returns a `CostResolution` breakdown by lot.

What none of those slices does — and what this slice adds — is **append a `cost_snapshot` row at the moment of consumption**, capturing:

1. The resolved unit cost per consumed lot (from slice #4's `CostResolution`).
2. The total resolved cost for the consumption event.
3. The lot-level breakdown (which lots contributed which quantity at which unit cost).
4. The audit envelope (org, actor, capability, correlation_id) so the row is downstream-discoverable.

| Downstream slice | Why it needs `cost_snapshots` |
|---|---|
| `m3-ai-obs-ui` (#20) | "Cost by tag" + "Cost by capability" dashboard widgets SUM `cost_snapshots.total_cost` GROUP BY tag / capability over a time window. Without the snapshot, the widget has to re-run the resolver on demand — too slow and historically incorrect (lot state has moved on). |
| (future) recipe P&L exporter | Regulatory + management reports need the snapshot frozen at consumption time, not a recomputed value against today's lot state. |
| (future) recall dossier cost section | A 86-flag dispatch dossier states "this incident involved €X of stock"; the value comes from snapshotted rows, not live recomputation. |

Per architecture-m3.md NFR-TEST listing line 79: *"rollup drift reconciliation INT"* is an M3-mandatory test category. This slice is the one that *creates* the rollup table that the drift test reconciles — so the INT test ships here, not in a downstream slice.

## What Changes

- **Migration `0039_create_cost_snapshots_table.ts`** — new `cost_snapshots` table with 11 columns:
  - `snapshot_id uuid PK`
  - `organization_id uuid NOT NULL` (multi-tenant gate)
  - `stock_move_id uuid NOT NULL FK stock_moves` (the consumption event this snapshot belongs to)
  - `lot_id uuid NOT NULL FK lots` (the dominant lot — first entry in `breakdown`; convenience column for the partial index)
  - `product_id uuid NOT NULL` (the ingredient/product consumed — FK soft, validated at app layer to keep migration order-independent of M2 ingredient table)
  - `strategy text NOT NULL CHECK (strategy IN ('fifo','fefo','manual'))`
  - `qty_consumed numeric(18,4) NOT NULL` (matches slice #1 numeric precision; CHECK > 0)
  - `total_cost numeric(18,4) NOT NULL` (Euros; CHECK >= 0)
  - `breakdown jsonb NOT NULL` (array of `{ lot_id, qty, unit_cost, subtotal }`; one entry per contributing lot)
  - `correlation_id uuid NOT NULL` (OTel trace correlation per ADR-030 NFR-OBS-2; allows the snapshot to join the AI-observability pipeline if the consumption was AI-mediated)
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - Two indexes:
    - `idx_cost_snapshots_org_move_created` on `(organization_id, stock_move_id, created_at DESC)` — back-reference per-consumption (slice #20 widget hot path)
    - `idx_cost_snapshots_org_product_created` partial on `(organization_id, product_id, created_at DESC)` — rollup queries
- **`apps/api/src/inventory/cost/snapshot/`** new BC sibling to slice #4's `apps/api/src/inventory/cost/resolver/`:
  - `domain/cost-snapshot.entity.ts` — TypeORM entity matching migration 0039.
  - `domain/errors.ts` — `CostSnapshotImmutableError` (append-only invariant), `CostSnapshotBreakdownInvariantError` (sum-of-subtotals must equal total_cost ± 0.01).
  - `application/cost-snapshot.repository.ts` — `append()` only; explicit refusal of `update` / `delete` (throws `CostSnapshotImmutableError`).
  - `application/cost-snapshot.service.ts` — single public method `snapshotConsumption(input: SnapshotConsumptionInput)` that builds the row from a resolved `CostResolution` + the originating `stock_move_id` and persists it.
  - `application/cost-snapshot.subscriber.ts` — `@OnEvent('LOT_CONSUMED')` listener that (a) calls the cost resolver port, (b) calls `snapshotConsumption()`, (c) emits the `COST_SNAPSHOT_RECORDED` event on the bus.
  - `application/ports/cost-resolver.port.ts` — local TypeScript interface declaring the `CostResolution` contract this slice consumes. Slice #4 implements the port; this slice owns the interface. Prevents forward dependency.
  - `cost-snapshot.module.ts` — NestJS wiring.
- **`packages/contracts/src/m3/cost-snapshot.ts`** — Zod schemas + types:
  - `CostBreakdownEntrySchema` (lot_id, qty, unit_cost, subtotal)
  - `CostSnapshotReadModel` schema (matches DB row)
  - `CostSnapshotRecordedEvent` typed `AuditEventEnvelope` (`aggregateType='cost_snapshot'`, `eventType='COST_SNAPSHOT_RECORDED'`)
  - `CostResolution` Zod schema declared HERE as forward reference (slice #4 imports from contracts; this slice imports from contracts; no circular dep on slice #4's source).
- **Event registration only — NO subscriber wiring to `AuditLogSubscriber`**. Per the slice #1 `ADR-LOT-NO-EVENT-EMIT-HERE` and slice #2 mirror precedent, the `COST_SNAPSHOT_RECORDED` event type ships in `packages/contracts`, the bus emit happens here, but the `AuditLogSubscriber.KNOWN_EVENTS` update is batched into slice #21 (`m3-audit-log-hash-chain-hardening`). A smoke test asserts NO `audit_log` row is written when `snapshotConsumption()` is called by this slice's tests.
- **Rollup-drift INT test** — `cost-snapshot.rollup-drift.int-spec.ts` seeds 1,000 synthetic snapshots spanning 30 days, queries `SUM(total_cost) GROUP BY product_id`, then reconstructs the expected total from the seeded `stock_moves` + `lots` state, and asserts the drift is < 0.5% per NFR-TEST line 79. Catches arithmetic regressions invisible to unit tests.
- **BREAKING**: none. M2 `cost-rollup-and-audit` service (Wave 1.10) is untouched; that wave computes M2-era recipe-cost using `ingredient.cost_per_unit_eur` — orthogonal to the lot-level cost-snapshot stream introduced here. M3's `m3-ai-obs-ui` and recall dossier consume this slice; M2 surfaces are unaffected.

## Capabilities

### New Capabilities

- `inventory-cost-snapshot`: canonical `cost_snapshots` append-only table + `CostSnapshotService.snapshotConsumption()` write path + `@OnEvent('LOT_CONSUMED')` subscriber wiring + `COST_SNAPSHOT_RECORDED` event type + rollup-drift INT test. Foundation for FR7 traceability surfaces (FR15 forward trace cost section, FR45/46 AI observability cost-by-tag widget).

### Modified Capabilities

- None. `inventory-lots` (slice #1) and `inventory-consumption-events` (slice #2) are unchanged — this slice subscribes to slice #2's emitted event without modifying its API surface.

## Impact

- **Prerequisites**: slice #1 `m3-lot-aggregate` merged. Slice #2 `m3-lot-consumption-events` and slice #4 `m3-inventory-cost-resolver-fifo-fefo` are in parallel; **`/opsx:apply` for this slice MUST land after both #2 and #4 are merged** even though their proposals can be written in parallel. The proposal phase (this PR) is file-path disjoint from #2 and #4.
- **Code**:
  - `apps/api/src/inventory/cost/snapshot/` (new BC). ~450 LOC.
  - `apps/api/src/migrations/0039_create_cost_snapshots_table.ts`. ~90 LOC.
  - `packages/contracts/src/m3/cost-snapshot.ts`. ~80 LOC (4 schemas + 1 typed event).
  - Tests: ~28 new tests across entity + repository + service unit + subscriber unit (mocked resolver) + rollup-drift INT + cross-tenant fixture + index-usage INT.
- **Performance**:
  - INSERT-only path; one INSERT + one event emit per consumption. Expected synchronous overhead ≤4ms (resolver call + INSERT + bus emit). Meets NFR-PERF-2 sub-budget for write paths.
  - Two indexes; expected p95 < 30ms for slice #20 "cost by product over 30d" queries at 1M rows/org (well inside NFR-PERF-1 budget given the partial index discrimination).
  - JSONB `breakdown` adds ~200 bytes per row at 3-lot average split; budgeted in the storage section.
- **Storage growth**: ~400 bytes per snapshot × ~5,000 consumptions/day/org × 365 days × 30 orgs = ~22 GB/year for the table + indexes combined. Within NFR-SCALE storage budget; cold-storage archival deferred to a 7-year-horizon follow-up (see ADR-SNAPSHOT-RETENTION).
- **Audit**: `COST_SNAPSHOT_RECORDED` event registered as typed envelope but NOT persisted to `audit_log` by this slice. Slice #21 wires `AuditLogSubscriber.KNOWN_EVENTS`. Smoke test asserts the absence of `audit_log` writes from this slice's INT runs to prevent accidental double-write at slice #21 landing.
- **Rollback**: down migration drops `cost_snapshots` table. Downstream slice #20 dashboard widgets degrade to "no data" (no breakage since the dashboard renders the empty state). No M2 surface is affected.
- **Out of scope** (claimed by other slices, do NOT pre-empt):
  - Cost resolution algorithm (FIFO/FEFO selection logic) → `m3-inventory-cost-resolver-fifo-fefo` (#4).
  - `LotConsumed` event emission → `m3-lot-consumption-events` (#2).
  - AuditLog subscriber registration for `COST_SNAPSHOT_RECORDED` → `m3-audit-log-hash-chain-hardening` (#21).
  - Dashboard widgets that consume `cost_snapshots` → `m3-ai-obs-ui` (#20).
  - 7-year cold-storage archival (HACCP regulatory retention) → deferred follow-up (`m3.x-cost-snapshot-archival`).
  - UX: zero UI in this slice — surface is via slice #20 (operator dashboard) and via Hermes MCP capabilities for agent surfaces.
- **Parallelism**: this slice writes exclusively to `apps/api/src/inventory/cost/snapshot/` + `apps/api/src/migrations/0039_*` + `packages/contracts/src/m3/cost-snapshot.ts`. File-path disjoint from every other Wave 2.2 slice in flight. Sibling subagents (#2, #3, #4, #6, #7) write to disjoint directories per the same convention.

- **Effort estimate**: M (~450 LOC application + ~90 LOC migration + ~28 tests; matches gate-c slice list "M" sizing).
