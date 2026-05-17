# Proposal: m2-mcp-agent-registry-bench

> **Wave 1.13 [3c]** — third and final slice of the m2-mcp-extras split. Closes the security and visibility gaps left open by 3a (`m2-mcp-write-capabilities`) and 3b (`m2-mcp-agent-chat-widget`). Per-agent identity (Ed25519 signing) replaces the trusted-internal-network shared-secret posture; the first MCP-client benchmark gives us comparative data on Hermes vs Claude Desktop vs OpenCode; SSE idempotency replay closes the chat retry path that 3b explicitly deferred.

## Problem

3a shipped 43 MCP write capabilities behind per-capability env flags + audit trail, but **anyone with the apps/api network reach can post agent-flagged requests**. The `X-Agent-Name` and `X-Agent-Capability` headers are accepted as-is. There is no cryptographic proof that the request originates from the named agent. The 3a runbook + `apps/api/.env.example` carry an explicit "trusted-internal-network only" warning to compensate.

3b shipped the first-party web chat behind a Hermes shared secret (`NEXANDRO_HERMES_AUTH_SECRET`). That secret is **infrastructure-level, not per-user** — anyone who holds it can post on behalf of any user attribution they supply. The 3b runbook documents this as deferred to slice 3c.

3b also deferred SSE idempotency replay: the `IdempotencyMiddleware` (3a) only caches JSON write responses, so chat turn retries hit Hermes twice. The `cacheableTextForIdempotency()` helper exists and is unit-tested, but there is no wiring into the cache layer.

Across both slices we have **zero comparative performance data** on MCP clients. Hermes is the incumbent because the eligia-vps already runs it; Claude Desktop and OpenCode are the most-asked-about alternatives. The 3a + 3b retros both filed "first MCP-client benchmark" as deferred.

This slice closes all three gaps in one bundle.

## Goals

1. **Per-agent identity (Ed25519)**: every authenticated agent request carries `X-Agent-Id`, `X-Agent-Signature`, `X-Agent-Timestamp`, `X-Agent-Nonce`. apps/api verifies the signature against the registered public key before admitting the request as agent-attributed.
2. **`agent_credentials` table** with CRUD endpoints under `/agent-credentials` (Owner-only). Per-org scoping, revocation column, audit emission via the existing 3a interceptor for create/update/revoke/delete.
3. **Apply signing to MCP writes (3a) + agent-chat (3b)** behind a flag (`NEXANDRO_AGENT_SIGNATURE_REQUIRED`, default false). Day-1 the flag is off so existing integrations keep working; day-N (per org) it flips on.
4. **SSE idempotency replay for chat**: extend the cache layer to cover `text/event-stream` responses, store the `{kind, text, finishReason, images?}` envelope from `cacheableTextForIdempotency()`, replay on `Idempotency-Key` hit without re-calling Hermes. Replay frame shape: `event: token` + full text + `event: image`* + `event: done`. Mismatched key payload returns HTTP 409 (matches 3a precedent).
5. **MCP-client benchmark harness**: a runnable Node CLI under `tools/mcp-bench/` that drives a fixed capability matrix against a configured MCP transport. Three transport adapters ship: Hermes (SSE), Claude Desktop (stdio), OpenCode (stdio). Output: `docs/bench/<YYYY-MM-DD>-<client>.md` with capability × {p50, p95, error_rate, throughput} table + run metadata.

## Non-goals

- **Owner UI for `agent_credentials`** — REST only this slice; UI filed as `m2-agent-credentials-ui` for a follow-up. Owners use curl / Postman / `tools/agent-cli/` (also filed as a follow-up if curl friction surfaces).
- **JWT / OIDC integration** — defer to M3 if nexandro becomes multi-tenant SaaS with an external IdP. Ed25519 + DB-stored public keys is the day-1 model.
- **Per-capability signing scope granularity** — signing is transversal (auth-pipeline level), not per-capability. The 3a per-capability flags continue to gate authorisation; signing gates authentication.
- **Frame-by-frame chat replay timing** — replay is "all-at-once" (one big token frame + done). The chef does not perceive a difference between streaming and instant on retry.
- **Bench in CI** — the matrix run is manually triggered by the maintainer. CI keeps the existing unit + INT loops without any bench gate (yet).
- **Public-key rotation flow** — revoke + re-register replaces rotation. Documented in the runbook.

## What changes (high level)

**New BC (`apps/api/src/agent-credentials/`):**
- Entity, repository, service, REST controller. POST/GET/PUT/DELETE `/agent-credentials`. RBAC: Owner only. Audit via `@AuditAggregate('agent_credential', req => req.params.id)` so the existing `BeforeAfterAuditInterceptor` from 3a writes a forensic row per CRUD.
- Migration `0021_agent_credentials` adds the table.

**New auth pipe (`apps/api/src/shared/middleware/agent-signature.middleware.ts`):**
- Reads the four `X-Agent-*` headers; verifies via `crypto.verify('ed25519', ...)`; rejects with 401 when `NEXANDRO_AGENT_SIGNATURE_REQUIRED=true` and the request is agent-flagged but unsigned/invalid; populates `req.agentContext` server-side from the verified `X-Agent-Id` (replaces today's behaviour where the controller stamps a hardcoded agentName).
- 5-minute clock skew window on `X-Agent-Timestamp`. Nonces tracked in a Redis-or-in-memory LRU bounded at 10k entries per process (replay protection); falls back to "drop the connection if seen" for the in-memory case.

**Idempotency middleware extension (`apps/api/src/shared/middleware/idempotency.middleware.ts`):**
- Detect `text/event-stream` responses; intercept `subscriber.next` to record events in the existing observable terminal callback; on cache hit, replay the cached envelope as a synthetic SSE stream.
- Keeps the 3a JSON write path bit-for-bit identical.

**`agent-chat` service (`apps/api/src/agent-chat/application/agent-chat.service.ts`):**
- Wire `cacheableTextForIdempotency(events)` into the cache record path (via the extended middleware contract).
- New unit tests for the replay path (cached → replays without fetch, mismatch → 409).

**MCP-client bench harness (`tools/mcp-bench/`):**
- Node CLI: `pnpm exec tsx run.ts --client=hermes --capabilities=read,list --duration=60s`.
- Three transport adapters under `transports/`: hermes (HTTP+SSE), claude-desktop (stdio JSON-RPC over child process), opencode (stdio JSON-RPC).
- Synthetic capability matrix: `recipes.read`, `recipes.list`, `ingredients.search`, `menu-items.read` (M2-relevant reads only — avoids accidentally writing during a bench).
- Output writer: `report.ts` emits markdown to `docs/bench/<YYYY-MM-DD>-<client>.md`.

**Runbook:** `docs/operations/m2-mcp-agent-registry-bench-runbook.md` — registration flow, signing flag rollout, SSE replay testing, bench invocation.

## Acceptance

See `specs/m2-mcp-agent-registry-bench/spec.md`.

## Out-of-scope follow-ups (filed)

- `m2-agent-credentials-ui` — Owner UI screen for credential CRUD.
- `m2-agent-credentials-cli` — `tools/agent-cli/register-agent.ts` for ops bootstrap (if curl friction proves real).
- `m2-mcp-bench-ci` — wire the bench harness into a scheduled CI workflow with regression detection.
- `m2-agent-credential-rotation` — keypair rotation API (today: revoke + re-register).
- `m3-agent-jwt-bridge` — IdP integration if multi-tenant SaaS lands in M3.

## Risk

- **Breaking integrations during the day-N flag flip**. Mitigation: per-org flag (default false), runbook documents the staged rollout, the `agent_credentials` REST surface ships before any flag flip lands.
- **Bench harness flakiness against real MCP clients**. Stdio process orchestration is finicky on Windows. Mitigation: each transport adapter ships its own smoke test that verifies the lifecycle (spawn → handshake → 1 capability → close); bench failures surface as exit-non-zero with a partial report.
- **Replay cache size growth**. Each cached chat turn carries the full reply text. Mitigation: 24h TTL (matches 3a `agent_idempotency_keys`); per-org cap monitored via the runbook (if growth surprises us we add LRU eviction).
- **Ed25519 + Node `crypto` module**. Builtin since Node 12, stable; no external deps. The agent side has many client libraries (libsodium, tweetnacl, Node crypto). Documented in the runbook.

## Estimate

Single PR, ~5-7 days of work. Bigger than 3b (which was ~3 days) because of three concerns combined + the bench harness having three transport adapters.
