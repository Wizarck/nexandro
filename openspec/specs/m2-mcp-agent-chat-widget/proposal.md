## Why

Wave 1.13 [3a] (`m2-mcp-write-capabilities`) shipped 43 MCP write capabilities + idempotency + forensic audit. The MCP surface is now feature-complete for any agent that speaks MCP — Hermes, Claude Desktop, OpenCode, ChatGPT-MCP-bridge, custom clients. But there is no first-party UI to talk to an agent from inside nexandro yet.

Per [PRD-2 §M2 Architecture Pillar #4](../../../docs/prd-module-2-recipes.md): "Web chat widget is feature-flagged. `NEXANDRO_AGENT_ENABLED=false` (env) → widget hidden, no Hindsight bank initialisation, no `nexandro-agent` service-account creation. UI is fully usable without it." The widget closes the agent loop on the same surface chefs already use.

This slice (**3b** of the m2-mcp-extras split) adds the AgentChatWidget UI + dual-mode CI guarantees + Hermes integration via a **new generic upstream platform** (`web_via_http_sse`). 3c will add agent signing + first MCP-client benchmark.

## What Changes

**Scope (Gate D picks):** F1=b+c · F2=B · F3=a · F4=c · F5=a · F6=SSE · F7=text+image · F8=`nexandro-{tenant}` single bank generalist.

### 1. Hermes upstream — new generic platform `web_via_http_sse`

Hermes today exposes only Telegram + WhatsApp adapters. There is no HTTP-SSE platform that lets a web app embed a Hermes chat. This slice adds one — generic, vendor-neutral, designed to be **PR'd upstream** alongside the existing WABA precedent (`whatsapp_via_mcp_meta_business_api.py`, 376 lines, already merged in our overlay).

- New file `gateway/platforms/web_via_http_sse.py` (~400 LOC, mirrors WABA structure).
- Inherits `BasePlatformAdapter`, implements `connect / disconnect / send / get_chat_info`.
- Exposes a small HTTP-SSE server (configurable host/port/path/auth/CORS).
- Endpoint: `POST /web/{session_id}` with body `{message, bank_id, user_attribution, metadata}` returns `text/event-stream` of `event: token / tool-calling / proactive / done`.
- Auth: `X-Web-Auth-Secret` header, constant-time compare against `WEB_VIA_HTTP_SSE_AUTH_SECRET` env.
- CORS: `WEB_VIA_HTTP_SSE_ALLOWED_ORIGINS` env allowlist.
- `bank_id` parameter is forwarded into Hermes' Hindsight cascade — the platform itself stays generic; the consumer (any web app, not just nexandro) chooses the bank.
- Initially shipped via the same `eligia/hermes-agent:wamba` overlay strategy as WABA; PR upstream filed in parallel.

### 2. apps/api — `POST /agent-chat/stream` SSE relay

- New `apps/api/src/agent-chat/` BC: controller + service + DTO.
- Endpoint `POST /agent-chat/stream` accepts `{ message: { type, content, imageData? }, sessionId? }` — body comes from the widget via apps/web.
- Service:
  1. Reads `NEXANDRO_AGENT_ENABLED` flag — when false, returns 404 (defence in depth: controller would 404 too).
  2. Validates user auth + injects `bank_id = nexandro-{organizationSlug}` (single bank per tenant per F8 pick).
  3. Wraps the Wave 1.13 Idempotency middleware (replays prior chat turn if same `Idempotency-Key`).
  4. Records audit row `AGENT_ACTION_EXECUTED` with `agentName=hermes-web`, capability `chat.message`, `payload_before=null`, `payload_after={messageDigest, sessionId}` per Wave 1.13 forensic interceptor.
  5. Streams to `web_via_http_sse` Hermes endpoint with the shared `X-Web-Auth-Secret`.
  6. Relays SSE events back to the browser, mapping Hermes' event names 1:1.
- New env vars: `NEXANDRO_AGENT_ENABLED` (already exists per ADR-013), `NEXANDRO_HERMES_BASE_URL`, `NEXANDRO_HERMES_AUTH_SECRET`.

### 3. packages/ui-kit — `AgentChatWidget` component

Per `docs/ux/components.md` §AgentChatWidget the contract is already designed: closed FAB → open sidesheet → streaming → tool-calling state. Implementation:

- `packages/ui-kit/src/AgentChatWidget/{AgentChatWidget.tsx, .stories.tsx, .test.tsx, .types.ts, index.ts}`.
- Props: `{ organizationId, userId, initialContext?: 'recipe'|'menu'|'none' }`.
- States (per components.md): `closed` (FAB) · `open` (sidesheet) · `streaming` (token-by-token, no celebration animation) · `tool-calling` (`--mute` inline note).
- Dimensions: ~400px sidesheet on tablet+; full-width on mobile.
- Multimodal: text input + drag-drop image + paste-image. Voice deferred to M2.x.
- `Esc` closes; returns focus to launch FAB.
- `NEXANDRO_AGENT_ENABLED=false` → component returns `null`. Storybook smoke test asserts this.

### 4. apps/web — wire the widget

- Mount `<AgentChatWidget />` at the layout level (visible on every authenticated screen).
- New TanStack Query hook `useAgentChat()` in `apps/web/src/hooks/` — owns the SSE connection lifecycle.
- Per ai-playbook the hook lives outside ui-kit (data layer separation).

### 5. Dual-mode CI matrix (F4=c)

- Add 2 INT specs in `apps/api/src/agent-chat/`:
  - `agent-chat-flag-enabled.int.spec.ts`: with `NEXANDRO_AGENT_ENABLED=true`, POST `/agent-chat/stream` returns 200 + SSE stream + audit row written. Hermes is mocked at the SSE layer (we don't call the real container in CI).
  - `agent-chat-flag-disabled.int.spec.ts`: with `NEXANDRO_AGENT_ENABLED=false`, POST `/agent-chat/stream` returns 404 + no audit row.
- Storybook smoke: `AgentChatWidget.stories.tsx` includes a `FlagDisabled` story; `AgentChatWidget.test.tsx` asserts the component renders `null` when the flag is off.
- No global CI matrix multiplier — per F4=c we test the flag with focused INT + Storybook, not by re-running the entire suite twice.

### 6. Hindsight bank reservation

- Reserve `nexandro-{tenant}` as the canonical web-chat bank id pattern. `{tenant}` resolves to a slug derived from `organization.name` (lowercase, dashed, ≤32 chars). Documented in this slice's design.md; bank itself is initialised lazily by Hermes on first message (no schema migration here).

## Capabilities

### New Capabilities

- **`m2-mcp-agent-chat-widget`** — first-party web chat surface for nexandro, feature-flagged, hooked into Hermes via a generic upstream HTTP-SSE platform.

### Modified Capabilities

- **`m2-mcp-server`** — unchanged in this slice (write capabilities from 3a stay as-is). The widget consumes the API directly, not the MCP surface — agents reach MCP via Hermes' existing tool-calling layer.
- **`m2-audit-log`** — gains `AGENT_ACTION_EXECUTED` rows with `agentName=hermes-web` + capability `chat.message`. Forensic envelope reused from Wave 1.13 (no schema change).

## Impact

- **Prerequisites**: 3a `m2-mcp-write-capabilities` (`9020550`) merged. Hermes container running on the VPS (already up, healthy) — the slice ships a config update that adds the new platform alongside Telegram + WABA.
- **Estimated LOC**: ~1500-2000 (Hermes platform ~400 + apps/api SSE relay ~300 + ui-kit component ~500 + apps/web hook + tests). Significantly smaller than 3a.
- **Estimated CI runs**: 2-3.
- **Tests**: ~30 unit (component states, SSE event mapping, Hermes platform) + 2 INT (flag matrix) + 7 Storybook stories.
- **Deployment**:
  - Hermes overlay rebuild via existing `eligia/hermes-agent:wamba` image flow with the new platform file. Mirrors how WABA was added.
  - apps/api env: `NEXANDRO_AGENT_ENABLED`, `NEXANDRO_HERMES_BASE_URL`, `NEXANDRO_HERMES_AUTH_SECRET`.
  - Hermes env: `WEB_VIA_HTTP_SSE_HOST`, `WEB_VIA_HTTP_SSE_PORT`, `WEB_VIA_HTTP_SSE_PATH`, `WEB_VIA_HTTP_SSE_AUTH_SECRET`, `WEB_VIA_HTTP_SSE_ALLOWED_ORIGINS`.
  - Both flags default-false in `.env.example`. Production rollout = flip both after smoke test.
- **Storage**: zero schema changes in apps/api. Hindsight bank `nexandro-{tenant}` lives in the eligia-hindsight Postgres (ELIGIA-side concern, not nexandro-side).
- **Locale**: widget UI strings localised es / en / it (matching label-renderer pattern from Wave 1.6). System prompt language is Hermes' concern (auto-detect from user message).
- **Rollback**: flip `NEXANDRO_AGENT_ENABLED=false` in apps/api and the entire feature is invisible. Hermes overlay rollback = revert the Dockerfile.eligia-overlay to its prior tag.
- **Out of scope** (filed as follow-ups):
  - **Voice in/out** — Whisper STT + TTS + audio bubble UX. Filed `m2-agent-chat-voice`.
  - **Web Push API for proactive messages when tab is closed** — Service Worker + Push API + Hermes side opt-in. Filed `m2-agent-chat-webpush`.
  - **Conversation persistence visible to user** — search prior chats, resume from any device. Filed `m2-agent-chat-history`.
  - **Multi-personality / per-domain banks** (`nexandro-chef`, `nexandro-purchasing`) — single bank for now; revisit in M3 if signal demands.
  - **Agent signing / verified identity** — 3c.
  - **MCP-client benchmark** — 3c.
