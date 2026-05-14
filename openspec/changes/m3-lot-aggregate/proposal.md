## Why

M3 introduces lot-level traceability — every operational slice (procurement, HACCP, recall, cost resolver) needs a `Lot` entity to anchor "which batch served which customer". Today, M2 ingredients have a `Lot` reference only as a string column (`ingredient.lot_code text NULLABLE`); there is no `lots` table, no entity, no repo, no factory. Five downstream M3 slices declare a foreign key to `lots.id` in their migrations but the parent table does not exist yet:

| Slice | Will FK into `lots.id` |
|---|---|
| `m3-lot-consumption-events` (#2) | `LotConsumed` event payload references `lot_id`; FIFO/FEFO depletion needs `lot_id` |
| `m3-lot-expiry-alerts` (#3) | nightly scan over `lots.expires_at` |
| `m3-inventory-cost-resolver-fifo-fefo` (#4) | resolver returns `cost_per_unit_at_received` from `lots` |
| `m3-gr-aggregate-reconciliation` (#7) | GR confirms → creates `lots` row per line |
| `m3-recall-86-flag-dispatch` (#13) | dossier section "lot affected" lists `lots` row + supplier + received_at |

This slice ships the **inventory.lots bounded context** — Lot + StockMove entities, repository, factory, indexes per ADR-031 — without any consumption logic, cost logic, or alerting. It is the **foundation** for blocks 1–6 of the M3 slice list. Architecture-m3.md §Implementation Sequence (line 294) names it as "First slice — Lot lifecycle entities". Until this lands, every operational M3 slice is blocked.

## What Changes

- **Migration `0026_create_lots_table.ts`** — new `lots` table with 11 columns:
  - `id uuid PK`, `organization_id uuid NOT NULL`, `location_id uuid NOT NULL FK locations`
  - `supplier_id uuid NULL FK suppliers` (NULL for legacy backfill)
  - `received_at timestamptz NOT NULL`, `expires_at timestamptz NULL`
  - `quantity_received numeric(18,4) NOT NULL`, `quantity_remaining numeric(18,4) NOT NULL`
  - `unit text NOT NULL CHECK (unit IN ('kg','g','L','ml','un'))`
  - `metadata jsonb NULL DEFAULT '{}'::jsonb` (open shape for supplier-specific fields: invoice ref, vehicle plate, temperature on arrival)
  - `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
  - 3 indexes:
    - `(organization_id, supplier_id, received_at DESC)` per ADR-031 — forward-trace queries from supplier
    - `(organization_id, expires_at) WHERE expires_at IS NOT NULL` — expiry-proximity scans (slice #3)
    - `(organization_id, location_id, quantity_remaining) WHERE quantity_remaining > 0` — FIFO/FEFO lookups (slice #4)
- **Migration `0027_create_stock_moves_table.ts`** — new `stock_moves` table with 9 columns:
  - `id uuid PK`, `organization_id uuid NOT NULL`, `location_id uuid NOT NULL FK locations`
  - `lot_id uuid NOT NULL FK lots`
  - `move_type text NOT NULL CHECK (move_type IN ('inbound','outbound','adjustment','waste'))`
  - `quantity numeric(18,4) NOT NULL` (signed: positive for inbound, negative for outbound/waste)
  - `actor_user_id uuid NOT NULL FK users`, `reason text NULL`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - 1 index: `(organization_id, lot_id, created_at DESC)` — depletion history per lot
- **`apps/api/src/inventory/lot/`** new BC: `Lot` + `StockMove` entities, repository, factory, application service (read-only public surface in this slice; mutation reserved for slices #7 + #2).
- **`apps/api/src/inventory/lot/lot.factory.ts`** — single creation seam, takes a `CreateLotInput` and emits a domain event placeholder (subscribed in slice #2). Tests cover boundary values (qty 0, expires_at in past, unit enum membership).
- **`apps/api/src/inventory/lot/lot.repository.ts`** — multi-tenant by `organizationId` (every query gates on it). Three query methods: `findById`, `findByLotCode` (for legacy M2 string-lookup compatibility), `findAvailableFifo(organizationId, locationId, ingredientId, asOf)`.
- **`packages/contracts/`** updates: 2 new DTO types (`LotReadModel`, `StockMoveReadModel`) exported for downstream slice consumption.
- **BREAKING**: none. M2's `ingredient.lot_code` column stays (legacy string lookup); no migration coupling.

## Capabilities

### New Capabilities

- `inventory-lots`: canonical `Lot` + `StockMove` entities, repository, factory, read-only application service. Foundation for FR4 (lot generation, slice #7), FR6 (consumption, slice #2), FR7 (cost resolver, slice #4), FR8 (expiry alerts, slice #3), and recall trace (slice #11-13). Does NOT include creation, mutation, or alerting flows — those belong to dependent slices.

### Modified Capabilities

- None. M2 ingredients keep their `lot_code` string column unchanged; opting into `inventory-lots` is a slice-#7 (`m3-gr-aggregate-reconciliation`) responsibility.

## Impact

- **Prerequisites**: M2 wave 1.19 merged (audit_log canonical exists at `apps/api/src/audit-log/`). No M3 prerequisites — slice #1 has no `Depends on` in the slice contract.
- **Code**:
  - `apps/api/src/inventory/lot/` (new BC: domain + application + interface + module). ~600 LOC.
  - `apps/api/src/migrations/0026_create_lots_table.ts` + `0027_create_stock_moves_table.ts`. ~150 LOC combined.
  - `packages/contracts/src/m3/lots.ts` (2 DTOs + Zod schemas). ~60 LOC.
  - Tests: ~25 new tests across entity + factory + repository + read-only service.
- **Performance**:
  - Tables created empty; no perf concern at landing.
  - Three indexes prevent table scans for downstream slices. Index on `(org, supplier_id, received_at DESC)` is the hot path for recall forward-trace (NFR-PERF-1: p95 < 500ms at 100k events). Validated via property-based fixture in slice #11.
- **Storage growth**: ~200 bytes per `lots` row + ~140 bytes per `stock_moves` row. At ~50 GR/day × 8 lots/GR × 365 days × 30 orgs = ~4.4M lots/year, ~1 GB. Negligible until M4 scale.
- **Audit**: every Lot/StockMove creation emits `LOT_CREATED` / `STOCK_MOVE_CREATED` via the M2 `AuditLogSubscriber` (typed `AuditEventEnvelope` shape). Mutation is reserved for downstream slices — this slice only registers the event types.
- **Rollback**: drop `lots` + `stock_moves` tables in a follow-up migration. M2 `ingredient.lot_code` string column is untouched, so M2 traceability degrades gracefully to the pre-M3 baseline. No M3 downstream slice can have shipped yet (foundation slice).
- **Out of scope** (claimed by other slices, do not pre-empt):
  - Lot creation via GR confirmation → `m3-gr-aggregate-reconciliation` (slice #7).
  - Lot consumption events + traversal indexes → `m3-lot-consumption-events` (slice #2, migration 0037 `add_lot_compound_and_traversal_indexes`).
  - Expiry-proximity backend rule → `m3-lot-expiry-alerts` (slice #3).
  - FIFO/FEFO cost resolution → `m3-inventory-cost-resolver-fifo-fefo` (slice #4).
  - Lot UI (none in MVP; Hermes WhatsApp surfaces lots when needed).
- **Parallelism**: this slice has **no `Depends on`** (foundation). It writes exclusively to `apps/api/src/inventory/lot/` + `apps/api/src/migrations/0026_*` + `0027_*` + `packages/contracts/src/m3/lots.ts`. Track A slices that depend on `lots.id` (#2, #3, #4, #7) MUST wait for this slice's merge. Tracks B (AI/obs) and C (cross-cutting) are file-path disjoint and can run in full parallel from day one.
