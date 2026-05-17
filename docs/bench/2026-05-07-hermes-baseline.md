# MCP-client bench — hermes (baseline, synthetic data)

> Status: **SYNTHETIC — replace after running against the live VPS**

This file is a placeholder committed alongside Wave 1.13 [3c] so the
`docs/bench/` directory has a baseline anchor. Real numbers land here
after the maintainer runs:

```bash
cd tools/mcp-bench
NEXANDRO_HERMES_BASE_URL=http://127.0.0.1:8644 \
NEXANDRO_HERMES_AUTH_SECRET=$(grep WEB_VIA_HTTP_SSE_AUTH_SECRET /opt/eligia/eligia-core/secrets/secrets.env | cut -d= -f2) \
HERMES_VERSION=$(docker inspect eligia-hermes-agent --format='{{ index .Config.Labels "org.opencontainers.image.version" }}' 2>/dev/null || echo "wamba-overlay") \
pnpm exec tsx src/run.ts --client=hermes --duration=60s
```

## Run metadata (synthetic)

- **Client**: hermes
- **Transport**: hermes
- **Version**: wamba-overlay
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
