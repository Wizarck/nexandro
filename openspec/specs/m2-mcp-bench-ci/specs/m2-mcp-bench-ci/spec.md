# Spec: m2-mcp-bench-ci

> Wave 1.16. Acceptance scenarios for the MCP-bench CI integration.

## Scenario: WHEN a PR changes tools/mcp-bench/**, THEN the lint-test-build job runs

```
GIVEN  A PR opened against master
       AND The PR diff touches at least one file under tools/mcp-bench/**
WHEN   GitHub Actions evaluates the workflow triggers
THEN   The .github/workflows/mcp-bench.yml lint-test-build job runs
       AND It executes: npm ci → npm run lint → npm test → npm run build
       AND All steps must pass for the PR check to be green
       AND No VPS / network calls outside the GitHub runner happen.
```

## Scenario: WHEN a PR does NOT change tools/mcp-bench/**, THEN the workflow does not run

```
GIVEN  A PR whose diff is entirely outside tools/mcp-bench/**
       AND outside .github/workflows/mcp-bench.yml
WHEN   GitHub Actions evaluates the workflow triggers
THEN   The mcp-bench.yml workflow is NOT triggered for this PR
       AND No CI minutes are consumed for the bench workflow.
```

## Scenario: WHEN a maintainer triggers workflow_dispatch with default inputs, THEN the bench runs against VPS Hermes and commits a new report

```
GIVEN  A maintainer with `actions:write` permissions
       AND GH Secrets contain NEXANDRO_HERMES_BASE_URL + NEXANDRO_HERMES_AUTH_SECRET
WHEN   The maintainer runs `gh workflow run mcp-bench.yml`
       OR clicks "Run workflow" in the GH UI with default inputs
THEN   The `bench` job runs on master (or the chosen ref)
       AND It runs: npm ci → bench against client=hermes for 60s
       AND It writes docs/bench/<YYYY-MM-DD>-hermes.md
       AND It uploads the report as a workflow artifact
       AND The regression-check step compares new vs previous-most-recent
            <…>-hermes.md and exits 0 if no p95 regressed by more than 20%
       AND The github-actions[bot] commits the new report to master
            and pushes it.
```

## Scenario: WHEN the regression check finds a >20% p95 regression, THEN the workflow fails BEFORE committing the report

```
GIVEN  A previously-committed docs/bench/2026-05-07-hermes.md exists with
       p95(recipes.read)=100ms
       AND The new run produces p95(recipes.read)=130ms (30% regression)
       AND threshold = 20 (default)
WHEN   The regression-check step runs
THEN   It exits non-zero with a diagnostic line naming the offending capability
       AND The "Commit new report" step is skipped (workflow already failed)
       AND The artifact upload still ran (operator can download for inspection).
```

## Scenario: WHEN no previous baseline exists for the client, THEN the regression check passes and the new report becomes the first baseline

```
GIVEN  docs/bench/ contains zero <…>-<client>.md files for this client
       (or only synthetic placeholders the parser identifies as "synthetic")
WHEN   The bench job runs
THEN   The regression-check step exits 0 with "no baseline; first report"
       AND The commit step proceeds.
```

## Scenario: WHEN commit_report=false, THEN the artifact uploads but no commit happens

```
GIVEN  A maintainer triggers workflow_dispatch with commit_report=false
WHEN   The bench job completes
THEN   The artifact uploads as workflow output
       AND No git commit happens
       AND No git push happens
       AND The maintainer can manually download + commit the report later if desired.
```

## Scenario: WHEN regression-check runs against two well-formed reports, THEN per-capability p95 deltas are computed correctly

```
GIVEN  Two markdown reports A (baseline) + B (new) following the bench harness
       schema (results table with columns: Capability | Calls | OK | Errors |
       p50 (ms) | p95 (ms) | Throughput (req/s) | Error rate)
WHEN   `npx tsx scripts/regression-check.ts <B-path> <A-path> 20` runs
THEN   For each capability row in B that has a matching row in A, the script
       computes (B.p95 - A.p95) / A.p95 * 100
       AND If any computed regression > 20, the script exits 1 with the
            offending capability + delta logged
       AND If all regressions ≤ 20, the script exits 0 with a one-line summary.
```

## Scenario: WHEN the bench harness emits a malformed report, THEN regression-check fails fast

```
GIVEN  The bench harness emitted a report missing the results table
       (corrupted run / harness bug)
WHEN   regression-check parses it
THEN   It exits non-zero with "could not parse results table" diagnostic
       AND The maintainer is alerted via the failed workflow run
       AND No commit happens.
```

## Scenario: WHEN the workflow runs with auth secret missing, THEN the bench fails BEFORE producing a partial report

```
GIVEN  GH Secrets do not contain NEXANDRO_HERMES_AUTH_SECRET
       (e.g. fork PR / org-level secret missing)
WHEN   The bench job runs
THEN   The bench harness exits non-zero on its `/health` probe + the workflow fails
       AND No partial report file is committed.
```
