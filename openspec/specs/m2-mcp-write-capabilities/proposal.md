## Why

Wave 1.5 (`m2-mcp-server`) shipped the MCP server `nexandro` with **read-only** capabilities (`recipes.{read,list}` + `menu-items.{read,list}` + `ingredients.{read,search}`). Writes were deferred to `m2-mcp-extras` per Gate D 2a — explicitly trading scope for shipping speed.

The Agent-Ready architectural pillar (ADR-013) commits the system to: "the MCP server is the agent-side analog to the entire REST API". Without writes the MCP server is a glorified read replica; agents cannot do useful work. **HITL approvals are NOT in scope** for this slice — per Master's direction, "ya después podremos poner HITL approvals para las cosas que veamos necesarias". Per-capability feature flags (F6=a) are the safety net while we observe agent behaviour in production.

This slice (3a of the m2-mcp-extras split) closes the writes gap. 3b adds the AgentChatWidget UI + dual-mode CI matrix. 3c adds the agent-signing registry + first MCP-client benchmark.

## What Changes

**Scope** (per Gate D F1=a + SD6=a — truly all write endpoints, ~43 capabilities across 12 namespaces):

| Namespace | Capabilities | Source controller |
|---|---|---|
| `recipes.*` | create / update / setLineSource / delete / setAllergensOverride / setDietFlagsOverride / setCrossContamination | recipes + recipes-allergens |
| `menu-items.*` | create / update / delete | menu-items |
| `ingredients.*` | create / update / delete / reactivate / applyOverride / import | ingredients |
| `categories.*` | create / update / delete | categories |
| `suppliers.*` | create / update / delete | suppliers |
| `supplier-items.*` | create / update / delete / promotePreferred | supplier-items |
| `labels.*` | print / setOrgLabelFields | labels + org-label-fields |
| `ai-suggestions.*` | yield / waste / accept / reject | ai-suggestions |
| `external-catalog.*` | sync | external-catalog |
| `iam.users.*` | create / update / changePassword / addLocation / removeLocation | iam/user |
| `iam.locations.*` | create / update / delete | iam/location |
| `iam.organizations.*` | create / update | iam/organization |

**Cross-cutting changes**:

- **Pre-flight audit (F2=b)** — each REST write endpoint is audited for the `{ data, missingFields, nextRequired }` response contract from `m2-mcp-server` spec. Where missing, the contract is added (DTO + service + controller). Status of each endpoint documented in tasks.md §1.

- **Idempotency-Key support (F4=a + SD4=a)** — new migration `0020_agent_idempotency_keys.ts` creates `agent_idempotency_keys (organization_id uuid, key text, request_hash text, response_status int, response_body jsonb, created_at timestamptz, primary key (organization_id, key))` with an index on `created_at` for TTL cleanup. New `IdempotencyMiddleware` in `apps/api/` applied to all write endpoints: when `Idempotency-Key` header is present, the middleware looks up `(orgId, key)`; on hit returns the cached response; on miss the request proceeds and the response is cached (status + body) on success.

- **Forensic audit interceptor (F5=c + SD5=b)** — new `BeforeAfterAuditInterceptor` in `apps/api/src/shared/interceptors/`. Wraps every write controller method; before calling the handler, fetches the entity's current state via a per-namespace resolver (`recipes.findById`, `menu-items.findById`, etc.); after the handler returns, emits `AGENT_ACTION_EXECUTED` with `{ before, after, capability, executedBy, agentName, viaAgent, organizationId }` payload. The existing `AgentAuditMiddleware` (Wave 1.5) is left untouched — it emits the SAME event without before/after for non-MCP REST clients; the interceptor's emit is an enriched superset for MCP-routed writes.

- **Per-capability feature flags (F6=a + SD1=a)** — `apps/api/.env.example` documents ~43 new env vars `NEXANDRO_AGENT_<CAP>_ENABLED` (default `false`). When the flag is `false`, the API returns HTTP 503 with `code: 'AGENT_CAPABILITY_DISABLED'` for MCP-routed writes (detected via `req.agentContext.viaAgent === true`). Direct REST/UI traffic is NEVER affected by these flags. The MCP server does NOT mirror the flags (per SD1=a — Master refuses to release MCP versions just to toggle flags); the MCP server registers all 43 capabilities unconditionally and the API rejects when disabled.

- **Capability registry pattern in MCP server** — `packages/mcp-server-nexandro/src/capabilities/write/index.ts` exports a `WRITE_CAPABILITIES` registry: each entry is `{ name, description, schema (zod), restMethod, restPath, restPathParams }`. The MCP `buildServer()` factory loops over the registry and registers each capability via `server.registerTool()`. Adding a 44th capability is one new entry in the registry — no boilerplate.

- **No signing / agent registry yet** — 3a inherits the "trusted-internal-network mode only" posture from Wave 1.5. Spec requirement "unsigned agent → 401" is honoured by 3c (`m2-mcp-agent-registry-bench`) which lands the signing layer. 3a's README + `apps/api/.env.example` carry an explicit warning.

## Capabilities

### New Capabilities

- **`m2-mcp-write-capabilities`** — full CRUD parity for the MCP server's write surface, with idempotency + forensic audit + per-capability feature flags.

### Modified Capabilities

- **`m2-mcp-server`** — gains the 43 write capabilities listed above. Existing reads unchanged.
- **`m2-audit-log`** — `AGENT_ACTION_EXECUTED` payload now contains `{before, after, capability}` for MCP-routed writes (forensic-grade). Direct REST/UI traffic still emits the lean `{capability, executedBy, ...}` envelope from Wave 1.5.

## Impact

- **Prerequisites**: `m2-mcp-server` (Wave 1.5, `d43bbc1`) + `m2-audit-log` (Wave 1.9, `1e420a6`) + `m2-audit-log-fts` (Wave 1.11, `e7e1fb1`) merged.
- **Heaviest slice in M2 to date** — projected LOC delta ~3000-4000 LOC, ~50-80 tests, 5-7 days. Mitigation: capability-registry pattern keeps individual capability surface to ~10 LOC + 1 test each. The audit work (F2=b) for ~20 endpoints missing the contract is the majority of the manual labour.
- **Code**:
  - `apps/api/src/migrations/0020_agent_idempotency_keys.ts` — new table.
  - `apps/api/src/shared/interceptors/before-after-audit.interceptor.ts` — new + spec.
  - `apps/api/src/shared/middleware/idempotency.middleware.ts` — new + spec.
  - `apps/api/src/shared/dto/write-response.dto.ts` — shared `{data, missingFields, nextRequired}` envelope (extracted to dedupe across N controllers).
  - ~10-20 controller files modified to emit the contract where missing.
  - `apps/api/.env.example` — ~43 new flag entries (grouped by namespace) + Idempotency-Key documentation.
  - `packages/mcp-server-nexandro/src/capabilities/write/index.ts` — WRITE_CAPABILITIES registry.
  - `packages/mcp-server-nexandro/src/capabilities/write/<namespace>.ts` × 12 — one file per namespace with that namespace's entries.
  - `packages/mcp-server-nexandro/src/server.ts` — register the registry alongside existing reads.
  - Tests:
    - Unit: ~20 capability descriptor tests (registry shape + zod schema validation).
    - Unit: idempotency middleware (hit/miss/cache eviction/expired).
    - Unit: BeforeAfterAuditInterceptor (before/after capture + event emission).
    - Unit: per-capability flag rejection (503 on disabled).
    - INT: end-to-end via apps/api with seeded data — pick 3 representative writes (recipes.create, ingredients.applyOverride, menu-items.update) and verify `before/after` + `Idempotency-Key` round-trip.
    - mcp-server tests: each registered tool's invocation against a mocked apps/api.
- **Performance**: BeforeAfterAuditInterceptor adds one `findById` per write request — ~5-15ms latency on top of writes. Acceptable for chef workflows (UI is non-blocking on audit emission anyway). Idempotency lookup adds one indexed Postgres query (`primary key` lookup) — sub-1ms.
- **Storage**: `agent_idempotency_keys` rows accumulate at ~1 row per agent write request. TTL = 24h via cron `DELETE FROM agent_idempotency_keys WHERE created_at < now() - interval '24 hours'`. Steady-state size ~1MB/heavy-org.
- **Locale**: not user-facing.
- **Rollback**: revert the migration (`down()` drops the table); revert controllers (each is a small unit). Per-capability flags allow surgical disable in prod without code revert.
- **Out of scope**:
  - **HITL approval workflow** — agent issues a write, system emits "approval required" event, human approves before the write commits. Filed as `m2-mcp-write-hitl` follow-up.
  - **Agent-side dry-run mode** — MCP capability returns "what would happen" without writing. Filed as `m2-mcp-write-dry-run`.
  - **ETag / If-Match optimistic concurrency** (F4 was Idempotency-only). Filed as `m2-mcp-write-etag`.
  - **Signing / agent registry** — 3c.
  - **AgentChatWidget UI + dual-mode CI matrix** — 3b.
  - **MCP-client benchmark** — 3c.
