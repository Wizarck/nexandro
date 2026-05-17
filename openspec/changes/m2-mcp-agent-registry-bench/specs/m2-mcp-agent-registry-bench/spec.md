# Spec: m2-mcp-agent-registry-bench

## ADDED Requirements

### Requirement: Per-agent identity via Ed25519 signing

The system SHALL accept signed agent requests carrying `X-Agent-Id`, `X-Agent-Signature`, `X-Agent-Timestamp`, `X-Agent-Nonce` headers. Verification uses Ed25519 over the canonical envelope `method+'\n'+path+'\n'+timestamp+'\n'+nonce+'\n'+body`. The public key for verification is loaded from `agent_credentials` keyed by `X-Agent-Id`.

#### Scenario: valid signed request authenticates as the credentialed agent

- **WHEN** a request carries valid `X-Agent-*` headers AND the credential exists AND `revoked_at IS NULL` AND timestamp is within the 5-minute skew window AND the nonce has not been seen
- **THEN** `req.agentContext = { viaAgent: true, agentName: <agent_credentials.agent_name>, signatureVerified: true }` is stamped server-side BEFORE downstream guards or interceptors run

#### Scenario: invalid signature returns 401 when flag is on

- **WHEN** `NEXANDRO_AGENT_SIGNATURE_REQUIRED=true` (or includes the request's organizationId) AND `X-Agent-Signature` does not verify against the registered public key
- **THEN** the response is HTTP 401 `code: AGENT_SIGNATURE_INVALID`; the request never reaches the route handler

#### Scenario: expired timestamp returns 401

- **WHEN** `X-Agent-Timestamp` is more than 5 minutes outside the server's clock
- **THEN** the response is HTTP 401 `code: AGENT_SIGNATURE_EXPIRED`

#### Scenario: replayed nonce returns 401

- **WHEN** the same `X-Agent-Nonce` arrives twice within the skew window
- **THEN** the second request is rejected with HTTP 401 `code: AGENT_SIGNATURE_NONCE_REPLAYED`

#### Scenario: missing headers + flag off keeps the legacy 3a path

- **WHEN** `NEXANDRO_AGENT_SIGNATURE_REQUIRED=false` AND no `X-Agent-Signature` header is present
- **THEN** the request is processed under the 3a unsigned path: `X-Via-Agent` + `X-Agent-Name` + `X-Agent-Capability` headers are honoured as today; `req.agentContext.signatureVerified=false`; a deprecation log line is emitted

#### Scenario: missing headers + flag on rejects

- **WHEN** the flag is on for the request's organization AND no `X-Agent-Signature` header is present AND `X-Via-Agent` claims agent attribution
- **THEN** the response is HTTP 401 `code: AGENT_SIGNATURE_REQUIRED`

#### Scenario: revoked credential rejects

- **WHEN** `agent_credentials.revoked_at IS NOT NULL` for the requested `X-Agent-Id`
- **THEN** the response is HTTP 401 `code: AGENT_CREDENTIAL_REVOKED`

#### Scenario: tampered body fails verification

- **WHEN** an attacker captures a valid signed request and modifies its body
- **THEN** the signature verification fails and the response is HTTP 401 `code: AGENT_SIGNATURE_INVALID`

### Requirement: `agent_credentials` REST surface (Owner only)

The system SHALL expose a CRUD REST API under `/agent-credentials` restricted to the `OWNER` role. All write operations SHALL emit one `AGENT_CREDENTIAL_*` audit row via the existing `BeforeAfterAuditInterceptor`.

#### Scenario: create credential

- **WHEN** an Owner POSTs `{ agentName, publicKey, role }`
- **THEN** the response is HTTP 201 `{ data: { id, agentName, role, createdAt }, missingFields: [], nextRequired: null }`; the `public_key` is NOT echoed back in the response; one audit row is written with `event_type=AGENT_CREDENTIAL_CREATED`

#### Scenario: duplicate agentName per-org rejects

- **WHEN** an Owner POSTs an `agentName` that already exists for their organization (regardless of revoked_at status)
- **THEN** the response is HTTP 409 `code: AGENT_NAME_TAKEN`

#### Scenario: list credentials for the calling org only

- **WHEN** an Owner GETs `/agent-credentials`
- **THEN** the response carries credentials WHERE `organization_id = req.user.organizationId`; rows from other orgs are never visible (per-org isolation)

#### Scenario: revoke credential

- **WHEN** an Owner PUTs `/agent-credentials/:id/revoke`
- **THEN** `revoked_at` is set to `now()`; the row is preserved (soft-delete); audit row `AGENT_CREDENTIAL_REVOKED`

#### Scenario: non-Owner forbidden

- **WHEN** a Manager or Staff calls any `/agent-credentials/*` endpoint
- **THEN** the response is HTTP 403

### Requirement: SSE idempotency replay for chat

The system SHALL cache `text/event-stream` responses for endpoints with an `Idempotency-Key`. On replay (same key + same body hash within 24h), the system SHALL emit a synthetic SSE stream from the cached envelope WITHOUT re-invoking the upstream Hermes (or other LLM provider).

#### Scenario: first turn populates the cache

- **WHEN** a client POSTs `/agent-chat/stream` with `Idempotency-Key: K1` AND a valid body
- **THEN** Hermes is called exactly once; the response is the live SSE stream; one row is inserted into `agent_idempotency_keys` with `response_body = { kind: 'sse-replay', text, finishReason, images? }`

#### Scenario: replay returns cached envelope

- **WHEN** the same client retries `POST /agent-chat/stream` with the same `Idempotency-Key: K1` AND the same body within 24 hours
- **THEN** Hermes is NOT called; the response is HTTP 200 `text/event-stream` carrying one `event: token` frame with the full cached `text` + zero or more `event: image` frames + one `event: done` frame; exactly one new audit row is written (the audit emission stays per-turn) marked `replayed: true` in `payload_after`

#### Scenario: idempotency mismatch returns 409

- **WHEN** a client retries with the same `Idempotency-Key` and a DIFFERENT body
- **THEN** the response is HTTP 409 `code: IDEMPOTENCY_KEY_REQUEST_MISMATCH`; the new request is NOT executed

#### Scenario: TTL expiry refreshes

- **WHEN** the cached row is older than 24h
- **THEN** the next request with the same key is processed as a fresh turn (Hermes is called); the cache row is updated

#### Scenario: image events are replayed

- **WHEN** the cached envelope carries `images: [...]`
- **THEN** the synthetic stream emits one `event: image` per cached image, in the original order, between the `event: token` and `event: done` frames

### Requirement: MCP-client benchmark harness

The system SHALL provide a runnable Node CLI under `tools/mcp-bench/` that drives a fixed read-only capability matrix against three MCP transport adapters (Hermes, Claude Desktop, OpenCode) and emits a markdown report.

#### Scenario: invocation produces a report

- **WHEN** an operator runs `pnpm exec tsx tools/mcp-bench/run.ts --client=hermes --capabilities=read,list --duration=60s`
- **THEN** a markdown file is written to `docs/bench/<YYYY-MM-DD>-hermes.md` containing: run metadata (client name, version, transport, env, nexandro git SHA, ISO8601 timestamp); a table with rows per capability and columns p50, p95, error rate, throughput; the process exits zero on success

#### Scenario: transport spawn failure surfaces cleanly

- **WHEN** a transport adapter (e.g. claude-desktop stdio) cannot spawn its child process
- **THEN** the bench writes a partial report annotated `INCOMPLETE — <reason>` and exits non-zero; the harness does NOT throw uncaught exceptions

#### Scenario: capabilities are read-only

- **WHEN** the bench runs with the default capability set
- **THEN** every invoked capability is a GET-equivalent (read or list); no MCP write capability is invoked

### Requirement: Default-OFF flag posture

The system SHALL ship signing infrastructure with `NEXANDRO_AGENT_SIGNATURE_REQUIRED=false` by default. Per-org rollout SHALL flip the flag once that org's agents have registered their public keys.

#### Scenario: comma-separated org list

- **WHEN** `NEXANDRO_AGENT_SIGNATURE_REQUIRED` is set to a comma-separated list of UUIDs
- **THEN** signing is required only for requests whose `req.user.organizationId` is in the list; other orgs continue to use the legacy 3a unsigned path

#### Scenario: literal `true` enforces globally

- **WHEN** the flag is the literal string `true`
- **THEN** signing is required for all agent-flagged requests across every org

#### Scenario: rollback by removing the org id

- **WHEN** the flag previously contained an org id and that id is removed
- **THEN** after restart, that org's agent-flagged requests fall back to the unsigned legacy path; the `agent_credentials` rows persist and reactivate when the flag is flipped back
