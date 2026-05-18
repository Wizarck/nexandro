# retros/m2-cost-rollup-and-audit.md

> **Slice**: `m2-cost-rollup-and-audit` · **PR**: [#75](https://github.com/Wizarck/nexandro/pull/75) · **Merged**: 2026-05-04 · **Squash SHA**: `f2c9207`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: First slice that consumed and **closed** the `InventoryCostResolver` seam introduced in M1. Wave 1.2 (sequential after Wave 1.1's parallel pair).

## What we shipped

The live food-cost engine. Sub-recipe-tree rollup with `qty × cpb × yield × (1 − waste)` per ingredient line and `subRecipeTotal × qty × yield × (1 − waste)` per sub-recipe line, 4-decimal rounding everywhere, rollup-tolerance warning at >0.0001. New `cost/` BC at `apps/api/src/cost/` with: `PreferredSupplierResolver` (replaces M1's resolver, adds override-first lookup via `ResolveOptions.sourceOverrideRef`), `CostService` (compute + delta + recordSnapshot + 4 event handlers), `RecipeCostHistory` entity + migration `0011_recipe_cost_history` (append-only, `(recipe_id, computed_at DESC)` index), 3 new GET endpoints + 1 new PUT.

22 new unit tests, 1 in-process perf test (p95 <200 ms for a 100-node recipe), 1 INT spec (Docker-deferred) covering end-to-end resolver wiring + supplier price cascade + override + cost-delta. **Total: 405 tests green** (was 383).

## What worked

- **The seam paid off.** M1's `INVENTORY_COST_RESOLVER` DI token (apps/api/src/cost/inventory-cost-resolver.ts) plus `M1InventoryCostResolver` was the first time we built a seam ahead of the consumer. M2 swapped the implementation by deleting the M1 file, dropping `PreferredSupplierResolver` into `cost/application/`, and rebinding `useExisting`. Total integration cost: 0 changes to other call sites.
- **Backward-compat 2nd-arg shape.** `resolveBaseCost(ingredientId, options?: ResolveOptions | Date)` keeps the M1 spec compiling unchanged while letting callers pass `{ asOf, sourceOverrideRef }`. The `normaliseResolveOptions` helper centralises the union-narrow.
- **EventEmitter2 + @OnEvent gives us cascade for free.** SUPPLIER_PRICE_UPDATED → recompute every dependent recipe; SUB_RECIPE_COST_CHANGED → walk parents. The recursion guard (`subRecipeId === recipeId` self-emit check inside `onSubRecipeCostChanged`) is one line.
- **The `recordSnapshot` pattern.** Persisting per-component rows + a totals row (componentRefId NULL) makes `computeCostDelta` trivial: build a snapshot at boundary `t` by taking the latest row at-or-before `t` for each `componentRefId` (and the latest totals row for the recipe-level total). No window-function gymnastics; pure JS over the rows from a `Between(0, t)` query.
- **In-process perf test as a guardrail.** `cost.service.perf.spec.ts` runs 20 samples on a 100-node fake-EM tree, asserts p95 <200 ms. Doesn't model DB latency, but it catches algorithmic regressions cheaply (no Docker). Real latency is dominated by `findBy({ id: In([...]) })` round-trips, which we batch (1 query for ingredients, 1 for sub-recipes).
- **Self-review checklist on the PR body.** Eight items per §4.5 of the runbook; each one a 5-second cognitive nudge. Caught one before push: the typed error `RecipeIngredientNotFoundError` wasn't being mapped in `RecipesController.translate()`.

## What didn't (and the fixes)

- **The pre-existing INT spec broke when I added `EventEmitter2` to `RecipesService`.** TypeORM TestingModule didn't have `EventEmitterModule.forRoot()` in imports, so DI couldn't satisfy the new constructor parameter. Fix: added the import to `recipes.service.int.spec.ts`. Lesson: when you add a DI dep to an injectable, grep for its `Test.createTestingModule` blocks.
- **Initial naive ingredient lookup was N queries.** First draft did `em.getRepository(Ingredient).findOneBy({ id })` inside the loop. Refactor: pre-batch with `findBy({ id: In([...]) })`, build a `Map<id, Ingredient>`, look up. Same for sub-recipes. The 100-node perf test went from ~150 ms to <5 ms p95 after this.
- **`recipe.wasteFactor` came back as a string from TypeORM.** Postgres `numeric` columns serialize as strings. The cost computation was multiplying strings, producing `"1000NaN"`. Fix: explicit `Number(recipe.wasteFactor)` and `Number(line.quantity)` at the boundary. Filed as a tiny risk for future numeric columns.
- **The `Not` import was unused.** Initial draft had `Not(IsNull())` in a TypeORM query that I refactored away, but left the import. Caught by `tsc --noEmit` as `unused-import` lint warning. Removed.
- **Unrequired `void Not;` workaround left behind from the refactor** until I cleaned it up. Reminder: when you remove the cause, remove the workaround too.

## Surprises

- **CodeRabbit ran in <2 minutes and found nothing.** Both prior slices (m2-recipes-core, m2-off-mirror) had CodeRabbit hit minor nits. This one was clean — possibly because the slice is more isolated (new BC, no shared-file edits beyond `app.module.ts` + `package.json` + the supplier controller's event-emit + the recipes service/controller's PUT endpoint and source-override emit).
- **All 5 required CI checks went green on the first push.** No rebase, no fixup. Both prior wave-1 slices had at least one DIRTY/CONFLICTING moment. The difference here: only one slice in flight (wave 1.2 is sequential after wave 1.1).
- **`@nestjs/event-emitter` install reformatted `package.json` arrays inline → multi-line.** Same issue m2-off-mirror saw. The fix this time was no fix — npm normalised it into multi-line, which is what the file already had at root level. We're not yet enforcing inline arrays anywhere, so this is fine.

## What to keep

1. **Seam-then-consume.** The InventoryCostResolver pattern (interface in cost/, M1 binding via DI, M2 rebinds drop-in) is the canonical way to introduce architectural seams that need to be implemented before the consumer ships. M3's batch-aware resolver will follow this exact playbook.
2. **`recordSnapshot` as the single write path.** All four cost events route through `recordSnapshot(orgId, recipeId, reason)` which: (a) recomputes the breakdown via `computeWithEm`, (b) persists per-component + totals rows, (c) emits `SUB_RECIPE_COST_CHANGED`. Cascade is structural, not behavioural — listeners just call `recordSnapshot` again.
3. **In-process perf tests with `process.hrtime.bigint()`.** Cheap, runs on every push, catches algorithmic regressions before they hit staging. Pattern: warm-up + 20 samples + p95 assertion.
4. **`@OnEvent` self-emission guard.** One line (`if (id === evt.subRecipeId) continue`) prevents infinite cascade. Codify in the slice spec for any future event emitter that recurses.
5. **Self-review checklist in the PR body.** §4.5 items rendered as `[x]` — the act of checking each box catches subtle issues.

## What to change

1. **Numeric column boundary normalisation.** Every place we read a `numeric` column needs explicit `Number(...)`. Consider a TypeORM column transformer (`transformer: { from: Number, to: String }`) on the cost-relevant fields so the serialisation surprise lives in one place.
2. **`computeCostDelta`'s "snapshot at boundary" loop is O(N) per row.** Fine for the 14-day default window; will need an index-only scan + DISTINCT ON when history grows. Filed as a future optimisation; M2 doesn't hit the threshold.
3. **Recompute fan-out is unbounded** when a SupplierItem price change touches many recipes. Currently `for (const id of recipeIds) await recordSnapshot(...)` runs sequentially in the @OnEvent handler. M3 may need a queue (`@nestjs/bull`?) if a single supplier change cascades through hundreds of recipes.
4. **The 1000-row CSV fixture is still missing** (filed under generic follow-ups). m1-csv-import-export uses smaller fixtures; we'll need bigger ones once a real customer imports a full catalogue.

## Wave-N parallelism observations (sequential slice this time)

| Aspect | Number |
|---|---|
| Slice complexity | High (interface refactor + tree walker + cost-history + event hooks + 4 endpoints) |
| Implementation wall-clock | ~75 min focused work |
| Tests written | 22 unit + 1 perf + 1 INT (deferred) |
| PR open + CI + admin-merge | ~3 min (5/5 green on first push, no CodeRabbit nits) |
| Total wall-clock | ~80 min |

This slice was deliberately sequential (after the wave 1.1 parallel pair m2-recipes-core + m2-off-mirror). Wave parallelism §6.4 says ~30 min of parallelisable work is the threshold; m2-cost-rollup is single-thread complex enough that splitting it would have introduced more coordination cost than benefit. The next wave (1.3) will likely re-introduce the wave parallelism pattern with `m2-allergens-article-21` (independent BC) running in a subagent while the main thread does `m2-menus-margins`.

## Cross-references

- Specs (archived): `openspec/specs/m2-cost-rollup-and-audit/`
- ADRs: ADR-011 (InventoryCostResolver M2→M3 seam), ADR-016 (4-decimal precision + 0.01% rollup tolerance)
- Foundation: `openspec/specs/m2-data-model/` (Recipe + RecipeIngredient + ingredient nutrition jsonb)
- Predecessor: `retros/m2-recipes-core.md` (RecipesService that this slice extended with `updateLineSource`)
- ai-playbook: `specs/release-management.md` §6.4 (wave parallelism — N/A here, sequential), §4.5 (PR self-review checklist)
