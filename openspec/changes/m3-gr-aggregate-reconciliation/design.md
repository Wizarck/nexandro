## Context

M2 ships supplier + product + ingredient + location + user + audit_log canonical tables. Slice #1 (`m3-lot-aggregate`, merged at `0dab33b`) shipped the `lots` + `stock_moves` foundation with `LotFactory.create()` reserved for **the GR confirmation seam** (slice #1 design.md §ADR-LOT-NO-EVENT-EMIT-HERE). Slice #6 (`m3-po-aggregate`, parallel — branched from same `031c30f` head) ships the `purchase_orders` header + line tables + a `PoStateMachine` with states `draft → sent → partially_received → received → closed`.

This slice (`m3-gr-aggregate-reconciliation`) is the **seam that closes the procurement loop**:

1. A Goods Receipt is the moment supplier-side stock becomes *ours* — by SQL definition, the moment a `lots` row exists for that batch.
2. A Goods Receipt may be linked to a PO line (the common case) OR independent (direct-purchase / petty-cash / hand-typed).
3. When linked to a PO line, GR confirmation transitions the PO's state via the slice #6 state machine.
4. Quantity and price actuals on the GR line are reconciled against the PO line; deltas above the org-configured threshold emit variance events for human review (and eventually for the supplier scorecard in M3.x).

The slice spans 3 invariants that cannot be split further without re-introducing the closeable-loop seam:

- **Atomicity**: GR confirmation either (a) creates all Lots + transitions the PO + emits events, OR (b) leaves the GR in `draft` state with no Lots created. Per-line partial success is not allowed (single DB transaction).
- **Idempotency**: the same PO line cannot be received twice within the same GR (UNIQUE constraint); across multiple GRs, cumulative `qty_received` is bounded by `qty_ordered + tolerance`.
- **Multi-tenant isolation**: every read + write is gated on `organization_id` at the repository (slice #1 pattern, slice #21 audit-chain pattern).

Architecture-m3 line 486 anchors `apps/api/src/procurement/` ownership; line 510 originally numbered migration 0030 for "create_purchase_orders_and_goods_receipts_tables" combined. This slice **splits** the migration:
- Slice #6 claims 0030 for `purchase_orders` + `purchase_order_lines`.
- This slice claims **0031** for `goods_receipts` + `goods_receipt_lines`.

The split lets the two slices land independently. If slice #6 lands first, no conflict; if this slice lands first, the migration runs on a database that has `lots` but no `purchase_orders` (we feature-flag the PO FK creation — see ADR-GR-INDEPENDENT-LOT-NO-PO).

## Goals / Non-Goals

**Goals:**

- A `GoodsReceiptAggregate` (header + lines) with state machine `draft → confirmed → cancelled` (no `partially_confirmed` — confirmation is atomic per ADR-GR-IDEMPOTENCY).
- Single seam — `GrConfirmationService.confirm()` — that orchestrates lot creation + PO state transition + variance detection in one transaction.
- Per-PO-line `qty_received` accumulation across multiple GRs with over-receipt tolerance (default 5%, configurable per org).
- Variance event emission threshold (default 1% qty, 1% price, configurable per org).
- Independent GR support (no PO link) for direct purchases.
- 3 indexes on `goods_receipts` + 2 indexes on `goods_receipt_lines`, each justified by a real downstream query (ops dashboard / PO drill-down / supplier history / parent-child join / idempotency).
- Reservation pattern for audit subscriber registration — event types defined, subscriber wiring deferred to slice #21.

**Non-Goals:**

- PO entity + state machine — slice #6.
- GR draft creation flow — slice #6 (the `procurement.create-goods-receipt` MCP capability is owned by slice #6's Hermes surface; this slice only provides the `confirm()` action).
- GR UI — slice #8.
- Supplier-quality scoring derived from variance history — M3.x followup (PRD line 216).
- Backfill of historical M2 invoices into GR rows — out of MVP.
- StockMove emission on Lot creation — see ADR-GR-LOT-CREATION-SEAM rationale.

## Decisions

### ADR-GR-LOT-CREATION-SEAM — GR confirmation is the ONLY code path that creates Lots

GR confirmation is the **single creation seam** for `lots` rows in M3. No other slice (UI, ingestion, agent capability) writes directly to `lots`; they all flow through `GrConfirmationService.confirm()`.

**One Lot per GR line**: each `goods_receipt_lines` row produces exactly one `lots` row. The mapping is:
- `lots.organization_id` ← `goods_receipts.organization_id`
- `lots.location_id` ← `goods_receipts` carries no `location_id` directly (TODO in open questions); derived from the receiving user's primary location OR a required `received_at_location_id` column on the header. **Decided**: add `received_at_location_id uuid NOT NULL FK locations` to `goods_receipts` header in migration 0031 — cleaner than user-primary-location derivation.
- `lots.supplier_id` ← `goods_receipts.supplier_id`
- `lots.received_at` ← `goods_receipts.received_at` (same server timestamp)
- `lots.quantity_received` ← `goods_receipt_lines.qty_received_actual`
- `lots.quantity_remaining` ← same (set by `LotFactory` invariant from slice #1)
- `lots.unit` ← `products.unit` (looked up via product_id)
- `lots.expires_at` ← derived from `products.shelf_life_days` if present + `received_at`; NULL otherwise
- `lots.metadata` ← `{ supplier_invoice_ref, gr_id, gr_line_id, po_line_id?, unit_price_actual }`

**Why one-Lot-per-line (not aggregate by product)?** If a single GR has 3 lines all of `tomato (product_id=X)` (e.g., 3 crates from same supplier same day), we still create 3 Lots. Reasons:
1. Recall granularity — if one crate has a defect, we recall *that crate*, not all 3.
2. Cost variation — line-level `unit_price_actual` may differ (volume discount tier crossover); each Lot carries its own cost (in metadata).
3. Auditor preference — 1:1 mapping between line and lot is the simplest story to defend in an APPCC inspection.

**Atomicity**: the whole `confirm()` runs in one DB transaction. If `LotFactory.create()` fails on line 3 of 5, NO Lots are created and the GR stays `draft`. Rejected: per-line partial commit (would create a "confirmed" GR with only some Lots, ambiguous state).

**StockMove on creation?** No. Slice #1's `stock_moves` table is for **consumption / waste / adjustment** flows (slice #2). Creating an `inbound` StockMove row here would double-book inventory (the `lots.quantity_received` is the inbound record). M3 design uses `lots.quantity_remaining` materialized + `stock_moves` only for outbound; this slice does NOT emit StockMove rows.

### ADR-GR-IDEMPOTENCY — same po_line_id receives at most once per GR

The `goods_receipt_lines` table has a UNIQUE partial constraint: `UNIQUE (gr_id, po_line_id) WHERE po_line_id IS NOT NULL`. A single GR cannot receive the same PO line twice (would be ambiguous — split into two physical Lots from one PO line is allowed across DIFFERENT GRs, see ADR-GR-PARTIAL-RECEIPT).

**App-side idempotency on retry**: `GrConfirmationService.confirm()` accepts an `Idempotency-Key` header (per Wave 1.13 [3a] pattern from M2). The service computes a hash of `(organization_id, gr_id, [po_line_id sorted], qty_received_actual_per_line)`; on retry with same key, returns the prior result without re-inserting. INT test asserts double-submit returns identical response.

**Rejected**: relying solely on the DB UNIQUE constraint for retry safety. Reason: the constraint catches the duplicate at the database, but the caller receives a 500 they can't distinguish from a "real" conflict; the Idempotency-Key path returns a clean 200 with the prior result.

### ADR-GR-PARTIAL-RECEIPT — a PO line can be received across multiple GRs

A PO line with `qty_ordered=100` can be received as:
- One GR with `qty_received_actual=100` — full receipt, PO transitions to `received`.
- Three GRs with `qty_received_actual=30, 40, 30` — cumulative 100, PO stays `partially_received` after the first two, transitions to `received` after the third.
- Three GRs with `qty_received_actual=30, 40, 25` — cumulative 95, PO stays `partially_received` indefinitely (until manually closed or the next GR).

**Accumulator invariant**: `SUM(goods_receipt_lines.qty_received_actual WHERE po_line_id = X AND state='confirmed') <= purchase_order_lines.qty_ordered * (1 + tolerance)`. Tolerance is the over-receipt threshold from ADR-GR-OVER-RECEIPT.

**Implementation**: `GrConfirmationService.confirm()` reads the running sum from `goods_receipt_lines` joined on `purchase_order_lines` before validating; rejects if the new line would push cumulative over `qty_ordered * (1 + tolerance)`. INT test seeds 2 prior GRs + asserts the 3rd is rejected if it pushes over.

**Rejected alternative**: maintaining a materialized `purchase_order_lines.qty_received_cumulative` column. Cost: another invariant to keep in sync (similar to slice #1's `lots.quantity_remaining` decision but here the read pattern is colder — only on receipt). On-demand SUM with the right index (the line's `(po_line_id)` partial index from slice #6) is < 5ms at our scale.

### ADR-GR-OVER-RECEIPT — configurable tolerance, default 5%, hard reject above

When `SUM(qty_received) > qty_ordered`, the **over-receipt tolerance** decides whether the new GR line is accepted:

- Default tolerance: **5%** for bulk goods (kg, g, L, ml — natural physical variance). The number reflects industry practice for fresh produce + dry goods where ordering 50 kg can plausibly arrive as 52 kg.
- Default tolerance: **0%** for discrete units (un) — you can't receive 11 boxes when you ordered 10 without an explicit override.
- Per-org override: `organizations.metadata->>'gr_over_receipt_tolerance_pct'` (jsonb, decimal 0.00-0.25). Read by `GrConfirmationService` at the start of `confirm()`. Cached LRU per request (no DB hit per line).
- Above tolerance: **hard reject** with `OverReceiptError`. UI (slice #8) surfaces the error inline and offers "split into two GRs" or "cancel + reorder" actions.

**Why not auto-accept all overages?** Inventory waste + budget overruns. The food-safety auditor expects a deliberate human action when receiving more than ordered (the auditor's question: "why did you accept 110 kg when you ordered 100?"). Hard reject with explicit override forces that decision into the audit trail.

**Why not zero tolerance everywhere?** Bulk goods physically vary. Forcing zero would mean every receipt has to be re-typed to match the actual weight, defeating the PO → GR efficiency goal. The 5%/0% split is the simplest practical balance; org override handles edge cases (premium / restaurant / processed food differs from fresh produce).

### ADR-GR-VARIANCE-THRESHOLDS — 1% default for qty + price, configurable per org

Variance events fire when the actual deviates from the PO line beyond a threshold:

- **Quantity variance**: `|qty_received_actual - qty_ordered| / qty_ordered > threshold_qty` (default 1%).
- **Price variance**: `|unit_price_actual - unit_price_ordered| / unit_price_ordered > threshold_price` (default 1%).

**Configurability**: `organizations.metadata->>'gr_variance_thresholds'` is a jsonb `{ qty: 0.01, price: 0.01 }` (0.00 to 0.25 range). Default = 1% qty + 1% price. UI surfaces an "Org Settings → Variance" form (slice #8 owns the UI, not us — we own the read at service-layer).

**Floor on small quantities**: when `qty_ordered < 5 units` OR `unit_price_ordered < 0.50 EUR`, the relative-percent threshold is augmented by an absolute floor (`abs_delta_qty >= 1.0 unit` OR `abs_delta_price >= 0.10 EUR`) to avoid noisy events on small orders (1 → 2 units is 100% delta but only 1 unit absolute). The floor is org-configurable in the same jsonb.

**Event emission semantics**:
- If only qty crosses threshold → emit `GR_LINE_QTY_VARIANCE` only.
- If only price crosses → emit `GR_LINE_PRICE_VARIANCE` only.
- If both → emit BOTH events (two separate envelopes for orthogonal downstream consumers — the supplier-scorecard subscriber may care about price-only; the inventory-reconciliation subscriber may care about qty-only).
- If neither → no variance event; `GR_CONFIRMED` is still emitted.

**Rejected**: a single combined `GR_LINE_VARIANCE` event with a `kind: 'qty' | 'price' | 'both'` discriminator. Reason: forces every downstream subscriber to filter on `kind`, harder to evolve as we add new variance dimensions (e.g. `GR_LINE_EXPIRY_VARIANCE` for early-expiry stock).

### ADR-GR-INDEPENDENT-LOT-NO-PO — GR can have `po_id IS NULL` for direct purchases

Not every Lot in the kitchen comes from a formal PO. Petty-cash / market-stall / emergency purchases happen, and the auditor still wants traceability (FR4 — "each linking received quantity to discrete lot metadata"). The GR aggregate supports an **independent receipt mode**:

- `goods_receipts.po_id IS NULL` allowed at DB level.
- `goods_receipts.supplier_id` still required (even for petty cash, a supplier must be identified — even if it's a generic "Local Market" supplier seeded per org).
- `goods_receipt_lines.po_line_id IS NULL` for all lines of an independent GR.
- `goods_receipt_lines.product_id` still required (no Lot can be created without a canonical product).
- `unit_price_actual` is whatever was paid (no comparison since no PO line to compare against).
- Variance events do NOT fire (no PO line baseline).
- `GR_CONFIRMED` event DOES fire.

**App-side validator**: in `GrConfirmationService.confirm()`, if `po_id IS NULL` then ALL lines must have `po_line_id IS NULL` (and vice versa). Mixed mode is rejected with `IndependentGrMissingSupplierError` (despite the name, the validator runs for both shape mismatches).

**Rationale**: trying to "fake" a PO for petty cash purchases creates worse data (the PO has no real `qty_ordered` to reconcile against, so variance noise floods the dashboard). Explicit independent mode is cleaner.

### ADR-GR-NO-AUDIT-EMIT-HERE — events registered, not emitted (slice #21 wires subscriber)

Mirroring slice #1's ADR-LOT-NO-EVENT-EMIT-HERE pattern. This slice DEFINES three event types in `packages/contracts/src/m3/procurement-gr.ts`:

- `GR_CONFIRMED` — emitted on successful `confirm()`.
- `GR_LINE_QTY_VARIANCE` — emitted per offending line on `confirm()`.
- `GR_LINE_PRICE_VARIANCE` — emitted per offending line on `confirm()`.

It does NOT register an `@OnEvent` subscriber in `apps/api/src/audit-log/audit-log.subscriber.ts`. Slice #21 (`m3-audit-log-hash-chain-hardening`) adds all M3 event types to the subscriber's `KNOWN_EVENTS` set in a single batch update + applies hash-chain hardening to the audit envelope shape.

**Smoke test in INT suite**: after `confirm()` succeeds, assert `SELECT COUNT(*) FROM audit_log WHERE aggregate_id = grId` returns 0. This catches accidental subscriber wiring during development. Same test pattern as slice #1.

**Why not emit-and-discard?** Risk of double-write when slice #21 wires it (the subscriber would consume the event AGAIN from the still-running emitter). Plus the audit envelope shape is not finalized until slice #21's hash-chain migration lands.

### ADR-GR-PO-STATE-TRANSITION — confirming a GR auto-transitions linked PO state

When `GrConfirmationService.confirm()` succeeds AND `po_id IS NOT NULL`, the orchestrator calls `PoStateMachine.transitionFromGrConfirmation(poId, grLines)` (slice #6's surface). The state machine logic:

- Compute cumulative `qty_received_total` per PO line across ALL confirmed GRs.
- If every PO line has cumulative `>= qty_ordered * (1 - 0)` (i.e., 100% or more, ignoring under-receipt tolerance) → transition PO `partially_received → received`.
- If at least one PO line has cumulative `> 0` but at least one is `< qty_ordered` → transition PO `sent → partially_received` (or stay `partially_received` if already there).
- If a PO is already `received` and a new GR pushes over tolerance → blocked at the over-receipt check before reaching the state machine.

**Decoupling**: this slice does NOT inline the state-transition logic; we call `PoStateMachine.transitionFromGrConfirmation()` as an opaque function from slice #6. If slice #6's contract changes, this slice's tests catch via integration but the unit tests mock the state machine.

**Feature flag for slice #6 readiness**: `M3_PO_AGGREGATE_ENABLED=true` env var (defaults false). When false, `GrConfirmationService.confirm()` rejects any `po_id IS NOT NULL` with a clear error (`'PO aggregate not yet enabled in this deployment'`). Independent GRs (po_id NULL) still work. When slice #6 merges, ops flips the flag to true. This makes the slice mergeable independently of slice #6.

**Rejected**: try/catch around the `PoStateMachine` import. Reason: a missing module at import time crashes the whole NestJS bootstrap, not just the affected request. Feature flag is the cleaner gate.

### ADR-GR-INDEXES — 3 indexes on header, 2 on lines, each anchored to a real query

| Table | Index | Cols | Query pattern | Owning consumer |
|---|---|---|---|---|
| `goods_receipts` | `idx_gr_org_received` | `(organization_id, received_at DESC)` | ops dashboard "most recent GRs" | slice #8 dashboard, slice #11 incident search |
| `goods_receipts` | `idx_gr_org_po` | `(organization_id, po_id) WHERE po_id IS NOT NULL` | PO drill-down "show all GRs for this PO" | slice #8 drawer |
| `goods_receipts` | `idx_gr_org_supplier_received` | `(organization_id, supplier_id, received_at DESC)` | supplier history "all GRs from supplier X last N days" | slice #11 incident search, slice #14 APPCC bundle |
| `goods_receipt_lines` | `uniq_gr_line_po_line` | UNIQUE `(gr_id, po_line_id) WHERE po_line_id IS NOT NULL` | idempotency per ADR-GR-IDEMPOTENCY | this slice's invariant |
| `goods_receipt_lines` | `idx_gr_line_gr` | `(gr_id)` | parent-child join from header drawer | slice #8 drawer |

**Why no `(organization_id)` on `goods_receipt_lines`?** Tenancy isolation goes through the parent `goods_receipts.organization_id` via the FK; queries always join header → lines. INT test asserts every line query goes via the header (no orphan-line scan).

**Why no index on `lot_id_created`?** It's populated AFTER confirmation and is never queried as the search key (the inverse — `lots → goods_receipt_lines` — is the join direction, and `lots.id` is the PK there). If a downstream slice needs to find "which GR line spawned this lot", they JOIN on `lot_id_created` and accept a small per-request scan (only one row matches because of the 1:1 invariant). Slice #14 (APPCC) is the most likely consumer; we revisit if profiling shows pain.

### ADR-GR-MONEY-PRECISION — unit_price_actual is numeric(12,4)

`unit_price_actual` uses `numeric(12,4)` (8 integer digits + 4 fractional). Rationale:
- 4 fractional digits — matches `lots.quantity_received` precision and survives × N quantity multiplications without rounding error.
- 12 total — handles prices up to 99,999,999.9999 EUR. A single unit price will never realistically exceed this; LINE total can be larger but we don't store totals (derived).

**Currency**: implicit per organization (single-currency MVP per PRD scope). Future multi-currency adds a `currency_code text` column on the GR header (NOT on each line). Out of MVP scope.

**Rejected alternatives**:
- `money` Postgres type — locale-dependent formatting, not portable, generally avoided.
- `numeric(18,4)` — overkill for unit price; we already use `numeric(18,4)` for `quantity_received` because quantities aggregate up large in lots.

## Risks / Trade-offs

- **[Risk] Slice #6 not merged before this slice**: handled via `M3_PO_AGGREGATE_ENABLED` feature flag (ADR-GR-PO-STATE-TRANSITION). When false, only independent GRs work; PO-linked confirmation rejects with clear error. **Trade-off**: ops complexity (one more env var to flip).
- **[Risk] Migration 0031 numbering conflict** with the architecture-m3's originally-planned `0031_create_ai_pricing_table`. Mitigation: AI-obs slice (#15-ish) is in Track B (parallel block), not yet drafted in openspec/changes/; when it ships, it can re-number to 0032+. The architecture-m3 line 506-518 numbering is **planning-time** — actual claims happen at slice merge order. Track this in the slice's tasks.md (task 12.3: rename if needed at rebase).
- **[Risk] LotFactory.create() signature** from slice #1: we assume `(input: CreateLotInput): Lot` returning a hydrated entity ready for persistence. If slice #1's `CreateLotInput` is missing fields we need (e.g., we want to pass `gr_line_id` for metadata), we extend it via a follow-on PR. Verified at slice-#1 spec.md line 86-92 (`LotReadModel` includes `metadata jsonb` open shape).
- **[Risk] Variance event noise on first-month operations**: 1% threshold is tight; expect ~5-10 variance events per GR initially as supplier price lists drift. Mitigation: org-level threshold override is in scope; default can be retuned post-pilot.
- **[Risk] Over-receipt tolerance per-org override** adds query complexity: every `confirm()` reads org.metadata. Mitigation: LRU cache (per-request scope, NestJS request-scoped provider) — same pattern as M2 audit-log circuit-breaker config.
- **[Trade-off] Atomicity vs. observability**: a failed `confirm()` rolls back ALL Lot inserts — so the operator never sees "lot 1 of 5 was created". UI must surface "all-or-nothing" semantics clearly. Slice #8 handles the UX; we document in the API response shape.
- **[Trade-off] Single transaction span**: `confirm()` holds a DB transaction across N Lot inserts + 1 PO state transition + N+1 GR row inserts. At 20 lines this is ~22 SQL roundtrips. Budget: p95 < 200ms; if profiling shows tail, switch to a single multi-VALUES insert for `goods_receipt_lines` (TypeORM's `repository.insert([...])` supports it).
- **[Trade-off] No StockMove emission on Lot creation**: simpler invariant (one inbound row per receipt = the `lots.quantity_received` itself) but downstream code that wants a unified "flow log" via `stock_moves` will need to UNION with `lots` for the inbound side. Slice #2 (consumption events) addresses by treating the Lot creation as the implicit inbound move; the audit subscriber renders both consistently.

## Migration Plan

1. **Stage 1 — Schema only** (this PR):
   - Run migration 0031 on staging (creates `goods_receipts` + `goods_receipt_lines` + 5 indexes).
   - No data; no behavior change in M2.
   - Smoke test: insert one independent GR (no PO link) via `GrConfirmationService.confirm()`, verify one Lot row was created.
2. **Stage 2 — PO integration** (after slice #6 merges):
   - Flip `M3_PO_AGGREGATE_ENABLED=true` on staging.
   - Run INT test suite with PO-linked GRs.
   - Push to prod env var change.
3. **Stage 3 — UI activation** (slice #8 merge):
   - GR drawer + reconciliation view start consuming `GrRepository` reads.
   - No backend change needed.
4. **Rollback strategy**:
   - Down migration: drop `goods_receipt_lines` → drop `goods_receipts`.
   - Any `lots` row created via this slice's `confirm()` remains valid (orphan but uncorrupted; `lots.metadata.gr_id` becomes a dangling reference but metadata is open-shape).
   - If slice #6 already shipped + integrated, also revert any PO state transitions caused by this slice's GRs — manual SQL replay from `audit_log` (slice #21 makes this scriptable).

## Open Questions

- **Location semantics**: `goods_receipts.received_at_location_id` — should this be the kitchen-level location (M2 Location entity) or a sub-zone (cold-room / dry-store / freezer)? **Proposed answer**: kitchen-level for MVP; sub-zone is M3.x followup tracked as `m3-lot-location-zones`. The `lots.location_id` mirrors this choice.
- **PO line vs. PO header reference**: `goods_receipt_lines.po_line_id` references the line directly. Should we also store `goods_receipts.po_id` (header)? **Decided**: yes — header denormalizes the relationship for "all GRs for this PO" query (slice #8 drawer) without joining through every line. Cost: 16 bytes per GR row; INT test asserts `goods_receipts.po_id` matches `goods_receipt_lines.po_line_id → purchase_order_lines.po_id` for every confirmed GR with `po_id IS NOT NULL`.
- **GR line `expires_at_actual`**: should the operator be able to override the product's default shelf-life on a per-line basis (e.g., "this batch of tomatoes has a 5-day expiry sticker, not the standard 7-day")? **Proposed answer**: yes, optionally via `goods_receipt_lines.expires_at_override timestamptz NULL`. If set, `LotFactory.create()` uses it; if NULL, falls back to `received_at + product.shelf_life_days`. We add this column in migration 0031 from the start (cheaper than a follow-up ALTER TABLE).
- **Per-line `gross_weight` vs. `net_weight`**: not modeled in MVP — `qty_received_actual` is the net (usable) weight. If supplier invoices report gross + tare, the operator subtracts before entering. Modeling gross separately is M3.x.
- **Multi-currency GR lines for cross-border supplier**: out of MVP; ADR-GR-MONEY-PRECISION notes the future column shape but doesn't add it now.
- **Cancelled GR semantics**: once a GR is `cancelled` (after being `confirmed`), do we reverse the Lots? **Proposed answer**: NO — slice scope is forward-only state. Cancellation of a confirmed GR requires a separate "negative receipt" / inventory adjustment flow, handled in M3.x. The `state='cancelled'` transition is only valid from `state='draft'`. Validator enforces; INT test asserts.
