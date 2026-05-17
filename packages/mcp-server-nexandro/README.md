# @nexandro/mcp-server-nexandro

MCP server `nexandro` exposing Recipe / MenuItem / Ingredient read-only capabilities to MCP-compatible clients (Hermes, Claude Desktop, OpenCode, custom).

Per ADR-013 + the m2-mcp-server slice, this package is a SEPARATE Docker image / npm module with **zero compile-time coupling** to `apps/api/`. It consumes the same REST endpoints the UI uses; reading the database directly is forbidden.

## Scope (Wave 1.5 — read-only first)

Capabilities exposed:

| Capability | REST proxied |
| --- | --- |
| `recipes.read(id)` | `GET /recipes/:id` |
| `recipes.list(filter?)` | `GET /recipes` |
| `menu-items.read(id)` | `GET /menu-items/:id` |
| `menu-items.list(filter?)` | `GET /menu-items` |
| `ingredients.read(id)` | `GET /ingredients/:id` |
| `ingredients.search({ barcode?, query? })` | `GET /ingredients?barcode=… or ?q=…` |

Write capabilities (`recipes.create`, `menu-items.update`, `ingredients.applyOverride`, …) are deferred to the `m2-mcp-extras` follow-up slice. See `openspec/changes/m2-mcp-server/design.md` Open Question 2 for rationale.

## Configuration

Environment variables read at startup:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXANDRO_API_BASE_URL` | `http://localhost:3000` | Base URL of `apps/api/`. The MCP server forwards every capability call as a REST request to this base. |
| `NEXANDRO_AGENT_NAME` | `nexandro-mcp-server` | Sent as the `X-Agent-Name` header. The audit middleware in `apps/api/` records this against every action routed via the MCP layer. |
| `NEXANDRO_AGENT_AUTH_TOKEN` | _(unset)_ | Optional bearer token forwarded as `Authorization: Bearer …`. Required when `apps/api/` runs behind RBAC; the MCP server itself does NOT mint tokens (that's the operator's job). |

## Identity, signing, and trust boundary

Per `design.md` Risks: this slice runs in **trusted-internal-network mode only**. The `X-Via-Agent` + `X-Agent-Name` headers are forwarded as-is; there is no signed-agent-registry verification yet (deferred to M3 multi-tenant). Operators MUST place this server behind a network boundary that prevents header spoofing from untrusted callers.

When the M3 agent registry lands, this package will gain a `--signing-key` config surface and forward an additional `X-Agent-Signature` header.

## Connection pooling

The HTTP client uses Node 20's default fetch implementation (undici). Undici keeps a per-origin keep-alive pool by default; no extra configuration is required for the typical single-API deployment. If you observe socket exhaustion under load, set `NEXANDRO_API_KEEPALIVE=false` to disable pooling (this is the only escape hatch in the read-only slice; finer pool tuning lands with `m2-mcp-extras`).

## Deploy

### Docker (preferred)

```sh
docker build -t nexandro/mcp-server:0.1.0 packages/mcp-server-nexandro/
docker run --rm -i \
  -e NEXANDRO_API_BASE_URL=http://host.docker.internal:3000 \
  -e NEXANDRO_AGENT_NAME=claude-desktop \
  nexandro/mcp-server:0.1.0
```

The image speaks MCP over stdio (the SDK default for desktop clients).

### npm install

```sh
cd packages/mcp-server-nexandro
npm install
npm run build
node dist/index.js
```

## Lint contract

A regression fixture at `apps/api/src/__test_fixtures__/agent-vendor-import.fixture.ts` proves that any attempt to import this package's SDK dependency (`@modelcontextprotocol/sdk`) from `apps/api/` triggers the `no-restricted-imports` ESLint rule. CI fails on violation. See `apps/api/eslint.config.mjs`.

## See also

- `openspec/changes/m2-mcp-server/proposal.md`
- `openspec/changes/m2-mcp-server/design.md`
- `openspec/changes/m2-mcp-server/specs/m2-mcp-server/spec.md`
- ADR-013 (separability of agent-vendor packages)
