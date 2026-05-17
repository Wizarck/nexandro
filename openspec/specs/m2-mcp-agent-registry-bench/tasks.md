# Tasks: m2-mcp-agent-registry-bench

> Wave 1.13 [3c]. 5 stages, single PR. Each stage is a single commit, all green locally before pushing.

## Stage 1 — `agent_credentials` BC

- [ ] Migration `0021_agent_credentials` (table + indexes + uniqueness constraint)
- [ ] `AgentCredential` entity (`apps/api/src/agent-credentials/domain/agent-credential.entity.ts`)
- [ ] `AgentCredentialsRepository` (TypeORM repository)
- [ ] `AgentCredentialsService` — `create`, `list`, `findByOrgAndName`, `revoke`, `delete`
- [ ] `AgentCredentialsController` — POST (create) / GET (list) / GET /:id / PUT /:id (revoke) / DELETE /:id
- [ ] DTO + zod schemas (request validation)
- [ ] `@Roles('OWNER')` on all endpoints
- [ ] `@AuditAggregate('agent_credential', req => req.params.id)` on writes (interceptor from 3a writes the audit row automatically)
- [ ] 8 unit tests: service (create/list/revoke/duplicate-rejected/per-org-isolation/findByOrgAndName-revoked), controller (RBAC, DTO validation)
- [ ] 1 INT spec (`agent-credentials.int.spec.ts`): full CRUD round-trip + audit row emission

## Stage 2 — Ed25519 signing pipeline

- [ ] `AgentSignatureMiddleware` (`apps/api/src/shared/middleware/agent-signature.middleware.ts`)
- [ ] Header parsing: `X-Agent-Id`, `X-Agent-Signature`, `X-Agent-Timestamp`, `X-Agent-Nonce`
- [ ] Verification: `crypto.verify('ed25519', envelope, publicKey, signature)` — envelope = `method+'\n'+path+'\n'+ts+'\n'+nonce+'\n'+body`
- [ ] 5-min timestamp skew window
- [ ] In-memory nonce LRU (10k entries; reject duplicates within the skew window)
- [ ] Flag parsing: `NEXANDRO_AGENT_SIGNATURE_REQUIRED` (true / false / comma-list of org ids)
- [ ] Stamp `req.agentContext` from the verified credential (NOT from `X-Agent-Name`); legacy unsigned path keeps the 3a behaviour when flag is off
- [ ] Module wiring: `SharedModule` applies the middleware via `consumer.apply()` to all `*` routes
- [ ] 8 unit tests: valid sig accepts, invalid 401, expired 401, replayed nonce 401, missing + flag-off ignores, missing + flag-on rejects, revoked credential 401, body-tampering 401
- [ ] 1 INT spec (`agent-signature.int.spec.ts`): signed request end-to-end through the full pipeline (RBAC + capability gate + handler) + audit row carries the verified `agent_name`
- [ ] Update `apps/api/.env.example` with the new flag + a `# IMPORTANT` block on rollout

## Stage 3 — SSE idempotency replay

- [ ] Extend `IdempotencyMiddleware` to detect `text/event-stream` Content-Type
- [ ] Streaming-cache mode: intercept `res.write` + `res.end`; parse each `data:` JSON line; build the cache envelope
- [ ] Cache shape: `{ kind: 'sse-replay', text, finishReason, images?: [...] }`
- [ ] Replay path: on cache hit + matching request hash, emit a synthetic SSE stream (`event: token` with full text, then `event: image` per image, then `event: done`)
- [ ] Mismatch path: HTTP 409 `code: IDEMPOTENCY_KEY_REQUEST_MISMATCH` (matches 3a)
- [ ] Extend `AgentChatService.cacheableTextForIdempotency()` to also collect `image` events into the optional `images` array (3b currently captures `{kind, text, finishReason}` only)
- [ ] 6 unit tests: streaming capture (token+image+done collected correctly), replay envelope shape, replay does not call Hermes, mismatch 409, JSON write path bit-for-bit identical (regression guard for 3a), TTL expiry
- [ ] 1 INT spec (`agent-chat-replay.int.spec.ts`): first chat turn calls fakeHermes once + writes idempotency row + writes audit row; second turn with same `Idempotency-Key` returns synthetic SSE body + fakeHermes call count stays at 1
- [ ] Update `openspec/specs/m2-mcp-agent-chat-widget/specs/m2-mcp-agent-chat-widget/spec.md` to mark the deferred scenarios as resolved (carryover from 3b)

## Stage 4 — MCP-client bench harness

- [ ] `tools/mcp-bench/` package — `package.json`, `tsconfig.json`, `pnpm-workspace.yaml` entry
- [ ] `run.ts` CLI: `pnpm exec tsx run.ts --client=<name> --capabilities=<list> --duration=<duration>`
- [ ] Transport adapter interface: `connect()`, `invoke(capability, args)`, `disconnect()`
- [ ] `transports/hermes.ts` — HTTP+SSE adapter for the `web_via_http_sse` platform
- [ ] `transports/claude-desktop.ts` — stdio JSON-RPC over child process
- [ ] `transports/opencode.ts` — stdio JSON-RPC over child process
- [ ] Capability matrix: `recipes.read`, `recipes.list`, `ingredients.search`, `menu-items.read`
- [ ] Stats collector: per-capability p50, p95, error rate, throughput; configurable warmup
- [ ] Report writer: `report.ts` emits markdown to `docs/bench/<YYYY-MM-DD>-<client>.md`
- [ ] Smoke test per adapter: spawn → handshake → 1 capability → close cleanly
- [ ] 2 sample reports committed (Hermes baseline + 1 other client) so future runs have a comparison anchor
- [ ] README in `tools/mcp-bench/` with invocation examples + adapter contract

## Stage 5 — runbook + ops surface

- [ ] `docs/operations/m2-mcp-agent-registry-bench-runbook.md`:
  - Day-1 install (no enforcement)
  - Public key generation (Node 1-liner: `node -e "const {generateKeyPairSync} = require('crypto'); const {publicKey, privateKey} = generateKeyPairSync('ed25519'); console.log(publicKey.export({type:'spki', format:'pem'})); fs.writeFileSync('agent.key', privateKey.export({type:'pkcs8', format:'pem'}));"`)
  - Registration via curl (`POST /agent-credentials`)
  - Day-N rollout (flip flag per-org)
  - Rollback procedure
  - Bench invocation
  - Troubleshooting (signature errors, replay window mismatches, bench transport failures)
- [ ] Update `docs/operations/m2-mcp-write-capabilities-runbook.md` (3a) with a forward-pointer to the signing flag
- [ ] Update `docs/operations/m2-mcp-agent-chat-widget-runbook.md` (3b) with a forward-pointer to the signing flag + the SSE replay status
- [ ] Update `apps/api/.env.example` with all new flags grouped under a Wave 1.13 [3c] header

## Sweep

- [ ] `npx turbo build` — green across all workspaces
- [ ] `npx turbo lint` — green
- [ ] `npm run test --workspace=apps/api -- --runInBand` — verde (target ≥756 + new tests)
- [ ] `npm run test --workspace=packages/ui-kit -- --run` — verde (target 166 — no UI changes this slice)
- [ ] All INT specs run-deferred-pending-docker per slice policy (CI runs them; they live in `*.int.spec.ts`)
- [ ] One smoke run of each bench adapter before push (manual; output committed under `docs/bench/`)
