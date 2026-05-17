# m2-mcp-agent-chat-widget — operations runbook

> Wave 1.13 [3b]. Companion: `docs/operations/m2-mcp-write-capabilities-runbook.md`.

This runbook covers the web chat surface added by Wave 1.13 [3b]. The feature
is dual-flagged (apps/api + apps/web) and dual-secret (apps/api shares a
secret with the Hermes `web_via_http_sse` platform). All defaults are off.

## What it is

- A first-party chat widget mounted in `apps/web` at the layout level.
- A NestJS SSE relay (`POST /agent-chat/stream`) in `apps/api` that proxies
  user messages to a Hermes `web_via_http_sse` platform and streams the
  agent's response back as SSE events.
- A new generic Hermes platform `web_via_http_sse` (filed upstream as
  [NousResearch/hermes-agent#20911](https://github.com/NousResearch/hermes-agent/pull/20911);
  shipped via `eligia/hermes-agent:wamba` overlay until merged).

## Architecture (recap)

```
[browser]                       <-- React + AgentChatWidget
    v POST /agent-chat/stream + (Idempotency-Key)
[apps/api]                      <-- relay + audit + idempotency + bank_id resolver
    v POST /web/{session_id} (X-Web-Auth-Secret)
[hermes web_via_http_sse]       <-- generic platform; bank_id forwarded into Hindsight
    v
[Anthropic / OpenRouter LLM]
```

## Pre-flight

1. **Generate the shared secret** (or rotate the existing one):
   ```bash
   openssl rand -hex 32
   ```
   The same value is used on both sides as `NEXANDRO_HERMES_AUTH_SECRET`
   (apps/api) and `WEB_VIA_HTTP_SSE_AUTH_SECRET` (Hermes container).

2. **Hermes overlay rebuild** (only when bringing up a new VPS or rotating
   to a fresh upstream image):
   ```bash
   ssh eligia-vps
   cd /opt/hermes/wamba_build
   docker build -f Dockerfile.eligia-overlay -t eligia/hermes-agent:wamba .
   ```
   The overlay's COPY layers patch `gateway/platforms/web_via_http_sse.py`
   on top of the upstream image. The base SHA in the Dockerfile must
   contain the `agent.account_usage` module — bumping the base SHA without
   syncing the overlay copies is what causes the
   "ModuleNotFoundError: No module named 'agent.account_usage'" startup
   crash documented in the slice retro.

3. **Hermes env (compose)**:
   ```yaml
   environment:
   - WEB_VIA_HTTP_SSE_AUTH_SECRET=${WEB_VIA_HTTP_SSE_AUTH_SECRET}
   - WEB_VIA_HTTP_SSE_HOST=127.0.0.1
   - WEB_VIA_HTTP_SSE_PORT=8644
   - WEB_VIA_HTTP_SSE_PATH=/web
   - WEB_VIA_HTTP_SSE_ALLOWED_ORIGINS=
   ```
   (Allowed origins stays empty when only apps/api talks to Hermes —
   the relay is server-to-server, no browser CORS path.)

4. **apps/api env**:
   ```env
   NEXANDRO_AGENT_ENABLED=true
   NEXANDRO_HERMES_BASE_URL=http://127.0.0.1:8644
   NEXANDRO_HERMES_AUTH_SECRET=<same value as Hermes>
   ```

5. **apps/web env (compile-time, Vite)**:
   ```env
   VITE_NEXANDRO_AGENT_ENABLED=true
   ```
   Vite compiles this into the bundle, so a rebuild is needed after a flip.

## Smoke

From the VPS, hit Hermes directly first:

```bash
SECRET=$(grep WEB_VIA_HTTP_SSE_AUTH_SECRET /opt/eligia/eligia-core/secrets/secrets.env | cut -d= -f2)
curl -s -o /dev/null -w "HTTP %{http_code}\n" \
  -H "Content-Type: application/json" \
  -H "X-Web-Auth-Secret: $SECRET" \
  -X POST \
  http://127.0.0.1:8644/web/smoke-1 \
  -d '{"message":{"type":"text","content":"hi"},"bank_id":"nexandro-smoke","user_attribution":{"user_id":"u","display_name":"Smoke"}}'
# Expect HTTP 200
```

Then via apps/api (assumes auth is wired in this env):

```bash
curl -N -X POST http://localhost:3000/agent-chat/stream \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"message":{"type":"text","content":"hi"}}'
# Expect text/event-stream with token frames + done
```

## Production rollout

1. Deploy the apps/api with the env vars set.
2. Restart apps/api container.
3. Build apps/web with `VITE_NEXANDRO_AGENT_ENABLED=true` baked in;
   deploy the static bundle.
4. Verify in the browser: open the app, see the FAB bottom-right, click
   it, send a test message, observe streaming reply.

## Rollback

The fastest rollback flips the apps/api flag — the apps/web widget will
get 404s and surface "agent chat not enabled" as an inline error:

```bash
# apps/api side
NEXANDRO_AGENT_ENABLED=false
# restart apps/api
```

To remove the FAB from the UI entirely, also rebuild apps/web with
`VITE_NEXANDRO_AGENT_ENABLED=false` and redeploy.

The Hermes platform itself stays running — it is generic and harmless
when no consumer is sending traffic.

## Auth secret rotation

The shared secret rotates in three steps:

1. Generate the new value: `openssl rand -hex 32`.
2. Update `WEB_VIA_HTTP_SSE_AUTH_SECRET` in the Hermes compose (or the SOPS
   secret backing it) and restart the Hermes container.
3. Update `NEXANDRO_HERMES_AUTH_SECRET` in the apps/api env and restart
   apps/api.

There is a brief window between steps 2 and 3 where apps/api → Hermes
returns 401. In-flight chat turns will surface an inline error to the
user; subsequent retries succeed once both ends carry the new value.

## Troubleshooting

### Browser sees the FAB but `/agent-chat/stream` returns 404
- `NEXANDRO_AGENT_ENABLED` is unset / false in apps/api. Flip it on
  + restart.
- Or apps/api is on a stale image without the `agent-chat` module —
  rebuild and redeploy.

### Streaming starts but never completes / hangs
- Check `NEXANDRO_HERMES_BASE_URL` resolves to the Hermes container.
  In the eligia VPS overlay it's `http://127.0.0.1:8644`; from a different
  network, use a tunnel.
- The relay enforces a 60 s deadline per turn (see
  `apps/api/src/agent-chat/application/agent-chat.service.ts`
  `HERMES_DEFAULT_TIMEOUT_MS`). Genuinely-slow Hermes turns surface as
  `event: error` with `code: HERMES_TRANSPORT_ERROR`.

### Audit row missing for a chat turn
- Confirm the BeforeAfterAuditInterceptor fired: the controller stamps
  `req.agentContext = { viaAgent: true, agentName: 'hermes-web', capabilityName: 'chat.message' }`
  before the response. If a request 4xx-ed before the controller body
  ran, no audit row is expected (RBAC denials, idempotency rejections).

### "ModuleNotFoundError: No module named 'agent.account_usage'" on Hermes startup
- The Hermes overlay is patching files from a sync that imports a module
  the base image doesn't have. Either bump the base image SHA in
  `Dockerfile.eligia-overlay` to a newer upstream or re-extract the
  overlay files from the matching base SHA. See the slice retro for the
  workaround pattern.

### Bank id collisions
- Two organisations sharing a name slugify to the same `bank_id` and
  share a Hindsight bank. To split them, add a uniqueness column to the
  organisation table (M3+ multi-tenant work) and amend
  `AgentChatService.resolveBankId` to consult it. As of M2, this is
  documented behaviour, not a bug — single-tenant deployments dominate.

### Trusted-internal-network reminder
- The shared secret is **infrastructure-level**, not per-user. Anyone
  with the secret can post on behalf of any user attribution they
  supply. Per-user signing is deferred to slice 3c
  (`m2-mcp-agent-registry-bench`). Until then, do NOT expose
  `/agent-chat/stream` to the public internet without an additional auth
  layer.

## See also (Wave 1.13 [3c] update)

- `docs/operations/m2-mcp-agent-registry-bench-runbook.md`:
  - Per-agent Ed25519 signing replaces the Hermes shared-secret trust
    posture for production rollout.
  - SSE idempotency replay is now automatic. A retry with the same
    `Idempotency-Key` and same body returns the cached final reply
    without re-invoking Hermes.
