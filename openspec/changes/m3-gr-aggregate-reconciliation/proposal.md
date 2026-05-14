## Why

M3's procurement loop is **PO → Goods Receipt → Lot creation → reconciliation against the supplier invoice**. Slice #1 (`m3-lot-aggregate`, merged at `0dab33b`) shipped the `lots` + `stock_moves` foundation but **explicitly reserved lot creation for this slice** (slice #1 design.md §ADR-LOT-NO-EVENT-EMIT-HERE: "Lot creation / mutation flows. Reserved for `m3-gr-aggregate-reconciliation` (#7)"). Slice #6 (`m3-po-aggregate`, parallel) ships the `purchase_orders` table + state machine. **Neither slice closes the procurement loop on its own** — the loop only closes when a Goods Receipt is confirmed, because that is the moment supplier inventory becomes *ours*: a new `Lot` row is materialized, the PO line is marked received (fully or partially), and any quantity/price discrepancy against the PO line is surfaced as a reconciliation event for human review.

The PRD assigns two functional requirements to this slice:

- **FR4** — "System can generate one or more `Lot` records on Goods Receipt confirmation, each linking received quantity to discrete lot metadata (supplier, received_date, invoice_ref, expiry_date)" (`prd-m3.md` line 529).
- **FR5** — "Owner / Manager can reconcile a Goods Receipt against the supplier invoice, surfacing price + quantity differences for review" (`prd-m3.md` line 530).

Architecture-m3 reinforces this seam: `apps/api/src/procurement/` houses `PurchaseOrder`, `GoodsReceipt`, and the **PO/GR reconciliation service**, and depends on `lot` (creates lots on GR) + `suppliers` from M2 (`architecture-m3.md` line 486). The slice contract row in `gate-c-slice-list-m3-2026-05-14.md` line 71 confirms: **size L** (large — lot creation seam + variance detection + per-PO-line accumulation + idempotency invariants).

This slice is the **structural backbone** of Block 3 (Procurement). Slice #8 (`m3-procurement-ui`) cannot ship without it (drawer + line list + reconciliation view consume the GR aggregate), and slice #14 (`m3-appcc-export-bundle-service`) cites GR rows by `received_at + supplier_id` in the inspection bundle. Slice #11 (`m3-incident-search`) anchors recall queries against `(supplier_id, received_at)` on GR header. Block 3 closes when this slice + #6 + #8 are all merged.

## What Changes

- **Migration `0031_create_goods_receipts_tables.ts`** — two new tables:
  - **`goods_receipts`** (header) with 9 columns:
    - `id uuid PK`, `organization_id uuid NOT NULL` (multi-tenant gate)
    - `po_id uuid NULL FK purchase_orders` (NULL allowed: direct-purchase / petty-cash GR with no PO — see ADR-GR-INDEPENDENT-LOT-NO-PO)
    - `supplier_id uuid NOT NULL FK suppliers` (always required, even when PO is null)
    - `received_at timestamptz NOT NULL` (server timestamp; FR42)
    - `receiving_user_id uuid NOT NULL FK users` (actor attribution snapshot anchor)
    - `supplier_invoice_ref text NULL` (free-text invoice reference; matched against ingestion or typed by hand)
    - `state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','confirmed','cancelled'))`
    - `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`
    - 3 indexes per ADR-GR-INDEXES:
      - `(organization_id, received_at DESC)` — ops dashboard "most recent GRs"
      - `(organization_id, po_id) WHERE po_id IS NOT NULL` — PO drill-down "show all GRs for this PO"
      - `(organization_id, supplier_id, received_at DESC)` — supplier history "show all GRs from this supplier last N days"
  - **`goods_receipt_lines`** (detail) with 9 columns:
    - `id uuid PK` (called `gr_line_id` in the row contract)
    - `gr_id uuid NOT NULL FK goods_receipts ON DELETE CASCADE`
    - `po_line_id uuid NULL FK purchase_order_lines` (NULL when GR is independent of any PO — ADR-GR-INDEPENDENT-LOT-NO-PO)
    - `product_id uuid NOT NULL FK products` (canonical product, always required — without it, no Lot can be created)
    - `qty_received_actual numeric(18,4) NOT NULL CHECK (qty_received_actual >= 0)`
    - `unit_price_actual numeric(12,4) NOT NULL CHECK (unit_price_actual >= 0)` (per-unit; money precision per ADR — see design)
    - `lot_id_created uuid NULL FK lots` (populated on GR confirmation; NULL while line is draft)
    - `created_at`/`updated_at`
    - 2 indexes per ADR-GR-INDEXES:
      - UNIQUE `(gr_id, po_line_id) WHERE po_line_id IS NOT NULL` — idempotency per ADR-GR-IDEMPOTENCY
      - `(gr_id)` for the parent-child join from header drawer
- **`apps/api/src/procurement/gr/`** new BC under the `procurement` module:
  - `domain/goods-receipt.entity.ts` + `goods-receipt-line.entity.ts` — TypeORM entities; **numericTransformer hoisted ABOVE class declarations** per Wave 2.1 lesson (TS2448 hoisting cascade).
  - `domain/errors.ts` — `IllegalGrTransition`, `OverReceiptError`, `PoLineAlreadyReceivedError`, `GrLineInvariantError`, `IndependentGrMissingSupplierError`.
  - `application/gr-confirmation.service.ts` — orchestrator: validate input → call `Lot.create()` per line (via slice #1's `LotFactory`) → if PO linked, call `PoStateMachine.transitionFromGrConfirmation()` (slice #6's surface) → assess qty + price variance thresholds → persist GR with `state='confirmed'`.
  - `application/variance-detector.ts` — pure function `detectVariance(poLine, grLine, thresholds): VarianceResult` returning typed enum `'none' | 'qty' | 'price' | 'both'` + the actual delta values for the eventual event payload. Thresholds default to 1% qty + 1% price (per ADR-GR-VARIANCE-THRESHOLDS) but consult an org-level override read from `organizations.metadata->>'gr_variance_thresholds'`.
  - `application/gr.repository.ts` — multi-tenant by `organizationId` (every query gates on it, per the slice #1 ADR-LOT-MULTITENANT-AT-REPO pattern).
  - `gr.module.ts` — wires entities + service + repository.
- **`apps/api/src/procurement/gr/types.ts`** — inline shared types per Wave 2.1 lesson (avoid TS2448 cascade with circular imports): `CreateGrInput`, `GrLineInput`, `VarianceResult`, `VarianceThresholds`.
- **`packages/contracts/src/m3/procurement-gr.ts`** — typed event envelopes:
  - `GR_CONFIRMED` (payload: GR read model with all lines + their lot_id_created)
  - `GR_LINE_QTY_VARIANCE` (payload: gr_line_id + po_line_id + qty_ordered + qty_received_actual + delta_pct + threshold_pct)
  - `GR_LINE_PRICE_VARIANCE` (payload: gr_line_id + po_line_id + unit_price_ordered + unit_price_actual + delta_pct + threshold_pct)
- **Module wiring**: `apps/api/src/procurement/procurement.module.ts` re-exports `GrModule`; `app.module.ts` imports `ProcurementModule` behind `M3_ENABLED=true` gate per M2 wave-1.x convention.
- **NO new MCP capability surface** in this slice (`procurement.create-goods-receipt` is defined in slice #6 alongside `procurement.create-purchase-order`; the Hermes capability that ingests an invoice photo and writes a GR draft is owned by slice #15-ish photo-ingestion).
- **BREAKING**: none. Slice #1's `lots` table and slice #6's `purchase_orders` table are untouched at the schema level; this slice adds new tables that FK into both.

## Capabilities

### Added Capabilities

- `procurement-gr-reconciliation`: GoodsReceipt aggregate + lot creation seam + variance event registration. Owns `apps/api/src/procurement/gr/` and migration 0031. Surfaces:
  - `GrConfirmationService.confirm(input, actor)` — the **only** code path that may create a Lot in M3.
  - `GrRepository.findById`, `findByPoId`, `findBySupplierAndDateRange` — read-only listings for slice #8 (UI), slice #11 (incident search), slice #14 (APPCC bundle).
  - Event types `GR_CONFIRMED`, `GR_LINE_QTY_VARIANCE`, `GR_LINE_PRICE_VARIANCE` registered in `packages/contracts/src/m3/procurement-gr.ts`. **Subscriber registration is reserved for slice #21** (`m3-audit-log-hash-chain-hardening`) per ADR-GR-NO-AUDIT-EMIT-HERE — same pattern slice #1 used for `LOT_CREATED`.

### Modified Capabilities

- `inventory-lots` (slice #1): **consumer** of `LotFactory.create()` — this slice is the first real caller. Slice #1 reserved this seam explicitly; we activate it. No code change inside `apps/api/src/inventory/lot/` — we import and call.
- `procurement-po` (slice #6, parallel): **consumer** of `PoStateMachine.transitionFromGrConfirmation()`. This method is part of slice #6's design surface; if slice #6 has not merged, the integration code is gated behind a feature flag `M3_PO_AGGREGATE_ENABLED=true` (defaults false) — see Risks below.

## Impact

- **Prerequisites**:
  - Slice #1 (`m3-lot-aggregate`) — MERGED at `0dab33b`. `LotFactory.create()` + `LotRepository` available.
  - Slice #6 (`m3-po-aggregate`) — parallel; this slice's PR opens with a defensive feature flag so it is **mergeable independently** of slice #6 ordering. See Risks → "Slice #6 not merged".
  - M2 wave 1.x: `suppliers`, `products`, `users`, `organizations`, `locations`, `audit_log` tables all present from M2.
- **Code**:
  - `apps/api/src/procurement/gr/` (new BC: domain + application + module). ~850 LOC.
  - `apps/api/src/procurement/procurement.module.ts` (new wrapper, ~20 LOC).
  - `apps/api/src/migrations/0031_create_goods_receipts_tables.ts`. ~180 LOC.
  - `packages/contracts/src/m3/procurement-gr.ts` (3 event envelopes + Zod schemas + read DTOs). ~140 LOC.
  - Tests: ~35 unit + ~12 INT new tests across service + variance detector + repository + module wiring.
- **Performance**:
  - Tables created empty; no perf concern at landing.
  - Hot path is `GrConfirmationService.confirm` — one transaction wraps: validate input + N `Lot` inserts + 1 `goods_receipts` insert + N `goods_receipt_lines` inserts + optional PO state transition. Budget: p95 < 200ms for a typical GR (≤ 20 lines). Asserted by INT test.
  - The 3 GR-header indexes + 2 line indexes are sized for ~50 GRs/day/org × 30 orgs × 365 days = ~550k header rows/year, ~4.4M line rows/year. Multi-tenant gate keeps per-org scan footprint small.
- **Storage growth**: ~140 bytes per `goods_receipts` row + ~200 bytes per `goods_receipt_lines` row. At year-1 scale: ~80 MB header + ~880 MB lines = ~1 GB total. Negligible.
- **Audit**: 3 new event types registered in `packages/contracts/src/m3/procurement-gr.ts` (typed `AuditEventEnvelope` shape). **No `audit_log` row is written by this slice** — slice #21 wires the `AuditLogSubscriber` to consume these events in a single batch update across all M3 BCs. Smoke test in INT suite asserts the absence of audit rows after `confirm()`, mirroring slice #1's pattern.
- **Rollback**: down migration drops `goods_receipt_lines` then `goods_receipts` (FK order). No data depends on these tables yet (slices #8, #11, #14 not yet merged). M2 + slice #1's `lots` table is untouched; if any `Lot` was created via this slice's `confirm()` before rollback, those Lot rows remain valid (orphan but not corrupt — `lot_id_created` FK is dropped with the lines table).
- **Out of scope** (claimed by other slices, do not pre-empt):
  - PO entity + state machine — slice #6 (`m3-po-aggregate`).
  - GR UI (PoTable, PoDetailDrawer, GrLineList, GrLineDrawer, ReconciliationView) — slice #8 (`m3-procurement-ui`).
  - Hermes MCP capability `procurement.create-goods-receipt` — slice #15-ish photo-ingestion + agent surface (consumes this BC's service).
  - APPCC bundle reference to GR rows — slice #14 (`m3-appcc-export-bundle-service`).
  - Recall incident search anchored by (supplier_id, received_at) on GR — slice #11 (`m3-incident-search`).
  - StockMove emission on Lot creation — out of MVP scope (`stock_moves` rows are emitted by consumption flow in slice #2, not on receipt; lot creation only writes to `lots`).
  - AuditLog subscriber registration for `GR_*` events — slice #21 (`m3-audit-log-hash-chain-hardening`).
- **Parallelism**:
  - Hard dependency: slice #1 (merged).
  - Soft dependency: slice #6 (parallel; feature-flagged integration if not merged).
  - File-path disjoint from all other Wave 2.2 parallel subagents (we own `apps/api/src/procurement/gr/`, migration 0031, and `packages/contracts/src/m3/procurement-gr.ts` exclusively).

## Effort

**L (Large)** — per gate-c slice contract. Drivers:

1. Lot creation seam — first slice to actually wire `LotFactory.create()` end-to-end; INT test must validate multi-tenant isolation across GR + Lot together.
2. Variance detection with org-level threshold override — pure logic but needs property-based fuzz testing (1% boundary fencepost).
3. Per-PO-line accumulation across multiple GRs — idempotency invariant + over-receipt tolerance check.
4. Defensive feature flag for slice #6 readiness — adds branching in `confirm()` that must be tested both ways.
5. 3 event envelope types + read DTOs in contracts package.

Estimated implementation time post-merge of slice #6: ~5–7 working days for `/opsx:apply` + babysit cycle (per Wave 2.1 subagent cascade pattern, 30–45 min CI babysit per fix-commit; expect 5–10 fix commits).
