# retros/m2-mcp-write-capabilities.md

> **Slice**: `m2-mcp-write-capabilities` · **PR**: [#100](https://github.com/Wizarck/nexandro/pull/100) · **Merged**: 2026-05-06 · **Squash SHA**: `9020550`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.13 [3a] — first slice of the m2-mcp-extras split**. Promotes the MCP server from read-only (Wave 1.4) to a 43-capability write surface across 12 namespaces, with cross-cutting Idempotency-Key, per-capability kill-switches, and forensic before/after audit trail.

## What we shipped

**Cross-cutting infrastructure (`apps/api/src/shared/`):**
- `agent_idempotency_keys` table (composite PK `(organizationId, key)`, sha256 `request_hash`, jsonb `response_body`). Migration `0020_agent_idempotency_keys`.
- `AgentIdempotencyService` — `lookup(orgId, key, requestHash) → miss | replay | mismatch` and `record(...)` with `ON CONFLICT DO NOTHING`. Exported `computeRequestHash(method, path, body)` with canonicalised JSON.
- `IdempotencyMiddleware` — activates on POST/PUT/PATCH/DELETE + `Idempotency-Key` header + `req.user.organizationId`. Replays cached body on hit, 409 on body mismatch.
- `WriteResponseDto<T> = { data, missingFields, nextRequired }` envelope as the canonical wire shape for every write.
- `@AuditAggregate(aggregateType, idExtractor?)` decorator + `BeforeAfterAuditInterceptor` + `AuditResolverRegistry`. The interceptor resolves payload_before via the BC-registered resolver, runs the handler, captures payload_after from the unwrapped envelope, emits `AGENT_ACTION_EXECUTED` with the rich envelope.
- `AgentCapabilityGuard` — per-capability env flag (`NEXANDRO_AGENT_<NS>_<OP>_ENABLED`) checked via `process.env`. 503 with `code: AGENT_CAPABILITY_DISABLED` when the flag is missing/falsy.
- `SharedModule` `@Global()` — exports `AuditResolverRegistry`, `AgentIdempotencyService`, `TypeOrmModule.forFeature([AgentIdempotencyKey])`. BC modules import it directly so DI scoping is uniform across the AppModule and any TestingModule.

**REST layer (43 endpoints across 11 controllers):**
- All POST/PUT/PATCH/DELETE writes return `WriteResponseDto<T>` (200 + envelope; DELETE moved from 204 → 200 + `{id}`).
- All write handlers carry `@AuditAggregate(aggregateType, idExtractor?)`.
- Six BC modules implement `OnApplicationBootstrap` and register `findById`-shaped resolvers for: `recipe`, `menu_item`, `ingredient`, `category`, `supplier`, `supplier_item`, `ai_suggestion`, `user`, `location`, `organization`.
- Three UI hooks adapted to `response.data`: `useAiSuggestions`, `useDietFlags`, `useLabelPrint`. Three controller specs adapted accordingly.

**MCP capability registry (`packages/mcp-server-nexandro/src/capabilities/write/`):**
- `WriteCapability` interface (zod schema, REST method/path template, body extractor, query extractor, idempotency forwarding flag).
- `render-path.ts` — pure `:param` substitution with `encodeURIComponent` and throw-on-missing.
- 12 namespace files defining 43 capabilities total: recipes (7), menu-items (3), ingredients (6), categories (3), suppliers (3), supplier-items (4), labels (2), ai-suggestions (4), external-catalog (1), iam-users (5), iam-locations (3), iam-organizations (2). Plus an `UNSUPPORTED_VIA_MCP` set documenting routes intentionally not exposed.
- `buildServer()` loops `WRITE_CAPABILITIES` and calls `server.registerTool()`. `http-client.ts` extended with body, idempotencyKey, JSON serialisation for non-GET methods.

**Tests (net delta):**
- Unit: +88 (api 645 → 733). Eight units for `BeforeAfterAuditInterceptor`, eight for `AgentIdempotencyService`, six for `IdempotencyMiddleware`, six for `AgentCapabilityGuard`, plus assorted controller spec adaptations. mcp-server: 22 → 83.
- INT: `agent-write-capabilities.int.spec.ts` — 10 e2e tests against a real Postgres covering Idempotency-Key round-trip (replay/mismatch/no-key), BeforeAfterAuditInterceptor (PUT/DELETE/POST emission shape + viaAgent gating), AgentCapabilityGuard (flag=false 503, flag=true success, REST without agent headers unaffected by flag).

**Operator surface:**
- `apps/api/.env.example` — 87 lines appended: 43 per-capability env flags grouped by namespace, plus a "trusted-network" deployment warning.
- `docs/operations/m2-mcp-write-capabilities-runbook.md` — operator-facing checklist for enabling capabilities, rotating keys, and debugging idempotency mismatches.

## What surprised us

- **`AGENT_ACTION_EXECUTED` was a single channel with two payload shapes after this slice.** Wave 1.5 `AgentAuditMiddleware` emitted a lean `{ executedBy, agentName, capabilityName, organizationId, timestamp }` per agent request; the new `BeforeAfterAuditInterceptor` emits the canonical `AuditEventEnvelope` per agent **mutation** (with aggregateType ≠ 'organization', aggregateId, payload_before, payload_after). The legacy subscriber handler hardcoded `aggregate_type = 'organization'` and discarded the rich envelope. Discrimination by shape inside the handler (`isRichAuditEnvelope(event)`) is the minimal fix; both rows now coexist for a single agent write — one for "request happened" (orgId-anchored), one for "mutation happened" (aggregate-anchored). Future cleanup: split into two distinct event types so the discrimination is type-system-level, not runtime-shape-level.
- **`tap + emit` is racy across the event bus.** The interceptor first shipped with `tap((response) => events.emit(...))`. RxJS `tap` runs the side effect synchronously then forwards the value, so the HTTP response is sent BEFORE the `@OnEvent` async handler awaits the DB write. INT specs read `audit_log` immediately after the response and saw zero rows — pure read-after-write hazard. Fix: switch to `mergeMap + emitAsync + .then(() => response)` so the response holds until subscribers settle. Same pattern as Wave 1.11's INT-spec event-bus fix; this is the SECOND time we've hit this exact bug — codified the pattern in feedback memory.
- **`@Global()` is not enough when a TestingModule re-declares the global provider.** `SharedModule` is `@Global`. TestAppModule imported `RecipesModule` (which imports SharedModule transitively) AND re-declared `AuditResolverRegistry` in its own `providers`. Result: two distinct registry instances. `RecipesModule.OnApplicationBootstrap` registered the `recipe` resolver on instance A; the interceptor (provided via APP_INTERCEPTOR on TestAppModule) read from instance B → `resolver-found=false` → `payload_before: null` for every PUT/DELETE. Fix: TestAppModule must `imports: [SharedModule, RecipesModule, ...]` and remove the redundant provider declaration. **Lesson**: in NestJS, `@Global()` makes a module's exports visible everywhere in the import graph BUT does not deduplicate when a downstream module re-declares the same provider symbol — the local declaration wins for that subtree.
- **Idempotency cache MUST persist before the response leaves the wire.** v1 used `void this.idempotency.record(...).catch(...)` inside `res.json` — fire-and-forget. Local-against-VPS tests passed (5–15ms tunnel RTT gave the INSERT enough headroom); CI failed (Postgres on the runner = sub-millisecond RTT, the second POST with the same key landed before the INSERT settled, observed a miss, executed the side effect twice). Fix: await the record promise, then forward to `originalJson(body)`. Adds ~5ms latency but is the only correctness guarantee. **Lesson**: any cache-on-write hooked into `res.json` must be `persist-then-send`, never fire-and-forget. The latency cost is real but the correctness guarantee is non-negotiable.

## What's next

- **Slice 3b (`m2-mcp-agent-chat-widget`)**: AgentChatWidget UI behind `NEXANDRO_AGENT_ENABLED` flag, dual-mode CI matrix (with/without agent enabled), per-capability advice surface in the chat that respects `WriteResponseDto.missingFields` and `nextRequired`.
- **Slice 3c (`m2-mcp-agent-registry-bench`)**: agent identity signing (HMAC or async key pair), capability registry benchmark, M3 hand-off readiness.
- **Forensic event split (M3+ tech-debt)**: separate `AGENT_ACTION_EXECUTED` (lean, request-anchored) from a new `AGENT_MUTATION_RECORDED` (rich, aggregate-anchored) so the subscriber's runtime shape discrimination becomes type-system enforcement.
- **Deferred E2E** (per Gate D pick `F7=c`): no Playwright/Cypress agent flow yet. M3 to revisit once the chat widget lands.

## Process notes

- **Cadence A worked well** for this slice: 4 stages (cross-cutting infra → 43 endpoints + UI → MCP registry + 83 tests → INT specs + env flags + runbook), each pushed as a single commit, all green locally before the push. Total: 5 commits before merge (3 stage proposals + 2 fixes for INT regressions surfaced only in CI runs).
- **Local-against-VPS Postgres** unblocked CI iteration when Docker Desktop on the workstation wedged. The setup is documented in memory `reference_vps_postgres_test.md` — single-user, dev-local only, CI keeps its own per-runner compose.
- **CI revealed two issues local couldn't** (idempotency race + emit-vs-emitAsync mock drift in unit spec). Both are CI-only-visible classes of bugs; running INT against VPS is necessary but not sufficient — the per-runner-CI loop remains authoritative for race conditions and timing.
