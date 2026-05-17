## Context

The Recall BC's first user-facing surface is the j6 "investigate" screen: an operator types a symptom or selects a menu item and the system shows the **forward** consumption tree from a suspect lot (recipes served from it, menu items served via those recipes, the location × service-window leaves where guests received the product), or the **reverse** origin tree (which lots fed a given menu item / recipe / symptom anchor). The operator can toggle between the two modes via a chip below the tree.

Slices #1 + #2 have already shipped the data: `lots` + `stock_moves` + a stream of `LOT_CONSUMED` audit-log rows whose `payload_after` jsonb carries `lot_id`, `recipe_id` (nullable), `menu_item_id` (nullable), `consumed_at`. Slice #21 ensured those rows are durably persisted with hash-chain integrity. What is MISSING is the traversal engine that walks the graph these rows describe.

Architecture-m3.md ADR-028 commits to **SQL recursive CTE on `audit_log`**:

> Each traversal step is a SELECT against `audit_log` filtered by the parent's identifier in `payload_after`. The CTE recurses up to a depth cap (`RECALL_TRACE_MAX_DEPTH=10` default, configurable per org via `organizations.recall_max_depth INT NULL`). The recursive node materialises a flat row-set; application code re-builds the nested tree in a single pass.

ADR-031 names the traversal indexes; ADR-RECALL-RBAC names the REST roleset; line 397-398 pins the module constant location; line 563 reserves the INT testcontainer test file.

This slice is **read-only** over the existing audit_log row-set. No new event types, no new bus channels.

## Goals / Non-Goals

**Goals:**

- `TraceService.traceForward(organizationId, rootLotId, opts?)`: depth-capped tree of `{lot → recipes → menu-items → location×service-window}` starting from a suspect lot.
- `TraceService.traceReverse(organizationId, leafAnchor, opts?)`: depth-capped tree walking from an anchor (symptom report, menu item, recipe) back to the originating lots.
- Both functions share the `TraceNode` shape. Both return a tree, never a flat list.
- Depth cap enforced at the SQL recursion boundary (NOT in app code) — adversarial inputs cannot cause unbounded recursion.
- Per-org override (`organizations.recall_max_depth INT NULL`) honoured at query time; NULL falls back to the module constant.
- REST surface gated to OWNER + MANAGER (`@Roles` decorator). Mirrors `audit-log-browse.controller.ts`.
- Frontend: flat-list-with-margin-rule renderer (NO nested cards), `role="tree"`, `aria-level` per depth, 48 px touch targets, mode-chip toggle.
- Empty results return a well-typed empty tree rather than throwing.

**Non-Goals:**

- Search-by-anchor (symptom-text → anchor list) — slice #11 owns.
- Operator action (86-flag dispatch, kitchen alerts) — slice #13 owns.
- Recall PDF export — slice #14 owns.
- Live consumption mutation — already shipped by slice #2.
- Materialized view / table-of-paths persistence — deferred to M3.x if traversal latency becomes a bottleneck (NFR-PERF-1 budget is currently met by the indexed CTE per ADR-028).
- Per-org admin UX to change `recall_max_depth` — deferred to M3.x; this slice persists the column and honours it.

## Decisions

### ADR-TRACE-RECURSIVE-CTE — SQL recursive CTE, flat row-set, single-pass tree build

The system SHALL implement traversal via a single Postgres recursive CTE per request, returning a flat row-set ordered by `(depth, path_key)`. The application service iterates the row-set in one pass to build the nested `TraceNode` tree, indexed by id.

Forward CTE shape (pseudo-SQL):

```sql
WITH RECURSIVE forward_trace(node_id, node_kind, parent_id, depth, organization_id, label, qty_consumed, unit) AS (
  -- anchor: the root lot itself
  SELECT
    :rootLotId::uuid                    AS node_id,
    'lot'::text                          AS node_kind,
    NULL::uuid                           AS parent_id,
    0::int                               AS depth,
    :organizationId::uuid                AS organization_id,
    (SELECT 'Lote ' || COALESCE(metadata->>'supplier_lot_code', id::text)
       FROM lots WHERE id = :rootLotId AND organization_id = :organizationId) AS label,
    NULL::numeric                        AS qty_consumed,
    NULL::text                           AS unit

  UNION ALL

  -- recurse: each frontier-node child is a row from audit_log whose parent_id matches the frontier
  SELECT
    -- recipe child of a lot: each LOT_CONSUMED row whose payload_after.lot_id = parent
    -- (de-duplicated by recipe_id)
    ...
  FROM forward_trace ft
  JOIN audit_log a ON ...
  WHERE ft.depth < :maxDepth
    AND a.organization_id = ft.organization_id
)
SELECT node_id, node_kind, parent_id, depth, label, qty_consumed, unit FROM forward_trace ORDER BY depth, node_id;
```

Implementation specifics:
- The recursive arm runs THREE branches in one UNION ALL: lot→recipe, recipe→menu_item, menu_item→(location, service_window). At each level the frontier emits the next-level children, de-duplicated by the relevant identifier.
- The depth cap is a `WHERE ft.depth < :maxDepth` filter on the recursive arm. The cap value is resolved by the service per request: `org.recall_max_depth ?? RECALL_TRACE_MAX_DEPTH`.
- When the cap is reached, the service walks the row-set and marks the leaf nodes at `depth = maxDepth - 1` as `depthExceeded: true` IF they had at least one would-be-child the CTE didn't expand. To compute "would-be-child" without a second query, the service inspects `audit_log` once via a sibling probe — see below.

For the `depthExceeded` flag detection, after the main CTE the service runs a **secondary aggregation query** on the same `audit_log` rows to count would-be children of each `depth = maxDepth - 1` node. This is one extra round-trip but bounded by the result-set fan-out (typically <50 nodes at max depth). Implementation note: a more elegant single-query approach using `LEFT JOIN LATERAL` was considered but rejected — Postgres planner doesn't always pick the index for it.

Reverse CTE is structurally identical with arrows reversed: anchor (symptom/menu-item/recipe) → parent recipes/menu-items → lots that fed them. The `payload_after.lot_id` extraction is what makes the JOIN work.

**Rationale**:
- Recursive CTEs are well-understood in Postgres; the planner picks the indexes provisioned by ADR-031 reliably.
- One round-trip + one bounded aggregation query keeps NFR-PERF-1 hot-path latency well under budget.
- Flat row-set → single-pass tree build is O(n) and trivially testable against fixture rows.

**Rejected alternatives**:
1. **Application-layer recursive query**: rejected. N+1 query pattern; latency explodes with depth; the depth cap becomes an app-side concern (riskier).
2. **Materialized view of paths**: rejected. Read latency is already within NFR-PERF-1 budget at MVP scale; the materialized view requires a refresh trigger on every consumption event and adds operational complexity. M3.x revisit if latency becomes an issue at customer scale.
3. **Graph database (Neo4j) sidecar**: rejected. New piece of infrastructure for a single read pattern; consumption events already persist to `audit_log` so duplicating them into a graph store is wasted I/O.

### ADR-TRACE-DEPTH-CAP — Constant + per-org override

The system SHALL enforce a hard depth cap on traversal recursion. The default is `RECALL_TRACE_MAX_DEPTH=10` exported from `apps/api/src/recall/domain/constants.ts`. The per-org override lives on `organizations.recall_max_depth INT NULL`; NULL means "use the module constant".

The cap is enforced at the SQL `WHERE` level on the recursive arm (NOT in app code) so a malformed result-set CANNOT escape the bound. Even if a service caller passes a malicious `opts.maxDepth=999`, the service clamps to `min(opts.maxDepth, org.recall_max_depth ?? RECALL_TRACE_MAX_DEPTH)` before issuing the query.

**Rationale**: defense-in-depth. ADR-028 pins the cap; ADR-RECALL-RBAC restricts the surface to OWNER + MANAGER (trusted personas) but the cap protects against software bugs and adversarial inputs equally. The per-org override accommodates large multi-location chains whose menu graph genuinely exceeds 10 levels (rare but observed in supplier-of-supplier scenarios; product team flagged it in the gate-c review).

**Rejected alternatives**:
1. **Single global constant, no override**: rejected. Multi-location chains report graphs up to 15 deep on rare investigations. A global default of 15 would over-allocate compute for the 95% of single-location customers.
2. **Configure via env var instead of `organizations` column**: rejected. Per-org configuration is the correct granularity; env var would force a redeploy to change one customer's depth.

### ADR-TRACE-INDEXES — Three expression B-tree indexes on `audit_log.payload_after` paths

The traversal engine reads `audit_log.payload_after->>'lot_id'`, `payload_after->>'recipe_id'`, and `payload_after->>'menu_item_id'` at every recursive step. Without indexes, each step is a sequential scan over the entire audit_log table — NFR-PERF-1 would fail at any non-trivial scale.

Migration 0036 provisions three B-tree expression indexes:

```sql
CREATE INDEX "idx_audit_log_payload_lot_id"
  ON "audit_log" ("organization_id", ("payload_after"->>'lot_id'))
  WHERE "payload_after"->>'lot_id' IS NOT NULL;

CREATE INDEX "idx_audit_log_payload_recipe_id"
  ON "audit_log" ("organization_id", ("payload_after"->>'recipe_id'))
  WHERE "payload_after"->>'recipe_id' IS NOT NULL;

CREATE INDEX "idx_audit_log_payload_menu_item_id"
  ON "audit_log" ("organization_id", ("payload_after"->>'menu_item_id'))
  WHERE "payload_after"->>'menu_item_id' IS NOT NULL;
```

The partial `WHERE` clauses keep the indexes narrow — most audit rows don't carry these payload fields, so the index only covers `LOT_CONSUMED` (slice #2) and adjacent event types.

**Why B-tree expression and not GIN?** GIN excels at containment queries (`payload @> '{"lot_id": "…"}'`) and full-text. The traversal pattern is **equality on a scalar path** (`payload_after->>'lot_id' = $1`), which B-tree on a function expression is the canonical fit for. GIN would be heavier and slower for this access pattern (per Postgres docs §11.2).

**Why text expression and not casted uuid?** The `->>` operator returns text; casting to uuid in the index expression triggers a function call mismatch at query plan time unless the query also casts (and adds a CAST function in the SQL). Keeping both sides as text is simpler and preserves index applicability.

**Rejected alternatives**:
1. **GIN on `payload_after`**: rejected for traversal hot path. Useful for slice #11 search but wrong tool for slice #12.
2. **Materialized `consumption_edges` table**: rejected. Doubles storage; requires synchronous trigger on `audit_log` insert; M3.x revisit if expression indexes underperform at scale.

### ADR-TRACE-NODE-SHAPE — Inline `TraceNode` type, no contracts import

Per the Wave 2.1 hard constraint (`feedback_subagent_apply_typing_fix_cascade`), `apps/api/` MUST NOT import from `packages/contracts/` (TS6059 `rootDir` cascade). The `TraceNode` shape lives **twice**:

- `apps/api/src/recall/types.ts` — the backend's view.
- `packages/ui-kit/src/components/RecallTraceTree/types.ts` — the frontend's view (structurally identical; we accept the duplication explicitly).

The wire format is JSON; the controller serialises the backend `TraceNode` to JSON, the frontend's `RecallTraceTree` deserialises into its local `TraceNode`. INT test (deferred — `tasks.md §Deferred`) pins the JSON shape match.

```typescript
// apps/api/src/recall/types.ts (backend)
export type TraceNodeKind = 'lot' | 'recipe' | 'menu-item' | 'service-window';

export interface TraceNode {
  id: string;
  kind: TraceNodeKind;
  label: string;
  quantityBadge?: string;  // pre-rendered, e.g. "2.4 kg"
  children: TraceNode[];
  depthExceeded?: boolean; // when traversal would continue past maxDepth
}
```

**Rationale**: explicit duplication beats fragile cross-package coupling at this slice's maturity level. The shape is stable (a tree of 4 kinds). A future slice can promote the shape to `packages/contracts/` once the rootDir story is resolved.

**Rejected alternative**: `import type { TraceNode } from '@nexandro/contracts'`. Triggers TS6059 in `apps/api/` per Wave 2.1 cascade. Hard NO.

### ADR-TRACE-EMPTY-RESULTS — Empty tree returns root with empty children, NOT 404

If `traceForward(orgA, lotX)` finds no consumption events for `lotX`, the service returns a `TraceNode` with the root lot's metadata and `children: []`. The controller returns 200 with that body. Reverse follows the same pattern.

If the anchor itself doesn't exist (e.g., `lotX` is not a valid lot in `orgA`), the service throws `RecallAnchorNotFoundError` and the controller returns HTTP 404.

**Rationale**: empty-result is a valid UX state ("no consumption recorded yet — this lot may still be in storage"). The frontend renders the root + an `EmptyStateCard`-style message. Conflating "anchor not found" with "anchor has no descendants" would confuse operators.

### ADR-TRACE-RBAC — OWNER + MANAGER (mirrors audit-log)

Recall investigation surfaces are sensitive: they reveal the full consumption graph including supplier sources. Per ADR-RECALL-RBAC, only OWNER + MANAGER roles invoke `/m3/recall/trace/*`. STAFF cannot. The controller declares `@Roles('OWNER', 'MANAGER')` and the global `RolesGuard` enforces it.

Multi-tenant gate: `organizationId` is required (current-user's org from JWT, not a query param) per the existing M2 pattern. The service's first parameter is always `organizationId`.

**Rationale**: matches the `audit-log-browse.controller.ts` pattern. STAFF have a need-to-know for serving lines they operate, not for the entire consumption graph. Future Manager-Plus-Staff slice can grant STAFF read access to specific lot trees they participated in via a fine-grained RBAC slice — deferred to M3.x.

## Risks / Trade-offs

- **[Risk]** Recursive CTE plans regress on very deep trees with high fan-out. **Mitigation**: depth cap at the SQL boundary; the secondary "would-be-child" probe is bounded to the leaf-at-max-depth set (typically <50 nodes).
- **[Risk]** Expression index does NOT apply if a future event handler stores `lot_id` under a different jsonb path. **Mitigation**: slice #2's payload schema is Zod-validated; the field path is contract-locked. Any new event type adding `lot_id` MUST use the same path or extend the index migration.
- **[Risk]** Per-org `recall_max_depth` override could be set to a pathological value (e.g., 100). **Mitigation**: the migration's CHECK constraint enforces `recall_max_depth BETWEEN 1 AND 30`. Operators changing the value go through SQL (no UI yet), so the CHECK is the safety net.
- **[Trade-off]** Backend + frontend `TraceNode` duplicated. **Trade-off**: two small type files vs. resolving the rootDir cascade at the workspace level. The cascade resolution is in progress per the Wave 2.1 typing-fix lesson — when it lands, we'll consolidate. Until then, explicit duplication is the lower-risk path.
- **[Trade-off]** No INT testcontainer test in this slice (deferred). **Trade-off**: unit-level tests with fixture rows exercise the SQL builder + the tree-build pass; the INT test pins query plan + multi-tenant leakage which is valuable but not blocking. Deferring keeps the slice shippable while signalling the gap in `tasks.md §Deferred`.

## CTE shape and row-flattening pass — details

The recursive CTE returns rows shaped `(node_id, node_kind, parent_id, depth, label, quantityBadge)` ordered by `(depth ASC, node_id ASC)`. After fetching, the service performs ONE pass:

```typescript
function buildTree(rows: FlatRow[], rootId: string, maxDepth: number): TraceNode {
  const byId = new Map<string, TraceNode>();
  for (const row of rows) {
    byId.set(row.node_id, {
      id: row.node_id,
      kind: row.node_kind,
      label: row.label,
      quantityBadge: row.quantity_badge ?? undefined,
      children: [],
    });
  }
  for (const row of rows) {
    if (row.parent_id == null) continue;
    const parent = byId.get(row.parent_id);
    if (parent) parent.children.push(byId.get(row.node_id)!);
  }
  // Mark depth-exceeded leaves (filled in by secondary probe step)
  for (const row of rows) {
    if (row.depth === maxDepth - 1 && row.would_have_children) {
      byId.get(row.node_id)!.depthExceeded = true;
    }
  }
  return byId.get(rootId) ?? makeEmptyRoot(rootId);
}
```

The secondary "would-have-children" probe is one parametrised SQL query: `SELECT DISTINCT parent_id_field FROM audit_log WHERE organization_id = $1 AND parent_id_field IN (… leaves at maxDepth-1 …)`. The result populates the `would_have_children` flag on the flat-row set before the tree-build pass runs.

This keeps the build pass O(n) and trivially testable against synthetic flat-row fixtures.

## Migration Plan

1. **Stage 1 — Indexes + column** (this PR):
   - Run migration 0036 on staging.
   - No data; no behaviour change in M2 / earlier M3 slices.
   - Smoke test: insert a `LOT_CONSUMED` row, call `TraceService.traceForward(orgA, lotX)`, assert a single-node tree returns.
2. **Stage 2 — Frontend rollout** (downstream slice #13):
   - Slice #13 mounts `RecallTraceTreeScreen` from the j6 root screen.
   - First operator runs an investigation; trace renders with real data.
3. **Rollback strategy**:
   - Down migration drops the 3 indexes + the `recall_max_depth` column.
   - Code rollback: delete the new files under `apps/api/src/recall/` plus the migration.
   - No M2 or other M3 data depends on this slice's writes (it makes none).

## Open Questions

- **Should the CTE inline `lots`/`recipes`/`menu_items` table joins for `label` enrichment, or should the service fetch labels in a follow-up batch query?** **Proposed answer**: inline in the CTE for the LOT level (the `lots` table is small and the row-set is bounded by `quantity_remaining > 0`). For recipe / menu_item labels, defer to a follow-up batch fetch keyed on the id-set the CTE returns — this keeps the CTE simple and lets us use the M2 i18n hooks for label localisation later. Implementation pragma: in the first pass we render labels as `"Receta " || id` etc., and add a follow-up slice (M3.x) for proper label join. The unit tests pin only the structural id/kind/depth fields, not the human label.
- **Should `traceReverse` accept a "symptom report" anchor kind even though symptom-report search is in slice #11?** **Proposed answer**: yes — the `anchorKind` enum includes `'symptom'` from day one. The service short-circuits with `RecallInvalidAnchorKindError` until slice #11's search produces the anchor identifier; the type union is locked.
- **Per-org `recall_max_depth` admin UX**: deferred to M3.x — see ADR-TRACE-DEPTH-CAP.
