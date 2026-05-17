## ADDED Requirements

### Requirement: Hermes exposes a generic `web_via_http_sse` platform

Hermes SHALL expose a new platform adapter `web_via_http_sse` (file `gateway/platforms/web_via_http_sse.py`) inheriting `BasePlatformAdapter` and following the same shape as `whatsapp_via_mcp_meta_business_api`. The platform SHALL accept `POST {WEB_VIA_HTTP_SSE_PATH}/{session_id}` with body `{message, bank_id, user_attribution, metadata?}` and respond with `text/event-stream` carrying events `token`, `tool-calling`, `proactive`, `done`, `error`. The platform SHALL NOT contain any nexandro-specific logic — `bank_id` is supplied by the consumer per request.

#### Scenario: valid request streams agent response

- **WHEN** a consumer POSTs `{message: {type: 'text', content: 'Hola'}, bank_id: 'nexandro-acme', user_attribution: {user_id: 'u1', display_name: 'Lourdes'}}` with the correct `X-Web-Auth-Secret` header
- **THEN** the response is HTTP 200 `text/event-stream` carrying `event: token` chunks for each token of the agent reply, ending with `event: done data: {finishReason: 'stop'}`

#### Scenario: missing or wrong auth secret

- **WHEN** a request omits or sends a wrong `X-Web-Auth-Secret`
- **THEN** the response is HTTP 401 with no streaming, no `MessageEvent` is dispatched

#### Scenario: origin not in CORS allowlist

- **WHEN** a request's `Origin` header is not in `WEB_VIA_HTTP_SSE_ALLOWED_ORIGINS`
- **THEN** the response is HTTP 403 (CORS preflight blocks it; direct POSTs are also rejected)

#### Scenario: bank_id is forwarded into Hindsight cascade

- **WHEN** a request carries `bank_id: 'nexandro-acme'`
- **THEN** the agent's Hindsight `recall` calls scope to that bank id; memory writes target that bank id

#### Scenario: tool-calling event surfaces invocation

- **WHEN** the agent invokes an MCP tool while replying
- **THEN** the SSE stream emits `event: tool-calling data: {tool: '<name>'}` before resuming `event: token`

#### Scenario: proactive event mid-stream

- **WHEN** the agent emits a proactive insertion (e.g., a system-injected note) while a stream is active
- **THEN** the stream carries `event: proactive data: {text: '...'}`

### Requirement: apps/api exposes `POST /agent-chat/stream` SSE relay

The system SHALL expose `POST /agent-chat/stream` in `apps/api`. The endpoint SHALL be feature-flagged on `NEXANDRO_AGENT_ENABLED`: when `false`, the endpoint returns HTTP 404 with no audit emission. When `true`, the endpoint SHALL relay the SSE stream from Hermes' `web_via_http_sse` platform, injecting `bank_id = nexandro-{tenant_slug}` derived from the authenticated user's organization. The endpoint SHALL audit one `AGENT_ACTION_EXECUTED` row per turn with `agentName='hermes-web'`, `aggregateType='chat_session'`.

#### Scenario: flag-disabled returns 404

- **WHEN** `NEXANDRO_AGENT_ENABLED=false` AND a client POSTs `/agent-chat/stream` with valid auth
- **THEN** the response is HTTP 404; no audit row is written; the endpoint reveals no detail about the flag's state

#### Scenario: flag-enabled streams Hermes response

- **WHEN** `NEXANDRO_AGENT_ENABLED=true` AND a client POSTs `/agent-chat/stream` with `{message: {type: 'text', content: '¿qué dish lleva tomate?'}}`
- **THEN** the response is HTTP 200 `text/event-stream` relaying Hermes' `event: token`/`tool-calling`/`done` events 1:1

#### Scenario: bank id derived from organization

- **WHEN** a user from organization "Acme Trattoria" POSTs to the endpoint
- **THEN** apps/api forwards `bank_id: 'nexandro-acme-trattoria'` to Hermes; the `bank_id` is NOT exposed in the response

#### Scenario: bank id collision appended with org id hash

- **WHEN** two organizations both slugify to `la-tradicional`
- **THEN** the second org's bank id resolves to `nexandro-la-tradicional-{shortHash}` deterministically

#### Scenario: audit row written per chat turn

- **WHEN** a user successfully completes one chat turn (one POST + one full SSE stream)
- **THEN** exactly one `audit_log` row exists with `event_type='AGENT_ACTION_EXECUTED'`, `agent_name='hermes-web'`, `aggregate_type='chat_session'`, `actor_kind='agent'`, `payload_after.messageDigest` set, `payload_before` null

#### Scenario: idempotency replay cached SSE response (resolved in slice 3c)

- **WHEN** a client retries `POST /agent-chat/stream` with the same `Idempotency-Key` and the same body within 24 hours
- **THEN** Hermes is NOT called; the response is HTTP 200 `text/event-stream` carrying one `event: token` frame with the full cached `text` + zero or more `event: image` frames + one `event: done` frame with `replayed: true`
- **STATUS** Wired in slice 3c (`m2-mcp-agent-registry-bench`) via the extended `IdempotencyMiddleware` that detects `text/event-stream` Content-Type and parses captured frames into the `{kind:'sse-replay', text, finishReason, images?}` envelope persisted to `agent_idempotency_keys.response_body`

#### Scenario: idempotency mismatch returns 409 (resolved in slice 3c)

- **WHEN** a client retries with the same `Idempotency-Key` and a DIFFERENT body
- **THEN** the response is HTTP 409 `code: IDEMPOTENCY_KEY_REQUEST_MISMATCH`; the new request is NOT executed
- **STATUS** Wired in slice 3c via the same middleware extension. Mismatch detection reuses the 3a hash-comparison path; the SSE branch only added a parallel capture/replay code path

#### Scenario: agent context injected server-side

- **WHEN** a client POSTs without an `X-Agent-Name` header
- **THEN** apps/api server-side sets `req.agentContext = {viaAgent: true, agentName: 'hermes-web', capabilityName: 'chat.message'}` BEFORE the BeforeAfterAuditInterceptor reads it (so the audit row carries the correct attribution)

### Requirement: AgentChatWidget renders only when the flag is enabled

The `AgentChatWidget` component SHALL render the FAB + sidesheet only when the runtime config flag `agentEnabled` is `true`. When `false`, the component SHALL return `null` — no FAB, no sidesheet, no event listener, no SSE connection. The component SHALL support text + image input (drag-drop, paste-from-clipboard, file picker).

#### Scenario: flag disabled component returns null

- **WHEN** `agentEnabled=false`
- **THEN** the component returns `null`; the DOM contains no chat-widget-related elements

#### Scenario: flag enabled FAB visible

- **WHEN** `agentEnabled=true`
- **THEN** the FAB is rendered bottom-right; clicking it opens the sidesheet

#### Scenario: image drag-drop attaches preview

- **WHEN** the user drags a JPG/PNG file over the input area
- **THEN** the file is captured; an inline `<img>` preview renders in the user-bubble-to-be; on Send the image is base64-encoded into the SSE request body

#### Scenario: streaming rendering token-by-token

- **WHEN** the SSE stream emits `event: token` with `{chunk: 'Tag'}` then `{chunk: 'liatelle'}`
- **THEN** the agent bubble renders `Tag` then `Tagliatelle` (text concatenated, not replaced)

#### Scenario: tool-calling renders inline mute note

- **WHEN** the SSE stream emits `event: tool-calling data: {tool: 'recipes.read'}`
- **THEN** an inline `--mute`-styled line appears in the agent bubble: e.g., `Looking up recipe…`. When subsequent `event: token` events arrive, rendering resumes in the bubble below the note

#### Scenario: Esc closes the sidesheet

- **WHEN** the sidesheet is open and the user presses `Esc`
- **THEN** the sidesheet closes; focus returns to the FAB

#### Scenario: multimodal scope is text + image only

- **WHEN** the user attempts to attach an audio file or invoke a microphone
- **THEN** there is no UI affordance for it; voice is deferred to `m2-agent-chat-voice`

### Requirement: dual-mode CI guarantees flag isolation

The slice SHALL include two INT specs in `apps/api/src/agent-chat/` that guard the flag's two states (true / false). The slice SHALL include a Storybook story `FlagDisabled` plus a Vitest assertion that the component renders `null` in that state. The CI MUST NOT introduce a global matrix multiplier — focused tests only.

#### Scenario: CI flag-disabled INT is part of every PR run

- **WHEN** the CI runs `npm run test:int` on a PR
- **THEN** `agent-chat.flag-disabled.int.spec.ts` is included in the run; failure blocks merge

#### Scenario: Storybook story for flag-disabled exists

- **WHEN** an operator runs Storybook
- **THEN** a `FlagDisabled` story exists for `AgentChatWidget`; it asserts that the component renders nothing

### Requirement: Hindsight bank id pattern is `nexandro-{tenant_slug}`

The slice SHALL reserve the bank id pattern `nexandro-{tenant_slug}` where `tenant_slug` is `slugify(organization.name)` (lowercase ASCII, dash-separated, ≤32 chars), with collisions resolved by appending a short hash of `organization.id`. There SHALL NOT be per-domain banks (`nexandro-chef`, `nexandro-recipes`, etc.) in this slice. Hermes initialises the bank lazily on first message; nexandro does NOT pre-provision.

#### Scenario: tenant_slug derives from organization name

- **WHEN** an organization is named "La Tradicional"
- **THEN** the bank id resolves to `nexandro-la-tradicional`

#### Scenario: collision handling

- **WHEN** two organizations both have name "La Tradicional"
- **THEN** the second org's bank id appends an 8-char hex hash of `organization.id`: `nexandro-la-tradicional-{shortHash}`; resolution is deterministic

#### Scenario: bank not pre-provisioned

- **WHEN** an organization is created
- **THEN** apps/api does NOT create the Hindsight bank; the bank is initialised by Hermes on the first chat turn

### Requirement: trusted-internal-network posture extended (signing deferred to 3c)

This slice SHALL inherit the trusted-internal-network deployment posture from `m2-mcp-server` (Wave 1.5) and `m2-mcp-write-capabilities` (3a). `X-Web-Auth-Secret` is a shared secret between apps/api and Hermes, NOT a per-user signed token. The `apps/api/.env.example` and the slice's runbook SHALL document the trust assumption explicitly.

#### Scenario: runbook documents the trust assumption

- **WHEN** an operator reads `docs/operations/m2-mcp-agent-chat-widget-runbook.md`
- **THEN** a "Trusted-Internal-Network Mode" section warns against exposing the Hermes endpoint to the public internet until `m2-mcp-agent-registry-bench` ships per-user signing
