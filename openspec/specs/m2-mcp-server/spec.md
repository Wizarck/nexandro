## ADDED Requirements

### Requirement: Public REST API has full capability parity with UI

The system SHALL ensure every Recipe / MenuItem / Ingredient capability reachable via the UI is also reachable via REST. UI-only actions SHALL NOT exist.

#### Scenario: Every UI write action has a REST equivalent
- **WHEN** an audit checks the list of UI write actions against published REST endpoints
- **THEN** every UI action has a documented REST endpoint with equivalent behaviour

#### Scenario: REST endpoints are documented and discoverable
- **WHEN** a developer queries the OpenAPI / Swagger surface
- **THEN** the documentation lists every endpoint with its inputs, outputs, RBAC requirements, and any `missingFields`/`nextRequired` contracts

### Requirement: API write responses include missingFields and nextRequired

The system SHALL include `missingFields` and `nextRequired` in every write-endpoint response so conversational callers can determine what's needed to complete partial state.

#### Scenario: Partial Recipe creation returns missingFields
- **WHEN** a caller posts a Recipe with `name` only (no lines yet)
- **THEN** the response is `{id, missingFields: ["lines"], nextRequired: "lines"}` with HTTP 201 (resource created in draft state)

#### Scenario: Complete Recipe returns empty missingFields
- **WHEN** a caller posts a Recipe with all required fields populated
- **THEN** the response is `{id, missingFields: [], nextRequired: null}` with HTTP 201

#### Scenario: Update endpoints also return the contract
- **WHEN** a caller PUTs a partial update
- **THEN** the response includes `missingFields` for fields still required + `nextRequired` for the recommended next step

### Requirement: System operates in standalone or agent-integrated mode via configuration

The system SHALL operate in one of two modes determined by the `NEXANDRO_AGENT_ENABLED` configuration flag. Switching modes SHALL require only configuration change, no code change. Switch SHALL complete in ≤30 minutes.

#### Scenario: Standalone mode (default)
- **WHEN** `NEXANDRO_AGENT_ENABLED=false`
- **THEN** the MCP server is not deployed; UI hides AgentChatWidget; API ignores `X-Via-Agent` headers (no audit fields populated)

#### Scenario: Agent-integrated mode
- **WHEN** `NEXANDRO_AGENT_ENABLED=true`
- **THEN** the MCP server `nexandro` is deployed; UI exposes optional AgentChatWidget; API honours `X-Via-Agent` + `X-Agent-Name` headers

#### Scenario: Switch standalone → agent-integrated
- **WHEN** an operator changes the flag from `false` to `true` and restarts the stack
- **THEN** within 30 minutes the MCP server is reachable, the UI surfaces the widget, and the audit middleware populates agent fields

### Requirement: MCP server `nexandro` exposes Recipes, MenuItems, Ingredients

The system SHALL expose an MCP-standard server named `nexandro` that any MCP-compatible client can connect to. Capabilities SHALL include Recipes, MenuItems, Ingredients with their full CRUD parity from the REST API.

#### Scenario: MCP client connects and lists capabilities
- **WHEN** an MCP client (Hermes, Claude Desktop, custom) connects to the `nexandro` server
- **THEN** the server responds with capability descriptors for `recipes.*`, `menu-items.*`, `ingredients.*` including read and write operations

#### Scenario: MCP client invokes a Recipe creation
- **WHEN** the client calls `recipes.create` with valid payload
- **THEN** the MCP server proxies to the REST API; the resulting Recipe is persisted; the response includes the same `missingFields`/`nextRequired` contract as the REST API

### Requirement: Audit fields on agent-mediated actions

The system SHALL record `executedBy`, `viaAgent=true`, `agentName=<agent>` in `audit_log` for every API call routed via the MCP layer. The human user SHALL remain responsible per the hybrid identity model.

#### Scenario: Agent-mediated action populates audit fields
- **WHEN** an MCP client makes a Recipe edit on behalf of user U via agent A
- **THEN** the resulting `audit_log` row carries `executedBy=U`, `viaAgent=true`, `agentName=A`, plus the standard `at`, `action`, `resourceId` fields

#### Scenario: Direct UI action does not set agent fields
- **WHEN** a user U makes the same edit through the UI without an agent
- **THEN** the `audit_log` row carries `executedBy=U`, `viaAgent=false`, `agentName=null`

#### Scenario: Unsigned agent header is rejected
- **WHEN** a request arrives with `X-Via-Agent` + `X-Agent-Name` headers but lacks valid signature against the agent registry
- **THEN** the request is rejected with 401 Unauthorized; no audit row is written

### Requirement: Lint rule blocks agent-vendor imports from apps/api

The system SHALL enforce zero compile-time dependency from `apps/api/` to agent vendor packages via an ESLint rule. CI SHALL fail on violation.

#### Scenario: Direct vendor import blocked
- **WHEN** a developer adds `import { ... } from '@modelcontextprotocol/sdk'` in `apps/api/src/...`
- **THEN** ESLint reports an error with the rule name `no-import-agent-vendors-from-api`; CI rejects the PR

#### Scenario: MCP package is allowed to import vendor SDK
- **WHEN** the same import appears in `packages/mcp-server-nexandro/src/...`
- **THEN** ESLint passes; CI accepts (the rule is scoped to `apps/api/` only)

### Requirement: Dual-mode CI runs standalone and agent-integrated smokes per PR

The system SHALL run two CI smoke pipelines per PR: one with `NEXANDRO_AGENT_ENABLED=false` (standalone) and one with `=true` (agent-integrated).

#### Scenario: Both pipelines pass
- **WHEN** a PR is opened that touches Recipe / MenuItem / Ingredient code
- **THEN** both standalone and agent-integrated CI jobs run; both must pass for merge

#### Scenario: Standalone-only test failure blocks merge
- **WHEN** a PR breaks the standalone smoke test (regression in default mode)
- **THEN** CI marks the standalone job as failed; merge is blocked

#### Scenario: Agent-integrated test failure also blocks
- **WHEN** a PR works in standalone but breaks the agent-integrated smoke (e.g. middleware crash on agent header)
- **THEN** CI marks the agent-integrated job as failed; merge is blocked
