# Proposal: m2-mcp-bench-ci

> **Wave 1.16** — Wires `tools/mcp-bench/` into a GitHub Actions workflow with PR-level lint/test/build gating + a manual `workflow_dispatch` job that runs a real bench against the VPS Hermes deployment, commits the resulting markdown report, and fails the run when p95 regresses by >X% against the latest committed baseline.

## Problem

Wave 1.13 [3c] (`m2-mcp-agent-registry-bench`) shipped the bench harness as a standalone Node CLI under `tools/mcp-bench/` with three transport adapters (Hermes HTTP+SSE, Claude Desktop stdio JSON-RPC, OpenCode stdio JSON-RPC) and 13 vitest unit tests. Two synthetic baseline reports were committed to `docs/bench/` so the directory has anchor files for `git diff` comparison once real numbers land.

What is missing today:

- **No CI invocation** — vitest never runs in CI. A change to the bench harness can break the JSON-RPC parser, the Hermes SSE drain, or the markdown writer, and master would carry the regression.
- **No regression detection** — even if a maintainer runs the bench manually, comparing p95 to a previous report is a manual `git diff` exercise. No automated guard.
- **No anchor for "what is the current performance"** — both committed baselines are explicitly synthetic placeholders. Operators investigating a perf complaint have no real reference.

The 3c retro filed `m2-mcp-bench-ci` as the follow-up. This slice closes it with the narrowest viable scope.

## Goals

1. **`.github/workflows/mcp-bench.yml`** (NEW) with two jobs:
   - **`lint-test-build`** runs on every PR that changes `tools/mcp-bench/**` or `.github/workflows/mcp-bench.yml`. Steps: install deps, lint, vitest, tsc-noemit. **No VPS hit, no real bench.** Catches harness-level regressions.
   - **`bench`** runs only via `workflow_dispatch`. Inputs: `client` (default `hermes`), `duration` (default `60s`), `regression_threshold_pct` (default `20`), `commit_report` (default `true`). Steps: install deps, build, run `pnpm exec tsx src/run.ts --client=$client --duration=$duration` against the VPS Hermes (auth via GH Secrets), upload report as artifact, run regression check vs latest committed report for the same client, commit new report to `docs/bench/<date>-<client>.md` when `commit_report=true`.
2. **`tools/mcp-bench/scripts/regression-check.ts`** (NEW) — small TS script:
   - Argv: `<new-report-path> <baseline-report-path> <threshold-pct>`.
   - Parses the markdown table from each report; computes p95 deltas per capability.
   - Exits non-zero with a diagnostic line if ANY capability's p95 regressed by more than `threshold-pct`.
   - Pure parsing + math; testable as a unit.
3. **`tools/mcp-bench/scripts/regression-check.test.ts`** (NEW) — 4+ vitest tests covering: no regression (passes); within-threshold regression (passes); exact threshold (boundary; passes); over-threshold regression (fails with the expected error code + message); missing baseline (passes — no comparison to make on first run).
4. **`tools/mcp-bench/README.md`** updated with a "CI" section pointing at the workflow + the manual invocation recipe.

## Non-goals

- **Cron-scheduled bench** — the VPS Hermes is shared production infra; running the bench on every cron tick generates continuous traffic against the live service. Manual `workflow_dispatch` is the right abstraction for now. Filed `m2-mcp-bench-cron` as backlog when the project has steady contributors who need scheduled regression catch.
- **Multi-client matrix in CI** — the Claude Desktop and OpenCode adapters spawn binaries via stdio JSON-RPC. The CI runner doesn't have those binaries installed, and packaging them is a separate engineering decision (image baking vs Nix vs `actions/setup-*`). For this slice the matrix only has one entry: `hermes`. Filed `m2-mcp-bench-stdio-matrix`.
- **Rolling-window regression detection** — comparing the new run against a single most-recent baseline is the simplest mental model. A 7-run rolling window with statistical outlier rejection adds complexity that the current dataset (zero real reports) does not justify. Filed `m2-mcp-bench-rolling-window`.
- **PR-comment summary of the bench result** — pretty CI commenting requires either a GH App or a personal token, plus failure-mode handling for forks. Manual `workflow_dispatch` operators read the workflow run page directly. Filed `m2-mcp-bench-pr-comment`.
- **Auto-bench on Hermes-side WABA overlay deploys** — would close the loop where a Hermes upgrade triggers a perf check automatically. Cross-repo coordination + secret sharing across GH orgs makes it a separate slice. Filed `m2-mcp-bench-cross-repo`.
- **Histogram / latency distribution beyond p50/p95** — Wave 1.13 [3c] shipped p50, p95, throughput, error rate. Adding p99 / p99.9 / per-bucket histogram is a tooling extension, not a CI extension. Filed `m2-mcp-bench-extended-stats`.

## What changes (high level)

**`.github/workflows/mcp-bench.yml` (NEW):**

```yaml
name: MCP-bench

on:
  pull_request:
    branches: [master]
    paths:
      - 'tools/mcp-bench/**'
      - '.github/workflows/mcp-bench.yml'
  workflow_dispatch:
    inputs:
      client:
        description: 'MCP client to bench (currently only hermes)'
        type: choice
        options: [hermes]
        default: hermes
      duration:
        description: 'Bench window'
        type: string
        default: 60s
      regression_threshold_pct:
        description: 'Fail if any p95 regresses by more than this percent'
        type: string
        default: '20'
      commit_report:
        description: 'Commit the new report to docs/bench/'
        type: boolean
        default: true

permissions:
  contents: write  # for the `bench` job to commit reports

concurrency:
  group: mcp-bench-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-test-build:
    name: lint + test + build
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: tools/mcp-bench
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm', cache-dependency-path: 'tools/mcp-bench/package-lock.json' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build

  bench:
    name: bench (${{ inputs.client }})
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: tools/mcp-bench
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm', cache-dependency-path: 'tools/mcp-bench/package-lock.json' }
      - run: npm ci
      - name: Run bench
        env:
          NEXANDRO_HERMES_BASE_URL: ${{ secrets.NEXANDRO_HERMES_BASE_URL }}
          NEXANDRO_HERMES_AUTH_SECRET: ${{ secrets.NEXANDRO_HERMES_AUTH_SECRET }}
          HERMES_VERSION: ${{ vars.HERMES_VERSION || 'wamba-overlay' }}
        run: pnpm exec tsx src/run.ts --client=${{ inputs.client }} --duration=${{ inputs.duration }}
      - name: Upload report artifact
        uses: actions/upload-artifact@v4
        with:
          name: mcp-bench-${{ inputs.client }}-${{ github.run_id }}
          path: docs/bench/*-${{ inputs.client }}.md
      - name: Regression check
        run: |
          NEW=$(ls -1t ../../docs/bench/*-${{ inputs.client }}.md | head -1)
          BASE=$(ls -1t ../../docs/bench/*-${{ inputs.client }}.md | sed -n '2p')
          if [ -z "$BASE" ]; then echo "No baseline; first report"; exit 0; fi
          npx tsx scripts/regression-check.ts "$NEW" "$BASE" "${{ inputs.regression_threshold_pct }}"
      - name: Commit new report
        if: ${{ inputs.commit_report }}
        run: |
          cd ../..
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add docs/bench/
          git commit -m "bench(mcp): ${{ inputs.client }} run $(date -u +%Y-%m-%d) (workflow_dispatch by ${{ github.actor }})" || echo "Nothing to commit"
          git push
```

**`tools/mcp-bench/scripts/regression-check.ts` (NEW)** — pure parser + p95-delta computer:

```ts
// Parses the results table from a markdown bench report; for each capability
// row, compares new.p95 vs baseline.p95; fails if any regression exceeds the
// threshold percentage.
```

**`tools/mcp-bench/scripts/regression-check.test.ts` (NEW)** — vitest covering: no-regression / within / exact / over / missing-row / missing-baseline.

**`tools/mcp-bench/package.json`** — add `"scripts": { "regression-check": "tsx scripts/regression-check.ts", ... }`.

**`tools/mcp-bench/README.md`** — append CI section.

## Acceptance

1. PR that changes `tools/mcp-bench/**` triggers the `lint-test-build` job which runs vitest + lint + tsc; non-zero exit fails the check.
2. `gh workflow run mcp-bench.yml -f client=hermes -f duration=60s` from the maintainer's machine triggers the `bench` job, runs against VPS Hermes via the GH Secret-stored auth, produces `docs/bench/<YYYY-MM-DD>-hermes.md`, and commits it via the `github-actions[bot]` user.
3. The regression check finds the previous-most-recent `<...>-hermes.md` report and computes per-capability p95 deltas. If ANY exceeds 20% (or the workflow input value), the workflow fails before the commit step.
4. First-run case (no previous report exists for `client=hermes`): the regression check exits 0 with a "no baseline" log line; the new report still commits.
5. `commit_report=false` workflow input skips the commit but keeps the artifact upload.
6. The committed report follows the exact markdown shape the existing harness emits (`docs/bench/2026-05-07-hermes-baseline.md` is the format reference).

## Risk + mitigation

- **Risk: VPS Hermes is unreachable from GH Actions** — `NEXANDRO_HERMES_BASE_URL` may resolve to a private DNS name. Mitigation: the eligia-vps does expose Hermes on a public hostname per the m2-mcp-agent-chat-widget runbook (`https://hermes.eligia-vps.example` or similar). If it doesn't, the workflow needs SSH-tunnel scaffolding — out of scope for this slice. We will discover this on the first manual `workflow_dispatch` and handle it then; a follow-up `m2-mcp-bench-vpn-tunnel` is the right scope.
- **Risk: Auth secret leaks into the artifact or report** — the bench harness writes only the report markdown which contains no secrets. The auth secret is consumed via env var by the harness's HTTP client. Documented in the workflow: secret is masked in logs by GH Actions' default behaviour.
- **Risk: Regression check false-positives on noisy runs** — single-run p95 has variance. Mitigation: the threshold is operator-tunable (default 20% is intentionally lenient). After 5+ real runs land, the threshold can tighten. Rolling-window detection is filed but deferred.
- **Risk: Bot-commit triggers an infinite CI loop** — the new commit goes to master and would re-trigger workflows that watch master. Mitigation: the `mcp-bench.yml` workflow's `pull_request` trigger watches PRs only, not pushes. Other workflows (`ci.yml` etc.) do watch master pushes; a single extra CI run per manual bench is acceptable.
- **Risk: `git push` from the workflow conflicts when the operator pushes simultaneously** — the workflow's commit + push happens after the bench run; if another commit landed in master between checkout and push, the push fails with non-fast-forward. Mitigation: the workflow logs the failure and exits non-zero so the operator knows to re-run; we do NOT auto-rebase + retry (avoids amplifying a real conflict).

## Open questions

None at the time of writing — Gate D picks confirmed (per-PR build/test + manual dispatch / threshold p95 vs baseline / bot commit on dispatch).

## Related slices + threads

- Wave 1.13 [3c] `m2-mcp-agent-registry-bench` (Squash `17b37c1`) — shipped the bench harness this slice wires up.
- Wave 1.13 [3b] `m2-mcp-agent-chat-widget` runbook — documents the VPS Hermes deployment + public auth secret rotation.
- `python-tools.yml` workflow (existing) — pattern reference for separate CI workflows that target `tools/<name>/` packages.

## Filed follow-ups

- `m2-mcp-bench-cron` — daily scheduled bench when the project reaches steady-state.
- `m2-mcp-bench-stdio-matrix` — extend the matrix to Claude Desktop + OpenCode (requires binary provisioning).
- `m2-mcp-bench-rolling-window` — 7-run rolling window + statistical outlier rejection.
- `m2-mcp-bench-pr-comment` — pretty PR-comment summaries.
- `m2-mcp-bench-cross-repo` — auto-trigger on Hermes overlay redeploy.
- `m2-mcp-bench-extended-stats` — p99 / per-bucket histogram in the report.
- `m2-mcp-bench-vpn-tunnel` — SSH-tunnel scaffolding if VPS Hermes isn't publicly reachable.
