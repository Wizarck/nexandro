# Design — m2-mcp-agent-chat-widget (Wave 1.13 [3b])

## Architecture

Three-tier; the widget is a visual surface, the relay is a forwarding/audit layer, the cerebro is Hermes:

```
┌──────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ apps/web             │    │ apps/api            │    │ Hermes (eligia-vps) │
│   AgentChatWidget    │    │   POST /agent-chat  │    │   web_via_http_sse  │
│   useAgentChat hook  │SSE │   /stream           │SSE │   platform          │
│   ──────────────►    │    │   relay + audit +   │    │   bank_id forwarded │
│                      │    │   idempotency       │    │   to Hindsight      │
└──────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

Key boundaries:

- **The browser never talks to Hermes directly.** `NEXANDRO_HERMES_AUTH_SECRET` lives only in apps/api. CORS on the apps/api side allowlists apps/web.
- **The audit row is written by apps/api.** Hermes does its own logging on its side; the apps/api row is the nexandro-side forensic anchor (forensic envelope from Wave 1.13's `BeforeAfterAuditInterceptor`).
- **The Hermes platform is generic.** It takes `bank_id` from the request body and forwards it into Hindsight cascade. Other apps could embed Hermes via the same platform without ever touching nexandro code.
- **`NEXANDRO_AGENT_ENABLED=false` zeroes the surface.** Widget renders `null`, endpoint returns 404, no Hindsight initialisation. Per ADR-013 the standalone deployment must be fully usable.

## Decisions

### ADR-CHAT-W-PLATFORM — generic upstream Hermes platform `web_via_http_sse` (F2=B)

**Context.** The user wants Hermes (not a clone, not a parallel Anthropic-API call) as the agent backend. Hermes is engineered as a multi-channel agent — Telegram, WhatsApp Meta Business via MCP, Discord historically. Each channel is a **platform adapter** inheriting `BasePlatformAdapter` from `gateway/platforms/base.py`. The user has prior precedent: shipped the `whatsapp_via_mcp_meta_business_api` platform locally with PR upstream pending, ~376 LOC. That same pattern applies here.

**Decision.** Add a new platform `web_via_http_sse` upstream-PR-able, ~400 LOC, mirroring the WABA pattern. Until upstream merges it, ship via the existing `eligia/hermes-agent:wamba` overlay (the `wamba` tag is already a vendored fork; we add one more file).

**Generic contract** (no nexandro leakage):

```
POST /web/{session_id}
  Headers:
    X-Web-Auth-Secret: <secret>          # constant-time compare
    Content-Type: application/json
    Accept: text/event-stream
  Body:
    {
      "message": {
        "type": "text" | "image" | "multipart",
        "content": <string or { text, imageData (base64) }>
      },
      "bank_id": "<string>",              # consumer chooses Hindsight scope
      "user_attribution": {               # forwarded into audit + memory
        "user_id": "<string>",
        "display_name": "<string>"
      },
      "metadata": { ... }                 # passthrough to MessageEvent
    }
  Response: text/event-stream
    event: token         data: {"chunk": "..."}
    event: tool-calling  data: {"tool": "<capability>"}
    event: proactive     data: {"text": "..."}        # injected mid-stream
    event: done          data: {"finishReason": "stop"}
    event: error         data: {"code": "...", "message": "..."}
```

**Configuration (env vars, mirrors WABA naming):**

- `WEB_VIA_HTTP_SSE_HOST` (default `0.0.0.0`)
- `WEB_VIA_HTTP_SSE_PORT` (default `8644`)
- `WEB_VIA_HTTP_SSE_PATH` (default `/web`)
- `WEB_VIA_HTTP_SSE_AUTH_SECRET` (required; constant-time compare)
- `WEB_VIA_HTTP_SSE_ALLOWED_ORIGINS` (CSV; CORS allowlist)
- `WEB_VIA_HTTP_SSE_DEFAULT_BANK_ID` (optional; fallback when request omits)
- `WEB_VIA_HTTP_SSE_HOME_CHANNEL` (optional; same pattern as Telegram/WABA — first session for HITL)

**Consequences.**

- ✅ Reuses Hermes' existing message-handling pipeline (skills, memory cascade, tool calling, MCP client).
- ✅ PR-friendly upstream — same shape as your prior WABA contribution.
- ✅ Other web apps can embed the same Hermes container without touching nexandro code.
- ❌ Adds a network hop (browser → apps/api → Hermes). Mitigation: SSE keeps the connection open for the duration of the response; round-trip cost is one TCP handshake amortised over many tokens.

**Alternatives considered.**

- (A) **apps/api ↔ Anthropic directly**, bypass Hermes: rejected by the user explicitly. Loses Hermes' skills + memory cascade.
- (C) **Local hack endpoint in Hermes**, no platform abstraction: rejected — breaks Hermes' platform model, NOT upstream-PR-able.

### ADR-CHAT-W-RELAY — apps/api `POST /agent-chat/stream` (F1=b+c)

**Context.** Browser cannot hold the Hermes auth secret; CORS scoping needs to be apps/api-side; audit + idempotency are existing apps/api primitives from Wave 1.13. The relay is unavoidable.

**Decision.** New BC `apps/api/src/agent-chat/`:

- `agent-chat.controller.ts` — `POST /agent-chat/stream`, `@Roles('OWNER', 'MANAGER', 'STAFF')` (anyone authenticated can chat), `@AuditAggregate('chat_session', (req) => req.body?.sessionId ?? null)`.
- `agent-chat.service.ts` — orchestrates: flag check → bank_id resolution → Hermes call → SSE relay.
- `agent-chat.dto.ts` — `ChatMessageDto { type: 'text'|'image'|'multipart', content: ... }` + `ChatRequestDto { message, sessionId? }`.

**Service flow:**

1. Read `NEXANDRO_AGENT_ENABLED`. If false → throw `NotFoundException` (404). The `IdempotencyMiddleware` and `BeforeAfterAuditInterceptor` from Wave 1.13 are already wired globally; they no-op for 404 paths so no special handling.
2. Resolve bank id: `nexandro-${slugify(organization.name)}` (lowercase, ASCII, dash-separated, max 32 chars). Validation = `^[a-z0-9-]{1,32}$`. If slug collision (rare, multi-org with same name), the org id is appended: `nexandro-${slug}-${shortOrgIdHash}`.
3. Call Hermes `POST {NEXANDRO_HERMES_BASE_URL}/web/{sessionId}` with body `{message, bank_id, user_attribution, metadata}` + header `X-Web-Auth-Secret: {NEXANDRO_HERMES_AUTH_SECRET}`. `sessionId` defaults to a stable hash of `userId + browserSessionToken` so a refresh in the same tab continues the same Hermes-side session.
4. Stream the Hermes SSE response back through to the browser: pipe `event: token / tool-calling / proactive / done` 1:1, plus our own `event: error` for relay-side failures (timeout, 5xx from Hermes, etc.).
5. Audit emission is automatic — Wave 1.13's interceptor writes one `AGENT_ACTION_EXECUTED` row with `payload_after = { sessionId, messageDigest, modelHint? }`. The interceptor's `agentName` field is set to `hermes-web` by passing it via `req.agentContext.agentName` in a small middleware shim (the existing `AgentAuditMiddleware` only reads from `X-Agent-Name` header — for the chat endpoint we set the agent context server-side, not from request headers, since the user is talking to "nexandro's chat", not naming an agent themselves).

**Idempotency.** Wave 1.13 middleware applies. If the browser retries `POST /agent-chat/stream` with the same `Idempotency-Key` and the same body hash, it gets the cached response back. For a streaming endpoint this means **the cached SSE event sequence is replayed verbatim**. Implementation: cache the **complete final assistant message** + the synthetic SSE wrap (one `event: token` with full text + one `event: done`). We do not cache token-by-token replay — that's only useful for the live response, not retries. Stored in `agent_idempotency_keys.response_body` as `{ kind: 'sse-replay', text: '...', finishReason: 'stop' }`.

**Consequences.**

- ✅ Single audit row per chat turn; multi-org isolation built in via `bank_id`.
- ✅ Idempotency reuses Wave 1.13 infra.
- ❌ Cached SSE replay is "all-at-once" not streaming. Acceptable: replays happen on retry (rare) and the UX of a sudden full reply is fine.

**Alternatives considered.** Skipping idempotency on chat → rejected; chefs WILL double-tap on slow networks.

### ADR-CHAT-W-WIDGET — packages/ui-kit AgentChatWidget (F4=c, F7 text+image)

**Context.** `docs/ux/components.md` already specifies the contract: closed FAB · open sidesheet · streaming · tool-calling. Tokens are nominal (`--surface`, `--accent`, etc.). Storybook stories are pre-planned (7 of them).

**Decision.** Implement per the components.md spec. Five files in `packages/ui-kit/src/AgentChatWidget/`:

- `AgentChatWidget.tsx` — the component. Props `{ organizationId, userId, initialContext? }`. Reads `NEXANDRO_AGENT_ENABLED` from a runtime config object passed via React context (not direct `process.env` read — apps/web injects via `<RuntimeConfigProvider>`). When false → returns `null`.
- `AgentChatWidget.stories.tsx` — 7 stories: Closed (FAB-only), OpenEmpty, OpenMidConversation, Streaming, ToolCalling, LongConversation, FlagDisabled.
- `AgentChatWidget.test.tsx` — unit + smoke. Asserts: FAB renders when flag=true; nothing renders when flag=false; `Esc` closes and restores focus; image drag-drop captures file; streaming bubble appends tokens.
- `AgentChatWidget.types.ts` — props, message shapes, Hermes event types (1:1 with the SSE wire format).
- `index.ts` — barrel.

**Multimodal scope (F7):** text + image **input**. Output is text only (Hermes doesn't generate images yet, and Gemma 3 has text output only). Image input UX: drag-drop on the input bar + paste-from-clipboard + `[+]` icon button. Selected image renders inline in the user bubble before send.

**State machine (per components.md):**

```
closed ──[click FAB]──► open
open ──[Esc | click X]──► closed (FAB regains focus)
open ──[type + Enter | type + Send]──► streaming
streaming ──[tool-calling event]──► tool-calling (rendered as inline mute note)
tool-calling ──[next token event]──► streaming (back to bubble)
streaming ──[done event]──► open (idle)
streaming ──[error event]──► open + error toast
streaming ──[proactive event]──► open + new agent bubble injected
```

**Consequences.**

- ✅ Component is testable in isolation (Storybook).
- ✅ Voice deferred cleanly — no speculative API surface.
- ❌ Mobile keyboard handling is non-trivial when sidesheet is full-width — done with `vh` units + safe-area-insets; `AgentChatWidget.test.tsx` covers basic resize.

### ADR-CHAT-W-BANK — `nexandro-{tenant}` single bank, generalist (F8)

**Context.** PRD-2 §M2 Architecture Pillar #7 reserved `nexandro-recipes`, `nexandro-suppliers`, `nexandro-menus`, `nexandro-inventory` (M3+) as capability-named banks. The user's pick rejects per-feature granularity ("then we won't know which agent the user wants to talk to") in favour of a single generalist bank per tenant.

**Decision.** Bank id pattern: `nexandro-{tenant_slug}`.

- `tenant_slug` = `slugify(organization.name)` (lowercase ASCII, dash, ≤32 chars).
- On collision: append short hash of `organization.id` (8 hex chars).
- Single bank per tenant — Hermes uses the same bank for cooking questions, supplier negotiations, and dashboard analysis. Hermes' system prompt (SOUL.md) is the personality differentiator.
- Bank is created lazily by Hermes on first message; nexandro does NOT pre-provision.

**Consequences.**

- ✅ One concept for the user: "talk to your nexandro assistant".
- ✅ Cross-domain context survives in one place (chef notes a supplier change → mentions it later when planning a menu — same conversation history).
- ❌ Multi-personality split impossible without migration. Mitigation: revisit in M3 if user-research signals demand.

**Alternatives considered.**

- Multi-bank `nexandro-chef`, `nexandro-purchasing`, `nexandro-finance` — rejected per F8 user pick.
- `nexandro-{orgId}` (raw UUID) — rejected: not human-readable, breaks "name yourself something memorable" Hindsight ergonomics.

### ADR-CHAT-W-CI — flag matrix via 2 INT specs + Storybook smoke (F4=c)

**Context.** PRD-2 §M2 Architecture Pillar #4 commits to dual-mode operation. Per Gate D F4=c, we test the flag with focused INT + Storybook, NOT by re-running the entire suite twice (would 2× CI cost for marginal gain — most code paths don't touch the flag at all).

**Decision.** Three tests:

- `apps/api/src/agent-chat/agent-chat.flag-enabled.int.spec.ts` — `NEXANDRO_AGENT_ENABLED=true`, mock Hermes endpoint → assert 200 + SSE stream + audit row.
- `apps/api/src/agent-chat/agent-chat.flag-disabled.int.spec.ts` — `NEXANDRO_AGENT_ENABLED=false` → assert 404 + zero audit rows.
- `packages/ui-kit/src/AgentChatWidget/AgentChatWidget.test.tsx` includes a `flag-disabled returns null` assertion + the matching Storybook story.

**Consequences.**

- ✅ Coverage on both branches without doubling CI compute.
- ✅ The flag-disabled Storybook story doubles as visual regression — anyone seeing a non-empty render in that story knows the flag is leaking.

**Alternatives considered.** GH Actions matrix `NEXANDRO_AGENT_ENABLED: [true, false]` running the full suite — rejected as overkill; ~95% of tests don't touch the flag.

## Open questions / known risks

- ❓ **Hermes overlay rebuild cadence.** Adding the platform requires rebuilding `eligia/hermes-agent:wamba` with the new file under `gateway/platforms/`. The user's existing build script `/opt/hermes/wamba_build/Dockerfile.eligia-overlay` should accept the addition with one COPY line. Confirmed visually but not yet exercised. **Mitigation**: Stage 1 includes a smoke build before any other Stage starts.
- ❓ **CORS regex vs allowlist.** `WEB_VIA_HTTP_SSE_ALLOWED_ORIGINS` is a CSV allowlist; we picked it because it's auditable. Alternative: regex pattern. CSV is fine for ≤10 origins; revisit if the multi-tenant SaaS variant needs hundreds.
- ⚠ **Idempotency on streaming endpoints.** Cached replay is the full final text, not token-by-token. If a chef expects "second click streams the response again" they will be surprised. Mitigation: docs + the `done` event fires immediately on replay, which is a clear UX signal.
- ⚠ **Bank slug collisions.** Two orgs named "La Tradicional" become `nexandro-la-tradicional` + the orgId hash suffix. Display is internal (Hindsight key), not user-facing. Acceptable.
- ⚠ **Hermes auth secret rotation.** Same key for both Hermes and apps/api. Rotation = update both env vars in lockstep + restart both. Document in the operations runbook (Stage 4).

## Stages

The slice is divided into 4 stages, each pushable as one commit. Cadence is "B then escalate to A" per the user's preference from 3a.

- **Stage 1 — Hermes upstream platform `web_via_http_sse`.** New file in `gateway/platforms/` mirroring WABA. Local overlay rebuild + smoke against `curl`. ~400 LOC.
- **Stage 2 — apps/api `POST /agent-chat/stream` SSE relay BC.** Controller + service + DTO + 8-12 unit tests. Wires audit + idempotency from Wave 1.13.
- **Stage 3 — packages/ui-kit `AgentChatWidget`.** Component + 7 Storybook stories + Vitest tests including flag-disabled smoke.
- **Stage 4 — apps/web wiring + INT specs + env flags + ops runbook.** Mount widget in apps/web layout, useAgentChat hook, 2 INT specs, `apps/api/.env.example` + `tools/hermes-overlay/.env.example` updates, `docs/operations/m2-mcp-agent-chat-widget-runbook.md`.
