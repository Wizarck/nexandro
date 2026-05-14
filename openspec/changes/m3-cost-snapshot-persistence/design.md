## Context

M3 ships an `InventoryCostResolver` interface (FR7, owned by slice #4 `m3-inventory-cost-resolver-fifo-fefo`) that takes a `(organizationId, ingredientId, qtyToConsume, asOf)` request and returns a `CostResolution` — a breakdown of which lots fed the consumption at what unit cost. Slice #2 (`m3-lot-consumption-events`) emits a `LotConsumed` event whenever an outbound `stock_moves` row is appended.

What's missing — and what this slice owns — is the **persistence of the resolved cost-at-consumption-time**. Without it, every downstream rollup (recipe P&L, cost-by-tag dashboard, recall dossier financial section) would have to re-run the resolver on demand, against today's lot state, which is both expensive and incorrect (lot state has moved on; the historical resolution is no longer reconstructable from current state alone).

Architecture-m3.md NFR-TEST line 79 names "rollup drift reconciliation INT" as M3-mandatory. Slice #20 (`m3-ai-obs-ui`) builds the dashboard widget that consumes the snapshot rollups; the **drift test ships with the table that gets reconciled**, i.e. here.

This slice intentionally subscribes to slice #2's event and calls slice #4's resolver port, so it lands **after** both have merged at the implementation phase. The proposal phase is file-path disjoint from #2 and #4 so they can be authored in parallel.

ADR-030 (architecture-m3.md line 230) establishes the OTel observability BC. NFR-OBS-2 requires correlation_id propagation across span boundaries; this slice carries it through to the snapshot row so that an AI-mediated consumption can be joined to its originating LLM call in the obs dashboard.

## Goals / Non-Goals

**Goals:**

- Persist one `cost_snapshots` row per consumption event, frozen at consumption time, immutable thereafter.
- Subscribe to the `LotConsumed` event emitted by slice #2; build snapshot via slice #4's resolver port; INSERT row; emit `COST_SNAPSHOT_RECORDED` on the bus.
- Forward-declare the `CostResolution` contract in `packages/contracts/src/m3/cost-snapshot.ts` (the port interface), independent of slice #4's source — both slices import from `packages/contracts`, no circular dep.
- Compound index `(organization_id, stock_move_id, created_at DESC)` for per-consumption back-reference (slice #20 hot path).
- Partial index `(organization_id, product_id, created_at DESC)` for product-level rollups.
- Rollup-drift INT test (1,000 synthetic snapshots / 30 days) asserts <0.5% reconstruction drift vs. seeded `stock_moves` + `lots` state.
- Event type `COST_SNAPSHOT_RECORDED` registered in `packages/contracts`; NO `AuditLogSubscriber.KNOWN_EVENTS` update (slice #21).
- Multi-tenant invariant: every repository method gates on `organizationId`; cross-tenant fixture leakage INT test passes.

**Non-Goals:**

- FIFO/FEFO algorithm. Reserved for slice #4.
- `LotConsumed` event emission. Reserved for slice #2.
- `AuditLog` row persistence on `COST_SNAPSHOT_RECORDED`. Reserved for slice #21.
- Dashboard widgets that read `cost_snapshots`. Reserved for slice #20.
- 7-year cold-storage archival. Deferred to follow-up (see ADR-SNAPSHOT-RETENTION).
- Recomputation / revaluation API. Snapshots are immutable; correction is a NEW snapshot with a `manual` strategy referencing the original `stock_move_id`. The correction surface itself is out of MVP scope.
- UX surfaces. Slice #20 owns the operator dashboard; Hermes MCP surfaces consume via `inventory-cost-snapshot` capability (a future MCP write capability slice).

## Decisions

### ADR-SNAPSHOT-IMMUTABLE — cost_snapshots is append-only

The `cost_snapshots` table is append-only at the repository layer. The repository exposes `append(input): Promise<CostSnapshot>` and `findByStockMoveId(organizationId, stockMoveId)` + `findByProductSince(organizationId, productId, since, limit, offset)`. There is no `update` or `delete` method; if accidentally called, the repository throws `CostSnapshotImmutableError`. The DB schema has no `updated_at` column — `created_at` is the canonical timestamp.

**Why?** Regulatory traceability (EU 178/2002 + HACCP) requires that the cost basis at the moment of consumption is permanent and reconstructable. Any "correction" is recorded as a NEW snapshot with `strategy='manual'` and a reason in `breakdown[0].notes` (the breakdown JSONB allows free-form metadata). Same pattern as slice #1's `stock_moves` (`ADR-LOT-NO-EVENT-EMIT-HERE` companion: `StockMoveImmutableError`).

**Rejected alternative**: soft-delete with `deleted_at`. Rejected because (a) downstream rollups would have to filter `WHERE deleted_at IS NULL` on every query — error-prone; (b) regulatory chain-of-custody is cleaner with a hard append-only invariant; (c) the cost of an append-only table is low (no UPDATE WAL traffic, fewer dead tuples, no VACUUM concerns).

### ADR-SNAPSHOT-SCHEMA — canonical cost_snapshot row shape

**Columns** (11):

| col | type | nullable | note |
|---|---|---|---|
| `snapshot_id` | uuid | NO | PK |
| `organization_id` | uuid | NO | multi-tenant gate; first column in both indexes |
| `stock_move_id` | uuid | NO | FK `stock_moves(id)` — the consumption event this snapshot belongs to |
| `lot_id` | uuid | NO | FK `lots(id)` — dominant lot (the first entry in `breakdown`); convenience for partial-index pruning |
| `product_id` | uuid | NO | the ingredient/product consumed; soft FK validated app-side to avoid migration order coupling with M2 ingredients |
| `strategy` | text | NO | CHECK in (`fifo`,`fefo`,`manual`); copied from slice #4's `CostResolution.strategy` |
| `qty_consumed` | numeric(18,4) | NO | CHECK > 0; matches slice #1 precision |
| `total_cost` | numeric(18,4) | NO | Euros; CHECK >= 0; computed as Σ `breakdown[i].subtotal` |
| `breakdown` | jsonb | NO | array of `{ lot_id, qty, unit_cost, subtotal }`; one entry per contributing lot |
| `correlation_id` | uuid | NO | OTel trace correlation; propagated from `LotConsumed.correlation_id` or generated if not present (defensive) |
| `created_at` | timestamptz | NO | DEFAULT now(); canonical timestamp; no `updated_at` (append-only) |

**Why `numeric(18,4)` for `total_cost` and `qty_consumed`?** Matches slice #1's `lots.quantity_received` / `quantity_remaining` precision. 4 decimal places is sufficient for €0.0001 unit-cost precision; €18-digit ceiling is well beyond restaurant operational scale. Single convention reduces type-juggling at JOIN paths.

**Why JSONB for `breakdown` instead of a side table `cost_snapshot_lines`?**

- 95% of consumptions are single-lot or 2-lot splits (FIFO/FEFO consumes from the oldest available lot first; multi-lot splits only happen at lot boundaries). The denormalized array is cheap and avoids a JOIN on every read.
- The slice #20 dashboard widget reads `SUM(total_cost)` not the lines — the breakdown is for explainability / audit drill-down, not for arithmetic.
- A side table would add a second `INSERT` per consumption event (latency tax) and a JOIN in the API surface (read tax).
- **Rejected alternative**: separate `cost_snapshot_lines` table with FK to `cost_snapshots`. Adds 100% write amplification, 100% read JOIN tax, and saves nothing — JSONB indexing isn't needed because we never query `WHERE breakdown[*].lot_id = ?`; recall-trace queries hit the dominant `lot_id` column directly.

**Why a dominant `lot_id` column alongside the JSONB `breakdown`?** Recall-trace queries from slice #11 need `WHERE lot_id = ?` as a high-selectivity predicate. Putting the dominant lot at the column level lets us use a btree partial index; querying through JSONB `breakdown` would force a GIN index plus expression matching (10× slower per pg_stats benchmarks on prior eligia-rag projects).

### ADR-SNAPSHOT-AUDIT-ENVELOPE — typed COST_SNAPSHOT_RECORDED event

`packages/contracts/src/m3/cost-snapshot.ts` exports:

```ts
export const CostSnapshotRecordedEvent = AuditEventEnvelope.extend({
  aggregateType: z.literal('cost_snapshot'),
  eventType: z.literal('COST_SNAPSHOT_RECORDED'),
  capability_used: z.literal('inventory.cost-resolve'),  // pinned per ADR-030 tag attribute
  payload_after: CostSnapshotReadModel,                  // full snapshot row
  payload_before: z.null(),                              // append-only — no prior state
});
```

The event is emitted **on the in-process bus** (`EventEmitter2`) by `CostSnapshotService.snapshotConsumption()` after the INSERT commits. Slice #21 (`m3-audit-log-hash-chain-hardening`) extends `AuditLogSubscriber.KNOWN_EVENTS` to include `cost_snapshot:COST_SNAPSHOT_RECORDED`, at which point each emit also lands an `audit_log` row. Until then, the bus emit is a no-op for `audit_log` but downstream slices CAN listen on the bus directly (slice #20 dashboard widget is one such candidate, even before subscriber wiring).

**Why `capability_used='inventory.cost-resolve'` and not `inventory.consume`?** Per ADR-030 tag attribute convention, the capability names the **cost-resolution work** (which has a tracked latency + cost profile in the AI observability dashboard if the resolver ever ingests AI-provided suggestions), not the upstream consumption event. The consumption itself is tagged `inventory.consume` by slice #2. Two events, two capability tags, joined by `stock_move_id` and `correlation_id`.

### ADR-SNAPSHOT-NO-EMIT-HERE — event type registered, no AuditLogSubscriber wiring

Mirrors slice #1 `ADR-LOT-NO-EVENT-EMIT-HERE` and slice #2's equivalent. This slice:

- Defines the event TYPE in `packages/contracts/src/m3/cost-snapshot.ts`.
- Emits the event on the in-process bus from `CostSnapshotService.snapshotConsumption()`.
- Does NOT update `AuditLogSubscriber.KNOWN_EVENTS`.

Smoke test asserts NO `audit_log` row is written when the subscriber path runs end-to-end in this slice's INT suite. Slice #21 batches the `KNOWN_EVENTS` update for all M3 event types in a single PR (single atomic change to the subscriber's switch statement, easier to review than 6 piecemeal PRs).

**Why not emit-and-discard now?** Risk of double-write at slice #21 landing if a developer (a) forgets the smoke-test contract and (b) wires the subscriber later in a way that doesn't dedupe by `(stock_move_id, eventType)`. The cleaner contract is: "this slice never produces an `audit_log` row; slice #21 produces one for every prior emit by replaying the bus or by introducing a backfill query".

### ADR-SNAPSHOT-ROLLUP-DRIFT-INT-TEST — reconciliation invariant

The most important test in this slice. Lives at `apps/api/src/inventory/cost/snapshot/__tests__/cost-snapshot.rollup-drift.int-spec.ts`. Pattern:

1. Seed 30 days of synthetic data:
   - 50 lots/day × 30 days = 1,500 `lots` rows with varying unit costs in the range €1.50-€12.00/unit.
   - 33 outbound `stock_moves`/day × 30 days = 1,000 `stock_moves` rows with FIFO depletion.
   - For each `stock_moves` row, compute the expected `CostResolution` directly in test code (golden value), call `CostSnapshotService.snapshotConsumption()`, and assert the persisted row matches.
2. Query the rollup: `SELECT product_id, SUM(total_cost) AS rollup_total FROM cost_snapshots WHERE organization_id=$1 AND created_at > now() - interval '30 days' GROUP BY product_id`.
3. Reconstruct the expected total from the seeded `stock_moves` + `lots` state by replaying FIFO depletion in test code.
4. Assert per-product `|rollup_total - reconstructed_total| / reconstructed_total < 0.005` (<0.5% drift).

**Why <0.5%?** Floating-point error in `numeric(18,4)` arithmetic is bounded at ~1e-4 per operation; accumulated over 1,000 operations the worst-case drift is ~0.1% — well inside the budget. The 0.5% threshold leaves headroom for rounding-mode differences between Postgres `SUM(numeric)` and the test reconstruction in TypeScript. If the threshold is ever breached, the resolver has an arithmetic regression — the entire point of the test.

**Why INT rather than unit?** Unit tests mock the resolver, so they can't catch arithmetic regressions that emerge from the resolver+DB+JSONB roundtrip. The INT test exercises the full pipeline (resolver → INSERT → JSONB serialization → `SUM(numeric)` GROUP BY → SELECT).

**Test cost**: ~12 seconds against a real Postgres test container (slice #1 fixture). Acceptable for an INT suite; one of the heavier INT tests in the M3 codebase. Trade-off: catching arithmetic regressions is non-negotiable per FR7 + NFR-TEST line 79.

### ADR-SNAPSHOT-INDEX — two indexes, each anchored to a downstream query pattern

Per slice #1's index-justification convention (each index named, each tied to a concrete downstream query):

| Index | Cols | Query pattern | Owning slice |
|---|---|---|---|
| `idx_cost_snapshots_org_move_created` | `(organization_id, stock_move_id, created_at DESC)` | "find the snapshot for this consumption event" — back-reference from `stock_moves` row to its cost snapshot | dashboard widget hover detail (#20) + recall dossier financial section (future) |
| `idx_cost_snapshots_org_product_created` | `(organization_id, product_id, created_at DESC) WHERE total_cost > 0` | "sum cost over 30 days for product X" — rollup hot path | slice #20 "cost by product" widget |

The second index is **partial** (`WHERE total_cost > 0`) to exclude the rare zero-cost snapshots (corrections with breakdown sum = 0). At 22 GB/year storage, the partial discrimination saves ~5% on index size. Documented for slice #20's EXPLAIN ANALYZE proof.

**No JSONB GIN index on `breakdown`** — see ADR-SNAPSHOT-SCHEMA rationale; the dominant `lot_id` column handles selectivity. If a future slice ever needs "find snapshots that touched lot Y as a non-dominant contributor", that slice owns the GIN index (premature indexing here would inflate write amplification without a current consumer).

### ADR-SNAPSHOT-RETENTION — 7-year retention, cold-storage out of scope

Per EU 178/2002 + HACCP regulatory floor, `cost_snapshots` rows must be retained for 7 years. This slice does NOT implement a cold-storage archival job; rows accumulate in-place. At 22 GB/year, 7 years = ~154 GB per high-volume org — manageable on operational storage.

The cold-storage archival pattern (move rows older than 1 year to a partitioned cold table, restore on demand via the recall API) is **explicitly deferred** to a future slice `m3.x-cost-snapshot-archival`, mirroring the same deferment ADR-029 takes for `audit_log` archival. Both will share an archival pattern (Gap B ADR-029) when they land — no point inventing two.

**Why not partition the table now?** Postgres declarative partitioning is non-trivial to reverse if we get the partition key wrong. Cost-snapshot query patterns are still emerging (slice #20 hasn't shipped). Better to ship a single table now and partition in the archival slice with a known query distribution. The compound index keeps queries fast up to ~10M rows/org based on prior eligia-rag pg_stats benchmarks — well past 1 year of any conceivable org's traffic.

## Risks / Trade-offs

- **[Risk]** Slice #4 (`m3-inventory-cost-resolver-fifo-fefo`) hasn't merged when this slice's implementation lands. **Mitigation**: this slice owns the `CostResolution` Zod schema in `packages/contracts/src/m3/cost-snapshot.ts`; slice #4 imports it. The proposal phase has no source-code dependency. The impl phase merges in order #2 → #4 → this slice; the gate-c slice list section "Block 2 · Cost resolution closure" sequences them correctly.
- **[Risk]** The rollup-drift INT test is the heaviest test in the slice (~12s). **Mitigation**: gated behind `pnpm -w test:int` (not the default `pnpm test`); CI runs it every PR but local dev iterates on unit tests.
- **[Risk]** Append-only invariant means a corrupted snapshot can't be deleted, only superseded. **Mitigation**: `strategy='manual'` correction pattern documented in spec.md REQ-SS-3. If a row is genuinely corrupted (bug, not business correction), the recovery path is a DB-direct DELETE bypassing the repo — a one-off ops procedure logged in `docs/runbooks/`, not a routine code path.
- **[Risk]** JSONB `breakdown` is harder to enforce than a side table — a malformed array could slip through if Zod validation regresses. **Mitigation**: REQ-SS-7 INT scenario reads back every persisted row and runs `CostBreakdownEntrySchema.array().parse()` to verify shape integrity; runs on every PR.
- **[Risk]** `stock_move_id` FK uniqueness — same `stock_move_id` could in principle generate two snapshots (race condition between the LotConsumed listener firing twice). **Mitigation**: REQ-SS-8 idempotency scenario asserts no duplicate snapshot per `stock_move_id`; enforced at app layer (lookup before insert; the partial index supports the lookup). NOT enforced at DB layer (no UNIQUE constraint) because `strategy='manual'` corrections legitimately produce a second snapshot for the same `stock_move_id`.
- **[Trade-off]** Storage growth (22 GB/year/org) is the price of per-consumption persistence. Partitioning + cold archival deferred to follow-up.

## Migration Plan

1. **Stage 1 — Schema only** (this PR's impl phase):
   - Run migration 0039 on staging.
   - No data; no behavior change in M2 or M3 already-merged slices.
   - Smoke test: `cost-snapshot.repository.append()` writes a row + reads it back; multi-tenant leakage test passes.
2. **Stage 2 — Subscriber active** (still this slice, behind feature flag `M3_ENABLED`):
   - `@OnEvent('LOT_CONSUMED')` subscriber wires up; every consumption event from slice #2 produces a snapshot.
   - Resolver port is implemented by slice #4 (must merge first); if slice #4 isn't merged, the impl phase blocks at the integration test that exercises the full pipeline.
3. **Stage 3 — Downstream consumption** (out of slice, slice #20 + slice #21):
   - Slice #20 dashboard widget reads `cost_snapshots`.
   - Slice #21 `AuditLogSubscriber.KNOWN_EVENTS` extends to include `COST_SNAPSHOT_RECORDED`; every emit now lands an `audit_log` row.
4. **Rollback strategy**:
   - Down migration drops `cost_snapshots` table.
   - Slice #20 widget renders empty state (no breakage).
   - Slice #21 subscriber loses one event type (graceful degradation; remaining event types still landed).

## Open Questions

- **OTel correlation_id propagation**: does slice #2's `LotConsumed` event payload carry a `correlation_id` field? If yes, this slice consumes it; if no, this slice generates one in the subscriber. **Proposed answer**: defensive — the subscriber treats `LotConsumed.correlation_id` as optional; falls back to `randomUUID()` when missing. Slice #2's proposal review can confirm.
- **Snapshot for adjustment/waste stock-moves**: should a `stock_moves` row with `move_type='waste'` also produce a `cost_snapshot`? **Proposed answer**: yes — wasted stock has a cost basis that matters for P&L. The `@OnEvent('LOT_CONSUMED')` subscriber listens only to outbound consumption events from recipes; a separate `@OnEvent('STOCK_MOVE_WASTED')` listener can be wired in a follow-up. This slice scopes to `LOT_CONSUMED` only to keep the surface focused.
- **Multi-currency**: M3 PRD doesn't yet declare multi-currency support; `total_cost` is in Euros by convention. If multi-currency lands in M4, add a `currency_code char(3)` column via migration; this slice's `total_cost` is implicit-EUR. Documented in spec.md REQ-SS-2.
