# retros/m2-ui-foundation.md

> **Slice**: `m2-ui-foundation` · **PR**: [#81](https://github.com/Wizarck/nexandro/pull/81) · **Merged**: 2026-05-05 · **Squash SHA**: `51b4e56`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: First slice that ships UI code in the repo. Corrective slice for the prior 4-slice deviation from ai-playbook §13 — also added row #13 `m2-ui-backfill-wave1` to the slicing file as the sibling that picks up the rest of the deferred component debt.

## What we shipped

The frontend foundation. `apps/web/` (Vite + React 18 + TanStack Query 5 + React Router 6) + `packages/ui-kit/` (Tailwind 4 with `@theme`, OKLCH-canonical `tokens.css` from DESIGN.md, Storybook 8 with `@storybook/react-vite`). Two components shipped as proof-of-contract: `AllergenBadge` (Article 21 emphasis variant + cross-contamination "may contain" variant) and `MarginPanel` (consumes the `MarginReportDto` shape from #8, NO_SOURCE-tolerant rendering). One J3 proof-of-concept screen at `/poc/owner-dashboard` wires the chain end-to-end via 3 nested TanStack Query calls.

CI pipeline now runs Storybook builds on every PR + deploys to GitHub Pages on push to master (the canonical URL is reserved at `https://wizarck.github.io/nexandro/storybook/`; goes live on the first non-revertible push to master after Pages is provisioned in repo settings).

21 new ui-kit tests (Vitest + Testing Library + jsdom) all green. Vite production build is 90 KB gzipped — well under the 500 KB target. Backend regression: 447 unit tests still green.

## What worked

- **Squash + force-push to remove a leaked artefact from PR history.** First push accidentally committed `storybook-static/` (gitleaks correctly flagged it as a generic-api-key false-positive in the bundled JS). Rather than .gitleaksignore-ing a fingerprint, the cleaner path was `git reset --soft <proposal-commit>` + recommit + force-with-lease push. The branch's history is now: 1 proposal commit + 1 implementation commit. Cleaner story; gitleaks passed on the next run.
- **Tailwind 4 + `@theme` block** consumed the OKLCH variables from `tokens.css` directly, with zero `tailwind.config.js` to keep in sync with `DESIGN.md`. Class strings like `bg-(--color-accent)` resolved at runtime to the OKLCH form. The `@theme` block was a single 30-line addition; the rest of the design tokens live as plain CSS variables that any component can read.
- **Vitest separation from Vite config.** Started with `test` block embedded in `vite.config.ts`; that triggered a TS error because Vitest 2.x ships its own Vite copy and the two `defineConfig` types collide. Split into `vite.config.ts` + `vitest.config.ts` — clean compile, both packages happy.
- **`@nexandro/ui-kit/*` path alias via `vite-tsconfig-paths`.** No library build needed at v0; in-monorepo consumers import from `src/index.ts` directly. When the kit ships externally, add `build.lib` then.
- **Static `MenuItemsService.classify` from #8 mirrored as `STATUS_STYLES` lookup in `MarginPanel`.** Pure data → presentation mapping kept the component testable (no DI, no fetch). The 11 unit tests cover every status enum + loading + currency formatting + Discontinued cascade.
- **AllergenBadge's icon + text + `aria-hidden` SVG** prove the deuteranopia robustness in 2 LOC. The accessibility test (`expect(svg).toHaveAttribute('aria-hidden', 'true')`) catches any regression where someone accidentally drops the icon from the screen-reader name.
- **CI feedback loop.** First CI run failed on 3 dimensions (Lint, Test, Secrets); each had a one-line fix. By the time the squash + force-push landed, all 7 checks were green. Total CI iteration cost: ~8 minutes of wall-clock + 2 commits-and-pushes.

## What didn't (and the fixes)

- **First commit shipped `storybook-static/` as tracked files.** Three different fixes layered: (a) added per-package `.gitignore`, (b) `git rm -rf --cached`, (c) the squash-and-force-push above. The cleanest fix would have been a `.gitignore` BEFORE the first `git add`. Filed: scaffold every new package in the playbook templates with a per-package `.gitignore` from minute zero.
- **ESLint v9 needed a flat config (`eslint.config.js`).** Lockfile pinned ESLint 9, but I only added a `lint` script that pointed at the legacy config path. Fix: minimal flat configs in both packages, ~30 LOC each. ESLint v9 is mature enough that flat config is non-optional.
- **`apps/web` had no test files yet.** Vitest defaulted to exit 1 ("No test files found"). Fix: `--passWithNoTests` flag in the package script. The PoC screen will get its first test in `m2-ui-backfill-wave1` when the first real component lands.
- **Vite + Vitest type collision** described above. The root cause is Vitest 2.x ships `vitest/node_modules/vite/` as a separate copy. Documented as a small ai-playbook gotcha worth filing.
- **`storybook-static/` gitleaks false-positive on a React internals string** (`React.Element` etc. matched the generic-api-key heuristic on a minified bundle line). Squash erased it from PR history; long-term the right answer is a repo-level `.gitleaksignore` or `--exclude-paths` for `storybook-static/` in CI. Filed.

## Surprises

- **CodeRabbit cleared the slice on first review** — that's 5 in a row now (#75, #79, #80, #81, plus #76). Either the codebase is converging or the reviewer is being lenient on greenfield UI code; worth a sanity audit before relying on the green checkmark for security-sensitive work.
- **Storybook 8.4 + `@storybook/react-vite`** Just Worked™. Historically this integration has been a HMR / manager-builder pain point; 8.4 onward feels stable.
- **Vite production build = 90 KB gzipped.** Below the 500 KB v0 target, even with React 18 + Router 6 + TanStack Query 5 + 2 components + 3 query hooks. The bundle has plenty of room for the 11 components owed by `m2-ui-backfill-wave1` + the 5 unshipped backend slices' UI work.
- **Tailwind 4's `bg-(--color-accent)` syntax** survived a Storybook build, a Vite production build, and Vitest's jsdom rendering without any plugin gymnastics. The OKLCH form reaches the rendered DOM unchanged.
- **The proposal-then-implementation pattern** — opening PR #81 first as proposal-only at Gate D, then pushing implementation commits to the same branch — kept the slice contract visible while iterating. Master got to approve the design + 3 open questions BEFORE I burned implementation time. Worth codifying as a runbook entry: "for any slice that introduces a new tech stack or non-trivial architectural seam, open as proposal-only first; push implementation after explicit Gate D verdict."

## What to keep

1. **Proposal-only PR for big-fork slices.** Master approves the 4 OpenSpec artefacts at Gate D before any code lands. Keeps the design discussion separate from the implementation review and lets force-pushes happen freely on the implementation phase without breaking the design conversation.
2. **OKLCH-canonical `tokens.css` as the single bridge between DESIGN.md and runtime CSS.** Both `apps/web/` and Storybook import the same file; the OKLCH form is preserved end-to-end. ai-playbook §10 + §11.7 in spec form, working in code form.
3. **Per-component file layout** (`<Name>/{tsx, stories, test, types, index}` in one folder). `packages/ui-kit/README.md` codifies it. Reviewers see contract + impl + stories + tests in one ls. Future slices and the backfill wave will copy this exact pattern.
4. **`{ cost: null, status: 'unknown', warnings }` graceful-degrade pattern from #8** consumed cleanly by `MarginPanel`. The component handles all 4 status enums + loading + Discontinued + custom-className without ever 5xx-ing on backend issues. UI graceful-degrade tied to backend graceful-degrade is what made this work.
5. **Squash-on-force-push for accidentally-leaked artefacts.** Cleaner than `.gitleaksignore` fingerprint entries that grow over time. Use when (a) the leak is a clear false-positive, (b) the artefact is rebuilt by CI anyway, (c) the branch isn't shared with anyone else.

## What to change

1. **Per-package `.gitignore` MUST exist before first `git add`.** Scaffold every new package in the playbook templates with `.gitignore` covering `node_modules`, `dist`, `storybook-static`, `.env.local`. A future `wt_add.py` or component-scaffold helper should drop these in by default.
2. **ESLint v9 flat config goes in the scaffold, not the lint phase.** Same as above — `eslint.config.js` should land at workspace creation time, not be discovered missing on the first CI run.
3. **`storybook-static/` should be excluded from gitleaks at the repo level.** Filed as ai-playbook follow-up: ship a `.gitleaks.toml` template that excludes minified bundle outputs from generic-API-key heuristics.
4. **DTO type drift between `apps/api/` and `packages/ui-kit/`.** I hand-mirrored the `MarginReportDto` shape into `MarginPanel.types.ts` to avoid coupling the kit to the backend package layout. That works at v0 but will rot as the API evolves. Filed: codegen pipeline (e.g. `openapi-typescript`, `kubb`, or `nestjs-swagger` → typed client) for backend DTOs → ui-kit types.
5. **`apps/web/` deserves at least one E2E or smoke test before production.** Defer to slice that owns the canonical screen (e.g. `m2-owner-dashboard` for J3); but lock the discipline now: every slice that ships a journey screen ships a smoke test for it.
6. **Codify the "proposal-only first" pattern in `release-management.md`.** New §6.7: when a slice introduces a new tech stack, language, or architectural seam, open the PR as proposal-only at Gate D before any implementation commits. This was discovered organically here; deserves a runbook entry.

## Wave-N parallelism observations

Single slice, no subagent. The slice was complex enough (apps/web shell + ui-kit + Storybook + 2 components + CI workflow + ADR) that splitting it would have introduced more coordination cost than benefit — same call as `m2-cost-rollup-and-audit` ran solo.

| Aspect | Number |
|---|---|
| Proposal drafting | ~20 min |
| Implementation wall-clock (post-Gate D) | ~70 min |
| CI iteration (3 fixes + force-push squash) | ~12 min |
| PR open + admin-merge + archive + retro | ~15 min |
| **Total** | **~117 min** |

The proposal-first pattern added ~20 min upfront but saved an unknown amount of rework (the 3 open questions could have flipped in either direction; resolving them at Gate D meant the implementation went straight at the targets).

## Cross-references

- Specs (archived): `openspec/specs/m2-ui-foundation/`
- ADRs: ADR-019 (label rendering — locked React + Storybook + shadcn-ish), ADR-020 (this slice — Vite + React + Tailwind 4 + Storybook 8 rationale)
- Sibling: `openspec-slice-module-2.md` row #13 `m2-ui-backfill-wave1` — proposal lands AFTER this slice merges
- Predecessors (UI-component contracts deferred): `retros/m2-cost-rollup-and-audit.md` (MarginPanel), `retros/m2-menus-margins.md` (MarginPanel), `retros/m2-allergens-article-21.md` (AllergenBadge)
- ai-playbook: `specs/ux-track.md` §10 (OKLCH-canonical), §11 (DESIGN.md format), §13 (Storybook-first development + per-PR Storybook publish), `specs/runbook-bmad-openspec.md` §4.5 (PR self-review)
- Components catalogue: `docs/ux/components.md` — AllergenBadge + MarginPanel entries point to this slice's deliverables; remaining 11 component entries point at their owning slices.
