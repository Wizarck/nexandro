# MCP-client bench — claude-desktop (baseline, synthetic data)

> Status: **SYNTHETIC — replace after running against a real Claude Desktop install**

This file is a placeholder committed alongside Wave 1.13 [3c]. Real
numbers land here after the maintainer runs:

```bash
cd tools/mcp-bench
CLAUDE_DESKTOP_BIN=/path/to/claude-desktop \
CLAUDE_DESKTOP_VERSION=$(claude-desktop --version) \
pnpm exec tsx src/run.ts --client=claude-desktop --duration=60s
```

The Claude Desktop adapter speaks line-delimited JSON-RPC 2.0 over the
spawned process's stdin/stdout per the MCP spec. The bench drives a
fixed read-only capability matrix and measures round-trip latency.

## Run metadata (synthetic)

- **Client**: claude-desktop
- **Transport**: claude-desktop
- **Version**: pending
- **Started**: 2026-05-07T00:00:00.000Z
- **Ended**: 2026-05-07T00:01:00.000Z
- **Duration**: 60.0s
- **nexandro git SHA**: `pending`
- **Environment**: synthetic (placeholder)
- **Capabilities**: recipes.read, recipes.list, ingredients.search, menu-items.read

## Results (synthetic)

| Capability | Calls | OK | Errors | p50 (ms) | p95 (ms) | Throughput (req/s) | Error rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| `ingredients.search` | 0 | 0 | 0 | 0 | 0 | 0 | 0.00% |
| `menu-items.read` | 0 | 0 | 0 | 0 | 0 | 0 | 0.00% |
| `recipes.list` | 0 | 0 | 0 | 0 | 0 | 0 | 0.00% |
| `recipes.read` | 0 | 0 | 0 | 0 | 0 | 0 | 0.00% |

---

Wave 1.13 [3c] · `tools/mcp-bench/` · `pnpm exec tsx run.ts --client=<name>`
