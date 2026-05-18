# retros/m2-mcp-agent-chat-widget.md

> **Slice**: `m2-mcp-agent-chat-widget` · **PR**: [#105](https://github.com/Wizarck/nexandro/pull/105) · **Merged**: 2026-05-07 · **Squash SHA**: `17d7b28`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.13 [3b] — second slice of the m2-mcp-extras split**. Adds the first first-party UI surface for talking to an agent inside nexandro: a NestJS SSE relay (`POST /agent-chat/stream`), a presentational `AgentChatWidget` in `packages/ui-kit`, and a layout-level mount in `apps/web`. Builds on a NEW upstream Hermes platform (`web_via_http_sse`) shipped via [NousResearch/hermes-agent#20911](https://github.com/NousResearch/hermes-agent/pull/20911).

## What we shipped

**Hermes upstream platform (`web_via_http_sse`):**
- Forked `Wizarck/hermes-agent feat/web-via-http-sse-platform`, opened upstream PR #20911 (NousResearch/hermes-agent). Generic platform (no nexandro-specific anything) so other vendors can use it.
- Cross-repo rebase: WABA PR #11873 (`eligia-vps`) updated onto upstream/main with a clean single commit; the `eligia/hermes-agent:wamba` overlay rebuilt on the VPS.
- SOPS secret `WEB_VIA_HTTP_SSE_AUTH_SECRET` provisioned in `eligia-core/secrets/secrets.env` plus mirror keys (`NEXANDRO_HERMES_BASE_URL`, `NEXANDRO_HERMES_AUTH_SECRET`) for apps/api.
- VPS smoke verde end-to-end: GET `/health` → 200, POST without secret → 401, POST with secret → 200 SSE.

**apps/api `agent-chat` BC (~330 LOC + 26 unit tests + 1 INT spec with two suites):**
- `AgentChatService.stream()` returns `Observable<ChatSseEvent>`. Lazy-subscribed; opens fetch to Hermes when the @Sse() handler subscribes; emits SSE events 1:1 to the browser.
- `AgentChatEnabledGuard` enforces `NEXANDRO_AGENT_ENABLED` BEFORE `@Sse()` opens the stream — throwing from the handler returns 200 with an error frame, not a clean 404.
- `bank_id` derives `nexandro-{slugify(org.name)}` (≤32 chars, ASCII, diacritic-stripping); falls back to `nexandro-{shortHash(orgId)}` when slug is empty / org lookup fails. Forwarded to Hermes which uses it as the Hindsight bank id.
- Audit emission lives in the service's Observable terminal path (success / 5xx / transport error / unsubscribe), guarded by an `auditEmitted` flag so re-entrant termination paths can't double-emit. `aggregate_id = randomUUID()` per turn (the audit_log column is UUID-typed; chat sessionIds are free-form); the chat sessionId is preserved as `payload_after.sessionId`.
- DTO + types layer: `ChatRequestDto` with text/image/multipart message kinds; `ChatSseEvent` discriminated union mirroring the Hermes wire format.
- 4-var env flag contract: `NEXANDRO_AGENT_ENABLED` (master gate), `NEXANDRO_HERMES_BASE_URL`, `NEXANDRO_HERMES_AUTH_SECRET` (apps/api); `VITE_NEXANDRO_AGENT_ENABLED` (apps/web, Vite-baked).

**packages/ui-kit `AgentChatWidget` (~290 LOC + 7 stories + 10 Vitest tests):**
- Five-file layout matching the existing `YieldEditor`/`MarginPanel` pattern. Presentational; consumer owns the SSE connection via `onSend(req): AsyncIterable<ChatSseEvent>`.
- State machine: closed (FAB) ↔ open (sidesheet) → streaming → tool-calling (inline mute note) → streaming → done. Esc returns focus to FAB via the `justClosed` ref pattern (avoids stealing focus on initial mount).
- Multimodal: text + image (drag-drop, paste-from-clipboard, + icon picker). MIME-type validation (PNG/JPEG/WEBP) + 5 MB cap before base64 expansion. Voice input deferred to a future `m2-agent-chat-voice` per Gate D F7 picks.
- `agentEnabled=false` → component returns `null` (no FAB, no listener, no SSE). Storybook FlagDisabled story + Vitest test assert nothing renders.

**apps/web wiring:**
- `useAgentChat` hook (~120 LOC): SSE consumer with manual frame parser + `AbortController` cleanup. Plain fetch + ReadableStream — TanStack Query mutations don't model unidirectional streaming.
- `App.tsx` mounts the widget at the layout level behind `VITE_NEXANDRO_AGENT_ENABLED`. When unset / `false`, the widget renders nothing.

**Operator surface:**
- `apps/web/.env.example` + `apps/api/.env.example` extended with the 4-var contract and rotation notes.
- `docs/operations/m2-mcp-agent-chat-widget-runbook.md` (~220 lines): pre-flight, smoke, prod rollout, rollback, secret rotation, troubleshooting (including a "ModuleNotFoundError: agent.account_usage" recurrence pattern observed during the upstream sync).

**Tests (net delta):**
- apps/api unit: +23 (733 → 756). 13 service specs (flag, slug + diacritic + truncation + fallback for `bank_id`, ServiceUnavailable on missing config, Hermes call with mocked fetch, error mapping, deterministic session id, audit emit on success + on transport error), 4 controller specs (404 on missing user, user-identity forwarding, MessageEvent SSE wire format), 2 guard specs, 4 DTO/type tests.
- packages/ui-kit Vitest: +10 (156 → 166). Flag-disabled smoke, FAB→open + focus, Esc→close + FAB focus restoration, streaming append, tool-call inline note + reset, error event surfacing, drag-drop + MIME rejection, empty input no-op.
- INT: `agent-chat.int.spec.ts` — two suites against real Postgres + a local fakeHermes `http.Server`. Flag-enabled: SSE relay forwards bank_id + auth + body shape; SSE body relayed 1:1 (event lines + chunk frames); exactly one `AGENT_ACTION_EXECUTED` audit row written with the rich envelope; an "idempotency replay deferred to slice 3c" assertion that pins current behaviour (Hermes called twice on retry) so a future change deliberately breaks this test. Flag-disabled: 404 + zero audit rows.

## What surprised us

- **Five CI fixes after the initial green-local push.** The slice landed locally with everything green (turbo build + lint + 755/755 unit + 166/166 ui-kit) but CI surfaced one new failure mode per push:
  1. **Nest `@Sse()` default wire format folds the event type into the data payload.** The controller initially mapped `events$.pipe(map(e => ({ data: e })))`, so Nest emitted `data: {"event":"token","data":{...}}` with NO `event:` SSE line. Browser EventSource consumers couldn't dispatch by event name and the INT assertion `body.toContain('event: token')` failed. Fix: map to `{ data: event.data, type: event.event }` — Nest emits proper `event: <type>` + `data: <json>` frames. **Lesson**: when relaying Hermes's SSE wire format 1:1, the ChatSseEvent → MessageEvent mapping must split the discriminator into `type` (NOT `data.event`); otherwise the wire is a Nest-peculiar JSON envelope, not standard SSE.
  2. **Throwing `NotFoundException` from inside an `@Sse()` handler is too late.** The flag check inside the controller body returned 200 with an error frame (the SSE stream had already opened) instead of a clean 404. Fix: extracted `AgentChatEnabledGuard` — guards run BEFORE the route handler, so the exception filter returns 404 cleanly. **Lesson**: any feature flag protecting a streaming endpoint MUST be enforced via a guard, not in the handler body.
  3. **INT chunk assertion assumed concatenation.** Asserted `body.toContain('Hola Lourdes')` but the fakeHermes test double emits two separate `event: token` frames with chunks `"Hola "` and `"Lourdes"`. Switched to per-chunk substring assertions (`'"chunk":"Hola "'` + `'"chunk":"Lourdes"'`). **Lesson**: SSE assertions on token streams must be frame-aware, not text-aware.
  4. **`BeforeAfterAuditInterceptor` does NOT fit SSE handlers.** The 3a interceptor uses `mergeMap` over the handler's Observable. For an `@Sse()` handler that means one `emitForensicRow` per SSE event (token, tool-calling, done) — incorrect for chat (one row per turn is the right semantic). Worse, `req.agentContext` was being stamped inside the controller body, but the interceptor reads it during its before-handler phase — too late. Fix: bypass the shared interceptor entirely for chat. The service emits audit directly from the Observable's terminal path via `EventEmitter2.emitAsync`, guarded by an `auditEmitted` flag so re-entrant termination paths (success → done, error → unsubscribe, etc.) can't double-emit. **Lesson**: the shared `BeforeAfterAuditInterceptor` is a write-RPC primitive, not a streaming-handler primitive. Streaming endpoints emit their own audit rows from terminal callbacks. Codified in feedback memory.
  5. **`audit_log.aggregate_id` is UUID-typed; chat sessionIds are free-form strings.** Setting `aggregateId = sessionId` produced `invalid input syntax for type uuid: "sess-1"` in the AuditLogSubscriber's persist step. Unit tests passed because the EventEmitter2 mock didn't go to Postgres. Fix: generate `randomUUID()` per turn for `aggregateId`, store the chat sessionId in `payload_after.sessionId` for forensic linkage. **Lesson**: when reusing the rich audit envelope on a new aggregate type, verify the source-of-truth identifier shape against the schema constraint — UUID-typed columns will silently swallow string identifiers in unit tests but fail loudly in INT.

- **Disk full on the dev workstation blocked progress mid-slice.** Twelve worktree leftovers from prior slices accumulated to ~250 GB; `npm install` failed before Stage 2 could build. User-authorised cleanup of seven leftovers freed 3.8 GB; four remaining were locked by Windows file handles (Docker Desktop / running processes). The slice continued in the agent-chat-widget worktree. **Lesson**: sweep worktree leftovers between slices when Cadence A spawns many of them; consider a periodic cleanup script that lists worktrees with no in-flight branch.

- **Idempotency replay was over-promised in the proposal.** The Wave 1.13 [3a] `IdempotencyMiddleware` only caches JSON write responses; it does NOT wrap streaming SSE responses. The 3b proposal/spec/commit message claimed "the relay reuses Wave 1.13 idempotency"; the INT test caught the lie immediately. Honest fix: reframed the INT test to assert current behaviour (Hermes called twice on retry) so a future change that wires the cache deliberately breaks the test; updated `spec.md` scenarios "idempotency replay cached SSE response" + "idempotency mismatch returns 409" to mark them deferred to slice 3c (`m2-mcp-agent-registry-bench`); kept the `cacheableTextForIdempotency()` helper unit-tested and ready for 3c. **Lesson**: when a slice "reuses" infra from a previous slice, walk the wiring end-to-end before writing the proposal — not after CI proves the claim wrong.

## What's next

- **Slice 3c (`m2-mcp-agent-registry-bench`)**: agent identity signing (HMAC or async key pair), capability registry benchmark, SSE idempotency replay (wires `cacheableTextForIdempotency()` into the cache layer), M3 hand-off readiness.
- **Future slice (`m2-agent-chat-voice`)**: voice input on top of the existing AgentChatWidget. Deferred from Gate D F7 picks; needs a UX session before scoping.
- **Forensic event split (M3+ tech-debt, carried from 3a)**: separate `AGENT_ACTION_EXECUTED` (lean, request-anchored) from `AGENT_MUTATION_RECORDED` (rich, aggregate-anchored). Chat now emits the rich shape from a non-interceptor path — three call sites (lean middleware, 3a interceptor, 3b service) sharing one channel pushes the case for the split.
- **Per-user signing of chat turns**: today the Hermes shared secret is infrastructure-level. Anyone with the secret can post on behalf of any user attribution they supply. Slice 3c.

## Process notes

- **Cadence A worked again** for this slice: Stage 1 (Hermes upstream + WABA + VPS smoke) → Stage 2 (apps/api SSE relay + 22 unit) → Stage 3 (ui-kit widget + stories + 10 Vitest) → Stage 4 (apps/web wiring + INT specs + env flags + runbook). Three stage commits before push, then five fix commits responding to CI. Total: 8 commits before merge.
- **CI was the authoritative correctness loop again.** Three of the five fixes (Nest @Sse wire format, INT chunk-aware assertions, UUID schema constraint) were CI-only-visible — the local turbo build + jest --runInBand passed cleanly each time. The 3a retro called this out; this slice confirmed it.
- **The Hermes upstream PR + cross-repo WABA rebase added coordinated complexity.** Three repos with state to keep in sync (`hermes-agent` upstream PR, `eligia-vps` overlay PR, `nexandro` consumer slice) for one user-facing feature. Worth the architectural cleanliness — the platform is generic and other consumers can use it — but a one-team-three-repo effort takes proportionally more wall-clock time than a single-repo slice. Worth flagging on Gate D for slices that touch upstream forks.
- **Disk-full mid-slice was new.** Future Cadence-A waves should include a "disk free ≥ 5 GB" pre-flight check at the start of each stage; cheaper than discovering it via `npm install` failure.
