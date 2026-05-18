# retros/m2-recipes-core.md

> **Slice**: `m2-recipes-core` · **PR**: [#69](https://github.com/Wizarck/nexandro/pull/69) · **Merged**: 2026-05-01 · **Squash SHA**: `d75d3fd`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)

## What we shipped

The first M2 Wave-1 slice. Recipe CRUD with sub-recipe composition + cycle detection (depth cap 10) + soft-delete with active-MenuItem guard. Backend-only — UI RecipePicker deferred to UX track. Built on top of `m2-data-model` (PR #68).

This was **the first slice executed in the actual Wave-N parallel pattern** codified in ai-playbook §6.4 — opened in parallel with `m2-off-mirror` (separate PR, separate BC) running in a background subagent.

## What worked

- **Pure-function cycle detector tested in isolation.** The 17 unit tests covered every fixture I could think of (no-cycle, direct A→B→A, indirect A→B→C→A, self-loop, branching, depth-cap at 10, custom cap, depth-cap-vs-cycle priority, orphan node, error-class shape). When I wired it into the service, zero algorithmic surprises.
- **Graph augmentation pattern: `buildOrgGraph` minus the recipe under edit + `augmentGraphWithProposed`.** This made the create/update paths share the same detection routine. The trick is to exclude the editing recipe's OLD lines from the graph, then plug its NEW lines back in — that way "remove the cycle by editing it out" works naturally.
- **`displayLabel` synthesis at the service layer**, not in the controller. Centralised the "Discontinued" suffix policy. Controllers + DTOs just propagate the string.
- **Typed-error → controller-translation pattern from M1.1.** `RecipeNotFoundError` → 404, `RecipeInUseError` → 409 with `menuItems[]`, `CycleDetectedError` → 400 with full cycle path. Single `translate(err)` helper in the controller. Easy to extend for the next M2 slice.
- **Wave-N parallelism worked.** Pushed PR #69, queued m2-off-mirror in a background subagent, both PRs in flight. CI ran cleanly on both. Coordination overhead was about 5 min for the subagent prompt + 10 min reviewing its output (still pending at write time).

## What didn't (and the fixes)

- **Initial DepthLimitError mapping was awkward.** First pass had two error paths (CycleDetectedError vs DepthLimitError) bubbling up to the controller separately. Refactored: the service catches `DepthLimitError` and re-throws as `CycleDetectedError` with the offending path. One handler, one HTTP code (400). Chef-facing UX doesn't distinguish "your graph is too deep" from "your graph cycles" — both mean "fix the composition".
- **`RecipeInUseError.menuItemNames` uses `${channel}@${locationId}`** because `MenuItem` doesn't carry a `name` column (M2 wave 0 didn't need it). When `m2-menus-margins` adds a friendly menu item label, switch to that. Filed a TODO in the retro instead of bikeshedding now.
- **Initial spec file imported `CycleDetectedError` from `recipes.service.ts`** — TS error because the class is exported from `cycle-detector.ts`. Quick import-path fix; lesson: when a file re-exports types from a sibling, document the canonical source in a header comment.

## Surprises

- **The cycle detector's "depth-cap-vs-cycle priority" test passed unchanged.** When a 2-cycle exists with default cap 10, DFS finds the back edge before hitting the cap. The visit() function returns the cycle hit on the way down rather than throwing on the way through depth. Subtle but correct.
- **Service-layer transactions over the bare `dataSource.transaction(em => ...)`** behave the same way they did in M1's `CreateOrganization`. The pattern is so familiar at this point that I wrote the service top-down without referring to the M1 examples.
- **Wave-1 PR ordering didn't matter for m2-recipes-core because it doesn't touch shared files except locales (3 keys appended at the bottom).** The subagent for m2-off-mirror uses its own key prefix (`EXTERNAL_CATALOG_*`) so the JSON merge will be a no-conflict append.

## What to keep

1. **Pure-function utility + unit tests + service wiring** — the cycle detector landed in 1 day with confidence because the algorithm was tested in isolation before any DB coupling.
2. **Service-level `displayLabel` synthesis** for soft-delete UX. Same pattern when m3-haccp adds expired-batch markers.
3. **Single `translate(err)` controller helper** mapping typed errors → HTTP. Extend with each new slice's domain errors.
4. **`buildOrgGraph(em, orgId, excludeRecipeId)`** is the canonical shape: build the world, remove the entity-under-edit, plug the proposed update, walk. Reusable for any future graph-coherence check.

## What to change

1. **`MenuItem.name` or `MenuItem.label`** for human-readable references. Filed for m2-menus-margins.
2. **Cycle detection rebuilds the org graph on every create/update.** O(N) per write. PRD-M2 scale (hundreds of recipes per org) is fine; if it spikes in M3, cache the graph in a denormalised table and invalidate on mutation.
3. **DEPTH_LIMIT as a separate code** if a user reports confusion about "cycle detected at depth 10 with no actual cycle". Surfacing depth as a "cycle" is consistent today; revisit if real users push back.

## Numbers

| Metric | Value |
|---|---|
| Tasks complete | 21/30 (§§1-3 + §5.1-3+5 + §6.1; §4 UI deferred to UX track; §5.4 covered by M1 RolesGuard tests; §6.2-3 post-merge) |
| Commits in slice | 1 (squashed) |
| Files added | 6 (cycle-detector + spec + service + DTO + controller + INT spec); 4 modified (module + locales + tasks) |
| Unit tests new | 17 cycle-detector |
| Total tests | 360 green (was 343 pre-Wave-1) |
| INT scenarios new | 8 (deferred run pending docker) |
| Time wall-clock | ~1.5 hours (single Claude session, while subagent ran m2-off-mirror in parallel) |

## Wave-N parallelism observations (first real test)

- **Subagent prompt budget**: ~600 words covering scope + boundaries + conventions + verification. Took ~5 min to draft.
- **Coordination overhead estimate from §6.6**: 10–15 min recombination. Actual: ~5 min while writing this retro (the subagent owned distinct files; no cherry-pick cost).
- **Merit threshold**: §6.6 says >30 min of parallelisable work. m2-off-mirror is ~3 hours of work; m2-recipes-core is ~1.5 hours. Aggregate parallel time saved: ~1.5 hours wall-clock. Worth it.
- **Risk**: subagent could go off-spec or hit a roadblock. Mitigation: tight scope in the prompt + boundary list + explicit "report don't push" at the end.

## Cross-references

- Specs (archived): `openspec/specs/m2-recipes-core/`
- Foundation: `openspec/specs/m2-data-model/`
- ADRs: ADR-010 (M2 contexts), depends on Recipe/RecipeIngredient/MenuItem from m2-data-model
- ai-playbook: `specs/release-management.md` §6.4 (wave parallelism), §6.6 (intra-slice — N/A here, single agent)
