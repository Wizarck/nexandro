## Context

Wave 1.5 (`m2-mcp-server`, PR #85) shipped MCP server `nexandro` with reads only. Wave 1.9 (`m2-audit-log`, PR #90) shipped the `AgentAuditMiddleware` that emits `AGENT_ACTION_EXECUTED` events when `X-Via-Agent + X-Agent-Name` headers arrive. This slice (3a of the m2-mcp-extras split) closes the writes gap.

The Master picked F1=a + SD6=a (truly exhaustive, all 43 write endpoints across 12 namespaces including IAM and external-catalog), explicitly choosing wide scope over minimum-viable. Per-capability feature flags (F6=a) provide the safety net; HITL approvals are filed for follow-up. The reasoning ("after we'll add HITL where needed") puts the burden on observability — production telemetry will inform which capabilities need approval gating, rather than guessing upfront.

## Goals / Non-Goals

**Goals:**
- 43 MCP write capabilities, mirroring REST 1:1, registered via a single registry pattern.
- Every write endpoint emits the `{data, missingFields, nextRequired}` contract from `m2-mcp-server` spec — audited + added where missing.
- Idempotency-Key support across all writes (Postgres-backed deduplication with 24h TTL).
- Forensic audit: every MCP-routed write emits an `AGENT_ACTION_EXECUTED` event with `{before, after, capability, executedBy, agentName}` payload.
- Per-capability feature flags (~43 env vars), API-side only, to allow surgical kill-switching without MCP server redeploy.
- Zero impact on direct REST/UI traffic — flags + interceptor only fire when `req.agentContext.viaAgent === true`.

**Non-Goals:**
- HITL approval workflow. Filed as `m2-mcp-write-hitl`.
- Dry-run mode. Filed as `m2-mcp-write-dry-run`.
- ETag / If-Match optimistic concurrency. Filed as `m2-mcp-write-etag`.
- Agent signing / shared-secret verification. 3c.
- AgentChatWidget UI. 3b.
- MCP-client end-to-end benchmark. 3c.

## Decisions

### ADR-MCP-W-SCOPE — exhaustive 1:1 mirror of REST writes (F1=a + SD6=a)

All 43 write endpoints are exposed as MCP capabilities, including IAM (users/locations/orgs) and external-catalog.sync.

Rationale (per Master's direct instruction):
- The Agent-Ready architectural pillar (ADR-013) commits the system to "the API is the contract; UI consumes it; agents consume the same contract". Carving out IAM/external-catalog would create UI-only paths, contradicting the pillar.
- HITL approvals + per-capability flags are the safety net. The flags default to `false`, so even if a write is exposed, an operator must explicitly enable it before any agent can invoke it.
- Production telemetry (Wave 1.5's `AGENT_ACTION_EXECUTED` event) will reveal which capabilities are actually exercised — and which need HITL gating — in real usage. Filing those as follow-ups is more reliable than guessing scope upfront.

Trade-off: the slice is bigger than minimum-viable (b) by ~37 capabilities. Mitigation: the capability-registry pattern (ADR-MCP-W-REGISTRY) keeps each capability to ~10 LOC + 1 test.

### ADR-MCP-W-MISSING-FIELDS-AUDIT — audit + add (F2=b)

The `m2-mcp-server` spec mandates `{data, missingFields, nextRequired}` on every write response. Phase 1 of this slice audits each of the 43 endpoints; phase 2 adds the contract where missing.

Phase 1 deliverable: tasks.md §1 lists each endpoint with status (✅ has it / ⚠️ missing / ❓ partial).

Phase 2 deliverable: extract a shared `WriteResponseDto<T>` interface in `apps/api/src/shared/dto/write-response.dto.ts`. Each controller method returns `WriteResponseDto<EntityT>`. The DTO is `{ data: T, missingFields: string[], nextRequired: string | null }`. Services compute `missingFields` based on which required fields are still null/empty post-write; the controller wraps the service result.

Rationale:
- The contract is canonical for the MCP/agent flow but ALSO valuable for the UI (form-completion hints). Adding it where missing benefits both surfaces.
- An alternative was to "let the MCP gateway post-process" the REST response (option c in F2). Rejected because (a) the gateway lacks domain knowledge to decide what fields are required, (b) it would duplicate logic between MCP and a future v2-API client.
- Spread across N controllers is acceptable — each addition is a small unit (~5-15 LOC). The audit table in tasks.md keeps the work trackable.

### ADR-MCP-W-RBAC — inherited from REST (F3=a)

`@Roles('OWNER', 'MANAGER')` etc. on REST controllers continue to apply. The MCP server forwards `X-User-Id` and the standard auth bearer; `req.user` is populated by the existing `JwtAuthGuard`; `req.agentContext` is populated by `AgentAuditMiddleware`. The Roles guard sees `req.user.roles` exactly as it does for UI traffic.

Rationale:
- A new `agent_can_write` flag (F3=b) was rejected — it's a layer on top of RBAC, not a replacement, and it dilutes the meaning of the existing roles.
- Per-capability feature flags (F6=a) are the per-feature kill-switch; RBAC governs WHO can use them.

### ADR-MCP-W-IDEMPOTENCY — Postgres table with TTL (F4=a + SD4=a)

```sql
CREATE TABLE agent_idempotency_keys (
  organization_id uuid    NOT NULL,
  key             text    NOT NULL,
  request_hash    text    NOT NULL,
  response_status int     NOT NULL,
  response_body   jsonb   NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);
CREATE INDEX ix_agent_idempotency_keys_created_at
  ON agent_idempotency_keys (created_at);
```

`IdempotencyMiddleware` flow:
1. Extract `Idempotency-Key` header. If absent, pass through.
2. Compute `request_hash = sha256(method + path + sorted-body-canonical-json)`.
3. SELECT existing `(organization_id, key)`:
   - If row exists AND `request_hash` matches → return cached `response_status + response_body` (replay).
   - If row exists AND `request_hash` differs → HTTP 409 `code: IDEMPOTENCY_KEY_REQUEST_MISMATCH` (caller is using the same key for a different operation; bug in the agent).
4. If no row exists → call `next()`. After the response is generated and BEFORE flush, INSERT the row. Use `ON CONFLICT (organization_id, key) DO NOTHING` to handle race conditions where two parallel requests with the same key arrive (the loser becomes a no-op, the request goes through; mirrors Stripe's behaviour).
5. TTL: cron `DELETE FROM agent_idempotency_keys WHERE created_at < now() - interval '24 hours'` runs hourly. Cron is documented in the operations runbook (manual setup; automating cron lifecycle is out of scope).

Rationale:
- Postgres over Redis (b): no new infrastructure dependency. Audit-log already lives in Postgres.
- Postgres over in-process Map (c): survives restart. A Map loses cached responses on every deploy, defeating the agent's retry semantics across deploy boundaries.
- 24h TTL is the Stripe convention. Adequate for agent retry windows; cleanup keeps storage bounded.

### ADR-MCP-W-FORENSIC-EVENT — interceptor with before/after capture (F5=c + SD5=b)

```ts
// apps/api/src/shared/interceptors/before-after-audit.interceptor.ts
@Injectable()
export class BeforeAfterAuditInterceptor implements NestInterceptor {
  async intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    if (!req.agentContext?.viaAgent) return next.handle();

    const resolver = resolveBeforeFor(ctx);          // e.g. () => recipesSvc.findById(req.params.id)
    const before = resolver ? await resolver(req) : null;

    return next.handle().pipe(
      tap((response) => {
        const after = extractAfter(response);        // unwrap WriteResponseDto.data
        this.events.emit(AuditEventType.AGENT_ACTION_EXECUTED, {
          organizationId: req.user.organizationId,
          aggregateType: getAggregateType(ctx),
          aggregateId: getAggregateId(ctx, response),
          actorUserId: req.user.id,
          actorKind: 'agent',
          agentName: req.agentContext.agentName,
          payloadBefore: before,
          payloadAfter: after,
          capability: req.agentContext.capabilityName,
        });
      }),
    );
  }
}
```

The interceptor is wired globally; the resolver registry maps controller-method to a `findById` invocation. Methods that don't have a "before" (e.g. `recipes.create`) skip the resolver — `before` is `null`.

Rationale:
- Centralised over per-service emission (a): emits the SAME event consistently from one place; eliminates drift across N services.
- Interceptor over subscriber-fetches-before (c): subscribers running async after the write would see the AFTER state via `findById`, not the BEFORE — they'd need to query `audit_log` for the previous event, which is fragile and circular.
- The existing Wave 1.5 `AgentAuditMiddleware` continues to emit `AGENT_ACTION_EXECUTED` for non-MCP REST traffic (no before/after) — a leaner envelope. The interceptor's emit is an enriched superset, only fired when `viaAgent === true`. The audit-log subscriber is shape-agnostic (Wave 1.9 hybrid pattern) — both shapes persist.

Round-trip cost: one extra `findById` per write. ~5-15ms latency, acceptable for chef-mediated workflows.

### ADR-MCP-W-FLAGS — per-capability flags, apps/api-only (F6=a + SD1=a)

~43 env vars in `apps/api/.env.example`:

```
# m2-mcp-write-capabilities — per-capability kill-switches.
# When false, the API returns 503 with code=AGENT_CAPABILITY_DISABLED for
# MCP-routed writes (req.agentContext.viaAgent === true). Direct REST/UI
# traffic is NEVER affected by these flags. The MCP server registers all
# capabilities unconditionally; toggling here does not require an MCP
# server redeploy.

NEXANDRO_AGENT_RECIPES_CREATE_ENABLED=false
NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED=false
# ... (~41 more)
```

A new `AgentCapabilityGuard` reads the per-capability flag based on `req.agentContext.capabilityName` (set by middleware from `X-Agent-Capability` header) and returns 503 if disabled. The guard is wired AFTER the existing JWT/Roles guards, so unauthorised + role-rejected requests still 401/403 first.

Rationale (Master's direct quote: "no pienso andar sacando mas versiones del MCP solo para activar y desactivar flags"):
- API-side rejection (a) over MCP-side hiding (b) avoids redeploys. Operators flip an env var + restart `apps/api`; the MCP server is untouched.
- Per-capability over master-flag (F6=b): when an agent does something problematic, ops can disable JUST that capability without disabling the entire write surface. Granular control matters for incident response.
- Flag explosion (~43 vars) is documented + grouped by namespace in `.env.example`. CI's `envvar-doc-completeness` test catches stale flags.

### ADR-MCP-W-NO-SIGNING — trusted-network mode persists; signing in 3c

The `m2-mcp-server` spec requires "unsigned agent header → 401". This slice DOES NOT honour that requirement; it inherits the trusted-internal-network posture from Wave 1.5. The README + `.env.example` carry an explicit warning. 3c (`m2-mcp-agent-registry-bench`) closes the signing gap.

Rationale:
- Splitting writes (3a) from signing (3c) keeps each PR reviewable. Combining them would balloon to ~9-10 days.
- The risk window: between this slice merging and 3c shipping, the MCP server is exposing writes without signature verification. Mitigation: the MCP server runs on the trusted network only; production deployments place it inside the same Kubernetes namespace as `apps/api` (no external exposure). The README documents this as a hard prerequisite.
- The spec.md ADDED Requirement "unsigned → 401" is technically violated by 3a but explicitly tracked as a 3c deliverable. The retro will note this.

### ADR-MCP-W-REGISTRY — capability-registry pattern (implementation)

```ts
// packages/mcp-server-nexandro/src/capabilities/write/types.ts
export interface WriteCapability<TInput = unknown, TResponse = unknown> {
  name: string;                                    // e.g. 'recipes.create'
  description: string;
  schema: z.ZodSchema<TInput>;
  restMethod: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  restPathTemplate: string;                        // e.g. '/recipes/:id/lines/:lineId/source'
  restPathParams?: (input: TInput) => Record<string, string>;
  restBodyExtractor?: (input: TInput) => unknown;  // remove path params from body
}

// packages/mcp-server-nexandro/src/capabilities/write/recipes.ts
export const RECIPES_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'recipes.create',
    description: 'Create a new recipe (draft state if missingFields non-empty)',
    schema: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      // ... matches RecipeCreateDto
    }),
    restMethod: 'POST',
    restPathTemplate: '/recipes',
  },
  // ... 6 more recipe writes
];

// packages/mcp-server-nexandro/src/capabilities/write/index.ts
export const WRITE_CAPABILITIES: WriteCapability[] = [
  ...RECIPES_WRITE_CAPABILITIES,
  ...MENU_ITEMS_WRITE_CAPABILITIES,
  // ... 10 more namespace exports
];

// packages/mcp-server-nexandro/src/server.ts
for (const cap of WRITE_CAPABILITIES) {
  server.registerTool(cap.name, {
    description: cap.description,
    inputSchema: cap.schema,
    handler: async (input, ctx) => {
      const path = renderPath(cap.restPathTemplate, cap.restPathParams?.(input) ?? {});
      const body = cap.restBodyExtractor ? cap.restBodyExtractor(input) : input;
      return httpClient.request(cap.restMethod, path, body, ctx);
    },
  });
}
```

Rationale:
- DRY: 43 capabilities × ~30 LOC each = ~1300 LOC. Registry pattern reduces per-capability surface to ~10-15 LOC of declarative metadata.
- Tests: each capability descriptor is asserted in unit tests via the registry — schema validity, method+path resolution, idempotent path rendering.
- Adding a 44th capability (post-merge, when M3 introduces stock movements) is one new entry in the registry. No boilerplate.

## Risks / Trade-offs

- **[Risk] Slice is the heaviest in M2 to date** (~3000-4000 LOC, 5-7 days). Mitigation: registry pattern + audit-table-tracked F2=b work + per-namespace task structure to keep progress visible.
- **[Risk] missingFields/nextRequired audit reveals N controllers without the contract**, requiring contract-addition work that wasn't scoped. Mitigation: tasks.md §1 has the audit grid; if N > 20 the user can opt to defer some controllers to a follow-up `m2-mcp-write-contract-completion`. Hard cap on this slice: don't add the contract to controllers that aren't in the F1=a write surface.
- **[Risk] Idempotency table grows unbounded if cron isn't set up.** Mitigation: operations runbook documents the cron; in PROD a missing cron triggers an alert when the table exceeds 100 MB.
- **[Risk] BeforeAfterAuditInterceptor adds 5-15ms to every write.** Mitigation: only fires for `viaAgent === true` traffic; UI/REST traffic is unaffected. If agent traffic patterns reveal latency complaints, file `m2-mcp-write-async-audit` to move the before/after capture to a queue.
- **[Risk] Spec violation "unsigned agent → 401"** between 3a merging and 3c shipping. Mitigation: trusted-network deployment; explicit README warning; 3c is the IMMEDIATE next slice in the sub-saga.
- **[Risk] Per-capability flag default `false`** means an operator must turn each on before agents can use them. UX cost. Mitigation: documented in operations runbook; the apps/api startup logs which flags are enabled at boot.
- **[Trade-off] HITL approvals deferred to follow-up.** Master's choice; production telemetry informs prioritisation.
- **[Trade-off] No ETag / If-Match.** Idempotency-Key handles retries; concurrent writes still race (last-writer-wins). Filed.

## Migration Plan

1. Migration `0020_agent_idempotency_keys.ts`:
   - `up()`: CREATE TABLE + index.
   - `down()`: DROP TABLE.
2. New `apps/api/src/shared/dto/write-response.dto.ts` — extracted shared envelope.
3. Audit each of the 43 write endpoints; tasks.md §1 records status. Add the contract to controllers where missing — change is a controller-method-level wrap.
4. New `apps/api/src/shared/middleware/idempotency.middleware.ts` + spec. Wire it globally for write methods.
5. New `apps/api/src/shared/interceptors/before-after-audit.interceptor.ts` + spec + per-namespace resolver registry. Wire it globally as `APP_INTERCEPTOR`.
6. New `apps/api/src/shared/guards/agent-capability.guard.ts` + spec. Reads per-capability flag from config; rejects 503 when disabled and `viaAgent === true`. Wired globally.
7. `apps/api/.env.example` — ~43 new flag entries grouped by namespace.
8. `packages/mcp-server-nexandro/src/capabilities/write/` — types.ts + 12 namespace files + index.ts barrel.
9. `packages/mcp-server-nexandro/src/server.ts` — register the registry.
10. INT spec covering 3 representative writes round-tripping with Idempotency + before/after.
11. Operations runbook: cron setup, env var checklist, signing-deferred warning.

**Rollback**: revert the migration; revert controllers (each is a small unit). Production-side rollback: flip every `NEXANDRO_AGENT_*_ENABLED=false` and restart apps/api (no MCP redeploy needed — caps return 503).

## Open Questions

- **Should the per-capability flags default to `true` for read-only capabilities?** Decision: this slice is writes-only; read flags are a non-issue. Reads stay default-on. (No reads gain new flags.)
- **Should `Idempotency-Key` be REQUIRED on writes (not optional)?** Decision: optional per Stripe convention. Required would force agent authors to generate keys for every operation including idempotent-by-nature ones (e.g. setOrgLabelFields). Operators can require it via a header-policy follow-up.
- **Should the MCP server's WRITE_CAPABILITIES registry support runtime tool-list filtering (e.g. omit disabled capabilities)?** Decision: no, per SD1=a — all caps registered unconditionally; API rejects when disabled. Otherwise we'd need per-deploy MCP rebuilds.
