## ADDED Requirements

### Requirement: MCP server registers 43 write capabilities mirroring REST 1:1

The `packages/mcp-server-nexandro` server SHALL register one MCP tool for each of the 43 REST write endpoints listed in proposal.md, grouped into 12 namespaces (`recipes.*`, `menu-items.*`, `ingredients.*`, `categories.*`, `suppliers.*`, `supplier-items.*`, `labels.*`, `ai-suggestions.*`, `external-catalog.*`, `iam.users.*`, `iam.locations.*`, `iam.organizations.*`). Each tool's invocation SHALL proxy via the existing HTTP client to the corresponding REST endpoint with the same body shape.

#### Scenario: MCP client lists write capabilities

- **WHEN** an MCP client invokes `tools/list` against `nexandro`
- **THEN** the response includes 43+ tools (existing reads + 43 writes); each write tool has a name matching `<namespace>.<op>`, a description, and a JSON schema for inputs

#### Scenario: MCP `recipes.create` invocation proxies to POST /recipes

- **WHEN** an MCP client calls `tools/call` with `name='recipes.create'` and a valid `arguments` payload
- **THEN** the MCP server forwards `POST /recipes` with the same body to the REST API; the response is the REST response unchanged (`{ data, missingFields, nextRequired }`)

### Requirement: every REST write endpoint returns `{ data, missingFields, nextRequired }`

Every endpoint listed in proposal.md SHALL return a response shaped as `{ data: T, missingFields: string[], nextRequired: string | null }`. `missingFields` is computed by domain logic (not validation) — fields that are required for the entity to leave draft state. `nextRequired` is one of the entries in `missingFields` representing the recommended next step for a conversational caller, or `null` when `missingFields` is empty.

#### Scenario: partial Recipe creation returns missingFields

- **WHEN** a caller posts `POST /recipes` with `name` only (no `lines`, no `portions`)
- **THEN** the response is HTTP 201 with body `{ data: { id, name, ... }, missingFields: ['lines', 'portions'], nextRequired: 'lines' }`

#### Scenario: complete Recipe creation returns empty missingFields

- **WHEN** a caller posts a Recipe with all required fields populated
- **THEN** the response is HTTP 201 with `missingFields: [], nextRequired: null`

#### Scenario: update endpoints carry the contract

- **WHEN** a caller PUTs a partial Recipe update
- **THEN** the response includes the recomputed `missingFields` reflecting the post-update state

### Requirement: writes accept Idempotency-Key for retry deduplication

The system SHALL accept an optional `Idempotency-Key` HTTP header on all write endpoints. When present, the system SHALL deduplicate retries within a 24-hour window using a Postgres-backed table keyed on `(organization_id, key)`. Identical retries SHALL replay the cached response; mismatched retries (same key, different body) SHALL return HTTP 409 `code: IDEMPOTENCY_KEY_REQUEST_MISMATCH`.

#### Scenario: replay returns cached response without re-executing

- **WHEN** a caller posts `POST /recipes` with `Idempotency-Key: abc123` AND the same key was used 1 minute prior with the same body
- **THEN** the response is the cached body+status from the first call; the database has only ONE Recipe row from the first attempt

#### Scenario: mismatch returns 409

- **WHEN** a caller posts `POST /recipes` with `Idempotency-Key: abc123` AND the same key was used previously with a DIFFERENT body
- **THEN** the response is HTTP 409 with `code: IDEMPOTENCY_KEY_REQUEST_MISMATCH`; the new request is NOT executed

#### Scenario: missing header passes through

- **WHEN** a caller posts a write without `Idempotency-Key`
- **THEN** the request executes normally; no idempotency row is recorded

#### Scenario: TTL cleanup

- **WHEN** the operations cron runs `DELETE FROM agent_idempotency_keys WHERE created_at < now() - interval '24 hours'`
- **THEN** rows older than 24 hours are removed; replays beyond 24h fall through to fresh execution

### Requirement: agent-routed writes emit forensic-grade audit events

For every write request whose `req.agentContext.viaAgent === true`, the system SHALL emit an `AGENT_ACTION_EXECUTED` event with payload `{ before, after, capability, executedBy, agentName, organizationId, aggregateType, aggregateId }`. `before` is the entity state captured BEFORE the handler runs (or `null` for create operations). `after` is the entity state returned by the handler (or `null` for delete operations).

#### Scenario: agent-mediated update captures before + after

- **WHEN** an agent calls `recipes.update` for recipe X with new portions=4
- **THEN** the audit_log row carries `payloadBefore: { portions: 2, ... }`, `payloadAfter: { portions: 4, ... }`, `capability: 'recipes.update'`, `actorKind: 'agent'`, `agentName: 'claude-desktop'`

#### Scenario: agent-mediated create captures null before + new after

- **WHEN** an agent calls `recipes.create` with a new payload
- **THEN** the audit_log row carries `payloadBefore: null`, `payloadAfter: { id, name, ... }`, `actorKind: 'agent'`

#### Scenario: agent-mediated delete captures before + null after

- **WHEN** an agent calls `recipes.delete`
- **THEN** the audit_log row carries `payloadBefore: { id, name, ... }`, `payloadAfter: null`

#### Scenario: direct REST/UI traffic emits the lean envelope unchanged

- **WHEN** a UI user calls `recipes.update` directly (no MCP layer)
- **THEN** the existing Wave 1.5 `AgentAuditMiddleware` emits `AGENT_ACTION_EXECUTED` with `viaAgent: false`; the BeforeAfterAuditInterceptor does NOT fire (because `viaAgent !== true`)

### Requirement: per-capability feature flags gate agent writes

The system SHALL define ~43 environment variables `NEXANDRO_AGENT_<NAMESPACE>_<OP>_ENABLED` (default `false`) in `apps/api/.env.example`. When a write request arrives with `req.agentContext.viaAgent === true` AND the corresponding flag is `false`, the system SHALL return HTTP 503 with `code: AGENT_CAPABILITY_DISABLED`. Direct REST/UI traffic SHALL NOT be affected by these flags.

#### Scenario: disabled capability rejects agent write

- **WHEN** `NEXANDRO_AGENT_RECIPES_DELETE_ENABLED=false` AND an agent calls `recipes.delete`
- **THEN** the response is HTTP 503 with `code: AGENT_CAPABILITY_DISABLED`; no audit row is written; no Recipe is deleted

#### Scenario: enabled capability accepts agent write

- **WHEN** `NEXANDRO_AGENT_RECIPES_UPDATE_ENABLED=true` AND an agent calls `recipes.update`
- **THEN** the request is executed normally; audit row is emitted

#### Scenario: UI traffic ignores the flags

- **WHEN** `NEXANDRO_AGENT_RECIPES_DELETE_ENABLED=false` AND a UI user calls `DELETE /recipes/:id` directly (no MCP layer)
- **THEN** the request is executed normally; the flag is ignored

#### Scenario: boot-time logging surfaces enabled flags

- **WHEN** `apps/api` boots
- **THEN** the startup logs include a list of all enabled agent capabilities (e.g. `Agent capabilities enabled: recipes.create, recipes.update, …`); operators can audit at a glance

### Requirement: trusted-internal-network mode persists until 3c lands

This slice SHALL inherit the trusted-internal-network deployment posture from `m2-mcp-server` (Wave 1.5). The `m2-mcp-server` spec requirement "unsigned agent header → 401" is NOT honoured by this slice; it is deferred to `m2-mcp-agent-registry-bench` (3c). The `apps/api/.env.example` and `packages/mcp-server-nexandro/README.md` SHALL document this trade-off explicitly.

#### Scenario: README warns of trusted-network requirement

- **WHEN** an operator reads `packages/mcp-server-nexandro/README.md`
- **THEN** a "Trusted-Internal-Network Mode" section warns against external exposure until `m2-mcp-agent-registry-bench` ships

#### Scenario: env example carries the same warning

- **WHEN** an operator reads `apps/api/.env.example`
- **THEN** the per-capability flag block is preceded by a comment block documenting the trusted-network assumption
