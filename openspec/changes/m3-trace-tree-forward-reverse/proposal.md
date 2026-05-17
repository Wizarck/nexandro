## Why

FR15 + FR16 require operators investigating an incident to (a) walk **forward** from a suspect lot to every recipe / menu item / location × service-window that received product from that lot — answering *"if this lot is contaminated, who got served what?"* — and (b) walk **reverse** from an incident anchor (symptom report, menu item, recipe) to the set of lots that fed it — answering *"if these guests got sick, which lots did they share?"*.

Today, the M3 audit-log already captures the raw consumption ledger:
- Slice #1 (`m3-lot-aggregate`, MERGED `0dab33b`): canonical `Lot` + `StockMove` tables + repositories.
- Slice #2 (`m3-lot-consumption-events`, MERGED): `ConsumptionService.recordConsumption()` emits `LOT_CONSUMED` envelopes with `payload_after` carrying `lot_id`, `recipe_id` (nullable), `menu_item_id` (nullable), `consumed_at`.
- Slice #21 (`m3-audit-log-hash-chain-hardening`, MERGED `d596868`): the canonical subscriber persists the envelopes to `audit_log` with `payload_after` as jsonb and pins `retention_class='regulatory'` for `LOT_CONSUMED`.

What is MISSING is the **traversal engine** that walks the consumption graph — `lot → recipe → menu-item → (location, service-window)` for forward, the same chain in reverse for reverse — within the per-org depth cap (`RECALL_TRACE_MAX_DEPTH=10`, configurable per org via `organizations.recall_max_depth INT NULL` per ADR-028). Without traversal, the j6 recall-investigate UX has no data to render its `RecallTraceTree` widget, blocking slices #13 (recall dispatch dossier) and #14 (recall PDF export).

Architecture-m3.md ADR-028 names the engine: **SQL recursive CTE on `audit_log`, depth-capped, with bounded fan-out at each level, returning a flat row-set that the application code re-builds into a nested tree in a single pass**. ADR-031 names the traversal indexes. Line 397-398 of architecture-m3 pins `RECALL_TRACE_MAX_DEPTH = 10` at `apps/api/src/recall/domain/constants.ts`. Migration slot `0036` is reserved per `master/docs/openspec-slice-module-3.md` line 118 (gotcha range 110-119 — claimed by this slice).

This slice is the **traversal foundation** for the Recall BC. Slice #11 (`m3-incident-search-multi-anchor`, parallel) ships the search-by-anchor surface; slice #13 (recall dispatch) ships the operator action layer. The three slices coexist via module composition at master.

| Downstream consumer | Reference into recall.trace |
|---|---|
| `m3-incident-search-multi-anchor` (#11, parallel) | search produces an anchor; this slice's `traceReverse` walks the lots that fed it |
| `m3-recall-86-flag-dispatch` (#13) | dossier "lots affected + locations / windows served" reuses the forward + reverse tree shapes |
| `m3-appcc-export-multilingual` (#15) | APPCC export embeds the trace into the regulatory PDF (regulator-readable evidence trail) |
| `m3-recall-pdf-export` (#14) | recall notification PDF embeds the forward tree (operator-facing) |

## What Changes

- **`apps/api/src/recall/`** new BC (or extends slice #11's scaffold if it merges first):
  - `apps/api/src/recall/domain/constants.ts` — `RECALL_TRACE_MAX_DEPTH = 10`. **Created here if slice #11 hasn't merged yet**; re-exported from slice #11's location at rebase time otherwise.
  - `apps/api/src/recall/types.ts` — inline `TraceNode` shape (NOT imported from `@nexandro/contracts` per Wave 2.1 hard constraint).
  - `apps/api/src/recall/application/trace.service.ts` — `traceForward` + `traceReverse` against `audit_log` via a recursive CTE; ONE pass over the flat row-set to build the nested tree.
  - `apps/api/src/recall/application/trace.errors.ts` — `RecallAnchorNotFoundError`, `RecallInvalidAnchorKindError`.
  - `apps/api/src/recall/interface/trace.controller.ts` — `GET /m3/recall/trace/forward?lotId=…` + `GET /m3/recall/trace/reverse?anchorId=…&anchorKind=…` (RBAC: OWNER + MANAGER per ADR-RECALL-RBAC; mirrors `audit-log-browse.controller.ts`).
  - `apps/api/src/recall/interface/dto/trace.dto.ts` — query DTOs (UUID + enum validation).
  - `apps/api/src/recall/recall.module.ts` — own module exporting `TraceService`.
- **Migration `0036_add_recall_traversal_indexes.ts`** (slot 0036 per gotcha range 110-119):
  - 3 expression B-tree indexes on `audit_log` (lot_id / recipe_id / menu_item_id paths inside `payload_after`) — match style of existing M3 indexes (`idx_lots_org_supplier_received` etc) per ADR-031.
  - Adds `organizations.recall_max_depth INT NULL` per ADR-028 line 176-181 (per-org override; NULL = use the module constant).
- **Frontend** — new ui-kit component + screen partial + hooks:
  - `packages/ui-kit/src/components/RecallTraceTree/` — flat-list-with-margin-rule pattern per DESIGN.md §6 (NO nested cards). Mode chip below the tree toggles forward ↔ reverse. `role="tree"`, `aria-level` per depth. Touch targets ≥ 48 px. `depthExceeded` leaf renders muted eyebrow `…profundidad excedida`.
  - `apps/web/src/hooks/useRecallTrace.ts` — TanStack Query hooks `useForwardTrace(lotId)` + `useReverseTrace({ anchorId, anchorKind })`.
  - `apps/web/src/api/recallTrace.ts` — `getForwardTrace` + `getReverseTrace` HTTP clients.
  - `apps/web/src/screens/j6/RecallTraceTreeScreen.tsx` — j6 screen partial mounting the component when a lot is selected. No integration with slice #11's search yet (deferred to slice #13).
- **Events emitted INLINE**: none. This slice is read-only over the existing `audit_log` row-set written by slice #2 + slice #21. No new `AuditEventType` constants.
- **BREAKING**: none. New BC, no M2 entity touched. The traversal indexes on `audit_log` are additive.

## Capabilities

### New Capabilities

- `recall.trace`: traversal engine. `TraceService.traceForward(orgId, rootLotId, opts?)` + `TraceService.traceReverse(orgId, leafAnchor, opts?)` returning a depth-capped `TraceNode` tree. REST surface mirrored 1:1 by the agent layer per `agent-capability` naming convention (`recall.trace.forward`, `recall.trace.reverse`).

### Modified Capabilities

- none. (`audit-log` is not modified — this slice reads from `audit_log` rows already persisted by slices #2 + #21 + writes no new event type.)

## Impact

- **Prerequisites**: slice #1 `m3-lot-aggregate` (MERGED `0dab33b`) — `Lot` + `StockMove` schema. Slice #2 `m3-lot-consumption-events` (MERGED) — `LOT_CONSUMED` envelope shape. Slice #21 `m3-audit-log-hash-chain-hardening` (MERGED `d596868`) — `audit_log` rows for `LOT_CONSUMED` actually persisted. **No other M3 prerequisites**.
- **Parallel slice #11 `m3-incident-search-multi-anchor`**: builds the `apps/api/src/recall/` scaffold in parallel. Expected conflicts at merge time on `recall.module.ts` + `app.module.ts` registration + (possibly) `domain/constants.ts`. Both authors mirror NestJS module composition so the resolver picks up both at master.
- **Code**:
  - `apps/api/src/recall/` (new BC). ~600 LOC.
  - `apps/api/src/migrations/0036_add_recall_traversal_indexes.ts` (~90 LOC).
  - `packages/ui-kit/src/components/RecallTraceTree/` (~280 LOC across component + types + tests).
  - `apps/web/src/hooks/useRecallTrace.ts`, `apps/web/src/api/recallTrace.ts`, `apps/web/src/screens/j6/RecallTraceTreeScreen.tsx` (~180 LOC).
  - Tests: ~14 unit tests across `trace.service.spec.ts`, `RecallTraceTree.test.tsx`, plus one `trace.controller.spec.ts` smoke. INT testcontainer test (`recall-traversal-depth.int-spec.ts`) stubbed per architecture-m3 line 563 and deferred to followup per `tasks.md §Deferred`.
- **Performance**:
  - The 3 expression indexes on `audit_log.payload_after` paths keep traversal hot-path query plans bounded — each recursion level is an indexed lookup (NFR-PERF-1).
  - Depth cap (`RECALL_TRACE_MAX_DEPTH=10` default, configurable per org) prevents recursive runaway on adversarial / corrupted data: bounded WHERE filter `depth < cap` short-circuits at the SQL layer.
  - One round-trip per traversal — the recursive CTE returns the entire flat row-set; the service builds the tree in memory in a single pass. At 1,000 leaf nodes the in-memory build is sub-1ms.
  - Empty trees return immediately (root probe returns `null` if anchor lookup is empty).
- **Storage growth**: zero. The new indexes consume ~5% of the `audit_log` table size (Postgres planner heuristic on a multi-column expression index). At MVP scale (~1M audit_log rows / org / year) this is ~50 MB / org / year — negligible.
- **Audit**: zero. Read-only over existing rows.
- **Rollback**:
  - Down migration drops the 3 indexes + the `recall_max_depth` column.
  - Code rollback: delete `apps/api/src/recall/` (or the trace.* files inside it if slice #11 already merged).
  - Worst-case during downstream slice #13 dev: dossier "lots affected" section renders empty until rolled forward — no audit-log integrity loss; consumption ledger remains intact.
- **Out of scope** (claimed by other slices, do not pre-empt):
  - Search-by-anchor (symptom report → anchor list) → slice #11 `m3-incident-search-multi-anchor`.
  - Operator action / 86-flag dispatch (alert kitchen "stop serving recipe X") → slice #13 `m3-recall-86-flag-dispatch`.
  - Recall PDF export (operator-facing PDF that embeds the forward tree) → slice #14 `m3-recall-pdf-export`.
  - Per-org depth-override admin UX (operator changes their `recall_max_depth`) → deferred to M3.x. The column is added in this slice's migration; the override is read-only honoured by the service.
  - INT testcontainer test `recall-traversal-depth.int-spec.ts` — file path stubbed per architecture-m3 line 563; deferred to a followup (see `tasks.md §Deferred`).
- **Parallelism**: this slice writes exclusively to:
  - `apps/api/src/recall/application/trace.service.ts`, `trace.errors.ts`
  - `apps/api/src/recall/interface/trace.controller.ts`, `dto/trace.dto.ts`
  - `apps/api/src/recall/types.ts`
  - `apps/api/src/migrations/0036_add_recall_traversal_indexes.ts`
  - `packages/ui-kit/src/components/RecallTraceTree/*`
  - `apps/web/src/hooks/useRecallTrace.ts`, `apps/web/src/api/recallTrace.ts`, `apps/web/src/screens/j6/RecallTraceTreeScreen.tsx`
  - 1 line in `packages/ui-kit/src/index.ts` (barrel re-export).
  
  Conflicts with slice #11 expected on: `apps/api/src/recall/recall.module.ts`, `apps/api/src/app.module.ts`, possibly `apps/api/src/recall/domain/constants.ts`. Resolution at merge: keep both providers in `recall.module.ts`; the `RECALL_TRACE_MAX_DEPTH` constant is declared once in whichever slice merges first and re-exported.
