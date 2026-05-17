# Spec: m2-audit-log-forensic-split

> Wave 1.14. Acceptance scenarios for the audit-log channel split + ADR consolidation + operator runbook.

## Scenario: WHEN an agent makes an authenticated REST write request, THEN exactly two audit_log rows are persisted with distinct event_type values

```
GIVEN  An agent-flagged HTTP write request (POST/PUT/PATCH/DELETE)
       arrives at apps/api with valid X-Via-Agent + X-Agent-Name headers
       AND NEXANDRO_AGENT_<NS>_<OP>_ENABLED=true for that capability
       AND req.user is populated by the auth pipeline
WHEN   The request flows through AgentAuditMiddleware (lean emit) →
       IdempotencyMiddleware → guards → BeforeAfterAuditInterceptor
       (rich emit on success) → handler returns
THEN   Two audit_log rows are persisted:
         row A: event_type = 'AGENT_ACTION_EXECUTED'
                aggregate_type = 'organization'
                aggregate_id = req.user.organizationId
                actor_kind = 'agent'
                payload_after.capabilityName + payload_after.timestamp
         row B: event_type = 'AGENT_ACTION_FORENSIC'
                aggregate_type ∈ {recipe, menu_item, ingredient, ...}
                aggregate_id = the entity id
                payload_before + payload_after present
                actor_kind = 'agent'
       AND  The two rows are distinct rows (different ids, possibly different
            timestamps within the request's wall-clock window).
```

## Scenario: WHEN an agent issues an SSE chat turn, THEN the audit row carries AGENT_ACTION_FORENSIC

```
GIVEN  POST /agent-chat/stream is called by an agent with a session id
       AND NEXANDRO_AGENT_ENABLED=true
       AND the Hermes upstream returns a stream that terminates
WHEN   The Observable's terminal callback fires (success / 5xx / unsubscribe)
       AND the auditEmitted flag has not been raised yet
THEN   AuditLogSubscriber persists exactly one row with:
         event_type = 'AGENT_ACTION_FORENSIC'
         aggregate_type = 'agent_chat_session' (or the existing 3b value)
         aggregate_id = randomUUID() generated per turn
         payload_after.sessionId = the original chat session id (string)
         actor_kind = 'agent'
       AND  No row with event_type='AGENT_ACTION_EXECUTED' is emitted
            from the chat path (the chat handler does not flow through
            AgentAuditMiddleware's emit branch — see ADR-027).
```

## Scenario: WHEN the AGENT_ACTION_EXECUTED handler receives a rich envelope, THEN it is dropped (not persisted via the lean path)

```
GIVEN  A misbehaving caller emits an AGENT_ACTION_EXECUTED event whose
       payload looks like AuditEventEnvelope (aggregate_type != 'organization')
WHEN   AuditLogSubscriber.onAgentActionExecuted() runs
THEN   The handler treats the payload as legacy/lean shape and either
         (a) skips with a debug log when organizationId is missing
         (b) persists translated with aggregate_type='organization' anchored
             to the lean fields (the rich payload's other fields are ignored)
       AND  No isRichAuditEnvelope() discrimination occurs — the helper has
            been removed from the subscriber.
       AND  The forensic row never lands in audit_log unless the caller
            emits on AGENT_ACTION_FORENSIC.
```

## Scenario: WHEN migration 0022 runs on a database with mixed historical rows, THEN rich rows are reassigned and lean rows are untouched

```
GIVEN  audit_log has historical rows with event_type='AGENT_ACTION_EXECUTED':
         rows L: aggregate_type = 'organization'   (lean — should stay)
         rows R: aggregate_type ∈ {recipe, ingredient, ...}  (rich — must move)
WHEN   Migration 0022_audit_log_forensic_split.up() runs
THEN   Rows R have event_type updated to 'AGENT_ACTION_FORENSIC'
       AND  Rows L retain event_type = 'AGENT_ACTION_EXECUTED'
       AND  No other column on any row changes
       AND  The whole migration runs in one transaction (atomic).

WHEN   Migration 0022.down() runs from the post-up state
THEN   Rows R revert to event_type = 'AGENT_ACTION_EXECUTED'
       AND  Rows L are untouched.
```

## Scenario: WHEN docs/architecture-decisions.md is read, THEN ADR-025/026/027 are present and explain the audit-log subsystem

```
GIVEN  master/docs/architecture-decisions.md
WHEN   A maintainer or future contributor reads it after this slice ships
THEN   They find:
         ADR-025 — audit_log canonical architecture
                   (subscriber pattern; envelope; polymorphic FK without DB
                   constraint; UUID-typed aggregate_id; open-enum text
                   event_type; two-name pattern channel/persisted)
         ADR-026 — Forensic agent-event split
                   (this slice's decision: AGENT_ACTION_EXECUTED stays lean,
                   AGENT_ACTION_FORENSIC introduced for rich aggregate-anchored
                   emissions; rationale + migration referenced)
         ADR-027 — Streaming-handler audit pattern
                   (BeforeAfterAuditInterceptor unsuitable for @Sse() handlers;
                   service emits from Observable terminal callback; auditEmitted
                   flag prevents double-emit; aggregate_id = randomUUID() per
                   turn; opaque session id stored in payload_after.sessionId)
       AND  Each ADR follows the existing decision/rationale/consequence/
            alternatives format used by ADR-001 → ADR-024.
```

## Scenario: WHEN docs/operations/audit-log-runbook.md is read, THEN operators understand schema + query + FTS + CSV + agent dual-channel + troubleshooting

```
GIVEN  master/docs/operations/audit-log-runbook.md
WHEN   An operator opens the runbook to investigate an audit-log question
THEN   They find sections covering:
         1. Schema (audit_log table + 14 columns + 3 indexes + GIN FTS pair)
         2. Query API (GET /audit-log with filters, RBAC, pagination)
         3. Full-text search (?q= behaviour, dual-config, ranking)
         4. CSV export (GET /audit-log/export.csv, hard cap, truncation header)
         5. Agent dual-channel emission (AGENT_ACTION_EXECUTED lean + 
            AGENT_ACTION_FORENSIC rich, when each row is written)
         6. Troubleshooting recipes (≥5):
              - "I see only lean rows, no forensic" → check interceptor wiring
              - "FTS returns no results despite obvious match" → check both
                indexes via pg_indexes
              - "CSV export truncated at 100K" → header + async-export filed
              - "Migration 0022 didn't move my rows" → check aggregate_type
              - "Audit row drops silently" → log + drop pattern; DLQ filed
       AND  References per-slice runbooks for setup detail
            (m2-mcp-write-capabilities-runbook, m2-mcp-agent-chat-widget,
            m2-mcp-agent-registry-bench).
```

## Scenario: WHEN existing FTS + CSV-export + query consumers run after this slice, THEN behaviour is unchanged for them

```
GIVEN  Wave 1.11 FTS query (?q=tomate)
       AND Wave 1.12 CSV export (GET /audit-log/export.csv)
       AND Wave 1.9 GET /audit-log with eventTypes filter
WHEN   Any of those run after this slice ships
THEN   Behaviour is functionally identical:
         - FTS still searches across payload_*/reason/snippet, dual-config
         - CSV export streams the same 14 columns
         - GET /audit-log filter eventTypes=['AGENT_ACTION_EXECUTED'] returns
           only lean rows (after migration runs); previously it returned both
           lean and rich. Operators with such filters MUST add
           'AGENT_ACTION_FORENSIC' to recover the previous result set.
       AND  This is documented in the runbook + ADR-026 as the deliberate,
            type-system-clarifying behaviour change.
```

## Scenario: WHEN apps/api boots after this slice, THEN module wiring is complete and no orphaned channel emissions remain

```
GIVEN  Fresh apps/api boot
WHEN   The application context initialises
THEN   AuditLogSubscriber registers two @OnEvent handlers for agent rows:
         @OnEvent(AGENT_ACTION_EXECUTED) → onAgentActionExecuted (lean)
         @OnEvent(AGENT_ACTION_FORENSIC) → onAgentActionForensic (rich)
       AND  All 9 existing legacy @OnEvent handlers continue to function
            (cost.* + ai-suggestions.* + agent.action-executed lean path)
       AND  No emit site in apps/api emits a rich envelope on
            AGENT_ACTION_EXECUTED (verified via grep + type-check).
```
