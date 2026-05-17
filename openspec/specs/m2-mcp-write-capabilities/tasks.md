## 1. Pre-flight audit — `{data, missingFields, nextRequired}` contract per write endpoint

For each of the 43 write endpoints, mark status as ✅ has it / ⚠️ missing / ❓ partial. The audit drives §3 work.

- [ ] 1.1 `recipes.*`: POST /recipes, PUT /recipes/:id, PUT /recipes/:id/lines/:lineId/source, DELETE /recipes/:id, PUT /recipes/:id/allergens-override, PUT /recipes/:id/diet-flags-override, PUT /recipes/:id/cross-contamination.
- [ ] 1.2 `menu-items.*`: POST /menu-items, PUT /menu-items/:id, DELETE /menu-items/:id.
- [ ] 1.3 `ingredients.*`: POST /ingredients, PATCH /ingredients/:id, DELETE /ingredients/:id, POST /ingredients/:id/reactivate, POST /ingredients/:id/overrides, POST /ingredients/import.
- [ ] 1.4 `categories.*`: POST /categories, PATCH /categories/:id, DELETE /categories/:id.
- [ ] 1.5 `suppliers.*`: POST /suppliers, PATCH /suppliers/:id, DELETE /suppliers/:id.
- [ ] 1.6 `supplier-items.*`: POST /supplier-items, PATCH /supplier-items/:id, DELETE /supplier-items/:id, POST /supplier-items/:id/promote-preferred.
- [ ] 1.7 `labels.*`: POST /recipes/:id/print, PUT /organizations/:id/label-fields.
- [ ] 1.8 `ai-suggestions.*`: POST /ai-suggestions/yield, POST /ai-suggestions/waste, POST /ai-suggestions/:id/accept, POST /ai-suggestions/:id/reject.
- [ ] 1.9 `external-catalog.*`: POST /external-catalog/sync.
- [ ] 1.10 `iam.users.*`: POST /users, PATCH /users/:id, POST /users/:id/change-password, POST /users/:id/locations, DELETE /users/:id/locations/:locationId.
- [ ] 1.11 `iam.locations.*`: POST /locations, PATCH /locations/:id, DELETE /locations/:id.
- [ ] 1.12 `iam.organizations.*`: POST /organizations, PATCH /organizations/:id.
- [ ] 1.13 Audit grid committed as `apps/api/docs/write-response-contract-audit.md`. Each row: endpoint + status + LOC delta if work needed.

## 2. Shared DTO + write-response envelope

- [ ] 2.1 Create `apps/api/src/shared/dto/write-response.dto.ts`:
  - `WriteResponseDto<T>` interface = `{ data: T; missingFields: string[]; nextRequired: string | null }`.
  - Helper `toWriteResponse<T>(data: T, opts?: { missingFields?, nextRequired? }): WriteResponseDto<T>` — sensible defaults (empty array, null).
- [ ] 2.2 For each ⚠️ / ❓ row in §1's audit grid: refactor the controller method to return `WriteResponseDto<EntityDto>`. Service layer adds `computeMissingFields(entity): string[]` where domain knowledge lives. Existing OpenAPI types updated.

## 3. Migration 0020 — `agent_idempotency_keys`

- [ ] 3.1 `apps/api/src/migrations/0020_agent_idempotency_keys.ts`:
  - `up()`:
    - CREATE TABLE per design.md ADR-MCP-W-IDEMPOTENCY.
    - CREATE INDEX `ix_agent_idempotency_keys_created_at` for TTL cleanup.
  - `down()`: DROP TABLE.
- [ ] 3.2 Domain entity `apps/api/src/shared/domain/agent-idempotency-key.entity.ts`.
- [ ] 3.3 Repository + service `AgentIdempotencyService` with `lookup(orgId, key, requestHash)` and `record(orgId, key, requestHash, status, body)`.

## 4. Idempotency middleware

- [ ] 4.1 `apps/api/src/shared/middleware/idempotency.middleware.ts`:
  - Guards: only activates when `Idempotency-Key` header present AND request method is POST/PUT/PATCH/DELETE.
  - Computes `request_hash = sha256(method + path + sortedCanonicalJson(body))`.
  - Lookup → replay (200, cached body) OR mismatch (409 `IDEMPOTENCY_KEY_REQUEST_MISMATCH`) OR pass-through.
  - Pass-through case: hooks into NestJS response lifecycle to record after success (status 2xx). On failure (4xx/5xx) does NOT cache.
- [ ] 4.2 Wire as global middleware in `apps/api/src/app.module.ts` for all paths matching write endpoints.
- [ ] 4.3 Unit tests:
  - Hit (replay) → returns cached.
  - Miss (different hash, same key) → 409.
  - Miss (no row) + 2xx → caches.
  - Miss + 4xx → does NOT cache.
  - Header absent → no-op.
  - Concurrent requests with same key → ON CONFLICT DO NOTHING dedupes; one succeeds, the other replays.

## 5. BeforeAfterAuditInterceptor

- [ ] 5.1 `apps/api/src/shared/interceptors/before-after-audit.interceptor.ts`:
  - Skip when `req.agentContext?.viaAgent !== true`.
  - Resolve "before" via per-namespace resolver from a registry (`recipes/<id>` → `recipesService.findById`, etc.). Resolver registry seeded by handler decorator `@AuditAggregate('recipes', (req) => req.params.id)`.
  - On response success, unwrap `WriteResponseDto.data` for the "after" payload.
  - Emit `AGENT_ACTION_EXECUTED` with full `{ before, after, capability, executedBy, agentName, viaAgent, organizationId, aggregateType, aggregateId }` envelope.
- [ ] 5.2 `@AuditAggregate(aggregateType, idExtractor)` decorator that registers the resolver on the controller method.
- [ ] 5.3 Apply `@AuditAggregate` to all 43 write methods (one-line decoration each).
- [ ] 5.4 Wire as `APP_INTERCEPTOR` provider in `app.module.ts`.
- [ ] 5.5 Unit tests:
  - viaAgent === false → no-op.
  - viaAgent === true, resolver present → before captured.
  - Create operation (no resolver) → before is null; after is the new entity.
  - Delete operation → before captured; after is null.
  - Event payload shape verified.

## 6. Per-capability feature flags + AgentCapabilityGuard

- [ ] 6.1 `apps/api/.env.example` — add ~43 entries grouped by namespace under a `# m2-mcp-write-capabilities — per-capability kill-switches` block.
- [ ] 6.2 `apps/api/src/shared/guards/agent-capability.guard.ts`:
  - Read `req.agentContext.capabilityName` (set from `X-Agent-Capability` header by middleware, Wave 1.5).
  - Look up the env var `NEXANDRO_AGENT_<NORMALISE>_ENABLED` (snake-case, uppercase, namespace dot → underscore).
  - If `false` AND `viaAgent === true` → throw `ServiceUnavailableException` with `code: AGENT_CAPABILITY_DISABLED`.
  - If `true` OR `viaAgent === false` → pass through.
- [ ] 6.3 Wire globally; ordering: JwtAuthGuard → RolesGuard → AgentCapabilityGuard.
- [ ] 6.4 Boot-time log: list of enabled agent capabilities (helps ops verify config).
- [ ] 6.5 Unit tests: 503 on disabled, pass on enabled, no-op for non-agent traffic.

## 7. MCP server — capability registry

- [ ] 7.1 `packages/mcp-server-nexandro/src/capabilities/write/types.ts` — `WriteCapability` interface per design.md ADR-MCP-W-REGISTRY.
- [ ] 7.2 12 namespace files in `capabilities/write/` (one per `recipes`, `menu-items`, `ingredients`, `categories`, `suppliers`, `supplier-items`, `labels`, `ai-suggestions`, `external-catalog`, `iam-users`, `iam-locations`, `iam-organizations`). Each exports an array of `WriteCapability` matching the audit-table endpoints.
- [ ] 7.3 `capabilities/write/index.ts` barrel exporting `WRITE_CAPABILITIES = [...all]`.
- [ ] 7.4 `capabilities/write/render-path.ts` — pure helper that substitutes `:param` tokens in `restPathTemplate` from a params object.
- [ ] 7.5 `src/server.ts` — extend `buildServer()` to loop the registry + register each tool with the MCP SDK; handler invokes `httpClient.request(method, path, body, ctx)`.
- [ ] 7.6 `src/http-client.ts` — extend to forward `Idempotency-Key` from MCP `ctx.requestContext` if the agent provided one (MCP SDK extension or capability-supplied).

## 8. Tests

- [ ] 8.1 Unit: registry shape — assert WRITE_CAPABILITIES has 43 entries with unique names matching `<namespace>.<op>` regex.
- [ ] 8.2 Unit: each capability's zod schema rejects malformed input + accepts well-formed.
- [ ] 8.3 Unit: `render-path.ts` substitutes correctly + throws on missing param.
- [ ] 8.4 Unit: each registered tool — invoke via the MCP SDK testing harness with a mocked `httpClient`; assert correct `(method, path, body)` is forwarded.
- [ ] 8.5 INT (Postgres-backed): three representative writes — `recipes.create` + `ingredients.applyOverride` + `menu-items.update`. Each verifies:
  - REST endpoint returns `{data, missingFields, nextRequired}`.
  - `audit_log` row carries `payloadBefore` + `payloadAfter` + `capability` + `actorKind: 'agent'`.
  - Idempotency-Key replay returns cached response without re-executing.
  - Per-capability flag = false → 503 with `AGENT_CAPABILITY_DISABLED`.
- [ ] 8.6 Lint regression test: `apps/api` does NOT import from `packages/mcp-server-nexandro` (existing rule from Wave 1.5; verify it still fires).

## 9. Operations + docs

- [ ] 9.1 `docs/operations/m2-mcp-write-capabilities-runbook.md`:
  - 43 env flags grouped by namespace.
  - Cron setup for `agent_idempotency_keys` TTL cleanup (hourly DELETE).
  - Trusted-network warning (signing in 3c).
  - How to react to `AGENT_CAPABILITY_DISABLED` 503 alerts.
- [ ] 9.2 `packages/mcp-server-nexandro/README.md` updated with the 43 write capabilities list + signing-deferred warning.

## 10. Verification

- [ ] 10.1 `openspec validate m2-mcp-write-capabilities` (best-effort; CLI not local).
- [ ] 10.2 `npx jest --runInBand` (apps/api + mcp-server) — full suite green; ≥40 net new tests.
- [ ] 10.3 Lint clean across workspaces.
- [ ] 10.4 Build green.

## 11. CI + landing

- [ ] 11.1 Implementation pushed; CI green.
- [ ] 11.2 Admin-merge once required checks pass.
- [ ] 11.3 Archive `openspec/changes/m2-mcp-write-capabilities/` → `openspec/specs/m2-mcp-write-capabilities/`.
- [ ] 11.4 Write `retros/m2-mcp-write-capabilities.md`.
- [ ] 11.5 Update auto-memory `project_m1_state.md` — Wave 1.13 closed.
- [ ] 11.6 File follow-ups (only those still warranted post-merge):
  - `m2-mcp-write-hitl` — human-in-the-loop approval workflow.
  - `m2-mcp-write-dry-run` — agent dry-run mode.
  - `m2-mcp-write-etag` — ETag / If-Match optimistic concurrency.
  - `m2-mcp-write-async-audit` — move before/after capture to a queue if interceptor latency matters.
  - `m2-mcp-write-contract-completion` — cleanup any §1 controllers deferred from this slice.
- [ ] 11.7 Move to **3b — `m2-mcp-agent-chat-widget`** (UI + dual-mode CI matrix).
