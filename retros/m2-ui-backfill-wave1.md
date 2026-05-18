# retros/m2-ui-backfill-wave1.md

> **Slice**: `m2-ui-backfill-wave1` · **PR**: [#82](https://github.com/Wizarck/nexandro/pull/82) · **Merged**: 2026-05-05 · **Squash SHA**: `fd5946b`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: Closes the 4-slice UI-deferred debt left by `#2`, `#3`, `#7`, `#8`. Sibling to `#12 m2-ui-foundation`. Second slice that ships UI components, second use of the proposal-only-first pattern from `#12`'s retro.

## What we shipped

Five components owed by already-merged backend slices, each in its own folder per the per-component file layout locked by `#12`:

- **`RecipePicker`** — typeahead combobox with 250 ms debounce + keyboard nav (Up/Down/Enter/Escape) + ARIA combobox-listbox roles + `activeOnly` filter. Used in J1 (sub-recipe selection) and J4 (cycle-detection error context).
- **`IngredientPicker`** — same combobox semantics with 3-line cards (name + brand + barcode) when OFF-mirror data is present; degrades to single-line when null. Used in J1.
- **`SourceOverridePicker`** — radio-list with preferred-first then by-price-ascending ordering. "Use preferred" clears the override (per Gate D decision 1a). Used in J1 + J2.
- **`CostDeltaTable`** — table with arrow icons (`↑` `↓` `—`) + colour tokens per direction. Sorted by absolute delta magnitude descending. Used in J2.
- **`DietFlagsPanel`** — Manager+ override modal with ≥10-char reason validation (Gate D decision 2). Optimistic update + rollback on backend rejection. Used in J1.

Plus `apps/web/` wiring: 6 TanStack Query hooks (`useRecipes`, `useIngredients`, `useSupplierItems`, `useRecipeCostDelta`, `useDietFlags`, `useDietFlagsOverride`) + 2 stub journey screens at `/poc/recipe-builder-j1` (mounts 4 components) and `/poc/cost-investigation-j2` (mounts CostDeltaTable).

Tests: 65 new ui-kit unit tests (RecipePicker 14 + IngredientPicker 11 + SourceOverridePicker 12 + CostDeltaTable 14 + DietFlagsPanel 14). Total ui-kit: 86 tests, all green. Vite production build = 95.51 KB gzipped (well under the 300 KB target). Storybook static build = 7 components total.

## What worked

- **Proposal-only first pattern paid off again.** Master got to validate scope (5 components + 2 stubs), the contract for each component (props + behaviour), and 3 open questions (override semantics + reason validation + IngredientPicker degradation) BEFORE I wrote a single component. The 3 question replies came back as quick "1a, 2≥10, 3a" (one paragraph total) and unblocked clean implementation. Codifies cleanly the §6.7 pattern from `#12`'s retro: opening a PR proposal-only, getting Gate D verdict, pushing implementation later — works just as well on the second use.
- **The per-component file layout is muscle-memory now.** 5 components × 5 files = 25 new files, all with the same `<Name>/{tsx, stories, test, types, index}` structure. No surprises in scaffolding; cognitive load went into the actual component logic, not the wiring. Reviewers will see contract + impl + stories + tests in one `ls`.
- **OKLCH-canonical tokens stayed canonical without modification.** Zero new tokens added to `tokens.css`. Every component composed from existing CSS variables (`--color-status-at-risk`, `--color-accent-soft`, `--color-allergen-emphasis-bg`, etc.). The DESIGN.md → tokens.css → component class strings → rendered DOM chain works end-to-end as designed.
- **Combobox pattern (RecipePicker) reused cleanly in IngredientPicker.** Once the typeahead-with-debounce-and-keyboard-nav was right in RecipePicker, IngredientPicker copied 90% of the structure and only diverged on the per-row rendering (3-line card vs 1-line). The shared semantics (debounce, ARIA roles, keyboard handlers) stayed disciplined across both.
- **Optimistic update + rollback in `DietFlagsPanel`** worked first try. The pattern: call `setOptimisticFlags(payload.value)` immediately, await the consumer-supplied promise, on success clear the optimistic state (real query data takes over), on rejection clear AND surface a `role="alert"` message. Visible in tests via the `mockRejectedValue` path — the rollback assertion passes without any timing fuss.
- **Stub-screen pattern is throwaway and explicit.** The `/poc/recipe-builder-j1` and `/poc/cost-investigation-j2` paths advertise their proof-of-concept-ness in the URL itself. The note banner inside the screen reinforces it. When the canonical J1 screen lands with `#5` or a future slice, replacing these is `git rm` + a new screen. No risk of accidentally treating the stubs as production routes.
- **86 tests in 1.07s wall-clock.** Vitest 2.x with jsdom is genuinely fast. The 65 new tests added 0.7 s to the suite — plenty of room for the 11 components owed by the remaining backend slices.

## What didn't (and the fixes)

- **`tsc -b` polluted `apps/web/src/` with `.js` artefacts on first build.** Root cause: `apps/web/tsconfig.json` had no `outDir` and no `noEmit: true`, so `tsc` happily wrote `App.js` next to `App.tsx`, etc. Fix: added `"noEmit": true` to `apps/web/tsconfig.json`. Vite handles the actual production build; tsc is only used for type-checking via `tsc -b`. Per-package `.gitignore`s already covered `dist/` but not source-collocated `.js` — the proper fix is at the tsconfig layer, not the gitignore. Filed in `#12` retro and now resolved.
- **`CostDeltaTable.test.tsx` had a false-positive "single dash" assertion.** Test row had both `oldCost: null` AND `deltaPercent: null`, so the rendered DOM contained two `—` text nodes. `screen.getByText('—')` threw on multiple matches. Fix: `getAllByText('—')` + `expect(dashes.length).toBeGreaterThanOrEqual(2)`. The test now also covers that `deltaPercent: null` ALSO renders a dash, which was the actual coverage gap.
- **Unused `userEvent` import in `RecipePicker.test.tsx` failed lint at `--max-warnings=0`.** I imported it intending to use the higher-fidelity user-event API but ended up using `fireEvent.keyDown` for the keyboard nav tests (sufficient + simpler). Forgot to remove the import. Fix: dropped the import. Lint passed on retry. Lesson: ESLint v9 flat config IS strict about unused vars; trust the linter.

## Surprises

- **The Gate D conversation took ~3 message round-trips.** I asked 3 questions, the user (after asking for clarification on what I meant) replied "1a, 2 lo que propongas, 3a" — one short message. That's faster than I expected for design-decision sign-off and validates that Master CAN make crisp decisions when the questions are framed concretely (option a vs b, not "what should we do?"). Worth keeping the question style for future Gate D moments.
- **CodeRabbit hasn't run yet at retro-write time** — but `#12` set the precedent of 5-in-a-row clean reviews. If this slice also clears CR with no findings, that's 6 in a row. At some point we should sanity-audit by deliberately introducing a known issue (e.g., a missing aria-label) to verify CR catches it; otherwise the green checkmark loses signal.
- **The `DietFlagsPanel`'s optimistic update + rollback test was the cleanest test in the suite.** I expected timing/async-state pain; vitest's `waitFor` plus a manual promise resolver gave precise control over the optimistic state's lifecycle. The test reads almost like prose: "click override, toggle vegan, type reason, click apply, wait for dialog to close, assert vegan visible, resolve the mock promise." Pattern worth keeping for any future component with optimistic-update semantics.
- **Bundle size went from 90 KB (m2-ui-foundation: 2 components) to 95.5 KB (this slice: 7 components total).** That's 5 new components for 5.5 KB. Heavy use of shared lucide-react icons + cn helper + tokens.css means the marginal cost per component is low. The 11 remaining components (across `#5`, `#6`, `#9`, `#10`, `#11`) should fit comfortably under the 300 KB target.

## What to keep

1. **Proposal-only-first for any slice that introduces new component contracts.** Two for two now. The pattern doesn't add cost on small slices and saves rework on slices where Master would otherwise have flipped a default. Codified in `release-management.md` §6.7 by `#12`'s retro; this slice is the second confirmation.
2. **Hand-mirrored DTO `<Name>.types.ts` files.** ui-kit stays decoupled from `apps/api/` package layout. Total LOC across 5 type files: ~80 lines. When the codegen pipeline lands (filed in `#12` retro), these are the seeds — the mirrored interfaces will become the generated targets, no contract change.
3. **`cn(...)` + inline-style fallback dual pattern from `m2-ui-foundation`.** Storybook's a11y addon parses inline styles when computing colour-contrast ratios; class-only Tailwind 4 vars don't get parsed. The `style={{ backgroundColor: 'var(...)' }}` fallback ensures both Storybook a11y AND production builds get the right colours. All 5 new components followed this pattern; zero a11y addon false positives in Storybook canvas.
4. **TanStack Query hooks live in `apps/web/src/hooks/`, not in ui-kit.** Components stay pure (props + callbacks, no fetch). Storybook stories use literal data; tests use `vi.fn()` callbacks. ui-kit is reusable outside `apps/web/`. The hook layer is thin (~15 LOC each) — codegen would compress it further.
5. **Stub screens advertise their throwaway-ness in the URL (`/poc/<slug>-j<N>`)** and in a banner. When the canonical J1/J2 slice lands, the replacement is a single-file delete + import swap. Pattern carries forward to future "stub before canonical" cases.

## What to change

1. **Add `noEmit: true` to NEW tsconfig.json scaffolds** in the playbook templates (when `wt_add.py` provisions a new TypeScript package) UNLESS the package legitimately emits via tsc. Vite/SWC/esbuild handle the actual build; tsc is for type-checking. Filed: ai-playbook scaffold updates.
2. **CI guard against accidental `.js` next to `.ts` in source dirs.** A trivial pre-push hook or CI lint: `git ls-files apps/*/src packages/*/src | grep '\.js$' && fail`. Cheap, catches the same regression that bit me here.
3. **`docs/ux/components.md` should track which slice owns which component.** Currently it's a flat catalogue; would be useful to mark each entry with its slice ID + status (planned / in-flight / shipped). Then a quick `grep "shipped"` answers "what UI is live?". Filed.
4. **Storybook publish should pin a CommonJS-friendly bundle layout.** Saw the warning "Some chunks are larger than 500 kB" on `DocsRenderer-CFRXHY34`. That's Storybook's docs renderer, not our code, but it's a noisy warning. Either bump `build.chunkSizeWarningLimit` in Storybook's vite config OR live with the warning. Tracking only.
5. **CodeRabbit sanity audit.** 6 clean reviews in a row (if this one passes) — schedule a deliberate "introduce known a11y bug" run before relying on CR for security-sensitive work. Filed.

## Wave-N parallelism observations

Single slice, no subagent. The 5 components share heavy-template patterns; the marginal coordination cost of splitting (e.g., subagent for IngredientPicker while main thread does the rest) wouldn't have paid for itself. Same call as `#12 m2-ui-foundation` ran solo.

| Aspect | Number |
|---|---|
| Proposal drafting + Gate D wait | ~25 min |
| Implementation wall-clock (post-Gate D) | ~80 min |
| Validation (vitest + build + lint + storybook) | ~10 min |
| Cleanup (1 test fix + 1 lint fix + tsc-emit fix) | ~5 min |
| PR push + CI + admin-merge + archive + retro | ~15 min |
| **Total** | **~135 min** |

The 80 minutes of implementation broke down roughly: ~12 min/component × 5 components + 10 min for hooks + 8 min for stub screens + barrel + tsconfig fixup. The "templated" nature of components 2-5 (after RecipePicker established the combobox pattern) was real — IngredientPicker took ~8 min, not 12.

## Cross-references

- Specs (archived): `openspec/specs/m2-ui-backfill-wave1/`
- ADRs: ADR-020 (Vite + React + Tailwind 4 + Storybook 8 — locked by `#12`); no new ADR for this slice (pure consumption of the foundation contract)
- Sibling foundation: `retros/m2-ui-foundation.md` (`#12` PR #81 — locked the per-component file layout, OKLCH tokens, Storybook publish CI)
- Backend predecessors whose UI was deferred (now closed): `retros/m2-recipes-core.md` (#2 — RecipePicker), `retros/m2-cost-rollup-and-audit.md` (#3 — CostDeltaTable), `retros/m2-allergens-article-21.md` (#7 — DietFlagsPanel), `retros/m2-menus-margins.md` (#8 — IngredientPicker partial coverage; full landing with #5)
- ai-playbook: `specs/ux-track.md` §10 (OKLCH-canonical), §11 (DESIGN.md format), §13 (Storybook-first development + per-PR Storybook publish), `specs/release-management.md` §6.7 (proposal-only-first for new contracts — second use)
- Components catalogue: `docs/ux/components.md` — RecipePicker + IngredientPicker + SourceOverridePicker + CostDeltaTable + DietFlagsPanel entries point to this slice's deliverables; remaining 6 entries point at their owning slices.
