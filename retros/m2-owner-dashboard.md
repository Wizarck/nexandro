# retros/m2-owner-dashboard.md

> **Slice**: `m2-owner-dashboard` · **PR**: [#83](https://github.com/Wizarck/nexandro/pull/83) · **Merged**: 2026-05-05 · **Squash SHA**: `75d2eb5`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: First M2 slice that ships ONLY canonical-route UI (no PoC stub). Replaces `/poc/owner-dashboard` from `#12`. Third use of the proposal-only-first pattern (Gate D verdict in <5 min after 3 question round-trip).

## What we shipped

Journey 3's killer-app dashboard for the Owner persona. Top + bottom-5 MenuItem ranking by margin across all Locations + Channels, served by a 60-second in-memory cache invalidated on `SUPPLIER_PRICE_UPDATED`. Mobile-first (stacked-scrollable per Gate D 2b) with inline-expand cards (per 1b) reusing `MarginPanel` from `#12`. Drill-down jumps to the existing CostDeltaTable J2 stub from `#13`.

Backend (`apps/api/src/dashboard/`):
- `DashboardService.getTopBottomMenuItems(orgId, direction, windowDays, n)` — orchestrates `MenuItemsService.findAll` + `getMargin` per item, sorts by marginPercent, pushes unknown-margin items to the end regardless of direction
- `GET /dashboard/menu-items` (Owner+Manager) with `direction` / `windowDays` / `n` validation
- `@OnEvent(SUPPLIER_PRICE_UPDATED)` invalidates the org's cache entries when ANY supplier price changes (conservative — the event payload doesn't carry recipe-level attribution yet)
- Module registered in `app.module.ts`

Per the bundled scope (Gate D 3a):
- `GET /menu-items/:id/cost-history?windowDays=14` (all roles) — wraps recipe cost-history with MenuItem context
- `GET /recipes/:id/staff-view` (all roles) — payload subset: lines + allergens + dietFlags + wasteFactor; no cost / margin / audit. Reuses `RecipesAllergensService` from `#7`

UI:
- `MenuItemRanker` at `packages/ui-kit/src/components/MenuItemRanker/` (5 files per file-layout convention). 15 unit tests + 8 Storybook stories
- `useDashboardMenuItems` TanStack Query hook
- `OwnerDashboardScreen` at canonical `/owner-dashboard`. PoC `/poc/owner-dashboard` route deleted; `OwnerDashboardPocScreen.tsx` removed

Tests: 12 new DashboardService unit tests; 15 new ui-kit MenuItemRanker tests. Total ui-kit: 101. Backend total: 459. Vite production build: 95.58 KB gzipped (still under 300 KB target). Storybook: 8 components.

## What worked

- **The proposal-only-first pattern keeps paying back.** Three slices in a row now (`#12`, `#13`, `#15`-this). Gate D verdict in 1 short message ("yes to all"); zero implementation rework. The 3 questions were framed as binary forks (a/b/c) — that's the format that gets quick decisions.
- **The pre-existing scaffold (proposal + design + tasks + spec from earlier BMAD work) gave a clean starting point.** I only had to update post-`#12` conventions: per-component file layout, replace-PoC, Vitest+Storybook instead of Lighthouse. The OpenSpec scenarios were already well-formed.
- **`MarginPanel` reuse cut MenuItemRanker complexity in half.** The expanded-card body is just `<MarginPanel report={item.margin} />`. No new status colours, no new currency formatter, no new threshold logic. ADR-016's "single source of truth for margin classification" pays off when each new dashboard surface imports the same component.
- **`@OnEvent` decorator wired the cache invalidation in 1 line.** The event was already broadcast by `#3 m2-cost-rollup-and-audit`; subscribing was free. Conservative invalidation (drop ALL cache for the org on ANY supplier price change) is the right default here — chefs see fresh margins immediately on any price update, and the cache hit-rate for a single Owner reload is still ~5–10x given the 60s TTL.
- **Cache `key` builder is deterministic and includes `n`.** `(orgId, windowDays, direction, n)` is the full keyspace. Tests cover "caches separately by direction" — nothing weird like accidentally serving top-5 to a bottom-5 caller.
- **The "push unknowns to the end regardless of direction" rule.** Both top and bottom queries put `marginPercent === null` items last. A chef looking at the dashboard never sees "unknown" at the top of "best performers" — that would be misleading. Test covers it explicitly.
- **No new ADR.** The slice consumes existing seams (`MenuItemsService.getMargin` from `#8`, `CostService.getHistory` from `#3`, `RecipesAllergensService.getAllergensRollup`+`getDietFlagsRollup` from `#7`, `MarginPanel` from `#12`). Read-only + cache layer + UI assembly. Architectural cost: zero.
- **The "incomplete" flag on RankingResult**. When org has fewer MenuItems than `n`, the response carries `incomplete: true` and the UI surfaces the empty-state copy via the parent. Cleaner than implicit array length checks at multiple call sites.

## What didn't (and the fixes)

- **First test-fixture pass used non-UUID strings for recipeId in `MenuItem.create`.** The MenuItem entity validates UUID format at construction time; tests crashed with "MenuItem.recipeId must be a UUID". Fix: imported the declared UUIDs (r1, r2, ...) into `seedOne`. Two-line change. The test design (UUID-typed fixture constants at top of describe) was already there; I just hadn't applied it inside the inner caching describe block.
- **`npm test --workspace=apps/api` exits with code 1 locally** but all 459 unit tests pass. Cause: integration specs that need Postgres fail with `ECONNREFUSED` when no Docker DB is running. CI's Postgres job runs them green. Same Docker-deferred dance as every other M2 slice. Worth a future ai-playbook entry: "running unit tests locally" should default to `--testPathIgnorePatterns="\.int\.spec\."` when Docker isn't detected.
- **Initial draft of `getCostHistory` endpoint imported `CostHistoryRowDto` from `cost.dto` then immediately re-wrapped it.** Wasteful — could have just added a thin wrapper class with the MenuItem context fields and a `history: unknown[]` payload. Refactored to a `MenuItemCostHistoryDto` with the wrapper shape. Final endpoint is 25 lines instead of 40.

## Surprises

- **The "yes to all" Gate D verdict came back in <5 minutes.** Previous slices' Gate D round-trips were 10–30 min. The 3 binary forks (a vs b) seem to be the format that locks fast decisions. Worth keeping; could codify as a runbook entry "Gate D questions: prefer binary alternatives over open prompts".
- **Reusing MarginPanel meant the dashboard ships ZERO new status-colour CSS.** I expected to add at least a "small badge" variant or similar. Turns out the existing card-level pill (`bg-(--color-status-on-target)` etc.) embedded in the row header + the expanded `<MarginPanel>` for full detail is exactly the right separation: glance vs detail.
- **Bundle delta from this slice: +0.07 KB gzipped.** 95.51 → 95.58 KB. A new component, a new screen, a new hook, and a new route — for 70 bytes. shadcn's "copy and own" + tree-shaking + tokens.css doing all the heavy lifting.
- **DashboardService unit tests cover 100% of the cache invalidation logic** without ever touching Postgres. Mock `MenuItemsService` + `EventEmitter2`-style direct method call — clean test surface.

## What to keep

1. **Binary-fork Gate D questions.** When you can frame open questions as a/b/c, do it. "Yes to all" became a one-message verdict. Codify in the runbook §6.7 follow-up.
2. **`@OnEvent` for cache invalidation.** Pure event-driven invalidation; no manual hook in mutator code. The mutators (suppliers, recipes-allergens) already broadcast their changes; consumers (this slice's cache, future cost-history listeners) opt-in. Reuse pattern for any future cache.
3. **"Push unknowns to the end regardless of sort direction" rule.** Glanceable dashboards must never show ambiguous data at the top of either rank. The rule is small (filter+concat) but materially changes the UX.
4. **Reuse over re-implementation.** MarginPanel + RecipesAllergensService.getAllergensRollup + CostService.getHistory all consumed verbatim. Three slices' contracts compose cleanly because each shipped a "single-purpose" public method. Stay disciplined on this — it's what makes the per-slice contract durable.
5. **Canonical-route convention.** `/poc/<journey>-j<N>` is throwaway; `/<feature>` is canonical. The deletion of `OwnerDashboardPocScreen.tsx` + `/poc/owner-dashboard` route is mechanical: rename, swap imports, done. Future canonical screens (`#5`, `#10`) follow the same recipe.

## What to change

1. **`SupplierPriceUpdatedEvent` should carry the affected recipe set** (not just the supplier id), so the dashboard cache can invalidate per-recipe instead of per-org. Filed: extend the event payload in a future cost-events refinement slice. Until then, conservative invalidation is fine.
2. **`getCostHistory` and `staff-view` should ship with their own controller specs.** Right now they're verified only by the integration spec (Docker-deferred). A controller-level unit test mocking the services would catch DTO-shape regressions in <100 ms vs waiting for the Postgres CI job.
3. **`docs/ux/components.md` still doesn't track owning slice + status.** Filed in `#13` retro; still pending. Should add a column "Owner slice / Status" to that catalogue.
4. **The PoC route deletion deserves a smoke test.** Currently if someone imports `OwnerDashboardPocScreen` again by mistake the build will fail (file deleted), but a CI guard checking "no `/poc/<journey>-j<N>` route survives past slice <N>" would be a cleaner enforcement. Filed.
5. **Storybook is now 8 components — TOC needs sectioning.** Stories live under `Compliance/`, `Cost/`, `Recipes/`, `Suppliers/`, `Ingredients/`, `Dashboard/`. The `title:` prefix system handles this; documenting the convention in `packages/ui-kit/README.md` would help future contributors pick the right section.

## Wave-N parallelism observations

Single slice, no subagent. The slice is mostly "wire existing seams together"; splitting backend + UI into parallel tracks would have introduced sync overhead since the UI hand-mirrors the DTO shape. Same call as `#12`, `#13`. Worth flagging: as M2 progresses, the remaining 4 slices (`m2-ai-yield-suggestions`, `m2-ingredients-extension`, `m2-labels-rendering`, `m2-mcp-server`) are heavier and more independent — wave parallelism becomes valuable again.

| Aspect | Number |
|---|---|
| Proposal review + Gate D wait | ~10 min (proposal mostly pre-existing) |
| Implementation wall-clock | ~70 min |
| Validation (vitest + jest + build + lint + storybook) | ~12 min |
| Cleanup (1 UUID-fixture fix) | ~2 min |
| PR push + CI + admin-merge + archive + retro | ~15 min |
| **Total** | **~109 min** |

## Cross-references

- Specs (archived): `openspec/specs/m2-owner-dashboard/`
- ADRs: ADR-010 (Menus BC boundary), ADR-016 (margin status thresholds — reused via MarginPanel), ADR-020 (UI stack — locked by `#12`); no new ADR
- Predecessors: `retros/m2-menus-margins.md` (#8 — `MenuItemsService.getMargin`), `retros/m2-cost-rollup-and-audit.md` (#3 — `CostService.getHistory` + SUPPLIER_PRICE_UPDATED event), `retros/m2-allergens-article-21.md` (#7 — `RecipesAllergensService.getAllergensRollup`+`getDietFlagsRollup`), `retros/m2-ui-foundation.md` (#12 — MarginPanel + apps/web shell), `retros/m2-ui-backfill-wave1.md` (#13 — file-layout contract + CostInvestigationJ2 drill-down target)
- ai-playbook: `specs/release-management.md` §6.7 (proposal-only-first pattern — third use), `specs/ux-track.md` §13 (per-slice UI shipping)
- Replaces: `apps/web/src/screens/OwnerDashboardPocScreen.tsx` (deleted in this slice)
