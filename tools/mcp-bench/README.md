# mcp-bench

> Wave 1.13 [3c] — MCP-client benchmark harness.

Drives a fixed read-only capability matrix against an MCP transport and
emits a markdown report under `docs/bench/<YYYY-MM-DD>-<client>.md`.
Standalone Node CLI; no apps/api dependency.

## Adapters

| Client | Transport | Source |
|---|---|---|
| `hermes` | HTTP + SSE (`web_via_http_sse` platform from Wave 1.13 [3b]) | `src/transports/hermes.ts` |
| `claude-desktop` | stdio JSON-RPC 2.0 | `src/transports/stdio-jsonrpc.ts` |
| `opencode` | stdio JSON-RPC 2.0 | `src/transports/stdio-jsonrpc.ts` |

Adding a new client = implement the `Transport` interface in
`src/lib/types.ts` (3 methods: `connect`, `invoke`, `disconnect`) +
register a factory in `src/run.ts`.

## Capability matrix

Read-only by design (per ADR-BENCH-2). Writes have side-effects + per-
capability flag dependencies that make reproducible benches hard.

- `recipes.read`
- `recipes.list`
- `ingredients.search`
- `menu-items.read`

## Invocation

```bash
cd tools/mcp-bench
pnpm install
pnpm exec tsx src/run.ts \
  --client=hermes \
  --capabilities=read,list,search \
  --duration=60s \
  --warmup=5s
```

### Hermes-specific env

```bash
NEXANDRO_HERMES_BASE_URL=http://127.0.0.1:8644
NEXANDRO_HERMES_AUTH_SECRET=<see eligia-core/secrets/secrets.env>
HERMES_VERSION=wamba-overlay
MCP_BENCH_BANK_ID=nexandro-bench
MCP_BENCH_USER_ID=00000000-0000-4000-8000-00000000bench
```

### Claude Desktop / OpenCode

```bash
CLAUDE_DESKTOP_BIN=/usr/local/bin/claude-desktop
CLAUDE_DESKTOP_VERSION=$(claude-desktop --version)

OPENCODE_BIN=/usr/local/bin/opencode
OPENCODE_VERSION=$(opencode --version)
```

## Output

- One markdown file per run: `docs/bench/<YYYY-MM-DD>-<client>.md`
- Versioned in repo so `git log` shows performance evolution.
- Comparison between runs = `git diff` between two markdown files.

## Failure handling

A transport that cannot spawn or handshake produces an `INCOMPLETE` report
and exits non-zero. Per-call failures during the measurement window are
counted as errors and surface in `error rate` + `errors` columns.

## Tests

```bash
pnpm test
```

Smoke tests cover the stats math, the markdown renderer, the
JSON-RPC frame parser (which both stdio adapters share), and the
regression-check script. The Hermes adapter is exercised in INT
against the real VPS — no separate unit test for it.

## CI (Wave 1.16 — `m2-mcp-bench-ci`)

Two GitHub Actions jobs in `.github/workflows/mcp-bench.yml`:

- **`lint-test-build`** — runs on every PR that touches `tools/mcp-bench/**`
  or the workflow file. Pure unit/lint/build; no VPS hit.
- **`bench`** — `workflow_dispatch` only. Drives a real bench against the
  configured VPS Hermes (auth via GH Secrets), uploads the markdown report
  as an artifact, runs `regression-check.ts` against the previous
  most-recent committed report, and (default) commits the new report via
  `github-actions[bot]`.

```bash
# Manual trigger from a maintainer's machine
gh workflow run mcp-bench.yml \
  -f client=hermes \
  -f duration=60s \
  -f regression_threshold_pct=20 \
  -f commit_report=true
```

Required GH Secrets: `NEXANDRO_HERMES_BASE_URL`,
`NEXANDRO_HERMES_AUTH_SECRET`. Optional GH Variable:
`HERMES_VERSION` (defaults to `wamba-overlay`).

The regression check fails the workflow run BEFORE the commit step
when ANY capability's p95 regresses by more than the threshold (default
20%). When no previous baseline exists for the chosen client, the
check is skipped and the new report becomes the first baseline.

The two committed `*-baseline.md` files have all-zero p95 values; the
regression check detects this case (`isSyntheticBaseline()`) and skips
comparison. The first real run committed becomes the first non-synthetic
baseline.

```bash
# Local invocation of the regression script
npx tsx scripts/regression-check.ts \
  ../../docs/bench/2026-09-01-hermes.md \
  ../../docs/bench/2026-08-01-hermes.md \
  20
```

---

Wave 1.13 [3c] · Wave 1.16 (CI integration) · nexandro
