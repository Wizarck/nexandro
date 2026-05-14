## ADDED Requirements

### Requirement: TraceService.traceForward walks lot → recipe → menu-item → service-window with depth cap

The system SHALL expose `TraceService.traceForward(organizationId, rootLotId, opts?): Promise<TraceNode>`. The result SHALL be a tree rooted at the supplied lot whose children are the recipes that consumed from it, each recipe's children being the menu items that referenced it, each menu item's children being the `(location, service-window)` leaves where it was served. Walking SHALL stop at the org's configured `recall_max_depth` (defaulting to `RECALL_TRACE_MAX_DEPTH=10` when the org override is NULL).

#### Scenario: Forward trace from a consumed lot returns a 4-level tree
- **WHEN** `traceForward(orgA, lotX)` is called and the audit log contains 1 `LOT_CONSUMED` row for `(lotX → recipeR, menu_itemM)` at `(locationL, service-window=lunch)`
- **THEN** the result is a `TraceNode` with `kind='lot'`, one child `kind='recipe'`, that child's one child `kind='menu-item'`, and that child's one child `kind='service-window'` carrying the location + window in `label`

#### Scenario: Forward trace with no consumption returns the root with empty children
- **WHEN** `traceForward(orgA, lotX)` is called and `lotX` is a valid lot in `orgA` but has zero `LOT_CONSUMED` events
- **THEN** the result is a `TraceNode { id=lotX, kind='lot', label=…, children: [] }` (200 OK at the controller, NOT 404)

#### Scenario: Forward trace beyond depth cap marks leaves with `depthExceeded`
- **WHEN** `traceForward(orgA, lotX)` is called, the org has `recall_max_depth=2`, and the consumption graph actually extends 4 levels deep beyond `lotX`
- **THEN** the result's leaf nodes at depth 1 (the recipes layer at `depth = maxDepth - 1`) carry `depthExceeded: true` AND do NOT contain any `children` entries from below the cap

### Requirement: TraceService.traceReverse walks anchor → recipes → lots that fed it

The system SHALL expose `TraceService.traceReverse(organizationId, leafAnchor, opts?): Promise<TraceNode>`. The result SHALL be a tree rooted at the supplied anchor (kind `'symptom' | 'menu-item' | 'recipe'`) whose subtree walks backward through the consumption ledger to the set of `Lot` records that fed it. Walking SHALL stop at the configured `recall_max_depth`.

#### Scenario: Reverse trace from a menu item identifies the contributing lots
- **WHEN** `traceReverse(orgA, { id: menuItemM, kind: 'menu-item' })` is called and audit_log shows recipe `recipeR` was consumed via `lotX` and `lotY` for this menu item
- **THEN** the result is a `TraceNode { kind: 'menu-item', id: menuItemM, children: [<recipeR node with two lot children: lotX, lotY>] }`

#### Scenario: Reverse trace from a recipe anchor returns the lots that fed it
- **WHEN** `traceReverse(orgA, { id: recipeR, kind: 'recipe' })` is called and audit_log shows recipe `recipeR` was consumed from `lotX` and `lotY`
- **THEN** the result is a `TraceNode { kind: 'recipe', id: recipeR, children: [<lotX leaf>, <lotY leaf>] }`

#### Scenario: Reverse trace from a symptom anchor without slice #11 resolver throws RecallInvalidAnchorKindError
- **WHEN** `traceReverse(orgA, { id: 'evt-…', kind: 'symptom' })` is called BEFORE slice #11's anchor-resolver is wired into the BC
- **THEN** the service throws `RecallInvalidAnchorKindError` with the message naming the missing resolver

### Requirement: Depth cap is enforced at the SQL recursion boundary AND honours per-org override

The system SHALL apply `RECALL_TRACE_MAX_DEPTH=10` as the canonical depth cap, sourced from `apps/api/src/recall/domain/constants.ts`. The system SHALL check `organizations.recall_max_depth` (INT NULL) at query time; when NOT NULL, the row value SHALL be used in place of the constant. The depth filter SHALL be present in the SQL recursive arm itself (NOT only in application code) so adversarial inputs cannot cause unbounded recursion.

#### Scenario: Org override of 5 caps walking at 5 levels
- **WHEN** `organizations.recall_max_depth = 5` for `orgA` and `traceForward(orgA, lotX)` is called against a graph that genuinely extends 10 levels deep
- **THEN** the returned tree's deepest leaves are at depth 4 (`maxDepth - 1`) and carry `depthExceeded: true`

#### Scenario: Null override falls back to RECALL_TRACE_MAX_DEPTH
- **WHEN** `organizations.recall_max_depth IS NULL` for `orgB` and `traceForward(orgB, lotY)` is called
- **THEN** the effective cap is 10 (the module constant value)

#### Scenario: Service caller cannot exceed the org-level cap via opts.maxDepth
- **WHEN** `traceForward(orgA, lotX, { maxDepth: 999 })` is called and `organizations.recall_max_depth = 5`
- **THEN** the effective cap is `min(999, 5) = 5` (the service clamps before issuing the SQL)

### Requirement: GET /m3/recall/trace/{forward,reverse} requires OWNER or MANAGER role

The system SHALL expose two REST endpoints under `/m3/recall/trace/*`. Both SHALL declare `@Roles('OWNER', 'MANAGER')` so the global `RolesGuard` rejects STAFF callers with HTTP 403. The `organizationId` SHALL be sourced from the authenticated user's JWT, not from the query string.

#### Scenario: STAFF caller receives 403
- **WHEN** a STAFF-role user calls `GET /m3/recall/trace/forward?lotId=…`
- **THEN** the API returns HTTP 403 Forbidden (RolesGuard rejection); the trace service is NOT invoked

#### Scenario: OWNER caller receives the 200 tree
- **WHEN** an OWNER-role user in `orgA` calls `GET /m3/recall/trace/forward?lotId=<orgA-lot>`
- **THEN** the API returns HTTP 200 with the `TraceNode` JSON; multi-tenant gate uses the JWT's `organizationId`

#### Scenario: Cross-tenant lot lookup returns 404
- **WHEN** an OWNER in `orgA` calls `GET /m3/recall/trace/forward?lotId=<orgB-lot>`
- **THEN** the API returns HTTP 404 (translated from `RecallAnchorNotFoundError` since the lot is not in `orgA`); no row from `orgB` leaks

### Requirement: `recall_max_depth` column persists per-org with safety CHECK

The migration `0036_add_recall_traversal_indexes.ts` SHALL add a nullable `recall_max_depth INT` column to `organizations` with a `CHECK (recall_max_depth IS NULL OR recall_max_depth BETWEEN 1 AND 30)` constraint. The default value SHALL be NULL.

#### Scenario: Inserting a CHECK-violating value is refused at DB level
- **WHEN** an operator SQL `UPDATE organizations SET recall_max_depth = 0` (zero is invalid)
- **THEN** Postgres raises a CHECK-constraint violation

#### Scenario: Inserting 30 is accepted (boundary)
- **WHEN** `UPDATE organizations SET recall_max_depth = 30`
- **THEN** the statement succeeds (30 is the inclusive upper bound)

### Requirement: Three traversal indexes on `audit_log.payload_after` paths

The migration `0036_add_recall_traversal_indexes.ts` SHALL create three B-tree expression indexes on `audit_log`, each gated by a partial WHERE on the field non-null:

- `idx_audit_log_payload_lot_id` ON `("organization_id", ("payload_after"->>'lot_id'))` WHERE `payload_after->>'lot_id' IS NOT NULL`
- `idx_audit_log_payload_recipe_id` ON `("organization_id", ("payload_after"->>'recipe_id'))` WHERE `payload_after->>'recipe_id' IS NOT NULL`
- `idx_audit_log_payload_menu_item_id` ON `("organization_id", ("payload_after"->>'menu_item_id'))` WHERE `payload_after->>'menu_item_id' IS NOT NULL`

#### Scenario: `pg_indexes` reflects the three indexes after migration
- **WHEN** migration 0036 runs against a fresh test database AND the test queries `pg_indexes WHERE tablename = 'audit_log' AND indexname LIKE 'idx_audit_log_payload_%'`
- **THEN** exactly three rows are returned

#### Scenario: Down migration drops indexes + column
- **WHEN** migration 0036 is rolled down
- **THEN** the three indexes are dropped AND `organizations.recall_max_depth` is dropped AND the up migration replays idempotently

### Requirement: RecallTraceTree component renders flat-list with margin rule (no nested cards)

The system SHALL ship `packages/ui-kit/src/components/RecallTraceTree/` which renders a `TraceNode` tree as a single flat list with a left-margin accent rule per depth level (NOT as nested card containers, per DESIGN.md §6). The component SHALL set `role="tree"` on the root and `aria-level={depth + 1}` on each item. Touch targets SHALL be ≥ 48 px tall. Items with `depthExceeded: true` SHALL render a muted `…profundidad excedida` eyebrow.

#### Scenario: A 3-level tree renders 3 list items in a flat ul/li structure
- **WHEN** the consumer mounts `<RecallTraceTree tree={threeLevelTree} mode="forward" />`
- **THEN** the DOM contains a single `<ul role="tree">` with three `<li role="treeitem" aria-level="1|2|3">` items, NOT three nested card containers

#### Scenario: A depthExceeded leaf renders the muted eyebrow
- **WHEN** the consumer mounts a tree whose deepest leaf has `depthExceeded: true`
- **THEN** that leaf's rendered output includes the text "profundidad excedida"

#### Scenario: Mode chip click invokes onModeChange
- **WHEN** the consumer mounts `<RecallTraceTree mode="forward" onModeChange={fn} />` and the user clicks the reverse-mode chip
- **THEN** `fn` is invoked with the argument `"reverse"`
