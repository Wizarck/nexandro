# m2-mcp-agent-registry-bench — operations runbook

> Wave 1.13 [3c]. Companion: `m2-mcp-write-capabilities-runbook.md`,
> `m2-mcp-agent-chat-widget-runbook.md`.

This slice closes the security and visibility gaps left open by 3a and 3b:

- **Per-agent Ed25519 signing** replaces the trusted-internal-network
  posture. Each agent registers its public key under
  `agent_credentials`; apps/api verifies `X-Agent-Signature` against
  the row before trusting agent attribution.
- **SSE idempotency replay** caches chat turns at the middleware layer
  so retries with the same `Idempotency-Key` replay without recalling
  Hermes (cuts cost + latency on accidental double-taps).
- **MCP-client benchmark harness** lives under `tools/mcp-bench/` and
  drives a fixed read-only capability matrix against three transports
  (Hermes / Claude Desktop / OpenCode), emitting a markdown report.

## Architecture (recap)

```
[agent client]                       [apps/api pipeline]
     │                                     │
     │ X-Agent-Id            ┌─────────────▼──────────────┐
     │ X-Agent-Signature     │ AgentSignatureMiddleware   │
     │ X-Agent-Timestamp     │  ↓ verifies sig            │
     │ X-Agent-Nonce         │  ↓ stamps req.agentContext │
     │ + body                │  ↓ 401 if invalid + flag   │
     ├──────────────────────►│                            │
                             │ AgentAuditMiddleware       │
                             │ IdempotencyMiddleware (SSE-aware) │
                             │ Guards (RBAC + capability) │
                             │ BeforeAfterAuditInterceptor│
                             └────────────────────────────┘
```

## Day-1 install (no enforcement)

The slice ships with `NEXANDRO_AGENT_SIGNATURE_REQUIRED=false` by
default. After deploying, integrators continue to use the legacy
unsigned X-Agent-Name path until you flip the flag per-org.

```bash
# apps/api .env (production)
NEXANDRO_AGENT_SIGNATURE_REQUIRED=false
```

## Generating an agent keypair

Each agent generates its own Ed25519 keypair. The private key STAYS on
the agent's host; only the SPKI/DER-encoded public key gets uploaded to
nexandro.

```bash
node -e "
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
fs.writeFileSync('agent.key', privateKey.export({type:'pkcs8', format:'pem'}));
console.log(publicKey.export({type:'spki', format:'der'}).toString('base64'));
"
```

Save the printed string — that goes into `POST /agent-credentials`.
Save `agent.key` somewhere the agent can read it (e.g. SOPS-managed
on the agent's host).

## Registering a credential

Owners only. Either curl directly or use Postman:

```bash
SESSION=<your auth cookie / bearer>
curl -X POST https://api.example.com/agent-credentials \
  -H "Cookie: $SESSION" \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "hermes",
    "publicKey": "MCowBQYDK2VwAyEA...base64...",
    "role": "OWNER"
  }'
```

Response:
```json
{
  "data": {
    "id": "<uuid>",
    "agentName": "hermes",
    "role": "OWNER",
    "createdAt": "2026-05-07T...",
    "revokedAt": null
  },
  "missingFields": [],
  "nextRequired": null
}
```

The `id` is the value the agent sends as `X-Agent-Id` on every
subsequent signed request.

## Day-N rollout (per-org enforcement)

Once an org's agents are all registered, flip the flag for that org:

```bash
# apps/api .env — append the org id (UUID)
NEXANDRO_AGENT_SIGNATURE_REQUIRED=11111111-1111-4111-8111-111111111111
```

Multiple orgs:
```bash
NEXANDRO_AGENT_SIGNATURE_REQUIRED=org-uuid-1,org-uuid-2,org-uuid-3
```

Then restart apps/api. Unsigned agent requests for those orgs now 401.

### Verifying enforcement

```bash
# Should return 401 AGENT_SIGNATURE_REQUIRED
curl -X POST https://api.example.com/recipes \
  -H "X-Via-Agent: true" \
  -H "Cookie: $SESSION" \
  -d '{...}'
```

```bash
# Audit drift query — flags requests still coming through unsigned
psql -c "
SELECT count(*), agent_name
FROM audit_log
WHERE event_type = 'AGENT_ACTION_EXECUTED'
  AND actor_kind = 'agent'
  AND created_at > now() - interval '24 hours'
  -- unsigned rows DON'T carry signatureVerified=true in payload_after;
  -- the field is intentionally omitted for those.
GROUP BY agent_name;
"
```

## Rollback (per-org)

Remove the org id from `NEXANDRO_AGENT_SIGNATURE_REQUIRED` and
restart. The `agent_credentials` rows persist; flipping back later
re-activates them without re-registration.

## Key rotation (Wave 1.17)

Use `POST /agent-credentials/:id/rotate` for **planned key turnover**
(quarterly hygiene, regulatory cadence, vendor rotation policy). The
endpoint UPDATEs the existing row's `public_key` in a single
transaction. The row's `id`, `agentName`, `role`, and `createdAt`
remain — agents reconfigure only the new private key, NOT the
`X-Agent-Id` header.

```bash
# 1. Generate the new keypair locally
NEW_PUB=$(node -e "
  const {generateKeyPairSync}=require('crypto');
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  console.log(publicKey.export({type:'spki',format:'der'}).toString('base64'));
")

# 2. Rotate (Owner only)
curl -X POST -H "Authorization: Bearer $OWNER_JWT" \
  -H 'Content-Type: application/json' \
  -d "{\"publicKey\":\"$NEW_PUB\"}" \
  https://api.example.com/agent-credentials/<id>/rotate

# 3. Roll out the new private key to the agent's secret store + restart it
```

The audit_log will carry one `AGENT_ACTION_FORENSIC` row with
`payload_before.publicKey` (old) and `payload_after.publicKey` (new),
attributed to the Owner who triggered the rotation. Auditors get a
forensic timeline of every key change without polling the live row.

**When to rotate vs revoke + re-register:**

| Situation                                  | Use         |
|---|---|
| Planned hygiene / quarterly turnover       | Rotation    |
| Suspected key compromise — agent suspect   | Revoke (instant invalidation) + re-register |
| Re-using an existing `agentName`           | Revoke + DELETE + register (rotation refuses revoked rows) |
| Agent identity itself is being retired     | Revoke (no re-register; row preserved for audit) |

**Caveat: in-flight requests signed with the old key.** The swap is
atomic at the DB level, but a request signed with the old private key
that arrives mid-rotation fails verification. Restart the agent
immediately after rotation so its signing pipeline picks up the new
private key. Acceptable for planned rotations; not acceptable for
emergency invalidation (use revoke for those — see the table above).

## Signing a request (agent side)

```bash
# Pseudocode (Node)
const { createPrivateKey, sign } = require('crypto');
const fs = require('fs');

const privateKey = createPrivateKey(fs.readFileSync('agent.key'));
const ts = new Date().toISOString();
const nonce = crypto.randomBytes(16).toString('hex');
const method = 'POST';
const path = '/recipes';
const body = JSON.stringify({ name: 'New Recipe' });

const envelope = `${method}\n${path}\n${ts}\n${nonce}\n${body}`;
const signature = sign(null, Buffer.from(envelope, 'utf8'), privateKey).toString('base64');

fetch(`https://api.example.com${path}`, {
  method,
  headers: {
    'content-type': 'application/json',
    'x-via-agent': 'true',
    'x-agent-id': '<credential id from registration>',
    'x-agent-signature': signature,
    'x-agent-timestamp': ts,
    'x-agent-nonce': nonce,
  },
  body,
});
```

## SSE idempotency replay

The IdempotencyMiddleware now wraps `text/event-stream` responses (in
parallel to its 3a JSON write path). Behaviour:

- First chat turn with `Idempotency-Key: K1` → Hermes called once, response
  streamed live, captured frames persisted as
  `{kind:'sse-replay', text, finishReason, images?}` in
  `agent_idempotency_keys.response_body`.
- Retry within 24h with same key + same body → Hermes NOT called; response
  is a synthetic SSE stream (one `event: token` with full text, then
  any cached `event: image` frames, then `event: done` with
  `replayed: true`).
- Retry with same key + different body → HTTP 409
  `IDEMPOTENCY_KEY_REQUEST_MISMATCH` (matches 3a).

There's nothing to enable — replay is automatic on any SSE endpoint.

## Bench harness

```bash
cd tools/mcp-bench
pnpm install
pnpm exec tsx src/run.ts \
  --client=hermes \
  --capabilities=read,list,search \
  --duration=60s
```

Output lands in `docs/bench/<YYYY-MM-DD>-<client>.md` versioned in repo.
See `tools/mcp-bench/README.md` for adapter env vars and how to add a
new transport.

## Troubleshooting

### 401 AGENT_SIGNATURE_REQUIRED

The flag is on for this org and the request didn't carry
`X-Agent-Signature`. Either the agent was never updated to send signed
headers, or the agent crashed and restarted without picking up its
private key.

### 401 AGENT_SIGNATURE_INVALID

Three possibilities, in order of frequency:
1. Body serialisation drift — agent JSON-stringifies differently than
   apps/api parses. Verify the agent uses the canonical
   `JSON.stringify(body)` over the parsed body, NOT the raw bytes.
2. Path mismatch — apps/api's `req.originalUrl` includes query strings;
   the agent must too.
3. Public key drift — the registered key doesn't match the private key
   the agent signed with. Re-register.

### 401 AGENT_SIGNATURE_EXPIRED

Clock skew between agent host and apps/api host exceeds 5 minutes.
Sync NTP on both ends.

### 401 AGENT_SIGNATURE_NONCE_REPLAYED

The agent re-used a nonce within the 5-minute window. Verify the agent
generates a fresh `crypto.randomBytes(16)` per request, not per session.

### Bench: INCOMPLETE — spawn error

The Claude Desktop / OpenCode binary path is wrong. Set
`CLAUDE_DESKTOP_BIN` / `OPENCODE_BIN` to the absolute path. On Windows,
escape backslashes or use forward slashes.

### Bench: low throughput vs Hermes baseline

Compare `git diff docs/bench/2026-XX-XX-{a,b}-baseline.md`. Expected
differences come from network RTT (Hermes is local-loopback on the VPS;
Claude Desktop on a laptop pays WAN RTT). If a regression appears
within the same client, check apps/api logs for tool-call timeouts.

## Forward pointers

- 3a runbook (`m2-mcp-write-capabilities-runbook.md`) — write surface +
  capability flags. The signing flag from this slice gates authentication
  ahead of the per-capability flags from 3a.
- 3b runbook (`m2-mcp-agent-chat-widget-runbook.md`) — chat surface +
  Hermes integration. SSE replay from this slice is automatic; nothing to
  configure beyond Idempotency-Key on the client.
- Filed follow-ups (in proposal.md):
  - `m2-agent-credentials-ui` — Owner UI screen for credential CRUD.
  - `m2-agent-credentials-cli` — `tools/agent-cli/register-agent.ts`.
  - `m2-mcp-bench-ci` — wire the bench harness into a scheduled CI workflow.
  - `m2-agent-credential-rotation` — keypair rotation API.
  - `m3-agent-jwt-bridge` — IdP integration if multi-tenant SaaS lands.

## Trusted-internal-network reminder

Until `NEXANDRO_AGENT_SIGNATURE_REQUIRED` is on for an org, agent
attribution remains spoofable via `X-Agent-Name` per the 3a posture.
Once flipped on, attribution comes from the verified credential row;
header-based spoofing is rejected at the middleware.
