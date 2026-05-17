# audit-log — operator runbook

> Cross-cutting operator guide for the `audit_log` subsystem. Covers Wave 1.9 (canonical table) → 1.10 (cost-history merge) → 1.11 (FTS) → 1.12 (CSV export) → 1.14 (forensic event split). For slice-specific *setup* (env flags, secrets, credential registration) see the per-slice runbooks listed under [§7 Cross-references](#7-cross-references).

Architecture: see [ADR-025](../architecture-decisions.md#adr-025-audit_log-canonical-architecture-single-subscriber--envelope--polymorphic-fk), [ADR-026](../architecture-decisions.md#adr-026-forensic-agent-event-split-agent_action_executed-vs-agent_action_forensic), [ADR-027](../architecture-decisions.md#adr-027-streaming-handler-audit-pattern-sse-and-readablefromasynciterable-handlers).

---

## 1 Schema

`audit_log` is the canonical event-history table. One row per emitted audit event across every bounded context.

**Migration history:**

| Migration | Wave | Purpose |
|---|---|---|
| `0017_audit_log` | 1.9 | Create the table + 3 b-tree indexes + backfill from 5 prior BCs. |
| `0018_drop_recipe_cost_history` | 1.10 | Retire the legacy per-BC audit table; backfill into `audit_log` via `array_agg + jsonb_build_object`. |
| `0019_audit_log_fts` | 1.11 | Two functional GIN indexes (Spanish + English) for full-text search. |
| `0022_audit_log_forensic_split` | 1.14 | Backfill `AGENT_ACTION_EXECUTED` rich rows → `AGENT_ACTION_FORENSIC`. |

**14 columns:**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK. |
| `organization_id` | uuid | FK `organizations.id`. RBAC scope. |
| `event_type` | text NOT NULL CHECK len 1..100 | Open enum (no DB enum); maps to `AuditEventType*` constants in `apps/api/src/audit-log/application/types.ts`. |
| `aggregate_type` | text | Polymorphic discriminator: `recipe`, `menu_item`, `ingredient`, `supplier`, `supplier_item`, `ai_suggestion`, `agent_credential`, `chat_session`, `organization`. |
| `aggregate_id` | uuid | Polymorphic, no FK constraint. App-level invariant: emit only after the entity exists. **UUID-typed** — non-UUID identifiers MUST be UUID-shaped at emit (use `randomUUID()`). |
| `actor_user_id` | uuid NULL | FK `users.id`. Null for system / unauthenticated emissions. |
| `actor_kind` | text CHECK ('user', 'agent', 'system') | |
| `agent_name` | text NULL | When `actor_kind='agent'`: free-text identifier from `X-Agent-Name` (or, if Wave 1.13 [3c] signing is enforced, lifted from the verified credential row). |
| `payload_before` | jsonb NULL | Pre-mutation state for write RPCs / forensic emissions. |
| `payload_after` | jsonb NULL | Post-mutation state. For chat: `{sessionId, messageDigest, replyChars, finishReason, messageType}`. For lean agent: `{capabilityName, timestamp}`. |
| `reason` | text NULL CHECK len ≤2000 | Free-text rationale. AI-suggestion rejection reason; chat capability label; rich agent capability name. |
| `citation_url` | text NULL | AI-suggestion source URL. |
| `snippet` | text NULL CHECK len ≤500 | AI-suggestion source snippet. |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**Indexes:**

| Index | Columns / expression | Use |
|---|---|---|
| `ix_audit_log_aggregate` | `(organization_id, aggregate_type, aggregate_id, created_at)` | Drill-down by aggregate. |
| `ix_audit_log_event_type` | `(organization_id, event_type, created_at)` | Global filter by event type. |
| `ix_audit_log_actor_user` | `(organization_id, actor_user_id, created_at) WHERE actor_user_id IS NOT NULL` | User history. Partial. |
| `ix_audit_log_fts_es` | `GIN ((jsonb_to_tsvector('spanish', payload_*, '["string"]') \|\| to_tsvector('spanish', coalesce(reason \|\| ' ' \|\| snippet, ''))))` | FTS Spanish (Wave 1.11). |
| `ix_audit_log_fts_en` | `GIN ((jsonb_to_tsvector('english', payload_*, '["string"]') \|\| to_tsvector('english', coalesce(reason \|\| ' ' \|\| snippet, ''))))` | FTS English (Wave 1.11). |

The exact FTS index expression is shared between migration and service via `audit-log-fts.sql.ts` constants; planner contract holds because both sources read from one string literal.

---

## 2 Query API

`GET /audit-log` — per ADR-025 + Wave 1.9. **RBAC:** `OWNER` and `MANAGER` roles only.

**Required:** `organizationId=<uuid>`. The endpoint refuses requests scoped to an org other than `req.user.organizationId`.

**Filters (all optional):**

| Parameter | Type | Notes |
|---|---|---|
| `aggregateType` | string | E.g. `recipe`, `ingredient`, `menu_item`, `agent_credential`, `chat_session`. |
| `aggregateId` | uuid | Combine with `aggregateType` for drill-down. |
| `eventType` | string (comma-separated) | E.g. `AGENT_ACTION_FORENSIC,AGENT_ACTION_EXECUTED`. |
| `actorUserId` | uuid | Per-user history. |
| `actorKind` | enum | `user`, `agent`, `system`. |
| `since` | ISO 8601 timestamp | Default: `now() - 30 days`. |
| `until` | ISO 8601 timestamp | Default: `now()`. |
| `limit` | integer 1..200 | Default 50. Clamped server-side. |
| `offset` | integer ≥0 | Default 0. |
| `q` | string ≤200 | FTS — see §3. |

Errors return HTTP 422 with `{code: 'AUDIT_LOG_QUERY_ERROR', detail}` for invalid date range / out-of-bounds limit / negative offset.

**Response shape:**

```json
{
  "rows": [{ /* AuditLogRowDto */ }],
  "total": 84,
  "limit": 50,
  "offset": 0
}
```

---

## 3 Full-text search (`?q=`)

Wave 1.11. Dual-config Spanish + English. The service builds an OR'd `tsquery` predicate against both functional GIN indexes and ranks results by `GREATEST(ts_rank_es, ts_rank_en) DESC, created_at DESC`.

**Behaviour:**

- `q` is optional. When absent, ordering reverts to `created_at DESC` only (back-compat with pre-FTS callers).
- Empty string (`q=`) is treated as absent — no search, no rerank.
- Length cap 200 chars enforced at the DTO. Postgres `plainto_tsquery` tokenises (regex-safe).
- The query is locale-agnostic: Spanish stems and English stems both contribute. `tomate` and `chicken` both match without a language hint.

**Operator-side debugging:** when FTS returns no results despite an obvious match, see §6 R2.

---

## 4 CSV export

Wave 1.12. `GET /audit-log/export.csv` — `OWNER + MANAGER` roles. Same DTO as `GET /audit-log` (limit/offset accepted-but-ignored on the export path).

**Wire shape:**

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="audit-log-YYYY-MM-DD.csv"` (UTC date-of-export — no filter exfiltration in the filename).
- `X-Audit-Log-Export-Truncated: true` when the result set exceeds the cap; absent / `false` otherwise. The header is set BEFORE the body starts via a pre-flight `LIMIT cap+1` count.
- 14 columns in fixed order matching the schema (no rebinding by client). RFC 4180 escaping (commas, quotes, newlines all wrapped + double-quoted internally). UTC ISO-8601 for `created_at`.

**Cap:** `AUDIT_LOG_EXPORT_HARD_CAP = 100_000` rows. For larger dumps see [`m2-audit-log-export-async`](#8-future-tech-debt) (filed, not yet implemented).

**Cursor pagination internals:** `streamRows()` is an async generator that batches in 1000-row windows via `(created_at, id) < (cursor)` tuple comparison; `Readable.from(asyncIterable)` wraps the response. Constant memory per export.

---

## 5 Agent dual-channel emission

**As of Wave 1.14 (ADR-026)**, agent-attributed events split across two `event_type` values:

| event_type | Source | aggregate_type | Payload shape |
|---|---|---|---|
| `AGENT_ACTION_EXECUTED` | `AgentAuditMiddleware` (lean) | `'organization'` | `{capabilityName, timestamp}` |
| `AGENT_ACTION_FORENSIC` | `BeforeAfterAuditInterceptor` (write RPCs) + `AgentChatService` (chat turns) | `recipe`, `menu_item`, `ingredient`, `supplier`, `supplier_item`, `ai_suggestion`, `agent_credential`, `chat_session`, … | Full envelope with `payload_before` + `payload_after` |

For an authenticated agent REST write (e.g. `PUT /recipes/:id` with `X-Via-Agent`), expect **both** rows: one lean attribution + one rich forensic. Their `created_at` differ by < 1 ms but they are two distinct rows.

For a chat turn (`POST /agent-chat/stream`) you get **one** rich forensic row from the streaming-handler terminal callback (per ADR-027 streaming pattern).

**Migration 0022 (`audit_log_forensic_split`)** retroactively reassigned historical rows: any row with `event_type='AGENT_ACTION_EXECUTED' AND aggregate_type<>'organization'` was updated to `event_type='AGENT_ACTION_FORENSIC'`. Down reverses; symmetric.

**Operator-visible behaviour change:** any query that filtered on `event_type='AGENT_ACTION_EXECUTED'` will, post-migration, return ONLY lean rows. To recover the previous mixed set, add `OR event_type='AGENT_ACTION_FORENSIC'`. There are no known dashboards yet (M2 just shipped); this is the right moment to split.

---

## 6 Troubleshooting recipes

### R1 — "I see only lean rows for an agent write"

**Symptom:** `GET /audit-log?eventType=AGENT_ACTION_FORENSIC&aggregateId=<recipe-id>` returns 0 rows after `PUT /recipes/<recipe-id>` with `X-Via-Agent`.

**Checks:**

1. Confirm `req.user.organizationId` is populated upstream — `BeforeAfterAuditInterceptor` skips emission when missing. `grep -rn "audit.skipped: no organizationId" <log-stream>`.
2. Confirm the controller method has `@AuditAggregate('recipe')` (or analogous). Without metadata the interceptor short-circuits.
3. Confirm the controller's module imports `SharedModule` and re-uses the global `AuditResolverRegistry` instance — a re-declared local instance produces "two registries, one resolver per side" splits where the interceptor sees `resolver-found=false`.
4. Confirm the BC implements `OnApplicationBootstrap` and registers a `findById` resolver: `apps/api/src/recipes/recipes.module.ts::onApplicationBootstrap()` is the canonical pattern.

### R2 — "FTS returns no results despite obvious match"

**Symptom:** `GET /audit-log?q=tomate` returns nothing; manual SQL `SELECT … WHERE payload_after::text LIKE '%tomate%'` returns the rows.

**Checks:**

1. Verify both functional indexes exist:
   ```sql
   SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'audit_log' AND indexname LIKE 'ix_audit_log_fts_%';
   ```
   Both `ix_audit_log_fts_es` and `ix_audit_log_fts_en` should be present with `jsonb_to_tsvector` expressions.
2. Verify the planner is using one of the GIN indexes (planner cost can prefer Seq Scan on small tables — that is OK for correctness but slow at scale):
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM audit_log
    WHERE jsonb_to_tsvector('spanish', payload_after, '["string"]') @@ plainto_tsquery('spanish', 'tomate');
   ```
3. Drift between migration's indexed expression and the service's query expression is the dominant failure mode for functional FTS. The shared `audit-log-fts.sql.ts` constants prevent it; if anyone hand-edits one side without the other, the planner falls back to seq scan and at scale this looks like "FTS just doesn't work". Code-reviewer should catch this; production smoke would not.

### R3 — "CSV export truncated at 100K"

**Symptom:** Operator downloads `audit-log-YYYY-MM-DD.csv`, the file has exactly 100,000 rows, and `X-Audit-Log-Export-Truncated: true` in headers.

**Resolution:**

1. Narrow the filter window — `since` / `until` shrink the candidate set. Most exports for compliance use cases are date-bounded.
2. Filter by `eventType` if the question is about a single concern (e.g. only AI-suggestion accept/reject for a regulator).
3. If a single-export >100K is a recurring need, file [`m2-audit-log-export-async`](#8-future-tech-debt) — POST creates a job_id, GET /audit-log/exports/:id returns the file when ready. Trigger threshold per FR-A1: "operator requests > 100K rows more than once per quarter".

### R4 — "Migration 0022 didn't move my rows"

**Symptom:** After migration 0022 runs, operator sees `event_type='AGENT_ACTION_EXECUTED'` rows that they expected to land on `AGENT_ACTION_FORENSIC`.

**Checks:**

1. Run the diagnostic:
   ```sql
   SELECT event_type, aggregate_type, count(*) FROM audit_log
    WHERE event_type LIKE 'AGENT_ACTION_%' GROUP BY 1, 2 ORDER BY 1, 2;
   ```
   - Rows on `AGENT_ACTION_EXECUTED` with `aggregate_type='organization'` are correct (lean attribution row from `AgentAuditMiddleware`).
   - Rows on `AGENT_ACTION_FORENSIC` with `aggregate_type<>'organization'` are correct (rich mutation row).
   - Anything ELSE on `AGENT_ACTION_EXECUTED` (i.e. `aggregate_type<>'organization'`) means the migration didn't apply or there's a post-migration emit path that's still using the old channel.
2. Confirm the migration ran: `SELECT * FROM nexandro_migrations WHERE name LIKE '%forensic_split%';`
3. If migration ran but rows are still mis-channelled, grep emit sites: `grep -rn "AGENT_ACTION_EXECUTED" apps/api/src` should return only the lean middleware (`agent-audit.middleware.ts`) + types/comment matches. Any rich-emit site on the lean channel is a regression.

### R5 — "Audit row drops silently"

**Symptom:** A controller emits an event but the `audit_log` row never lands.

**Checks:**

1. Per ADR-025, every subscriber handler is wrapped in try/catch. DB or translation failures are logged + dropped. Grep the structured logs:
   ```
   grep "audit-log.subscriber.error" <log-stream>
   ```
2. Common causes: invalid envelope shape (missing `organizationId`/`aggregateType`/`aggregateId`); UUID schema constraint violation on `aggregate_id` (per ADR-027 — opaque ids must be UUID-shaped at emission); transient DB failure.
3. There is no DLQ today; failed audit rows are gone. [`m2-audit-log-dlq`](#8-future-tech-debt) is filed but volume-driven.

### R6 — "Streaming endpoint emits N audit rows for one turn"

**Symptom:** A new `@Sse()` handler or `Readable.from()` endpoint produces one audit row per emitted event, not one per turn.

**Resolution:**

The handler is misusing `BeforeAfterAuditInterceptor`. Per ADR-027 streaming-handler audit pattern:

1. Remove `@AuditAggregate(...)` from the streaming controller method.
2. Wire emission into the Observable / async-iterable terminal path inside the **service**, not the controller.
3. Use `randomUUID()` for `aggregate_id`; store the opaque session/job key in `payload_after`.
4. Set `auditEmitted = true` in a closure-captured local before persistence so re-entrant terminal callbacks (success → done, error → unsubscribe) cannot double-emit.
5. Use `EventEmitter2.emitAsync` (not `emit`) so INT specs reading the DB after the response see the row.

Reference implementation: `apps/api/src/agent-chat/application/agent-chat.service.ts`.

---

## 7 Cross-references

Slice-specific setup, env flags, secret rotation:

- [m2-mcp-write-capabilities-runbook](./m2-mcp-write-capabilities-runbook.md) — 43 per-capability env flags + Idempotency-Key + audit interceptor.
- [m2-mcp-agent-chat-widget-runbook](./m2-mcp-agent-chat-widget-runbook.md) — `NEXANDRO_AGENT_ENABLED` + Hermes secret + chat audit emission.
- [m2-mcp-agent-registry-bench-runbook](./m2-mcp-agent-registry-bench-runbook.md) — Ed25519 signing + agent_credentials registration + SSE replay + bench harness.

Architecture decisions consumed by this runbook:

- [ADR-025: audit_log canonical architecture](../architecture-decisions.md#adr-025-audit_log-canonical-architecture-single-subscriber--envelope--polymorphic-fk)
- [ADR-026: Forensic agent-event split](../architecture-decisions.md#adr-026-forensic-agent-event-split-agent_action_executed-vs-agent_action_forensic)
- [ADR-027: Streaming-handler audit pattern](../architecture-decisions.md#adr-027-streaming-handler-audit-pattern-sse-and-readablefromasynciterable-handlers)

---

## 8 Future tech-debt

Filed as backlog slices; trigger conditions documented for each:

- **`m2-audit-log-emitter-migration`** — migrate the 5 `cost.*` legacy translators in `AuditLogSubscriber` (`INGREDIENT_OVERRIDE_CHANGED`, `RECIPE_ALLERGENS_OVERRIDE_CHANGED`, `RECIPE_SOURCE_OVERRIDE_CHANGED`, `RECIPE_INGREDIENT_UPDATED`, `SUPPLIER_PRICE_UPDATED`) to envelope-shape emitters at their source services. Trigger: M3 inventory adds a 6th legacy translator → consolidate before fan-out.
- **`m2-audit-log-partition`** — partition `audit_log` by `created_at` month + cold-storage move after N years. Trigger: ~10M rows/org per heavy tenant.
- **`m2-audit-log-dlq`** — dead-letter queue for failed audit writes. Trigger: persistent `audit-log.subscriber.error` log volume > 10/day in PROD.
- **`m2-audit-log-export-async`** — `POST /audit-log/exports → job_id`, `GET /audit-log/exports/:id → file`. Trigger: customer requests > 100K row dumps regularly.
- **`m2-audit-log-export-multi-format`** — JSONL / Parquet / NDJSON formats alongside CSV. Trigger: data-engineering customer.
- **`m2-audit-log-export-columns`** — `?columns=foo,bar` configurability for redacted exports. Trigger: legal team request.
- **`m2-audit-log-fts-weighted`** — `setweight()` to boost `reason`+`snippet` over `payload_*`. Trigger: chef ranking-quality complaint.
- **`m2-audit-log-fts-trigram`** — `pg_trgm` for substring matching. Trigger: stemming-misses-partial-match feedback.
- **`m2-audit-log-fts-highlight`** — `ts_headline()` returning matched snippets. Trigger: UI request for inline match excerpts.
- **`m2-audit-log-fts-online-build`** — `CREATE INDEX CONCURRENTLY` for the GIN indexes. Trigger: ~10M rows.
- **`m2-audit-log-ui`** — Owner-facing browse / search / drill-down UI. Trigger: integrators ask.

---

Wave 1.14 — closes the audit-log saga consolidation. Subsystem is feature-complete for compliance use cases (regulator audits, GDPR Article 15 portability, agent-mutation forensics).
