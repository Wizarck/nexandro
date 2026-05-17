## Why

M3 introduces operational procurement — every restocking cycle starts with a `PurchaseOrder` (PO) sent to a supplier, then closes when goods are received and reconciled. Today, nexandro has no `PurchaseOrder` entity: M2 ships `suppliers` (Wave 1.x, `apps/api/src/suppliers/`) and supplier_items, but every downstream procurement flow assumes a PO record exists.

Two downstream M3 slices block on this foundation:

| Slice | Will FK / depend on `purchase_orders.id` |
|---|---|
| `m3-gr-aggregate-reconciliation` (#7) | GR confirms a PO line and creates `lots` rows; needs `po_id` + `po_line_id` FKs |
| `m3-procurement-ui` (#8) | Operator surface (j11 procurement table) lists POs, drives state transitions, edits drafts |

This slice ships the **procurement.po bounded context** — `PurchaseOrder` + `PurchaseOrderLine` entities, state machine, PO-number counter, repository, factory, indexes — **without** receipt reconciliation, GR coupling, or UI. It is **foundation-only** for block 3 (Procurement) of the M3 slice list. Until this lands, slices #7 and #8 cannot start.

## What Changes

- **Migration `0030_create_purchase_orders.ts`** — three new tables:
  - **`purchase_orders`** (15 columns):
    - `id uuid PK`, `organization_id uuid NOT NULL`, `supplier_id uuid NOT NULL FK suppliers`
    - `po_number text NOT NULL` (human-readable, `PO-{YYYY}-{nnnn}`)
    - `state text NOT NULL CHECK (state IN ('draft','sent','partially_received','received','closed','cancelled'))`
    - `currency text NOT NULL CHECK (length(currency) = 3)` (ISO 4217)
    - `subtotal numeric(18,4) NOT NULL DEFAULT 0`, `vat_total numeric(18,4) NOT NULL DEFAULT 0`, `total numeric(18,4) NOT NULL DEFAULT 0`
    - `expected_delivery_date date NULL`, `notes text NULL`
    - `created_by_user_id uuid NOT NULL FK users`, `sent_at timestamptz NULL`, `closed_at timestamptz NULL`
    - `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
    - 3 indexes (see ADR-PO-INDEXES).
  - **`purchase_order_lines`** (11 columns):
    - `id uuid PK`, `purchase_order_id uuid NOT NULL FK purchase_orders ON DELETE CASCADE`
    - `organization_id uuid NOT NULL` (denormalized for tenant gate)
    - `line_number int NOT NULL`, `ingredient_id uuid NOT NULL FK ingredients`
    - `quantity_ordered numeric(18,4) NOT NULL CHECK (quantity_ordered > 0)`
    - `unit text NOT NULL CHECK (unit IN ('kg','g','L','ml','un'))`
    - `unit_price numeric(18,4) NOT NULL CHECK (unit_price >= 0)`
    - `vat_rate numeric(5,4) NOT NULL DEFAULT 0` (e.g. `0.21` = 21%)
    - `vat_inclusive boolean NOT NULL DEFAULT false`
    - `line_subtotal numeric(18,4) NOT NULL`, `line_vat numeric(18,4) NOT NULL`, `line_total numeric(18,4) NOT NULL`
    - `UNIQUE (purchase_order_id, line_number)`
  - **`po_counters`** (3 columns):
    - `organization_id uuid NOT NULL`, `year int NOT NULL`, `next_value int NOT NULL DEFAULT 1`
    - `PRIMARY KEY (organization_id, year)`
    - Row-locked via `SELECT ... FOR UPDATE` for monotonic allocation.
- **`apps/api/src/procurement/po/`** new BC: `PurchaseOrder` + `PurchaseOrderLine` entities, state-machine pure module, repository, factory, PoCounterService, PoNumberService, errors module, NestJS PoModule.
- **State machine**: `draft → sent → partially_received → received → closed`. Terminal `cancelled` reachable from `draft`, `sent`, `partially_received` only (never from `received` or `closed`). Illegal transitions raise `IllegalStateTransitionError`.
- **`packages/contracts/src/m3/po.ts`** — 6 new event-envelope types: `PO_CREATED`, `PO_SENT`, `PO_RECEIVED_PARTIAL`, `PO_RECEIVED_FULL`, `PO_CANCELLED`, `PO_CLOSED`. Types registered, NOT emitted (claimed by slice #21 batch wiring per Wave 2.1 pattern).
- **BREAKING**: none. M2 suppliers and ingredients unchanged.

## Capabilities

### New Capabilities

- `procurement-po-aggregate`: canonical `PurchaseOrder` + `PurchaseOrderLine` entities, deterministic state machine, per-org monotonic PO numbering, multi-tenant-gated repository, read+write factory. Foundation for FR-PO-1 (PO creation), FR-PO-2 (PO send), FR-PO-3 (PO state transitions). Does NOT include GR reconciliation (slice #7), audit-log emission (slice #21), or operator UI (slice #8).

### Modified Capabilities

- None. M2 supplier surface unchanged. Hard FK `purchase_orders.supplier_id → suppliers.id` (NOT NULL, NO ACTION on delete) prevents supplier deletion while any PO references it; existing supplier CRUD picks this up naturally.

## Impact

- **Prerequisites**: M2 supplier BC merged (`apps/api/src/suppliers/`, verified present). M3 slice #1 (lot-aggregate) merged (foundation; not a hard dependency for this slice but informs the numeric convention).
- **Code**:
  - `apps/api/src/procurement/po/` (new BC: domain + application + infrastructure + module). ~800 LOC.
  - `apps/api/src/migrations/0030_create_purchase_orders.ts`. ~180 LOC.
  - `packages/contracts/src/m3/po.ts` (entity DTOs + 6 event envelopes + Zod schemas). ~120 LOC.
  - Tests: ~35 new tests across state-machine exhaustive table + entity + factory + counter race conditions + repo multi-tenant.
- **Performance**:
  - Tables created empty; no perf concern at landing.
  - 3 indexes on `purchase_orders` cover the documented query paths (buyer history, ops-dashboard active POs, per-org PO-number uniqueness).
  - `po_counters` row-lock contention bounded by inserts/sec/org (estimated < 0.1/sec at MVP scale; INT test asserts no deadlock under 8 concurrent inserts).
- **Storage growth**: ~250 bytes per `purchase_orders` row + ~200 bytes per line. At ~10 POs/day × 8 lines/PO × 365 days × 30 orgs ≈ 110k POs + 880k lines/year = ~200 MB/year. Negligible until M4 scale.
- **Audit**: this slice DECLARES the 6 PO event types in contracts; it does NOT emit them. Slice #21 (`m3-audit-log-hash-chain-hardening`) registers all M3 event types in `AuditLogSubscriber.KNOWN_EVENTS` as a single batch update once every M3 BC has shipped. Pattern matches `m3-lot-aggregate` (slice #1) and `m3-vision-llm-provider-di-otel` (slice #16).
- **Rollback**: drop `purchase_order_lines` → `purchase_orders` → `po_counters` (FK + dependency order) in a follow-up migration. M2 suppliers untouched.
- **Out of scope** (claimed by other slices, do not pre-empt):
  - GR confirmation creating `lots` rows from PO lines → `m3-gr-aggregate-reconciliation` (slice #7).
  - PO operator UI (j11 table, draft editor, send action) → `m3-procurement-ui` (slice #8).
  - Audit-log emission for PO events → `m3-audit-log-hash-chain-hardening` (slice #21).
  - PO line price re-negotiation / version history. Out of MVP scope.
  - Multi-currency conversion math; `currency` column stored as-is.
- **Parallelism**: this slice has no `Depends on` outside merged-master state. It writes exclusively to `apps/api/src/procurement/po/`, `apps/api/src/migrations/0030_create_purchase_orders.ts`, `packages/contracts/src/m3/po.ts`, and `apps/api/src/app.module.ts` (single-line module add). File-path disjoint from the other 5 parallel Wave 2.2 subagents. Slices #7 and #8 MUST wait for merge before starting.

## Effort

- **Size**: M (medium). State machine + counter + multi-tenant repo + entity mapping + Zod contracts ≈ 800 LOC + 35 tests. Comparable to slice #1 (lot-aggregate, M).
