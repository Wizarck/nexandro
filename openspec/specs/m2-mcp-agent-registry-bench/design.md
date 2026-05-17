# Design: m2-mcp-agent-registry-bench

> Wave 1.13 [3c]. Companion: `proposal.md`. Carries the architectural decisions (ADRs) for this slice.

## Architecture

```
┌────────────────┐                ┌─────────────────────────────┐
│  Agent client  │  X-Agent-*     │  apps/api                   │
│  (Hermes /     │  + body        │                             │
│  Claude Desk / ├───────────────►│  AgentSignatureMiddleware   │
│  OpenCode /    │                │   ↓ verifies sig            │
│  custom)       │                │   ↓ stamps req.agentContext │
│                │                │   ↓ 401 if invalid + flag   │
└────────────────┘                │                             │
                                  │  Existing pipeline:         │
                                  │   AgentAuditMiddleware      │
                                  │   IdempotencyMiddleware     │
                                  │   (now SSE-aware)           │
                                  │   Guards (RBAC + capability)│
                                  │   BeforeAfterAuditInterceptor│
                                  │                             │
                                  │  /agent-credentials CRUD ──┐│
                                  │  /agent-chat (3b)          ││
                                  │  43 MCP writes (3a)        ││
                                  └────────────────────────────┘│
                                                                │
                                                  ┌─────────────▼┐
                                                  │ agent_credentials│
                                                  │  (org-scoped,   │
                                                  │   public_key,   │
                                                  │   role, revoked)│
                                                  └────────────────┘
```

**Bench harness** is out-of-band: `tools/mcp-bench/` connects directly to a target MCP transport (Hermes HTTP+SSE / Claude Desktop stdio / OpenCode stdio), drives a fixed read-only capability matrix, and emits a markdown report. It does NOT need apps/api running because it talks to the MCP server, not the REST API.

## ADRs

### ADR-AGENT-SIG-1: Ed25519 over HMAC-SHA256

**Decision**: Per-agent signing uses Ed25519 asymmetric keypairs. apps/api stores the public key (DER-encoded, base64), the agent holds the private key locally and never transmits it.

**Context**: 3a + 3b ship with the trusted-internal-network warning. Closing that gap requires per-agent identity. Two reasonable primitives: HMAC-SHA256 (symmetric, shared secret) and Ed25519 (asymmetric, public/private keypair).

**Trade-off**:
- HMAC: ~20 LOC, no key distribution problem, leaks-on-server-compromise.
- Ed25519: ~50 LOC, agent self-generates keypair + uploads public key once, server compromise leaks only the public-key column (no impersonation possible without the private key).

**Rationale**: Agents in our deployment model are third-party MCP clients (Hermes on the VPS, Claude Desktop on a chef's laptop, OpenCode on an integrator's machine). They CAN safely hold their own private key — the "BYO-identity" model fits the MCP ecosystem direction (early MCP auth drafts converge on asymmetric). Ed25519 is the modern standard for inter-service signing (SSH from 2014, Sigstore, GitHub commit signing, WebAuthn / Passkey). Day-1 we are state-of-the-art; no migration debt.

**Implementation**: Node 16+ ships `crypto.sign('ed25519', ...)` and `crypto.verify('ed25519', ...)` builtin. Zero external deps.

### ADR-AGENT-SIG-2: Signed envelope shape

**Decision**: Signature covers `method + '\n' + path + '\n' + timestamp + '\n' + nonce + '\n' + body`. All four header values are required when the flag is on.

**Headers**:
- `X-Agent-Id: <uuid>` — primary key into `agent_credentials`.
- `X-Agent-Signature: <base64(ed25519_sig)>` — the signature over the canonicalised envelope.
- `X-Agent-Timestamp: <ISO8601>` — replay-window check (5-min skew).
- `X-Agent-Nonce: <128-bit-hex>` — nonce-once-per-request, tracked in an in-memory LRU.

**Rationale**: Body in the envelope means a tampered body fails verification. Path in the envelope means a path-rewriting MITM fails verification. Timestamp + nonce prevent replay (attacker who captures a valid signed request can't re-submit it). The 5-minute window matches the AWS SigV4 standard; tighter windows risk legitimate clock skew.

**Trade-off**: Body in signature means streaming bodies must be fully buffered before verification. Acceptable: chat messages are <100KB, MCP write payloads are <10KB.

**Alternatives considered**:
- HMAC over `(method, path)` only — rejected, allows tampered-body replay.
- JWS bearer token — rejected per ADR-AGENT-SIG-1 (multi-tenant defer to M3).

### ADR-AGENT-SIG-3: Default-OFF flag with staged rollout

**Decision**: `NEXANDRO_AGENT_SIGNATURE_REQUIRED=false` by default. Day-1 the slice ships with signing infrastructure but no enforcement. Per-org rollout flips the flag once that org's agents have registered their public keys.

**Per-org flag shape**: `NEXANDRO_AGENT_SIGNATURE_REQUIRED=true|false|<comma-list-of-org-ids>`. The third form is the staged-rollout escape hatch — true for listed orgs, false for the rest.

**Rationale**: Day-1 default-on would 401 every Hermes request on the VPS until the new credential is registered. That window is a downtime risk. Default-off + staged rollout is the standard cross-cutting auth-tightening pattern.

**Risk**: Operators forget to flip the flag and run with permissive auth indefinitely. Mitigation: the runbook documents the rollout checklist; the `apps/api/.env.example` carries an `# IMPORTANT` block; the periodic `audit_log.actor_kind='agent' WHERE agent_signature_verified=false` query (added to operations runbook) flags drift.

### ADR-AGENT-SIG-4: Agent context flows from the verified credential, not from headers

**Decision**: When the signature verifies, `req.agentContext.agentName` is populated from `agent_credentials.agentName` — NOT from a client-supplied `X-Agent-Name` header. The `X-Agent-Name` and `X-Agent-Capability` headers from 3a continue to be accepted for the legacy unsigned path (when the flag is off), but are IGNORED when a valid signature is present.

**Rationale**: Eliminates the "spoofed agent name" risk. A signed request from Hermes can ONLY attribute to "hermes" — the credential row is the single source of truth.

### ADR-AGENT-CRED-1: `agent_credentials` table per-org

**Decision**: Single table with composite uniqueness on `(organizationId, agentName)`. Public key stored as base64 DER (Ed25519 public keys are 32 bytes raw + DER overhead ≈ 44 bytes encoded).

```sql
CREATE TABLE agent_credentials (
  id           uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  agent_name   varchar(64) NOT NULL,
  public_key   text NOT NULL,
  role         varchar(32) NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz NULL,
  UNIQUE (organization_id, agent_name)
);
```

**Why `agentName` is the natural key**: integrators register exactly one credential per agent class ("hermes", "claude-desktop-john", "opencode-staging"). `agentName` becomes the audit attribution string — same value the existing `audit_log.agent_name` column already carries.

**`role`**: when a request is verified, the agent's role is inherited from this column (NOT the user's). That is, the agent acts AS itself with its own permissions, not impersonating a user. This matches the 3a `RolesGuard` shape and avoids the "agent acts on behalf of user" attribution pitfall.

**Revocation**: soft-delete via `revoked_at`. The signature middleware refuses verification when `revoked_at IS NOT NULL`.

### ADR-SSE-REPLAY-1: Replay envelope shape

**Decision**: Replayed SSE response = one `event: token` frame with the full text + zero or more `event: image` frames + one `event: done` frame. Replay is all-at-once, NOT timing-faithful.

**Cache shape**:
```ts
{ kind: 'sse-replay', text: string, finishReason: string, images?: { url: string; caption?: string }[] }
```

The 3b helper `cacheableTextForIdempotency()` already produces `{kind, text, finishReason}`. This slice extends it to also collect `image` events into the optional `images` array. The middleware persists this envelope to `agent_idempotency_keys.response_body` (jsonb).

**Why all-at-once**: streaming and instant replay are perceptually identical to a chef hitting retry. The 3b retro called this out; preserving original frame timing would cost ~10× the cache size and give zero UX benefit.

**Trade-off**: tool-calling intermediates (`event: tool-calling`) are NOT replayed. They are only meaningful in the live stream as transparency signals; on a retry the chef wants the answer, not the intermediate steps.

### ADR-SSE-REPLAY-2: SSE detection in IdempotencyMiddleware

**Decision**: The middleware sniffs the controller's `Content-Type` setter. If `text/event-stream`, it switches to streaming-cache mode: intercept `res.write` and `res.end` rather than `res.json`. Cached envelope is built from the captured frames + their JSON payloads.

**Implementation note**: Nest's `@Sse()` decorator emits frames via `res.write('id: N\nevent: <type>\ndata: <json>\n\n')`. The middleware parses each `data: <json>` line and discriminates by `type`. Match the existing `parseSseFrame` helper in agent-chat service for consistency.

### ADR-BENCH-1: Bench harness lives in `tools/mcp-bench/`, NOT in apps/api or packages/

**Decision**: New top-level Node CLI under `tools/mcp-bench/` (sibling of `tools/rag-proxy/`, `tools/rag-corpus/`). Standalone TypeScript, builds via `tsx`. Three transport adapters as plugins.

**Rationale**: Benches don't ship with the product binary. They are operational tooling. The `tools/` convention is established (rag-proxy + rag-corpus from Wave 1.8). Keeps the core build graph clean.

### ADR-BENCH-2: Capability matrix limited to read-only

**Decision**: The bench drives `recipes.read`, `recipes.list`, `ingredients.search`, `menu-items.read`. NO writes.

**Rationale**: Writes have side effects + idempotency checks + per-capability flag dependencies. A bench that mutates state is hard to make reproducible across runs. Read-only gives stable comparative data without the complexity of cleaning up between runs.

**Future**: when a "bench in CI" follow-up lands, it can layer a write-with-rollback wrapper on top.

### ADR-BENCH-3: Output is markdown in repo, not a database

**Decision**: Each run writes one markdown file to `docs/bench/<YYYY-MM-DD>-<client>.md`. The file carries metadata (client version, transport, env, nexandro git SHA) + a fixed table (capability × p50/p95/error_rate/throughput).

**Rationale**: Repo-versioned bench history = git log shows evolution. No additional schema, no UI, no scheduled jobs. The maintainer can compare runs by `git diff` between two markdown files. When run frequency justifies it, a follow-up slice can lift the data into a `bench_runs` table.

**Trade-off**: querying historical data requires git operations rather than SQL. Acceptable at current cadence.

## State machine — request authentication

```
                    ┌──────────────┐
                    │ Request arrives│
                    └──────┬───────┘
                           │
                  ┌────────▼─────────┐
                  │ Has X-Agent-* ?  │
                  └─┬──────────────┬─┘
                    │ no           │ yes
                    │              │
              ┌─────▼────┐   ┌─────▼────────────────┐
              │ Standard │   │ FLAG required?       │
              │ JWT auth │   └────┬───────────────┬─┘
              │ (UI)     │        │ no            │ yes
              └──────────┘        │               │
                          ┌───────▼──────────┐    │
                          │ Legacy 3a path   │    │
                          │ (X-Agent-Name    │    │
                          │  trusted; warn   │    │
                          │  in logs)        │    │
                          └──────────────────┘    │
                                       ┌──────────▼──────────┐
                                       │ Verify signature    │
                                       └─┬────────┬──────────┘
                                         │ valid  │ invalid
                                         │        │
                                ┌────────▼──┐  ┌──▼──────┐
                                │ Stamp     │  │ 401     │
                                │ agentCtx  │  │ +log    │
                                │ from cred │  └─────────┘
                                └───────────┘
```

## Module wiring

```
SharedModule (Global)
 ├ AgentSignatureMiddleware  (NEW — applied via consumer.apply())
 ├ AgentAuditMiddleware       (existing, unchanged)
 └ IdempotencyMiddleware      (existing — extended for SSE)

AgentCredentialsModule (NEW)
 ├ AgentCredentialsService
 ├ AgentCredentialsController (POST/GET/PUT/DELETE /agent-credentials)
 └ TypeOrmModule.forFeature([AgentCredential])

AgentChatModule (existing)
 └ AgentChatService           (extended — wire into IdempotencyMiddleware via the new SSE cache shape)
```

## Wire compatibility

**Day-N rollout (per-org)**:

1. Owner registers their agents' public keys via `POST /agent-credentials`.
2. Owner sets `NEXANDRO_AGENT_SIGNATURE_REQUIRED` to include their org id.
3. Restart apps/api.
4. Agents must now send signed requests; unsigned/invalid → 401.

**Rollback**:

1. Remove the org id from `NEXANDRO_AGENT_SIGNATURE_REQUIRED`.
2. Restart apps/api.
3. Unsigned requests fall back to the 3a legacy trusted-network path.

The `agent_credentials` rows persist across rollback; re-flipping the flag reactivates them without re-registration.

## Test plan

Unit (apps/api):
- `AgentSignatureMiddleware`: valid sig accepts; invalid sig 401; expired timestamp 401; replayed nonce 401; missing header + flag-off ignores; missing header + flag-on rejects.
- `AgentCredentialsService`: create / list / revoke / deny duplicate agentName per-org.
- `IdempotencyMiddleware` SSE branch: stream-aware capture; cache hit replays canonical envelope; mismatch returns 409.
- `AgentChatService` replay: cached envelope yields the synthetic SSE frames; Hermes is NOT recalled.

INT:
- `agent-credentials.int.spec.ts`: full CRUD round-trip + audit row emission.
- `agent-signature.int.spec.ts`: end-to-end signed request → success; tampered body → 401; flag-off + tampered → still passes (legacy path); flag-on + missing → 401.
- `agent-chat-replay.int.spec.ts`: first turn calls fakeHermes, cached row written; second turn with same Idempotency-Key returns the cached body and fakeHermes call count stays at 1.

Bench harness:
- Smoke: each transport adapter spawns + handshakes + 1 capability + closes cleanly.
- Output: writes a markdown file with the expected sections, no NaN values, dates ISO8601.

## Risks (recap from proposal + new ones surfaced in design)

- **Breaking integrations during day-N flag flip** (covered in proposal).
- **Bench harness flakiness on Windows** (covered in proposal).
- **Replay cache size growth** (covered in proposal).
- **Body-in-signature requires full buffering**: streaming bodies don't sign. Mitigation: chat + write payloads are small; documented in the runbook.
- **Nonce LRU per-process means horizontal scale-out can be replayed across replicas**: a request signed for replica A can be replayed at replica B if the LRU is in-memory only. Mitigation: M2 deployment is single-replica; if/when we go horizontal, a Redis-backed nonce store lands as a follow-up.

## Stages

1. **Stage 1** — `agent_credentials` migration + entity + service + REST controller + 8 unit + 1 INT.
2. **Stage 2** — `AgentSignatureMiddleware` + flag wiring + 8 unit + 1 INT.
3. **Stage 3** — `IdempotencyMiddleware` SSE extension + agent-chat replay wiring + 6 unit + 1 INT.
4. **Stage 4** — `tools/mcp-bench/` harness + 3 transport adapters + 1 smoke per adapter + report writer + 2 sample reports committed.
5. **Stage 5** — runbook + env flag docs + apps/api .env.example update + day-1 vs day-N migration notes.

Each stage = single commit. Total estimate: ~5-7 days.
