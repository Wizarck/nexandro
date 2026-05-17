# Tasks — m2-mcp-agent-chat-widget (Wave 1.13 [3b])

Cadence: 4 stages, each one commit. Each stage must end on green local lint + build + targeted tests before pushing.

## Stage 1 — Hermes upstream platform `web_via_http_sse`

**Output:** new file `gateway/platforms/web_via_http_sse.py` in the local Hermes overlay (`/opt/hermes/wamba_build/`), generic enough to PR upstream.

- [ ] 1.1 Read `gateway/platforms/whatsapp_via_mcp_meta_business_api.py` and `gateway/platforms/base.py` — confirm the abstract methods + lifecycle.
- [ ] 1.2 Create `gateway/platforms/web_via_http_sse.py`:
  - [ ] Class `WebViaHttpSsePlatform(BasePlatformAdapter)` with constructor reading `WEB_VIA_HTTP_SSE_*` env vars.
  - [ ] `connect()` boots a small `aiohttp` (or `fastapi`) server on `WEB_VIA_HTTP_SSE_HOST:PORT` with one route `POST {WEB_VIA_HTTP_SSE_PATH}/{session_id}`.
  - [ ] Auth check: `X-Web-Auth-Secret` header constant-time compared against `WEB_VIA_HTTP_SSE_AUTH_SECRET`.
  - [ ] CORS preflight: respond `OPTIONS` with `Access-Control-Allow-Origin` from the `WEB_VIA_HTTP_SSE_ALLOWED_ORIGINS` allowlist (404 if not allowed).
  - [ ] Body validation: pydantic schema `{message: {type, content}, bank_id: str, user_attribution: {user_id, display_name}, metadata?: dict}`.
  - [ ] Translate body → `MessageEvent` and call `self._message_handler(event)`. Stream response back via SSE: `event: token`, `event: tool-calling`, `event: proactive`, `event: done`, `event: error`.
  - [ ] `disconnect()` closes the server cleanly.
  - [ ] `send(chat_id, content, ...)` writes to the active SSE response stream for that chat_id. If no stream is open (chat ended), the message is dropped with a warning log (matches WABA's behaviour for closed sessions).
  - [ ] `get_chat_info(chat_id)` returns `{name: f"web-{chat_id}", type: "dm"}`.
  - [ ] All errors map to `event: error data: {code, message}` then close the stream.
- [ ] 1.3 Register the platform in `gateway/runner.py` (or wherever WABA was registered) — same one-line addition pattern.
- [ ] 1.4 Add a smoke unit test `gateway/platforms/test_web_via_http_sse.py` — auth fail (401), CORS-disallowed origin (403), valid request → handler called with proper `MessageEvent`.
- [ ] 1.5 Update `Dockerfile.eligia-overlay` to COPY the new file (one extra line; same as WABA).
- [ ] 1.6 Build the overlay locally: `cd /opt/hermes/wamba_build && docker build -f Dockerfile.eligia-overlay -t eligia/hermes-agent:wamba .` — **smoke** with `curl` against the new endpoint mocking the message handler.
- [ ] 1.7 Stage 1 commit message: `proposal(m2-mcp-agent-chat-widget): Stage 1 — Hermes upstream platform web_via_http_sse (Wave 1.13 [3b])`.

## Stage 2 — apps/api SSE relay BC

**Output:** `apps/api/src/agent-chat/` BC with controller + service + DTO + tests. No INT specs yet.

- [ ] 2.1 Module `apps/api/src/agent-chat/agent-chat.module.ts` — imports `SharedModule`, `ConfigModule`. Providers: `AgentChatService`. Controllers: `AgentChatController`.
- [ ] 2.2 DTO `apps/api/src/agent-chat/agent-chat.dto.ts` — `ChatMessageDto`, `ChatRequestDto`, `ChatSseEventDto` (typed events for testing).
- [ ] 2.3 Service `apps/api/src/agent-chat/agent-chat.service.ts`:
  - [ ] Read `NEXANDRO_AGENT_ENABLED` via `ConfigService`. Throw `NotFoundException` when false.
  - [ ] `resolveBankId(organization)` → `nexandro-{slug}` with collision handling per design.md.
  - [ ] `streamFromHermes(req)` returns an `Observable<ChatSseEventDto>` reading the Hermes SSE response and re-emitting events 1:1 plus a synthesised `error` on transport failure.
  - [ ] `cacheableTextForIdempotency(events)` accumulator that the controller will use after the stream completes — body cached for replay = `{kind: 'sse-replay', text, finishReason}`.
- [ ] 2.4 Controller `apps/api/src/agent-chat/agent-chat.controller.ts`:
  - [ ] `POST /agent-chat/stream`, `@Roles('OWNER', 'MANAGER', 'STAFF')`, `@AuditAggregate('chat_session', (req) => req.body?.sessionId ?? null)`.
  - [ ] Returns `Observable<MessageEvent>` (Nest's SSE primitive) wrapping the service stream.
  - [ ] Sets `req.agentContext = { viaAgent: true, agentName: 'hermes-web', capabilityName: 'chat.message' }` BEFORE the BeforeAfterAuditInterceptor reads it.
- [ ] 2.5 Wire the new module in `apps/api/src/app.module.ts`.
- [ ] 2.6 Tests:
  - [ ] `agent-chat.service.spec.ts` — bank id resolution (slug + collision), flag check, stream relay (mock Hermes EventSource), idempotency body shape.
  - [ ] `agent-chat.controller.spec.ts` — flag-disabled 404, role gating, agent-context injection, audit-decorator metadata.
- [ ] 2.7 Stage 2 commit: `proposal(m2-mcp-agent-chat-widget): Stage 2 — apps/api SSE relay BC (Wave 1.13 [3b])`.

## Stage 3 — packages/ui-kit `AgentChatWidget`

**Output:** five-file component + 7 Storybook stories + Vitest tests including the flag-disabled smoke.

- [ ] 3.1 `packages/ui-kit/src/AgentChatWidget/AgentChatWidget.types.ts` — props, message types, SSE event types matching the wire format.
- [ ] 3.2 `packages/ui-kit/src/AgentChatWidget/AgentChatWidget.tsx`:
  - [ ] Reads `agentEnabled` from `useRuntimeConfig()` (a hook backed by React context). When false → returns `null`.
  - [ ] State machine per design.md (`closed` → `open` → `streaming` ↔ `tool-calling` → `done`).
  - [ ] FAB anchored bottom-right; sidesheet slides from right.
  - [ ] Token-by-token rendering on `event: token`. Tool-call inline mute note on `event: tool-calling`.
  - [ ] Image input: drag-drop on input bar + `[+]` icon button + paste-from-clipboard. Renders inline `<img>` preview in user bubble before send.
  - [ ] `Esc` closes; focus returns to FAB.
  - [ ] Tokens used (per components.md): `--surface`, `--surface-2`, `--bg`, `--border`, `--accent`, `--ink`, `--mute`. No celebration animations.
  - [ ] `aria-label`, `aria-live="polite"` on the message log, focus-visible ring on the input.
- [ ] 3.3 `packages/ui-kit/src/AgentChatWidget/AgentChatWidget.stories.tsx` — 7 stories per components.md: Closed, OpenEmpty, OpenMidConversation, Streaming, ToolCalling, LongConversation, FlagDisabled.
- [ ] 3.4 `packages/ui-kit/src/AgentChatWidget/AgentChatWidget.test.tsx`:
  - [ ] Flag=false → component returns null + Storybook smoke.
  - [ ] Flag=true → FAB renders.
  - [ ] Click FAB → sidesheet opens; input receives focus.
  - [ ] `Esc` → sidesheet closes; FAB regains focus.
  - [ ] Drag-drop image → user bubble preview shows.
  - [ ] Streaming events append to bubble incrementally.
  - [ ] Tool-calling event renders mute note then back-to-streaming.
- [ ] 3.5 Update `packages/ui-kit/src/index.ts` barrel + `docs/ux/components.md` if any state diverges from the spec.
- [ ] 3.6 Stage 3 commit: `proposal(m2-mcp-agent-chat-widget): Stage 3 — packages/ui-kit AgentChatWidget (Wave 1.13 [3b])`.

## Stage 4 — apps/web wiring + INT specs + env flags + ops runbook

**Output:** widget mounted in apps/web, 2 INT specs in apps/api, env flags documented, ops runbook.

- [ ] 4.1 `apps/web/src/hooks/useAgentChat.ts` — TanStack Query mutation that opens an SSE connection to `/agent-chat/stream`, exposes `{messages, status, send(message), close()}`. Cleans up on unmount.
- [ ] 4.2 `apps/web/src/RuntimeConfigProvider.tsx` — reads `import.meta.env.VITE_NEXANDRO_AGENT_ENABLED` at boot, exposes `agentEnabled` to the context. Wrap `<App />`.
- [ ] 4.3 Mount `<AgentChatWidget organizationId userId />` in the apps/web layout (sibling of the main `<Outlet />`).
- [ ] 4.4 INT spec `apps/api/src/agent-chat/agent-chat.flag-enabled.int.spec.ts`:
  - [ ] `NEXANDRO_AGENT_ENABLED=true`, mock Hermes endpoint with a static SSE script.
  - [ ] POST `/agent-chat/stream` with valid auth + body → assert 200 + SSE event sequence + one `audit_log` row with `event_type=AGENT_ACTION_EXECUTED`, `agent_name='hermes-web'`, `aggregate_type='chat_session'`, `payload_after.messageDigest` set.
  - [ ] Idempotency-Key replay: same key + body → second response matches first; same key + different body → 409 IDEMPOTENCY_KEY_REQUEST_MISMATCH.
- [ ] 4.5 INT spec `apps/api/src/agent-chat/agent-chat.flag-disabled.int.spec.ts`:
  - [ ] `NEXANDRO_AGENT_ENABLED=false` → POST `/agent-chat/stream` returns 404, zero `audit_log` rows for the session.
- [ ] 4.6 `apps/api/.env.example` — append:
  - `NEXANDRO_AGENT_ENABLED=false` (already present from Wave 1.5 — verify wording).
  - `NEXANDRO_HERMES_BASE_URL=http://hermes:8644`
  - `NEXANDRO_HERMES_AUTH_SECRET=` (empty; document it must be 64-hex sha256-grade).
- [ ] 4.7 `tools/hermes-overlay/.env.example` (new) — document the Hermes-side flags: `WEB_VIA_HTTP_SSE_HOST`, `_PORT`, `_PATH`, `_AUTH_SECRET`, `_ALLOWED_ORIGINS`, `_DEFAULT_BANK_ID`.
- [ ] 4.8 `apps/web/.env.example` — `VITE_NEXANDRO_AGENT_ENABLED=false` (compile-time flag for Vite).
- [ ] 4.9 `docs/operations/m2-mcp-agent-chat-widget-runbook.md`:
  - [ ] Pre-flight: secret generation (`openssl rand -hex 32`), shared between apps/api and Hermes.
  - [ ] Hermes overlay rebuild steps.
  - [ ] Smoke test: `curl -N -H "X-Web-Auth-Secret: …"  http://hermes:8644/web/test-session` with a sample body.
  - [ ] Apps/api flip: set `NEXANDRO_AGENT_ENABLED=true` + restart container.
  - [ ] Apps/web flip: set `VITE_NEXANDRO_AGENT_ENABLED=true` + rebuild.
  - [ ] Rollback: flip the apps/api flag; widget vanishes immediately.
  - [ ] Auth secret rotation: lockstep update of both env vars + restart both.
  - [ ] Bank id collision diagnosis (rare).
- [ ] 4.10 Stage 4 commit: `proposal(m2-mcp-agent-chat-widget): Stage 4 — apps/web wiring + INT specs + env flags + ops runbook (Wave 1.13 [3b])`.

## Final close

- [ ] PR ready-for-review.
- [ ] CI all green (Build, Test, Integration, Lint, Secrets, Storybook).
- [ ] Admin-merge squash + delete branch.
- [ ] Archive `openspec/changes/m2-mcp-agent-chat-widget/` → `openspec/specs/`.
- [ ] Retro `retros/m2-mcp-agent-chat-widget.md`.
- [ ] Memory `project_m1_state.md` updated to Wave 1.13 [3b] closed; pending 3c.
