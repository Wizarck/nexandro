# retros/m2-mcp-bench-ci.md

> **Slice**: `m2-mcp-bench-ci` · **PR**: [#109](https://github.com/Wizarck/nexandro/pull/109) · **Merged**: 2026-05-07 · **Squash SHA**: `772080e`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.16 — first slice in the post-M2 backend tech-debt batch (4 slices the user picked together)**. Wires `tools/mcp-bench/` into a GitHub Actions workflow with PR-level lint/test/build + manual `workflow_dispatch` for real bench runs against VPS Hermes + automated regression detection. **First-pass green CI**, including the new workflow exercising itself for the first time.

## What we shipped

**`.github/workflows/mcp-bench.yml` (NEW):**
- Two jobs: `lint-test-build` (PR + paths-filtered to `tools/mcp-bench/**` + workflow file) and `bench` (`workflow_dispatch` only, `if: github.event_name == 'workflow_dispatch'`).
- Workflow inputs: `client` (choice: hermes), `duration` (string, default `60s`), `regression_threshold_pct` (string, default `20`), `commit_report` (boolean, default `true`).
- Permissions: `contents: write` at workflow level so the bot can push the new report. Concurrency: `mcp-bench-${{ github.ref }}` cancel-in-progress.
- The bench job:
  1. Checks out with `fetch-depth: 0` (full history needed for the bot push).
  2. `npm ci` against the cached `tools/mcp-bench/package-lock.json`.
  3. Locates the **previous** baseline report BEFORE running the bench (so the new report doesn't overwrite the basis of comparison).
  4. Runs `npx tsx src/run.ts --client=$client --duration=$duration` with `NEXANDRO_HERMES_BASE_URL` + `NEXANDRO_HERMES_AUTH_SECRET` from GH Secrets, `HERMES_VERSION` from a GH Variable (defaults `wamba-overlay`).
  5. Uploads the new report as a workflow artifact regardless of regression result.
  6. Runs the regression check vs the located baseline (skipped when no baseline exists).
  7. When `commit_report=true` AND nothing already cached for commit, configures the `github-actions[bot]` user, stages `docs/bench/`, commits with message `bench(mcp): <client> run <YYYY-MM-DD> (workflow_dispatch by <actor>)`, and pushes to whatever ref dispatched the workflow (`HEAD:${GITHUB_REF_NAME}`).

**`tools/mcp-bench/scripts/regression-check.ts` (NEW, ~150 LOC):**
- Pure parser + comparison; argv `<new.md> <baseline.md> <threshold-pct>`.
- Three exports: `parseReport(markdown)` finds the bench harness's fixed-shape results table by regex on the literal header, parses each row, returns `{ok, rows, error?}`. `isSyntheticBaseline(rows)` returns true when every row's p95 is exactly 0 (the two committed `*-baseline.md` placeholders). `findRegressions(newRows, baseRows, thresholdPct)` returns `[{capability, baselineP95, newP95, deltaPct}]` for capabilities exceeding the threshold; skips capabilities only present in the new report (added; not a regression) + per-row `baseline.p95=0` entries (avoids div-by-zero).
- Exit codes: `0` no regression OR baseline missing OR baseline synthetic; `1` at least one capability regressed; `2` malformed input. Strict `>` comparison (exact-threshold doesn't trip).
- The regression check is the only piece of regression-detection logic; `m2-mcp-bench-rolling-window` is filed if statistical sophistication becomes warranted.

**`tools/mcp-bench/scripts/regression-check.test.ts` (NEW):**
- 10 vitest tests covering: parse extraction, missing header (ok=false), malformed row (ok=false), synthetic baseline detection (true / false), no-regression, within-threshold, exact-threshold not flagged (boundary), over-threshold flagged, added-capability-skipped, per-row p95=0 skipped.

**Bonus fix — `tools/mcp-bench` ESLint config that was silently broken:**
- The 3c slice shipped `eslint` v9 in `package.json` deps + a `lint` script, but no `eslint.config.js`. ESLint v9 requires the flat config; without one, the script exits non-zero with a "couldn't find eslint.config" diagnostic. Nobody had noticed because nothing in CI ran the lint script (until this slice).
- New `tools/mcp-bench/eslint.config.js` matching the `apps/web/eslint.config.js` flat-config pattern (no React plugins; this is a Node CLI). Lints `src/**/*.ts` + `scripts/**/*.ts`.
- Discovered + fixed in the same slice that needed lint to work in CI; lesson codified below.

**Test deltas:**
- mcp-bench: 13 → 23 vitest (+10 net new). Lint clean (with 2 pre-existing no-console-disable warnings). Build clean.
- apps/api / ui-kit / apps/web: zero changes.

## What surprised us

- **The `tools/mcp-bench/` lint script had been silently broken since 3c.** The slice shipped ESLint v9 + a `lint` npm script + zero `eslint.config.js`. Running `npm run lint` exit-2's with a config-not-found diagnostic. The 3c retro mentioned "Lint clean" — but that was the *root* lint pass (which doesn't reach into `tools/`). Nobody discovered it because (a) `tools/mcp-bench/` is a sibling, not a Turborepo workspace; (b) the existing CI workflows don't enter `tools/` at all (`python-tools.yml` is the only one with `tools/` in scope, and it targets `rag-proxy` + `rag-corpus`); (c) running `npm run lint` locally from the standalone CLI dir wasn't part of any maintainer flow. Lesson: **tools/* siblings need their own CI workflow at slice-time; "we'll wire CI later" turns into "broken script that nobody hit"**. This slice is what surfaced it. Codifying as a recurring lesson.
- **First-pass green CI on a workflow that exercises itself.** The PR diff touched `.github/workflows/mcp-bench.yml` + `tools/mcp-bench/**`, so the workflow's `pull_request` paths trigger fired against itself on first push. The new `lint-test-build` job ran against the very tooling it was being added for — meta-testing without orchestration. Worked first try; no need for a follow-up "fix the workflow" commit. Three slices in a row with first-pass green CI (1.13[3c] / 1.15 / 1.16); the previous "workflow needs many iterations" pattern from 1.13[3a/3b] has receded as the cadence stabilises.
- **`workflow_dispatch` jobs need explicit `if:` even when the trigger should make it implicit.** Without `if: github.event_name == 'workflow_dispatch'`, GH Actions schedules ALL jobs in a workflow when ANY trigger fires. So a PR that triggers `lint-test-build` also tries to schedule `bench` — which then fails at the `${{ inputs.client }}` interpolation step because `inputs` is null on PR events. The workflow's `bench` job needs the explicit gate. The skipping shows up as `bench (${{ inputs.client }})` in the checks list with status `skipping`, which is the intended outcome. Worth documenting because the GH Actions docs treat this as obvious; in practice the failure mode is opaque.
- **`fetch-depth: 0` + `git push origin "HEAD:${GITHUB_REF_NAME}"` is the clean push pattern from a workflow.** Default `actions/checkout` does a shallow clone; pushing a new commit from a shallow checkout works for `git push` (Git pushes the committed object regardless), but inserting `fetch-depth: 0` makes the rebase + conflict surface predictable and removes one whole class of "shallow clone weirdness" failure modes. Documented in the workflow comments for future contributors.

## Patterns reinforced or discovered

- **Tools/* CI workflows follow the `python-tools.yml` shape**: dedicated workflow file per `tools/<name>/` standalone tool, paths-filtered to that directory + the workflow file itself. Reuse this pattern for any future `tools/<name>/` package (rag-corpus already shares the workflow with rag-proxy in python-tools.yml; future Node tools each get their own).
- **PR-only paths-filter triggers are quiet by design.** A PR that doesn't touch the bench harness skips the bench workflow entirely — no CI minutes consumed. This is opt-in cost; don't add a fallback "always run" job out of paranoia.
- **Manual `workflow_dispatch` is the right abstraction for VPS-traffic-generating CI.** Cron schedule against shared production infrastructure is wasteful (continuous traffic regardless of need) and risky (could rate-limit real users). Manual dispatch puts the operator in control: run before deploys, after upgrades, when investigating regressions.
- **Pure parser + math = unit-test bonanza.** The regression-check script has no I/O coupling beyond reading two files at the top of `main()`. The exported `parseReport`/`findRegressions`/`isSyntheticBaseline` functions are pure, testable, and produce 10 high-confidence tests in a thin file. This shape works for any future "compute a delta from two reports" tool (e.g. extending to p99 / throughput / error-rate deltas in the filed `m2-mcp-bench-extended-stats`).
- **Synthetic baseline detection is essential when committing placeholder anchors.** If a project commits placeholder reports as anchor files (`docs/bench/*-baseline.md` with all-zero values), the regression script must detect and skip them. Otherwise the first real run trips the threshold against +∞%. The detection is a 1-liner (`every(r => r.p95 === 0)`); cheap insurance against a confusing first-real-run failure.
- **Workflow `permissions: contents: write` at workflow level beats job level.** Job-level `contents: write` has subtler scoping quirks with cross-step state (the post-job tokens are scoped narrower than expected). Workflow-level matches the pattern other GitHub Actions docs canonicalise.

## Things to file as follow-ups

- **`m2-mcp-bench-cron`** — daily/weekly scheduled bench when the project hits steady-state production with continuous baseline tracking value.
- **`m2-mcp-bench-stdio-matrix`** — extend the matrix to Claude Desktop + OpenCode adapters. Requires binary provisioning (image baking vs Nix vs `actions/setup-*`) which is a separable engineering decision.
- **`m2-mcp-bench-rolling-window`** — 7-run rolling window + statistical outlier rejection.
- **`m2-mcp-bench-pr-comment`** — pretty PR-comment summaries on bench runs.
- **`m2-mcp-bench-cross-repo`** — auto-trigger on Hermes overlay redeploys.
- **`m2-mcp-bench-extended-stats`** — p99 / per-bucket histogram in the report + regression check.
- **`m2-mcp-bench-vpn-tunnel`** — SSH-tunnel scaffolding if VPS Hermes turns out not to be publicly reachable.
- **First real workflow_dispatch run** — operator action item, not a slice. Will surface whether the VPS is reachable from GH Actions runners + whether the secret rotation pattern works.

## Process notes

- **2 stage commits + first-pass green CI**, fastest closure of the saga so far:
  1. `proposal(...)` — openspec artifacts.
  2. `feat(mcp-bench): GH Actions workflow + regression-check script` — workflow + script + tests + eslint-config-fix + README update bundled (the slice was small enough that further decomposition would have been ceremony).
- **Gate D was light.** 3 picks; user delegated all 3 to my recommendation with "lo que recomiendes" / "lo que sugieras" / "como te paresca mas comodo y que nos ayude al objetivo". Picks were declared in the response and the slice proceeded autonomously per the user's separate "all" pick on the 4-slice batch.
- **Worktree leftover after merge.** The cleanup `git worktree remove --force m2-mcp-bench-ci` failed with "Permission denied" because Windows still held a file lock on the npm-installed `node_modules/`. The branch + git worktree registry deleted cleanly (`git branch -D` + `git worktree list` shows only `master`); the directory remained as a stale folder. Same pattern as Wave 1.13 [3b]'s twelve-leftover episode; this is one. Sweep at the end of the 4-slice batch.
- mcp-bench unit suite: 13 → 23 (+10). Lint working again (was silently broken since 3c). Build clean. Storybook unaffected. Gitleaks clean. CI verde first-pass at `70bb432`.
- This is **slice #1 of the user's 4-slice "all" pick**. Next: `m2-agent-credential-rotation` → `m2-audit-log-emitter-migration` → `m2-audit-log-ui`.
