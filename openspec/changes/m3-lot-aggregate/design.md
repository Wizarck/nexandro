## Context

M2 wave 1.x has shipped `apps/api/src/audit-log/` (canonical audit table from `m2-audit-log` slice) plus per-BC entities for recipes, ingredients, menus, labels, and MCP. None of these declare a `Lot` aggregate — M2 lot traceability stops at `ingredient.lot_code text NULLABLE`, a free-text string filled by Hermes during invoice ingestion.

M3 introduces 5 downstream slices (#2 consumption events, #3 expiry alerts, #4 cost resolver, #7 GR reconciliation, #11-13 recall) that each declare an FK to `lots.id` in their migrations. Architecture-m3.md §Implementation Sequence (line 294) explicitly names this as "First slice — Lot lifecycle entities (`apps/api/src/inventory/lot/`): `Lot`, `StockMove` entities with `organization_id` + `location_id` cols. Foundation for all FK references."

This slice is **foundation-only**: it creates the entities + tables + indexes + read-only repository surface. Creation, mutation, and event emission flows are claimed by dependent slices and out of scope here.

ADR-031 (audit_log indexing strategy) drives the index choices: compound + traversal indexes per NFR-PERF-1 (p95 < 500ms recall) / NFR-SCALE-1 (100k events).

## Goals / Non-Goals

**Goals:**

- Stable `Lot` + `StockMove` entity contracts for downstream M3 slices to FK into.
- Migration 0026 (`create_lots_table`) + 0027 (`create_stock_moves_table`) numbered in the architecture-canonical sequence (architecture-m3.md line 506-507).
- Three lot indexes per ADR-031, justified by downstream query patterns — not aspirational.
- `LotRepository.findAvailableFifo()` read-only API ready for slice #4 (cost resolver) without circular dependency.
- Multi-tenant invariant: every query gates on `organizationId` at the repository layer (not at the controller — protect against future leakage).
- Audit-log event registration (`LOT_CREATED`, `STOCK_MOVE_CREATED`) typed via the M2 `AuditEventEnvelope` shape, but NOT actually emitted in this slice — claimed by #7 (creation) and #2 (consumption mutations).
- Storybook stories + Jest tests covering boundary conditions (qty 0, expires_at in past, unit enum), multi-tenant leakage tests, repo query tests against a real Postgres test container.

**Non-Goals:**

- Lot creation / mutation flows. Reserved for `m3-gr-aggregate-reconciliation` (#7).
- FIFO/FEFO cost computation. Reserved for `m3-inventory-cost-resolver-fifo-fefo` (#4) — this slice provides the read surface only.
- Lot consumption event emission. Reserved for `m3-lot-consumption-events` (#2).
- Expiry-proximity alerting rule. Reserved for `m3-lot-expiry-alerts` (#3).
- UI surfaces. No j-mock consumes `Lot` directly in MVP; Hermes WhatsApp surfaces lot info on demand.
- Migration of M2 `ingredient.lot_code` string column data into `lots` rows. Out of MVP scope (no business value yet); deferred to a hypothetical `m3.x-lot-code-backfill` followup.
- Soft-delete / archival of old lots. M3.x followup tracked in [[project_m3_prd_scope]] as `m3-audit-log-archival` (covers lots too).

## Decisions

### ADR-LOT-SCHEMA — canonical Lot row shape

Lot is a **discrete batch** of stock received at one location at one time from one supplier. NOT an alias for "stock-keeping unit" (that's `ingredient` from M2). One ingredient maps to many lots over time. Composite identity: `(organization_id, supplier_id, received_at, location_id)` is *almost* unique but not guaranteed (same supplier can deliver two batches same morning); a `uuid PK` is used instead.

**Columns** (11):

| col | type | nullable | note |
|---|---|---|---|
| `id` | uuid | NO | PK |
| `organization_id` | uuid | NO | multi-tenant gate |
| `location_id` | uuid | NO | FK `locations` — the kitchen/store that received the lot |
| `supplier_id` | uuid | YES | FK `suppliers` — NULL only for legacy backfill (M3.x); new rows enforce NOT NULL via app validation |
| `received_at` | timestamptz | NO | server timestamp at GR confirmation |
| `expires_at` | timestamptz | YES | NULL for shelf-stable items (oil, salt) |
| `quantity_received` | numeric(18,4) | NO | immutable after creation |
| `quantity_remaining` | numeric(18,4) | NO | decremented by `StockMove` outbound rows (slice #2 wires this) |
| `unit` | text | NO | CHECK in (`kg`,`g`,`L`,`ml`,`un`) — matches M2 ingredient unit values |
| `metadata` | jsonb | YES | open shape — invoice_ref, vehicle_plate, arrival_temperature, supplier_lot_code |
| `created_at`/`updated_at` | timestamptz | NO | M2 convention |

**Why `numeric(18,4)` not `decimal` or `integer`?** Restaurant inventory mixes integer pieces (`12 un`) and fractional weights (`0.85 kg`); 4 decimal places covers grams precision. M2 already uses `numeric(18,4)` on `ingredient.quantity_per_unit` — same convention.

**Why `quantity_remaining` materialized vs. derived sum of `stock_moves`?** Read-hot FIFO/FEFO queries (slice #4) cannot afford to sum stock_moves on every recipe-cost rollup. Materialized column + INT test asserting `quantity_received - SUM(outbound stock_moves) == quantity_remaining` per nightly rollup.

**Alternatives considered**:
1. **Single `inventory_movements` table without separate Lot entity** (event-sourced lot reconstruction). Rejected: forward-trace queries (FR15-FR16) need to find "which lot fed this incident" without scanning millions of movement rows; a materialized `lots` row with indexed `supplier_id` + `received_at` is the only path to p95 < 500ms at NFR-SCALE-1.
2. **`Lot` as value object inside `Ingredient`**. Rejected: would force M2 ingredient table to grow per-lot; FKs from procurement / HACCP / recall to a value-object don't work in SQL.

### ADR-LOT-INDEXES — three indexes, each justified

Per ADR-031 architecture line 306: "ADR-031 (indexing) MUST land before recall slices". Three indexes, each anchored to a downstream query pattern. No speculative indexing.

| Index | Cols | Query pattern | Owning slice |
|---|---|---|---|
| `idx_lots_org_supplier_received` | `(organization_id, supplier_id, received_at DESC)` | "find all lots from supplier X in the last N days" | recall #11 (incident-search) + recall #12 (trace-tree) |
| `idx_lots_org_expires_active` | `(organization_id, expires_at) WHERE expires_at IS NOT NULL` | "find all lots expiring in the next 72h" | expiry-alerts #3 |
| `idx_lots_org_loc_available_fifo` | `(organization_id, location_id, quantity_remaining) WHERE quantity_remaining > 0` | "find oldest still-positive lot for FIFO depletion" | cost-resolver #4 |

The `(organization_id, supplier_id, received_at DESC)` index doubles as the source for `findByLotCode` legacy queries via app-side join on `ingredient.lot_code` → `lots.metadata->>'supplier_lot_code'`. Slow path; only invoked when M2 callers haven't migrated to FK-based lookups yet.

**The compound + traversal indexes for consumption-graph (forward + reverse trace)** are deliberately NOT in this slice — they belong to slice #2 (`m3-lot-consumption-events`, migration 0037). Reason: they index on `stock_moves` + `audit_log` JOIN paths that don't exist until the consumption event subscriber wires them up. Premature indexing would force re-thinking when slice #2 designs the actual query.

### ADR-LOT-MULTITENANT-AT-REPO — gate at repository, not controller

Every `LotRepository` method takes `organizationId` as the **first parameter** and includes it in the WHERE clause. No method exposes a "find without org" surface — even tests use a fixture org id. This pattern matches the M2 `RecipeRepository` and prevents the cross-tenant fixture-leakage class of bugs we saw in `m2-audit-log` retros.

**Rejected alternative**: tenant-scoped data source per request (NestJS request-scoped providers). Cost: a 10x query-rate penalty (proven in `m2-cost-rollup-and-audit` retro) + tighter coupling to NestJS lifecycle. Repository-gating is the cheaper invariant.

### ADR-LOT-NO-EVENT-EMIT-HERE — events registered, not emitted

This slice DEFINES the event shapes in `packages/contracts/src/m3/lots.ts`:
- `LOT_CREATED` (payload: full Lot read model) — emitted by GR confirmation in slice #7.
- `STOCK_MOVE_CREATED` (payload: full StockMove read model) — emitted by consumption flows in slice #2 + waste flows in M3.x.

It does NOT register an `@OnEvent` subscriber in `apps/api/src/audit-log/audit-log.subscriber.ts`. That's slice #21 (`m3-audit-log-hash-chain-hardening`) work — adding the event types to the subscriber's `KNOWN_EVENTS` set + writing audit rows on each. By that point all 6 of the M3 BCs will have shipped and the subscriber registration is a single batch update.

**Why not emit-and-discard now?** Risk of double-write when slice #21 wires it later, plus the audit envelope shape is not finalized until ADR-032 hash-chain hardening migration 0023+0024 lands.

## Risks / Trade-offs

- **[Risk]** Downstream slice #2 might want the `quantity_remaining` materialized column to be `numeric(20,8)` for finer-grain partial consumption (e.g., 0.001 g). **Mitigation**: defer to slice #2 design review. If needed, slice #2 adds a migration to widen the column; no breaking change since `(18,4)` is a subset.
- **[Risk]** Multi-tenant gate at repository means every test must pass `organizationId` — verbose. **Mitigation**: test fixture helper `mockOrgScope()` returns a closure bound to a fresh org id; M2 already has this pattern in `cost.service.spec.ts`.
- **[Risk]** Three indexes add ~30% write overhead per Lot insert (estimated from M2 audit_log benchmarks). **Mitigation**: lot inserts are ~50/day/org (one per GR line) — negligible vs. the ~500 `audit_log` inserts/min. Not a hot path.
- **[Risk]** `unit` enum CHECK constraint locks the unit values at DB level — adding a new unit (e.g. `dozen`) requires a migration. **Mitigation**: M2's experience shows unit set is stable (last addition was `un` in v0.4.0); CHECK is preferred over app-side enum because it catches DB-direct fixtures that bypass NestJS validators.
- **[Trade-off]** Materialized `quantity_remaining` requires the INT test to keep it in sync with `stock_moves`. **Trade-off**: read-hot FIFO/FEFO performance is non-negotiable for cost rollups; the INT test is the price.

## Migration Plan

1. **Stage 1 — Schema only** (this PR):
   - Run migration 0026 + 0027 on staging.
   - No data; no behavior change in M2.
   - Smoke test: `lot.factory.create(...)` writes a row + reads it back; multi-tenant leakage test passes.
2. **Stage 2 — Downstream slice integration** (slices #2, #3, #4, #7):
   - Each downstream slice rebases atop this slice's merge.
   - First downstream merge (likely #7 GR reconciliation) starts populating real rows.
3. **Rollback strategy**:
   - Down migration drops `stock_moves` then `lots` (FK order).
   - No M2 data depends on these tables; M2 functionality unaffected.
   - Worst-case rollback during M3 implementation: any downstream slice that already FK'd in must roll back first (its own migration's down).

## Open Questions

- **`location_id` semantics**: M2 has a `locations` table from Wave 1.2 (`m2-data-model`). Confirm that `Lot.location_id` references the kitchen/store that received the goods (vs. the storage zone within the kitchen). If sub-location granularity is needed, push to `m3-lot-location-zones` followup — not MVP.
- **Supplier lot code vs. internal UUID**: should `Lot.id` be exposed externally (e.g., in dossier PDFs), or do we expose a derived human-readable code (`L-2026-0042` per the j6 mock)? The j6 mock uses the `L-YYYY-NNNN` format. **Proposed answer**: store the human code in `metadata->>'display_code'`, materialized at creation by slice #7. This slice does NOT need to decide; expose `id` (uuid) as canonical and let slice #7 + dossier rendering layer derive the display code.
- **`Lot.supplier_id NULL`** semantics: only for legacy backfill. Should we add an app-side validator that rejects NULL `supplier_id` at creation? **Proposed answer**: yes, in slice #7 (where creation happens). This slice keeps the column NULL-able at DB to permit M3.x legacy backfill if it ever happens.
