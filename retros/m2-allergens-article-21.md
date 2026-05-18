# retros/m2-allergens-article-21.md

> **Slice**: `m2-allergens-article-21` · **PR**: [#80](https://github.com/Wizarck/nexandro/pull/80) · **Merged**: 2026-05-05 · **Squash SHA**: `58967c6`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: Wave 1.3 subagent slice, paired with main thread's `m2-menus-margins` (PR #79). Second Wave-N parallel test of the runbook §6.4 pattern; first to need a follow-up commit on the slice branch from the parent thread.

## What we shipped

The EU 1169/2011 Article 21 conformance layer. Recipe-level allergen aggregation (conservative — never auto-clears) + diet-flag inference (asserted only when every leaf carries the flag AND no contradicting allergen exists) + Manager+ override (with required `reason` + `appliedBy` + `appliedAt` audit attribution) + cross-contamination capture (note + structured `allergens[]` tags, both required). Recipe entity gains 4 nullable additive columns; migration `0012_recipe_allergens_extensions.ts` is purely additive.

5 endpoints (`GET /recipes/:id/allergens`, `GET /recipes/:id/diet-flags` public reads + 3 PUT Manager+ overrides). New event `RECIPE_ALLERGENS_OVERRIDE_CHANGED` emitted on every apply* mutation (cost handlers don't subscribe; future audit-log listener will). 21 new unit tests + 1 INT spec covering end-to-end across two sub-recipe levels.

UI components (`AllergenBadge`, `DietFlagsPanel`) deferred to UX track per Master direction.

## What worked

- **Subagent stayed exactly on-spec.** ~600-word brief covering scope + boundaries + conventions + verification. 0 boundary violations reported. The subagent only touched declared paths + the explicitly-allowed shared file (`apps/api/src/cost/application/cost.events.ts` for the new event constant). 21 unit tests landed in 11 minutes of subagent runtime.
- **Conservative-by-default inference.** Empty-recipe rule explicitly refuses to claim any flag for a leaf-less recipe — even though the universal-quantifier-over-empty-set would mathematically yield true. The subagent flagged this in its report as a deliberate regulatory-contract decision. That's the kind of judgement call you want a careful subagent to make and document.
- **Override-merge logic is symmetric and small.** `mergeAllergensOverride(aggregated, override)` returns sorted `(aggregated ∪ override.add) − override.remove`. Diet-flags override is a wholesale replacement. Both shapes serialise cleanly to jsonb.
- **Cross-contamination "both fields required" rule.** Validation rejects free-text without structured `allergens[]` tags. Stops the chef from typing "may contain nuts" without picking the structured `tree-nuts` allergen — the regulator audit needs both.
- **Locale prefix discipline (`ALLERGEN_*`)** made the locale append a non-event. Main thread's `MENU_*` work didn't touch locales at all, so even the file-level conflict risk was zero. Wave-1's locale-conflict pattern is now batting 2-for-2 (no genuine conflicts when prefixes are disjoint).
- **TypeORM 0.3 timestamp class-name convention is now muscle-memory.** `RecipeAllergensExtensions1700000012000` honoured the rule on first try (no CI-rename round-trip like the M2-followups PR had to do for migrations 0001-0011).

## What didn't (and the fixes)

Both fixes were applied by the parent thread on the slice branch (no extra PR; force-with-lease push) after the first INT-CI run failed.

- **Diet-flag warning trigger semantics.** First push only emitted a warning when `everyCarries === true AND contradiction exists`. The INT spec asserted a warning when `someCarries === true AND contradiction exists` (tomato carried `vegan`, butter brought `milk`, flour carried neither). The spec and design.md left the warning trigger ambiguous. Parent thread broadened the trigger: any candidate flag with a contradiction surfaces a warning, regardless of `everyCarries`. UX rationale: a chef who tagged tomato vegan and dropped butter into the pan deserves the heads-up, not silence.
- **INT spec didn't seed an actor User.** `applyAllergensOverride` bumps `recipe.updatedBy = ACTOR_ID`; the test fixture used a hardcoded UUID without seeding the corresponding `users` row, so the FK constraint `fk_recipes_updated_by` fired. Parent thread added a `User.create({...})` + `actor.id = ACTOR_ID` seed in `beforeEach`. The unit-test mocks didn't trigger this because they mock the EM rather than hitting Postgres.
- **First push's "ACTOR_ID" was a freely-fabricated UUID** that just happened to be a valid v4 string. Future INT specs writing to entities with FK-bound audit fields should follow the new pattern (seed a real User). Worth a runbook entry.

## Surprises

- **CodeRabbit gave zero findings on a 21-test, 12-file slice that touched `recipe.entity.ts`, a new migration, a new BC, and the `cost.events.ts` shared file.** Three slices in a row now (#75 / #79 / #80) with no CodeRabbit findings. Either the codebase is converging or the reviewer is being lenient — worth checking whether a regressive bug ever slips past it before we lean on the green checkmark.
- **The subagent reported "Worktree is clean; nothing outside the boundary list was touched"** before pushing. Mirrors the m2-off-mirror retro's observation: subagents that get a tight boundary list + return their own verification gate stay surgical.
- **Subagent flagged a runbook gap** ("audit_log table mentioned in spec but doesn't exist; D12 fields are the convention"). Useful — without the subagent's outsider eye, this latent inconsistency would have stayed in every M2 slice prompt.

## What to keep

1. **Subagent boundary-list contract.** Tight scope + declared file allow-list + "report don't push" verification gate. The two follow-up commits from the parent thread were design ambiguities (warning trigger) + test-fixture omissions (FK seed) — NOT subagent quality issues. The pattern works.
2. **`mergeAllergensOverride` purity.** `(aggregated, override) → string[]` with no I/O. Testable in isolation, reused identically in the rollup endpoint.
3. **Empty-recipe inference refusal.** Universal-quantifier-over-empty-set says "true"; regulatory contract says "no". Codify the principle in a future runbook: "regulator-facing computations refuse mathematical edge cases that cannot be defended in audit".
4. **Event-emitter side-channel for audit attribution.** `RECIPE_ALLERGENS_OVERRIDE_CHANGED` event carries everything a future audit-log listener needs. No coupling to any specific listener today — pure broadcast.

## What to change

1. **Lift the recipe-tree walker.** Subagent reimplemented `CostService.computeWithEm`'s `visiting: Set<string>` cycle defence. Same pattern, third site. Extract `walkRecipeTree(em, orgId, recipeId, onLeaf, options?)` BEFORE slice #10 (labels) needs it for a fourth time.
2. **i18n path standard.** Subagent's spec said `apps/api/src/i18n/locales/`; repo uses `apps/api/locales/`. Single source of truth (a runbook constant or README pointer) would prevent future drift.
3. **`audit_log` table absence**. Spec consistently mentions "write audit_log" but no table exists. Either ship the table (an M2 audit-trail slice) or update slice prompts to clarify "audit attribution = override jsonb payload + D12 fields, NOT a separate table".
4. **Subagent prompt should hand over a ready-made User-seed snippet** for INT specs that touch FK-bound audit fields. The next subagent that hits this will trip the same fk_recipes_updated_by error.

## Wave-N parallelism observations (Wave 1.3 — second real run)

| Aspect | This slice (subagent) | Sibling (main thread, m2-menus-margins) |
|---|---|---|
| Subagent runtime | 11 min | — |
| Parent thread coordination | ~10 min prompt drafting + ~10 min reviewing return + ~15 min fixing 2 issues on the slice branch | — |
| Files touched | 12 (recipe extension + migration 0012 + BC files + cost.events append + 2 locale appends + tasks.md) | 6 (menus BC + migration 0013 + module + tasks.md) |
| Boundary violations | 0 | — |
| Tests added | 21 unit + 1 INT | 19 unit + 1 perf + 1 INT |
| First-push CI | 5/6 (1 INT spec failed; 2 fixes pushed by parent) | 6/6 green |
| Parallel-time saved | ~30-40 min wall-clock vs sequential | — |

Cost-benefit threshold §6.6 (~30 min) was met. The subagent's 11 min runtime + 25 min of parent-thread coordination = ~36 min of slice cost; the slice would have taken ~75-90 min sequential by the parent thread. Net win: ~40 min wall-clock.

The two follow-up commits add to "subagent slice cost" but aren't waste: warning-trigger semantics is the kind of design ambiguity that typically surfaces in code review whether AI- or human-authored, and the FK-seed gap was a test-fixture omission that the unit tests' mocks couldn't catch.

## Cross-references

- Specs (archived): `openspec/specs/m2-allergens-article-21/`
- ADRs: ADR-017 (Article 21 emphasis pattern), ADR-019 (label-rendering risk → pre-launch external legal review)
- Foundation: `openspec/specs/m2-data-model/` (Ingredient.allergens, Ingredient.dietFlags from wave 0)
- Predecessor: `retros/m2-recipes-core.md` (RecipesService + cycle detector contract)
- Parallel sibling: `retros/m2-menus-margins.md` (PR #79, same wave, main-thread implemented)
- ai-playbook: `specs/release-management.md` §6.4 (wave parallelism, second run), §4.5 (PR self-review checklist)
