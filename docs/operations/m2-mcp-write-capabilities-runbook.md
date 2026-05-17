# m2-mcp-write-capabilities — operations runbook

Wave 1.13 / 3a of the m2-mcp-extras sub-saga. Operator-facing reference for the
43 MCP write capabilities, the per-capability kill-switches, the
`agent_idempotency_keys` TTL cron, and the audit-log forensic queries.

> Companion docs:
> - Capability proposal: `openspec/changes/m2-mcp-write-capabilities/proposal.md`
> - ADRs: `openspec/changes/m2-mcp-write-capabilities/design.md`
> - Production deploy procedure: `docs/operations/m2-prod-runbook.md`

## 1. Trusted-network warning (read this first)

This slice runs in **trusted-internal-network mode only**. The MCP server
(`packages/mcp-server-nexandro`) does NOT verify a signed agent identity —
any caller that can reach `apps/api` over HTTP and supply
`X-Via-Agent: true` + `X-Agent-Name` headers will be treated as an agent.

**Production deployment requirements (hard prerequisites):**

- The MCP server MUST run inside the same private network / Kubernetes
  namespace as `apps/api`. There must be NO ingress/load-balancer/reverse-proxy
  path that exposes either component to the public internet, a partner VPC, or
  a customer network.
- All 43 `NEXANDRO_AGENT_*_ENABLED` flags MUST default to `false` in the
  production `.env`. Operators flip a single flag only after explicit
  authorisation + a recorded change-management ticket.
- Audit-log forensic rows (`event_type='AGENT_ACTION_EXECUTED'`,
  `actor_kind='agent'`) are the post-hoc record. Do NOT enable agent writes in
  prod until the audit-log retention policy is confirmed (M2 default: 90 days
  via `audit_log` table; verify in `docs/operations/m2-prod-runbook.md`).

**Signing layer (deferred to 3c):** signature verification — agents present a
shared-secret HMAC or a signed JWT, MCP forwards the proof, apps/api verifies
against an agent registry — lands in `m2-mcp-agent-registry-bench` (the
immediate next slice). Until 3c ships, **do not expose the MCP server to any
network the agents themselves don't already have first-class access to**.

## 2. Per-capability flag matrix (43 flags / 12 namespaces)

All flags default to `false` (disabled). When `false` AND the request carries
`X-Via-Agent: true`, the API returns:

```json
HTTP/1.1 503 Service Unavailable
{
  "code": "AGENT_CAPABILITY_DISABLED",
  "capability": "<capability-name>",
  "message": "Agent capability '<capability-name>' is disabled. Set NEXANDRO_AGENT_<...>_ENABLED=true to enable."
}
```

Direct REST/UI traffic (no `X-Via-Agent` header) is NEVER affected by these
flags — flipping a flag does not turn off the corresponding UI affordance.

**To enable a capability:**

1. Edit `apps/api/.env` (NOT `.env.example`).
2. Set the corresponding `NEXANDRO_AGENT_<NAMESPACE>_<OP>_ENABLED=true`.
3. Restart `apps/api` (`systemctl restart nexandro-api` or your equivalent).
   The MCP server does NOT need a restart.
4. Tail the apps/api boot log; the boot-time line lists which agent
   capabilities are enabled (helps verify config drift).
5. Smoke-test from the agent: send the capability call; expect 2xx instead of
   503.

**Full flag inventory (matches `apps/api/.env.example`):**

### `recipes.*` (7)

| Capability                          | Env var                                                       |
|-------------------------------------|---------------------------------------------------------------|
| `recipes.create`                    | `NEXANDRO_AGENT_RECIPES_CREATE_ENABLED`                    |
| `recipes.update`                    | `NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED`                    |
| `recipes.setLineSource`             | `NEXANDRO_AGENT_RECIPES_SET_LINE_SOURCE_ENABLED`           |
| `recipes.delete`                    | `NEXANDRO_AGENT_RECIPES_DELETE_ENABLED`                    |
| `recipes.setAllergensOverride`      | `NEXANDRO_AGENT_RECIPES_SET_ALLERGENS_OVERRIDE_ENABLED`    |
| `recipes.setDietFlagsOverride`      | `NEXANDRO_AGENT_RECIPES_SET_DIET_FLAGS_OVERRIDE_ENABLED`   |
| `recipes.setCrossContamination`     | `NEXANDRO_AGENT_RECIPES_SET_CROSS_CONTAMINATION_ENABLED`   |

### `menu-items.*` (3)

| Capability             | Env var                                          |
|------------------------|--------------------------------------------------|
| `menu-items.create`    | `NEXANDRO_AGENT_MENU_ITEMS_CREATE_ENABLED`    |
| `menu-items.update`    | `NEXANDRO_AGENT_MENU_ITEMS_UPDATE_ENABLED`    |
| `menu-items.delete`    | `NEXANDRO_AGENT_MENU_ITEMS_DELETE_ENABLED`    |

### `ingredients.*` (6)

| Capability                  | Env var                                              |
|-----------------------------|------------------------------------------------------|
| `ingredients.create`        | `NEXANDRO_AGENT_INGREDIENTS_CREATE_ENABLED`       |
| `ingredients.update`        | `NEXANDRO_AGENT_INGREDIENTS_UPDATE_ENABLED`       |
| `ingredients.delete`        | `NEXANDRO_AGENT_INGREDIENTS_DELETE_ENABLED`       |
| `ingredients.reactivate`    | `NEXANDRO_AGENT_INGREDIENTS_REACTIVATE_ENABLED`   |
| `ingredients.applyOverride` | `NEXANDRO_AGENT_INGREDIENTS_APPLY_OVERRIDE_ENABLED` |
| `ingredients.import`        | `NEXANDRO_AGENT_INGREDIENTS_IMPORT_ENABLED` (not yet routable via MCP transport — flag exists for future) |

### `categories.*` (3)

| Capability             | Env var                                       |
|------------------------|-----------------------------------------------|
| `categories.create`    | `NEXANDRO_AGENT_CATEGORIES_CREATE_ENABLED` |
| `categories.update`    | `NEXANDRO_AGENT_CATEGORIES_UPDATE_ENABLED` |
| `categories.delete`    | `NEXANDRO_AGENT_CATEGORIES_DELETE_ENABLED` |

### `suppliers.*` (3)

| Capability           | Env var                                      |
|----------------------|----------------------------------------------|
| `suppliers.create`   | `NEXANDRO_AGENT_SUPPLIERS_CREATE_ENABLED` |
| `suppliers.update`   | `NEXANDRO_AGENT_SUPPLIERS_UPDATE_ENABLED` |
| `suppliers.delete`   | `NEXANDRO_AGENT_SUPPLIERS_DELETE_ENABLED` |

### `supplier-items.*` (4)

| Capability                            | Env var                                                       |
|---------------------------------------|---------------------------------------------------------------|
| `supplier-items.create`               | `NEXANDRO_AGENT_SUPPLIER_ITEMS_CREATE_ENABLED`             |
| `supplier-items.update`               | `NEXANDRO_AGENT_SUPPLIER_ITEMS_UPDATE_ENABLED`             |
| `supplier-items.promotePreferred`     | `NEXANDRO_AGENT_SUPPLIER_ITEMS_PROMOTE_PREFERRED_ENABLED`  |
| `supplier-items.delete`               | `NEXANDRO_AGENT_SUPPLIER_ITEMS_DELETE_ENABLED`             |

### `labels.*` (2)

| Capability                  | Env var                                                  |
|-----------------------------|----------------------------------------------------------|
| `labels.print`              | `NEXANDRO_AGENT_LABELS_PRINT_ENABLED`                 |
| `labels.setOrgLabelFields`  | `NEXANDRO_AGENT_LABELS_SET_ORG_LABEL_FIELDS_ENABLED`  |

### `ai-suggestions.*` (4)

| Capability                | Env var                                              |
|---------------------------|------------------------------------------------------|
| `ai-suggestions.yield`    | `NEXANDRO_AGENT_AI_SUGGESTIONS_YIELD_ENABLED`     |
| `ai-suggestions.waste`    | `NEXANDRO_AGENT_AI_SUGGESTIONS_WASTE_ENABLED`     |
| `ai-suggestions.accept`   | `NEXANDRO_AGENT_AI_SUGGESTIONS_ACCEPT_ENABLED`    |
| `ai-suggestions.reject`   | `NEXANDRO_AGENT_AI_SUGGESTIONS_REJECT_ENABLED`    |

### `external-catalog.*` (1)

| Capability                  | Env var                                              |
|-----------------------------|------------------------------------------------------|
| `external-catalog.sync`     | `NEXANDRO_AGENT_EXTERNAL_CATALOG_SYNC_ENABLED`    |

### `iam.users.*` (5)

| Capability                       | Env var                                                  |
|----------------------------------|----------------------------------------------------------|
| `iam.users.create`               | `NEXANDRO_AGENT_IAM_USERS_CREATE_ENABLED`             |
| `iam.users.update`               | `NEXANDRO_AGENT_IAM_USERS_UPDATE_ENABLED`             |
| `iam.users.changePassword`       | `NEXANDRO_AGENT_IAM_USERS_CHANGE_PASSWORD_ENABLED`    |
| `iam.users.addLocation`          | `NEXANDRO_AGENT_IAM_USERS_ADD_LOCATION_ENABLED`       |
| `iam.users.removeLocation`       | `NEXANDRO_AGENT_IAM_USERS_REMOVE_LOCATION_ENABLED`    |

### `iam.locations.*` (3)

| Capability                  | Env var                                              |
|-----------------------------|------------------------------------------------------|
| `iam.locations.create`      | `NEXANDRO_AGENT_IAM_LOCATIONS_CREATE_ENABLED`     |
| `iam.locations.update`      | `NEXANDRO_AGENT_IAM_LOCATIONS_UPDATE_ENABLED`     |
| `iam.locations.delete`      | `NEXANDRO_AGENT_IAM_LOCATIONS_DELETE_ENABLED`     |

### `iam.organizations.*` (2)

| Capability                       | Env var                                              |
|----------------------------------|------------------------------------------------------|
| `iam.organizations.create`       | `NEXANDRO_AGENT_IAM_ORGANIZATIONS_CREATE_ENABLED` |
| `iam.organizations.update`       | `NEXANDRO_AGENT_IAM_ORGANIZATIONS_UPDATE_ENABLED` |

**Total: 43 flags.** Validate parity with the MCP registry by running:

```sh
node -e "import('./packages/mcp-server-nexandro/dist/capabilities/write/index.js').then(m => console.log(m.WRITE_CAPABILITIES.length))"
# → 43
```

## 3. `agent_idempotency_keys` cron

Migration `0020_agent_idempotency_keys.ts` creates the table that backs the
`Idempotency-Key` HTTP header (per ADR-MCP-W-IDEMPOTENCY). Rows accumulate
at ~1 row per agent write request that includes an `Idempotency-Key` header.
TTL = 24 hours (Stripe convention).

**Recommended cleanup cron (Postgres `pg_cron`, hourly):**

```sql
-- Run as the database owner (e.g. nexandro).
SELECT cron.schedule(
  'agent-idempotency-keys-cleanup',
  '0 * * * *',                    -- top of every hour
  $$DELETE FROM agent_idempotency_keys WHERE created_at < now() - interval '24 hours'$$
);
```

**Without `pg_cron` (host-side):** wire a systemd timer or k8s `CronJob` that
runs the equivalent SQL hourly:

```sh
psql "$DATABASE_URL" -c "DELETE FROM agent_idempotency_keys WHERE created_at < now() - interval '24 hours';"
```

**Alarm threshold: 100 MB.** Steady state is ~1 MB per heavy-traffic org. If
`pg_total_relation_size('agent_idempotency_keys') > 100 * 1024 * 1024`:

1. Verify the cron is running (check `cron.job` or systemd `journalctl`).
2. Confirm no agent is supplying the same `Idempotency-Key` for unbounded
   distinct request hashes (would suggest a broken retry loop).
3. As a one-shot remediation, run the DELETE manually with `created_at <
   now() - interval '6 hours'` to free space; then fix the cron.

```sql
-- One-shot table-size check.
SELECT
  pg_size_pretty(pg_total_relation_size('agent_idempotency_keys')) AS total_size,
  count(*)                                                          AS row_count,
  min(created_at)                                                   AS oldest,
  max(created_at)                                                   AS newest
FROM agent_idempotency_keys;
```

## 4. Reading audit-log forensic events

Every agent-routed write (i.e. `X-Via-Agent: true` + handler decorated with
`@AuditAggregate(...)`) emits `AGENT_ACTION_EXECUTED` with the canonical
envelope: `{organizationId, aggregateType, aggregateId, actorUserId,
actorKind:'agent', agentName, payloadBefore, payloadAfter, reason:capability}`.

The `AuditLogSubscriber` persists one row per emit. Forensic queries:

**Last 100 agent writes (any capability):**

```sql
SELECT
  created_at,
  reason       AS capability,
  agent_name,
  actor_user_id,
  aggregate_type,
  aggregate_id,
  payload_before,
  payload_after
FROM audit_log
WHERE event_type = 'AGENT_ACTION_EXECUTED'
  AND actor_kind = 'agent'
ORDER BY created_at DESC
LIMIT 100;
```

**All writes by a specific agent in the last hour:**

```sql
SELECT created_at, reason, aggregate_type, aggregate_id
FROM audit_log
WHERE event_type = 'AGENT_ACTION_EXECUTED'
  AND actor_kind = 'agent'
  AND agent_name = 'claude-desktop'
  AND created_at >= now() - interval '1 hour'
ORDER BY created_at DESC;
```

**Diff between before/after on a single recipe:**

```sql
SELECT
  created_at,
  reason AS capability,
  jsonb_pretty(payload_before) AS before,
  jsonb_pretty(payload_after)  AS after
FROM audit_log
WHERE event_type   = 'AGENT_ACTION_EXECUTED'
  AND actor_kind   = 'agent'
  AND aggregate_type = 'recipe'
  AND aggregate_id   = '<recipe-uuid>'
ORDER BY created_at DESC
LIMIT 20;
```

**Note on row duplication.** During the 3a window, the legacy
`AgentAuditMiddleware` (Wave 1.5) ALSO emits `AGENT_ACTION_EXECUTED` with a
leaner shape (`aggregate_type='organization'`, no before/after) for ALL agent
traffic — including the same writes the new interceptor enriches. You will see
TWO rows per agent write in `audit_log`: one with `aggregate_type='organization'`
+ minimal payload, one with the canonical aggregate type + before/after. The
forensic queries above filter on the rich row by including
`aggregate_type IN ('recipe', 'menu_item', 'ingredient', ...)` or by
`payload_after IS NOT NULL`. De-duplication is filed as
`m2-mcp-write-async-audit` for a future iteration.

## 5. Reacting to AGENT_CAPABILITY_DISABLED 503 alerts

**Symptom:** alerting fires on a 503 spike with `code=AGENT_CAPABILITY_DISABLED`
in the response body (or, if the alert source is structured logs, on the
warn-level line `agent.capability.rejected: capability=<...> envVar=<...>`).

**Triage flow:**

1. **Identify the capability.** The alert payload (or log line) names the
   capability (e.g. `recipes.create`) and the env var
   (`NEXANDRO_AGENT_RECIPES_CREATE_ENABLED`). If you only have the 503
   rate, query the apps/api access log for recent 503s with the
   `X-Agent-Capability` header to map back.

2. **Decide if intentional.**
   - **Yes** (the flag is `false` by design — operator never enabled it):
     the agent is calling something it shouldn't. Treat as a misconfigured
     agent or unauthorised use. Notify the agent owner; check the audit-log
     for the requesting `agent_name` to see what else they tried.
   - **No** (the flag was supposed to be `true`): proceed to step 3.

3. **Flip the flag.**
   ```sh
   # apps/api host
   sudo $EDITOR /etc/nexandro/api.env
   # set NEXANDRO_AGENT_<...>_ENABLED=true
   sudo systemctl restart nexandro-api
   ```
   Boot log will show the new enabled-capabilities list. The MCP server does
   NOT need a restart.

4. **Verify recovery.** Tail the audit log for the next agent call to that
   capability; expect one row with `actor_kind='agent'` + the capability name
   in `reason`:
   ```sql
   SELECT created_at, reason AS capability, agent_name, aggregate_id
   FROM audit_log
   WHERE event_type = 'AGENT_ACTION_EXECUTED'
     AND reason = '<capability>'
     AND created_at >= now() - interval '5 minutes'
   ORDER BY created_at DESC;
   ```
   Empty after the restart → either the agent gave up (retry-after the 503)
   or there's a different gate (RBAC 403, JWT 401). Check the access log.

5. **Document.** Every flag flip should be recorded in your change-management
   system with: capability, who authorised, why, expected duration, rollback
   plan (re-flip to `false` + restart).

## 6. Open follow-ups (filed for later iterations)

These are NOT in scope for 3a. They are recorded here so operators and
reviewers know the boundary of what this slice ships.

- **`m2-mcp-write-hitl`** — human-in-the-loop approval workflow. Agent issues
  a write → system pauses → human approves → write commits. Per-capability
  flags are the safety net until HITL lands; production telemetry from this
  slice will inform which capabilities most need HITL gating.

- **`m2-mcp-write-dry-run`** — agent-side dry-run mode. MCP capability returns
  "what would happen" (computed missingFields, projected payload_after)
  without persisting. Useful for agent self-verification before commits.

- **`m2-mcp-write-etag`** — ETag / If-Match optimistic concurrency. This slice
  delivers Idempotency-Key for retries; concurrent writes still race
  (last-writer-wins). ETag/If-Match closes that gap.

- **`m2-mcp-write-async-audit`** — move the BeforeAfterAuditInterceptor's
  before/after capture to a background queue if the +5–15 ms per write
  becomes a latency problem. Also addresses the duplicate-row issue called
  out in §4.

- **`m2-mcp-write-contract-completion`** — finish the
  `{data, missingFields, nextRequired}` audit (tasks.md §1) for any
  controllers deferred from this slice. The shared `WriteResponseDto<T>` is
  in place; the work is per-controller and small.

- **`m2-mcp-agent-registry-bench`** (3c) — agent signing layer + first
  MCP-client end-to-end benchmark. **This is the IMMEDIATE next slice** in
  the m2-mcp-extras sub-saga and is the prerequisite for exposing the MCP
  server beyond the trusted internal network.

## See also (Wave 1.13 [3c] update)

- `docs/operations/m2-mcp-agent-registry-bench-runbook.md` — per-agent
  Ed25519 signing replaces the `X-Agent-Name` trust posture. The
  signing flag (`NEXANDRO_AGENT_SIGNATURE_REQUIRED`) sits ahead of
  the per-capability flags documented above; once enabled per-org,
  unsigned agent requests 401 before reaching the capability gate.
