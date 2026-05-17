# Design: m2-mcp-bench-ci

> Wave 1.16. Companion: `proposal.md`.

## Architecture

```
GitHub Actions
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  pull_request paths:'tools/mcp-bench/**'                        │
│      │                                                          │
│      ▼                                                          │
│  job: lint-test-build (PR-only, no VPS)                         │
│      ├── npm ci (cache: tools/mcp-bench/package-lock.json)      │
│      ├── npm run lint                                           │
│      ├── npm test  (vitest 13 + 4 new = 17)                     │
│      └── npm run build                                          │
│                                                                 │
│  workflow_dispatch (manual; default client=hermes, dur=60s)     │
│      │                                                          │
│      ▼                                                          │
│  job: bench (uses GH Secrets)                                   │
│      ├── npm ci                                                 │
│      ├── pnpm exec tsx src/run.ts --client=$client …            │
│      │       │                                                  │
│      │       └─→ HTTP+SSE → eligia-vps Hermes                   │
│      │                                                          │
│      ├── upload artifact: docs/bench/<date>-<client>.md          │
│      ├── regression-check.ts (new vs previous-most-recent)      │
│      │       └─→ exit 1 + log if any p95 ↑ > threshold           │
│      └── if commit_report=true:                                 │
│             git config bot ; git add docs/bench/ ; commit ; push│
└─────────────────────────────────────────────────────────────────┘
```

## Workflow file shape

The workflow lives at `.github/workflows/mcp-bench.yml`. Two jobs share the same checkout cache strategy. The `bench` job is gated by `if: github.event_name == 'workflow_dispatch'` so manual runs do not also re-execute the lint job (which would already have run on the merging PR).

**Triggers:**

- `pull_request` filtered by `paths: ['tools/mcp-bench/**', '.github/workflows/mcp-bench.yml']`. PRs that don't touch the bench harness skip the workflow entirely; minutes saved.
- `workflow_dispatch` with four inputs:
  - `client` — GitHub `choice` input restricted to `[hermes]` for now. Adding stdio adapters in the future expands this enum.
  - `duration` — string passed verbatim to `--duration=` flag.
  - `regression_threshold_pct` — string parsed as integer by the regression-check script.
  - `commit_report` — boolean; when false, the artifact uploads but no git commit happens.

**Permissions:**

The job needs `contents: write` to push the new report. Per [GH best-practice](https://docs.github.com/en/actions/security-guides/automatic-token-authentication), this is scoped at the workflow level, not the job level (job-level scoping has subtler quirks with cross-step state). Because the trigger paths are narrow, the elevated permission is narrowly scoped.

**Concurrency:**

`concurrency: { group: mcp-bench-${{ github.ref }}, cancel-in-progress: true }` — a second `workflow_dispatch` against the same ref cancels the in-flight run rather than queuing. PR-shape runs each get their own ref so they don't cancel each other.

## Regression-check script

`tools/mcp-bench/scripts/regression-check.ts`. ~80 LOC pure parser + comparison.

**Argv contract:**

```
tsx scripts/regression-check.ts <new-report-md> <baseline-report-md> <threshold-pct>
```

**Exit codes:**

- `0` — no regression beyond threshold; or baseline missing (first report case is handled at the workflow level by detecting that situation before invoking the script — see workflow shape above).
- `1` — at least one capability's p95 regressed by more than `threshold-pct`.
- `2` — could not parse one of the inputs (missing file, missing table, malformed row).

**Parsing approach:**

The bench harness emits a markdown table with a fixed header:

```
| Capability | Calls | OK | Errors | p50 (ms) | p95 (ms) | Throughput (req/s) | Error rate |
```

The script:

1. Reads both files into memory.
2. Locates the header line via a regex match on the literal header (case-sensitive — the harness writes the same shape).
3. Parses each subsequent table row until a blank line / non-table line.
4. Builds a `Map<capabilityName, { p95: number, … }>` per file.
5. For each capability in `new`, looks up the same capability in `baseline`. If absent, skips (added capabilities aren't a regression). If present, computes `delta = (new.p95 - baseline.p95) / baseline.p95 * 100` and emits a log line.
6. Returns exit 1 if any delta exceeds threshold; exit 0 otherwise. Outputs a one-line summary regardless.

**What the script does NOT do:**

- It does not compare p50, throughput, or error rate. Wave 1.16 spec is "p95 regression"; other metrics are filed for `m2-mcp-bench-extended-stats`.
- It does not understand "synthetic" baselines. The two committed synthetic reports (`2026-05-07-hermes-baseline.md` + `2026-05-07-claude-desktop-baseline.md`) have all-zero p95 values; comparing real numbers against zero would always trip the threshold. **Mitigation**: workflow-level pre-check — see SD1 below.

## Sub-decisions

### SD1 — Skip baselines whose p95 column is all zeroes

The two committed synthetic baseline files have rows like `| recipes.read | 0 | 0 | 0 | 0 | 0 | 0 | 0.00% |`. Comparing real numbers against zero produces a +∞% regression every time. The regression-check script treats any baseline whose p95 column is **all zeroes across every capability row** as "synthetic; skip" and exits 0 with an info log. The first real report committed becomes the first non-synthetic baseline.

### SD2 — `npx tsx` for the regression-check invocation in CI

The script is TypeScript. The workflow runs it via `npx tsx scripts/regression-check.ts` inside `tools/mcp-bench/` (where `tsx` is a dependency). Avoids a separate compile step + matches the existing `pnpm exec tsx src/run.ts` invocation pattern.

### SD3 — `git push` retries: zero

If the operator pushes simultaneously, the bot's push fails with non-fast-forward. The workflow logs the failure and exits non-zero. The operator manually re-runs the workflow (or pulls + reruns the bench locally + commits manually). Auto-rebase + retry would mask real conflicts.

### SD4 — Per-PR vs scheduled cron

The proposal commits the slice to manual `workflow_dispatch` only. SD3c's `m2-mcp-bench-cron` is the right next slice once the project has steady-state production traffic and a need to catch overnight regressions. Today the maintainer runs the bench when a regression is suspected.

### SD5 — Auth secret scoping

`NEXANDRO_HERMES_BASE_URL` + `NEXANDRO_HERMES_AUTH_SECRET` live as **org-level** GH Secrets so they are available to scheduled (future) runs and to fork PRs (no — fork PRs explicitly cannot access secrets per GH security model; the bench job's `if: workflow_dispatch` already gates on this). The maintainer owns secret rotation per the m2-mcp-agent-chat-widget runbook.

### SD6 — Bot identity for commits

`github-actions[bot]` (the default GH Actions bot user). No PAT needed; the workflow's `GITHUB_TOKEN` with `contents: write` permission suffices. The commit author email is `41898282+github-actions[bot]@users.noreply.github.com` (the canonical bot email per GitHub docs).

## Test strategy

**`tools/mcp-bench/scripts/regression-check.test.ts`** — vitest (the harness already uses vitest):

- **`no regression`** — both reports have identical p95; passes (exit 0).
- **`within-threshold regression`** — new p95 = baseline * 1.15, threshold 20 → passes.
- **`exact-threshold regression`** — new p95 = baseline * 1.20, threshold 20 → passes (boundary; `>` not `>=`).
- **`over-threshold regression`** — new p95 = baseline * 1.30, threshold 20 → fails (exit 1) with diagnostic naming the offending capability.
- **`new capability added`** — new report has a capability the baseline lacks; that capability is skipped (not counted as regression); other capabilities pass.
- **`synthetic baseline (all-zero p95)`** — script skips comparison, exits 0 with "synthetic baseline; skipped" log line.
- **`malformed report`** — input file lacks the expected header; script exits 2 with "could not parse" diagnostic.

**`tools/mcp-bench` lint + build:**

- `npm run lint` exists and currently lints `src/**/*.ts`. The new `scripts/` folder needs to be in scope; either expand the lint glob or add a `scripts/.eslintrc` extension.
- `npm run build` (tsc) needs to compile the new script (or skip via tsconfig include scope).

**No INT spec for the workflow itself** — there's no clean way to integration-test a GitHub Actions workflow short of running it. The first manual `workflow_dispatch` is the integration test.

## Out-of-scope follow-ups

Listed in proposal.md `Filed follow-ups`. Notable: `m2-mcp-bench-cron`, `m2-mcp-bench-stdio-matrix`, `m2-mcp-bench-rolling-window`, `m2-mcp-bench-vpn-tunnel`.
