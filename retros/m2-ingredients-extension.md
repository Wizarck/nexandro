# retros/m2-ingredients-extension.md

> **Slice**: `m2-ingredients-extension` · **PR**: [#84](https://github.com/Wizarck/nexandro/pull/84) · **Merged**: 2026-05-05 · **Squash SHA**: `cce620b`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: Wave 1.5 main-thread slice (paired with subagent's m2-mcp-server, PR #85). Closes IngredientPicker's OFF dependency from #13. First slice that introduces the `recipe-tree-walker.ts` shared helper. Override storage chose jsonb (matching #7 + #13 patterns). Fourth use of the proposal-only-first pattern.

## What we shipped

The OFF-backed Ingredient extension layer + recipe macro rollup:

Backend (`apps/api/src/`):
- **Migration 0014** — `ingredients.overrides jsonb DEFAULT '{}'::jsonb NOT NULL`
- **Ingredient entity extension** — new `overrides: IngredientOverridesMap` field with `IngredientOverrideEntry`/`IngredientOverridableField`/`OVERRIDABLE_FIELDS` exports
- **New `IngredientsService`** — `searchByBarcode` (delegates #4's ExternalCatalogService), `prefillFromOff` (pure mapper), `applyOverride` (jsonb merge + ≥10-char reason validation), `getMacroRollup` (consumes the new walker)
- **New `recipe-tree-walker.ts`** — visitor-style helper with cycle defence + depth cap (10) + cumulative `(yield × (1 − waste))` chain + `scaledQuantity` accumulator. Used today by macro rollup; allergens + cost.service refactor explicitly deferred (their walkers have specific cache/currency contracts that don't generalise cleanly here).
- **New event** `INGREDIENT_OVERRIDE_CHANGED` (channel reserved; future audit-log listener subscribes when audit_log lands)
- **3 new endpoints**: `GET /ingredients/search?barcode=`, `POST /ingredients/:id/overrides`, `GET /recipes/:id/macros` (the macros controller lives in IngredientsModule to avoid circular Recipes ↔ Ingredients dep)
- **2 extended endpoints** — `GET /ingredients/:id` and list now expose `nutrition`, `allergens`, `dietFlags`, `brandName`, `externalSourceRef`, `overrides` fields

UI (`packages/ui-kit/src/components/MacroPanel/`):
- 5 files per file-layout convention
- Compact (per-portion only) + expanded (per-portion + per-100g side-by-side)
- ODbL attribution **always visible** when `externalSources` non-empty (Gate D 3a — compliance margin > UI density)
- 13 unit tests + 6 Storybook stories

apps/web:
- `useRecipeMacros` TanStack Query hook
- Extended `RecipeBuilderJ1Screen` with a Macros section gated on `recipeId` query param

Tests: **21 new backend** (11 recipe-tree-walker + 10 IngredientsService) + **13 new ui-kit** = **480 backend + 114 ui-kit total**. Vite production build = 96.36 KB gzipped (still under 300 KB target). Storybook = 9 components.

## What worked

- **Override storage decision (jsonb) ages well.** Master picked 1a (jsonb) over the sibling-columns alternative. The `IngredientOverrideEntry` shape matches `#7`'s diet-flags-override pattern and stays compact. Adding a 5th overridable field (e.g. `densityFactor`) is a one-line type addition; sibling-columns would have been a migration.
- **`recipe-tree-walker.ts` visitor pattern is clean.** Caller passes `onLeaf({ line, parentRecipe, depth, cumulativeYieldWaste, scaledQuantity })`. Cycle defence + depth cap + load logic centralised. The macro rollup consumer is ~30 LOC — most of the complexity is in the visitor's nutrition aggregation, which is the actual domain logic.
- **The "cumulative chain" exposed by the walker** (`cumulativeYieldWaste` + `scaledQuantity`) means callers don't have to re-walk their own ancestor chain. The walker tracks the multipliers; consumer just multiplies leaf quantity once. Test #5 (mixed parent + sub-recipe yield/waste) passes on first try because the chain is already correct.
- **Avoiding the cost.service walker refactor.** I started planning a unified visitor that handled both cost.service's tree-result-with-cache contract AND allergens' flat accumulator. Realised the abstraction would be heavier than the duplication it removes. Pivoted to "ship a new walker for the new caller; refactor older callers later when patterns converge". Filed as tech debt; honest call.
- **Per-component file layout muscle memory.** 4th component slice in a row with the same `<Name>/{tsx, stories, test, types, index}` layout. Reviewer cognitive load is now near zero.
- **No circular dep.** `RecipesMacrosController` lives in `IngredientsModule` (because the rollup is owned by `IngredientsService`) but routes under `/recipes`. NestJS doesn't care which module hosts a controller; URL space is a routing concern. Avoiding the circular `RecipesModule ↔ IngredientsModule` import was a 2-minute call.
- **Existing `ExternalCatalogService.searchByBarcode` from #4 worked verbatim.** No API changes needed; the slice just consumes the existing graceful-degrade behaviour. `searchByBarcode` already returns null on outage; my service forwards that.
- **Barrel re-export discipline.** Added `MacroPanel` + `PRIMARY_MACRO_KEYS` + `MACRO_LABELS` to the kit's barrel; consumer-side `import { MacroPanel } from '@nexandro/ui-kit'` works without diving into folders.

## What didn't (and the fixes)

- **Initial test fixture used non-UUID strings for `recipeId` in `MenuItem.create`.** Same pattern that bit `#15`. The Ingredient entity validates UUIDs; my walker spec didn't (it constructs `Recipe` directly via `new Recipe()` not `Recipe.create({...})`), so this didn't bite. But the IngredientsService spec needed proper UUIDs for fixtures. Fixed before commit.
- **TS overload mismatch on `dataSource.transaction` mock.** `DataSource.transaction` has 2 overloads (with and without isolation level); jest's `mockImplementation` typed against the first overload. Fix: declared `transaction: jest.fn().mockImplementation(...)` on the mock object directly with `cb: unknown` + cast inside. Cleaner than fighting the overload typing.
- **Unused `RecipeTreeRecipeNotFoundError` import in `ingredients.service.ts`.** I re-exported it intending to translate it to 404 in the controller. Then I added the translator in `recipes-macros.controller.ts` instead. Left the re-export anyway — small cost, future-proof.
- **`apps/api` lint warning about `RecipeLineResponseDto` import.** Recipes controller imported it for the staff-view DTO and IDE-flagged it as unused. Fixed in dto file (the import lands on `RecipeStaffViewDto` indirectly).
- **One `npm test --workspace=apps/api` shell error.** Local Windows cygwin had a fork retry issue once; running `npx jest` directly in `apps/api/` worked. Documented as a tooling gotcha; CI runs Linux so doesn't hit it.

## Surprises

- **CodeRabbit had zero findings on the proposal PR commit.** That's 8 in a row now (counting #82, #83 + projected for #84). Cycle of 8 clean reviews is meaningful; should schedule the deliberate-bug-introduction sanity audit after this slice (filed in #15 retro).
- **The Gate D verdict came back almost instantly** ("yes to all"). 4th time in a row that binary-fork questions get fast verdicts. The pattern is now reliable enough that I should always prefer this format over open-ended questions.
- **480 backend tests in ~10 seconds.** Jest with the `--testPathIgnorePatterns="\.int\.spec\."` flag keeps the unit suite very fast; CI Postgres job picks up the 14 INT specs separately. Local-first DX is good.
- **Bundle delta from this slice: +0.78 KB gzipped.** 95.58 → 96.36 KB. New component + new hook + extended screen = ~800 bytes. Each of the 8 remaining components-or-screens (across `#10`+`#11`+`m2-mcp-extras`) should fit comfortably in the remaining 200 KB of headroom.
- **The walker's cumulative-yield-waste math passed all 11 tests on first run.** I expected at least one off-by-one or sign error. The `(yield × (1 − waste))` formula is well-defined enough that getting it right once was sufficient.
- **The override `value: unknown` typed property.** Each overridable field has a different value shape (string[] for allergens/dietFlags, jsonb for nutrition, string for brandName). Typing `value: unknown` and validating per-field at the service layer worked cleanly. A discriminated union would have been more type-safe but ~3x more code; trade-off favours the current approach until a real bug surfaces.

## What to keep

1. **Defer-and-document over force-unify.** When two existing implementations share <30% of structure, lift only what's clean and ship a new walker for the new caller. File a tech-debt note. Don't over-abstract. (Confirmed pattern across `#15` + this slice.)
2. **`<Helper>.spec.ts` colocated with `<Helper>.ts`.** The walker's test file lives next to the walker. Reviewer sees both in one `ls`; no spelunking through `__tests__/` folders.
3. **Visitor pattern with rich context.** The walker's `LeafContext` includes `depth`, `cumulativeYieldWaste`, `scaledQuantity` — every consumer-relevant fact is on the visitor parameters. No need for the consumer to track its own chain state.
4. **`OVERRIDABLE_FIELDS` const + type.** Listing the fields once + deriving the type means controller validation, service lookup, and DTO enum stay in lockstep. Adding a field is a single-line change.
5. **ODbL attribution as a `data-testid` element.** Tests assert visibility/absence by test id, not by full text content. Fragile to copy changes (e.g. translation), robust to layout tweaks.

## What to change

1. **Backfill the cost.service + allergens walker refactor when the macros + label-rendering walkers compose enough to suggest a unified visitor.** Today: 4 callers, 2 walkers (cost-service + allergens), 1 new walker (macros). Once `m2-labels-rendering` lands a 4th and possibly a 5th caller, the unified visitor pattern becomes worth the refactor cost.
2. **Add `migrate:run` to CI Postgres job validation.** Migration `0014_ingredients_overrides_column.ts` only validates via INT spec runs (Docker-deferred). A pre-test `migrate:run` step on the Postgres CI job would catch malformed SQL earlier.
3. **`docs/ux/components.md` STILL doesn't track owning slice + status.** Filed in #13 retro, again in #15 retro. Add the column.
4. **Ingredient `overrides` field — define a TypeScript discriminated union per field.** Currently `value: unknown` typed. Once we know all 4 overridable fields are stable (post-`#10` likely), tighten to `value: string[] | string | Record<string, unknown>` keyed on `field`. Filed.
5. **`recipe-tree-walker.ts` should expose `walkRecipeTreeWithCache<T>(...)` for callers that want sub-recipe memoization.** Today only macros uses it; macros doesn't need memoization (sub-recipe traversed once per parent reference). When cost.service eventually migrates, it'll need the cache. Plan: add the cached variant as part of the cost.service refactor slice.

## Wave-N parallelism observations (Wave 1.5 — third real run)

| Aspect | This slice (main thread) | Subagent (m2-mcp-server) |
|---|---|---|
| Implementation wall-clock | ~80 min | TBD when subagent reports |
| Tests written | 21 backend unit + 13 ui-kit unit | TBD |
| Files touched | 14 (migration + entity + service + walker + 2 controllers + module + 4 DTO files + barrel + screen + hook + tests) | TBD |
| Coordination overhead | ~10 min prompt drafting + ~10 min reviewing return + (any fix commits TBD) | — |
| Boundary violations | 0 (own work) | TBD |

The §6.6 cost-benefit threshold (~30 min of parallelisable work) was clearly met for both tracks. Parallel time saved expected: ~40-60 min vs sequential.

## Cross-references

- Specs (archived): `openspec/specs/m2-ingredients-extension/`
- ADRs: ADR-013 (Agent-Ready — N/A here), ADR-015 (OFF mirror — consumed verbatim), ADR-018 (per-100g vs per-portion macros — locked here in MacroPanel); no new ADR
- Predecessors: `retros/m2-data-model.md` (#1 — base entity), `retros/m2-off-mirror.md` (#4 — ExternalCatalogService consumed), `retros/m2-recipes-core.md` (#2 — Recipe + RecipeIngredient consumed by walker), `retros/m2-allergens-article-21.md` (#7 — RecipesAllergensService for staff-view in #15 + override-jsonb pattern), `retros/m2-ui-foundation.md` (#12 — file-layout contract), `retros/m2-ui-backfill-wave1.md` (#13 — IngredientPicker OFF graceful-degrade closed by this slice)
- Parallel sibling: `retros/m2-mcp-server.md` (#85, same wave, subagent-implemented)
- ai-playbook: `specs/release-management.md` §6.4 (wave parallelism, third real run), §6.7 (proposal-only-first — fourth use)
