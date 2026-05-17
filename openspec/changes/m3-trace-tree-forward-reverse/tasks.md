## 1. Migration 0036 — traversal indexes + per-org depth override

- [ ] 1.1 `apps/api/src/migrations/0036_add_recall_traversal_indexes.ts` — class `AddRecallTraversalIndexes1700000036000` implementing `MigrationInterface`
- [ ] 1.2 Create 3 partial B-tree expression indexes on `audit_log` per ADR-TRACE-INDEXES:
  - `idx_audit_log_payload_lot_id` ON `("organization_id", ("payload_after"->>'lot_id'))` WHERE non-null
  - `idx_audit_log_payload_recipe_id` ON `("organization_id", ("payload_after"->>'recipe_id'))` WHERE non-null
  - `idx_audit_log_payload_menu_item_id` ON `("organization_id", ("payload_after"->>'menu_item_id'))` WHERE non-null
- [ ] 1.3 Add `recall_max_depth INT NULL` column to `organizations` with CHECK `(recall_max_depth IS NULL OR recall_max_depth BETWEEN 1 AND 30)` per ADR-TRACE-DEPTH-CAP
- [ ] 1.4 Down migration drops indexes then column

## 2. Domain layer — constants + errors

- [ ] 2.1 `apps/api/src/recall/domain/constants.ts` — `export const RECALL_TRACE_MAX_DEPTH = 10;` (created here if slice #11 hasn't merged; re-exported at rebase time if it has)
- [ ] 2.2 `apps/api/src/recall/application/trace.errors.ts`:
  - `RecallAnchorNotFoundError` (HTTP 404) — anchor lookup empty
  - `RecallInvalidAnchorKindError` (HTTP 422) — anchor kind not yet resolvable (e.g. `'symptom'` until slice #11 lands)

## 3. Types — inline `TraceNode` shape

- [ ] 3.1 `apps/api/src/recall/types.ts` — `TraceNodeKind`, `TraceNode`, `TraceForwardOptions`, `TraceReverseOptions`, `ReverseAnchor` (NO `@nexandro/contracts` import per ADR-TRACE-NODE-SHAPE)

## 4. Application layer — TraceService

- [ ] 4.1 `apps/api/src/recall/application/trace.service.ts`:
  - Constructor takes `DataSource` (`@InjectDataSource`) + `OrganizationRepository` (or direct query for the depth override; pick the lighter dep) to read the per-org `recall_max_depth`
  - `resolveMaxDepth(organizationId, optsMaxDepth?)` — clamps to `min(optsMax, org.recall_max_depth ?? RECALL_TRACE_MAX_DEPTH)`; capped at module constant
  - `traceForward(organizationId, rootLotId, opts?)`:
    1. Probe `lots` for `(id=rootLotId, organization_id=organizationId)` — throw `RecallAnchorNotFoundError` if missing
    2. Resolve effective max depth
    3. Execute the forward recursive CTE → flat row-set
    4. Execute the secondary "would-have-children" probe for nodes at `depth = max - 1`
    5. Build the tree via single-pass `buildTree()` helper
  - `traceReverse(organizationId, anchor, opts?)`:
    1. Validate `anchor.kind` against the resolvable set (`'menu-item' | 'recipe'`); throw `RecallInvalidAnchorKindError` for `'symptom'`
    2. Resolve effective max depth
    3. Execute the reverse recursive CTE → flat row-set
    4. Build the tree via the same `buildTree()` helper
  - `buildTree(rows, rootId, maxDepth)` — pure helper; testable in isolation against fixture flat-row sets

## 5. Interface layer — REST controller + DTOs

- [ ] 5.1 `apps/api/src/recall/interface/dto/trace.dto.ts`:
  - `TraceForwardQueryDto` — `lotId` UUID required
  - `TraceReverseQueryDto` — `anchorId` UUID required + `anchorKind` enum (`'symptom' | 'menu-item' | 'recipe'`) required
- [ ] 5.2 `apps/api/src/recall/interface/trace.controller.ts`:
  - `@Controller('m3/recall/trace')` `@ApiTags('recall')`
  - `GET forward` `@Roles('OWNER', 'MANAGER')` — reads `organizationId` from `req.user` (mirror existing M2 pattern)
  - `GET reverse` `@Roles('OWNER', 'MANAGER')` — same
  - Both endpoints translate `RecallAnchorNotFoundError → NotFoundException`, `RecallInvalidAnchorKindError → UnprocessableEntityException`

## 6. Module wiring (NestJS)

- [ ] 6.1 `apps/api/src/recall/recall.module.ts` — registers `TraceService` provider + `TraceController`. If slice #11 has already merged, ADD `TraceService` to the existing module's `providers`; if not, create the module from scratch.
- [ ] 6.2 `apps/api/src/app.module.ts` — register `RecallModule` alongside the other M3 modules. Slice #11 also touches this file; at merge, keep the single module import + comment.

## 7. Unit tests

- [ ] 7.1 `apps/api/src/recall/application/trace.service.spec.ts`:
  - `buildTree()` builds expected shape from fixture flat-row set
  - `buildTree()` marks `depthExceeded` on leaves at `maxDepth - 1` when `would_have_children` is true
  - `resolveMaxDepth()` clamps to module constant when `org.recall_max_depth IS NULL`
  - `resolveMaxDepth()` honours per-org override
  - `resolveMaxDepth()` clamps to org value even when caller passes `opts.maxDepth=999`
  - `traceForward()` throws `RecallAnchorNotFoundError` when the root lot doesn't exist in the org
  - `traceForward()` returns the empty-tree shape when no consumption events exist
  - `traceReverse()` with `kind='symptom'` throws `RecallInvalidAnchorKindError`
- [ ] 7.2 `apps/api/src/recall/interface/trace.controller.spec.ts`:
  - Forward endpoint passes through to service + returns 200 with the tree
  - 404 translation from `RecallAnchorNotFoundError`
  - 422 translation from `RecallInvalidAnchorKindError`
- [ ] 7.3 `packages/ui-kit/src/components/RecallTraceTree/RecallTraceTree.test.tsx`:
  - Renders a 3-level tree as flat `<ul role="tree">` with `aria-level` per item (NOT nested cards)
  - Renders `…profundidad excedida` muted eyebrow on `depthExceeded` leaves
  - Mode chip click invokes `onModeChange('reverse')`
  - Empty tree renders the root + an empty-state message
  - Keyboard focus moves between items on Tab (no custom keymap — uses native button focus)

## 8. Frontend wiring (apps/web)

- [ ] 8.1 `apps/web/src/api/recallTrace.ts`:
  - `getForwardTrace(lotId): Promise<TraceNode>` — `GET /m3/recall/trace/forward?lotId=…`
  - `getReverseTrace(anchorId, anchorKind): Promise<TraceNode>`
  - Re-uses the existing `api<T>(path)` helper from `apps/web/src/api/client.ts`
- [ ] 8.2 `apps/web/src/hooks/useRecallTrace.ts`:
  - `useForwardTrace(lotId)` — `useQuery` keyed on `['recall-trace', 'forward', lotId]`, enabled only when `lotId` is truthy
  - `useReverseTrace({ anchorId, anchorKind })` — `useQuery` keyed on `['recall-trace', 'reverse', anchorId, anchorKind]`
- [ ] 8.3 `apps/web/src/screens/j6/RecallTraceTreeScreen.tsx`:
  - Owns `mode` state + the active lotId (placeholder selector for now — slice #13 will wire it to slice #11's search result)
  - Renders `<RecallTraceTree>` with the hook's data + mode + onModeChange
  - RoleGuard wrapper for OWNER+MANAGER (mirrors AuditLogScreen)

## 9. ui-kit barrel export

- [ ] 9.1 `packages/ui-kit/src/index.ts` — add `RecallTraceTree` + `RecallTraceTreeProps` + `TraceNode` + `TraceNodeKind` re-exports

## 10. Documentation + handoff

- [ ] 10.1 `apps/api/src/recall/README.md` — BC purpose, public surface (`TraceService`), what's claimed by downstream slices (#11 search, #13 dispatch, #14 PDF export, #15 APPCC export)

## 11. CI + PR hygiene

- [ ] 11.1 `pnpm -w typecheck` passes
- [ ] 11.2 `pnpm -w lint --max-warnings=0` passes
- [ ] 11.3 `pnpm -w test` passes (unit only — INT deferred)
- [ ] 11.4 `openspec validate m3-trace-tree-forward-reverse` returns 0
- [ ] 11.5 PR description cites the parallel slice #11 expected conflict surfaces (`recall.module.ts`, `app.module.ts`, possibly `domain/constants.ts`) and the resolution strategy (keep both providers; the constant lives in whichever slice merges first and the other re-exports)

## §Deferred

- [ ] D1 `apps/api/test/int/recall-traversal-depth.int-spec.ts` — INT testcontainer that seeds a real `audit_log` row-set + asserts the recursive CTE returns the correct flat row-set + the `depthExceeded` flag fires at the cap. File path reserved per architecture-m3 line 563. Deferred from this slice; followup tracked in M3.x backlog.
- [ ] D2 Per-org `recall_max_depth` admin UX (operator-facing form to change the value). The column is added in this slice's migration and honoured by the service; the admin surface is a separate slice.
- [ ] D3 Label-join enrichment for recipe / menu-item nodes (proper i18n labels from the M2 catalog). This slice renders placeholder labels (`"Receta " + id.slice(0,8)`); a followup slice wires the M2 i18n hooks.
- [ ] D4 Promote `TraceNode` shape to `packages/contracts/` once the TS `rootDir` cascade is resolved at the workspace level. Today it's duplicated between `apps/api/src/recall/types.ts` and `packages/ui-kit/src/components/RecallTraceTree/types.ts` per ADR-TRACE-NODE-SHAPE.
