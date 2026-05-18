# retros/m2-menus-margins.md

> **Slice**: `m2-menus-margins` · **PR**: [#79](https://github.com/Wizarck/nexandro/pull/79) · **Merged**: 2026-05-05 · **Squash SHA**: `e81cd08`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: Wave 1.3 main-thread slice, paired in parallel with subagent's `m2-allergens-article-21` (PR #80). First slice to consume the M2 cost engine end-to-end on a real customer-facing endpoint.

## What we shipped

The "MenuItem is the sellable thing" layer. CRUD service + 6 endpoints over `apps/api/src/menus/`, composite-uniqueness via partial unique index (`is_active = true`), and `getMargin(orgId, id)` that calls `CostService.computeRecipeCost` to compute live margin + classify per ADR-016 thresholds (`on_target` / `below_target` / `at_risk` / `unknown`). Discontinued-badge propagation from a soft-deleted parent Recipe surfaces in both `findOne`'s `MenuItemView.recipeDiscontinued` and the margin report.

20 new unit tests (4 `classify` boundary checks + 7 CRUD + 8 `getMargin`), 1 in-process perf test (p95 <200 ms across 50 samples), 1 INT spec (Docker-deferred: end-to-end create + duplicate + recreation-after-softdelete + Discontinued cascade). **Total: 426 tests** (was 406).

## What worked

- **The cost-seam pattern paid off twice.** This slice consumed `CostService.computeRecipeCost` + `CostBreakdown.components[*].unresolved` to gracefully degrade when no preferred SupplierItem exists. Three failure modes (`unresolved` component, `CostRecipeNotFoundError`, generic `Error`) all degrade to `{ cost: null, status: 'unknown', warnings: [...] }` instead of 5xx — the kind of robustness that matters when the kitchen tablet shows a margin to a chef mid-service.
- **Static `MenuItemsService.classify`.** Pulling the threshold logic into a pure static function means the 4 boundary tests (`0`, `-0.05`, `-0.0501`, `null`) ran without any mock infra. Same trick as `cycle-detector.ts`'s pure DFS: testable in isolation, no DI gymnastics.
- **Partial unique index `WHERE is_active = true`.** Soft-deleted MenuItems don't block recreation of the (recipe, location, channel) combo. INT spec covers it explicitly. The unit test mocks Postgres' unique-violation by fabricating a `QueryFailedError`; the controller's `translate(err)` raises 409 `MENU_ITEM_DUPLICATE` with the offending tuple in the body.
- **`MenuItemView` synthesises `recipeDiscontinued` from the parent recipe.** UI doesn't have to do a second lookup. The `displayLabel` synthesis follows the m2-recipes-core pattern.
- **Subagent paired cleanly.** Both slices are pure additive: subagent took `recipes/` extensions + migration `0012`, this slice took `menus/` extensions + migration `0013`. Locale prefix discipline (`MENU_*` here, `ALLERGEN_*` there) made even the locale append a non-event — but actually neither slice ended up touching locales except the subagent's append at the bottom of the existing `errors` block.

## What didn't (and the fixes)

- **Initial draft used `em.getRepository(this.recipes.target)`.** That would have worked but was awkward — `.target` is metadata-typed. Refactored to `em.getRepository(Recipe)` with explicit imports of `Recipe` and `Location`. Cleaner reads.
- **`LocationRepository` was injected but only used inside `create()`'s transaction**, where I switched to `em.getRepository(Location)`. Removed the constructor parameter to keep the signature minimal.
- **First-pass test mocks reused `service['menuItems']` etc. for "private repo access".** That's TypeScript escape-hatch territory. It works because the repos aren't actually private at runtime, but it's a smell — a future refactor that injects via `useFactory` would expose this. Kept for now because the alternative (mocking the entire transaction-em chain) was 3× the boilerplate.

## Surprises

- **All 6 CI checks green on first push.** Including the still-young Integration (Postgres) job — its second slice in production after PR #76 introduced it, and its first encounter with a non-trivial INT spec that traverses `MenuItem ↔ Recipe ↔ SupplierItem` end-to-end.
- **CodeRabbit had zero findings.** Three slices in a row now (#75, #79, #80 still pending, but #75 + #79 were both clean). The codebase is converging on a stable shape that the AI reviewer recognises.
- **The perf test ran 50 samples in <2 ms total**, far under the 200 ms p95 threshold — the in-process hot path is dominated by the ad-hoc Map lookups in the CostService mock. Real DB latency would dominate; this test is purely an algorithmic-regression guard, not a latency benchmark. Worth flagging in the PR body.

## What to keep

1. **`{ cost: null, status: 'unknown', warnings: [...] }` graceful-degrade pattern.** Reused across NO_SOURCE / not-found / generic-Error paths. The chef gets a "Cost unknown" badge with a warnings list rather than a 5xx blocking the page. Codify in a future runbook entry "user-facing read endpoints never 5xx for upstream-data issues".
2. **Static `classify` + boundary tests.** Pure-function classifier extracted from the service's main flow. Pattern: any time a service method's output enum depends on a numeric threshold, push the classification into a static testable helper.
3. **Partial unique index for soft-delete-tolerant uniqueness.** Composite `(orgId, recipeId, locationId, channel) WHERE is_active = true` is the canonical pattern. Reuse for any future "one-active-row-per-tuple" constraint (e.g. `m2-labels-rendering`'s "one active label config per (recipe, channel)" if it lands that way).
4. **`MenuItemView.recipeDiscontinued` boolean on the read path.** UI consumes a hint, not a derived check on its end. If M3 introduces a third "stale-batch" state, extend the view to carry it.

## What to change

1. **Lift the recipe-tree walker.** Subagent's allergens slice noticed it had to re-implement `CostService.computeWithEm`'s `visiting: Set<string>` cycle defence. This slice didn't need it (only top-level Recipe lookup), but `m2-labels-rendering` will. Worth extracting `walkRecipeTree(em, orgId, recipeId, onLeaf, options?)` into `recipes/application/recipe-tree-walker.ts` BEFORE slice #10 starts.
2. **Numeric column transformer**. `Number(m.sellingPrice)`, `Number(m.targetMargin)`, `Number(c.lineCost)` keeps appearing at boundaries. A TypeORM column transformer (`transformer: { from: (v) => Number(v), to: (v) => v }`) on the cost-relevant numeric columns would centralise this. Filed.
3. **Margin-panel UI deferred to UX track.** No UI shipped here — Master direction. The endpoint is consumable by `MarginPanel` whenever it lands.

## Wave-N parallelism observations (Wave 1.3 — second real run)

| Aspect | This slice (main thread) | Subagent (m2-allergens) |
|---|---|---|
| Implementation wall-clock | ~50 min | ~11 min (subagent runtime) |
| Tests written | 19 unit + 1 perf + 1 INT | 21 unit + 1 INT |
| Files touched | 6 (menus BC + migration 0013 + module + tasks.md) | 12 (recipes extensions + migration 0012 + module + cost.events.ts append + 2 locale appends + tasks.md) |
| Boundary violations | 0 | 0 (subagent reported "Worktree clean; nothing outside the boundary list") |
| First-push CI | 6/6 green | 5/6 (Integration spec failed; one warning-trigger semantics mismatch) |
| Coordination overhead | ~5 min prompt drafting + ~5 min reviewing return + ~10 min fixing the subagent's INT-spec warning logic | — |

The §6.6 cost-benefit threshold (~30 min of parallelisable work) was met comfortably. Aggregate wall-clock saved: ~30-40 min vs sequential.

The single failure (subagent's warning-emission semantics) was a design ambiguity, not a boundary or quality issue: the spec said "warn on contradiction" without pinning whether `everyCarries` was a precondition. The subagent picked the strict interpretation; the test fixture assumed the lenient one. Fixed in a follow-up commit on the slice branch (no extra PR needed).

## Cross-references

- Specs (archived): `openspec/specs/m2-menus-margins/`
- ADRs: ADR-016 (margin status thresholds), ADR-010 (M2 contexts boundary)
- Predecessor: `retros/m2-cost-rollup-and-audit.md` (the `liveRecipeCost` accessor consumed here)
- Parallel sibling: `retros/m2-allergens-article-21.md` (PR #80, same wave, subagent-implemented)
- Foundation: `openspec/specs/m2-data-model/` (MenuItem entity from wave 0)
- ai-playbook: `specs/release-management.md` §6.4 (wave parallelism, second real run), §4.5 (PR self-review checklist)
