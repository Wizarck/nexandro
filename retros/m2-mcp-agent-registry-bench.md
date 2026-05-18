# retros/m2-mcp-agent-registry-bench.md

> **Slice**: `m2-mcp-agent-registry-bench` · **PR**: [#106](https://github.com/Wizarck/nexandro/pull/106) · **Merged**: 2026-05-07 · **Squash SHA**: `17b37c1`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.13 [3c] — third and final slice of the m2-mcp-extras split**. Closes the security and visibility gaps from 3a + 3b: per-agent Ed25519 signing replaces the trusted-internal-network shared-secret posture, SSE idempotency replay closes the chat retry path 3b deferred, and the first MCP-client benchmark harness lands as standalone tooling. **First-pass green CI** — only 3c of the three slices in this Wave didn't need a fix-commit cycle.

## What we shipped

**`agent_credentials` BC (apps/api):**
- Migration `0021_agent_credentials` (table + UNIQUE on `(organization_id, agent_name)` + role + length CHECKs).
- Entity / repository / service / controller under `apps/api/src/agent-credentials/`. Owner-only REST: POST / GET / GET/:id / PUT/:id/revoke / DELETE/:id.
- DTO surface treats `public_key` as write-only — never echoed back in any response. Operators inspecting via psql is the documented path for verifying which key was registered.
- Per-org isolation enforced at the service layer (every read + write scoped on `req.user.organizationId`).
- Soft-delete via `revokedAt`. Re-registering the same `agentName` after revoke requires hard-DELETE first because the unique index covers all rows; documented in the runbook.
- `AgentCredentialsModule` registers a `findById` resolver against `AuditResolverRegistry` so the existing 3a `BeforeAfterAuditInterceptor` captures `payload_before` on revoke + delete.
- 16 unit specs (10 service + 6 controller) + 1 INT spec covering full CRUD round-trip + per-org isolation + 409 on duplicate name + 403 on non-Owner.

**Ed25519 signing pipeline (apps/api):**
- `AgentSignatureMiddleware` (~190 LOC) verifies via `crypto.verify('ed25519', envelope, publicKey, sig)` builtin. Zero external deps; Node 16+ ships Ed25519 in `crypto`.
- Canonical envelope per ADR-AGENT-SIG-2: `method+'\n'+path+'\n'+ts+'\n'+nonce+'\n'+JSON.stringify(body)`. Body in the signature → tampered body fails verification.
- 5-min skew window (matches AWS SigV4). In-memory FIFO nonce LRU bounded at 10k entries; replay protection. Nonces stored only after a fully-valid request so an attacker can't fill the LRU with bogus entries.
- Default-OFF posture (per ADR-AGENT-SIG-3): `NEXANDRO_AGENT_SIGNATURE_REQUIRED` accepts three forms — `false` (default; legacy 3a unsigned path stays), `true` (global enforcement), or `<uuid>,<uuid>,...` (comma-separated org list for staged rollout).
- Verified context (per ADR-AGENT-SIG-4): when verification succeeds, `req.agentContext.agentName` is populated from the credential row, NOT from the `X-Agent-Name` header. Spoofing the agent identity via headers is structurally impossible after this slice.
- `AgentAuditMiddleware` made idempotent — when `req.agentContext.signatureVerified=true` is already set, the legacy header-based stamping is skipped. Eliminates the "header overrides verified context" failure mode.
- 11 unit + 1 INT spec.

**SSE idempotency replay (apps/api):**
- `IdempotencyMiddleware` extended to detect `text/event-stream` Content-Type at first `res.write` and capture frames in parallel to the existing JSON write path. The JSON path (3a) is bit-for-bit unchanged.
- Cache shape: `{kind:'sse-replay', text, finishReason, images?}` persisted to `agent_idempotency_keys.response_body` (jsonb). Per ADR-SSE-REPLAY-1: replay is "all-at-once" (one big `event: token` frame + done), NOT timing-faithful. Saves ~10× cache size for zero perceptible UX difference.
- Replay path emits `event: token` with full text + cached `event: image` frames + `event: done` with `replayed: true`. No call to Hermes.
- Mismatched `Idempotency-Key` payload returns HTTP 409 (matches 3a).
- `AgentChatService.cacheableTextForIdempotency()` extended — now also collects `event: image` payloads. 3b shipped text-only; 3c completes the multimodal scope per Gate D pick.
- 9 unit + 2 INT specs (replay path verified end-to-end + mismatch 409 verified end-to-end). The 3b INT assertion that previously asserted "Hermes called twice on retry" inverted to "Hermes called once + replayed body emitted on retry".

**MCP-client benchmark harness (`tools/mcp-bench/`):**
- Standalone Node CLI (sibling of rag-proxy + rag-corpus, NOT an npm workspace). Builds via `tsx`; no compile step needed for invocation. Per ADR-BENCH-1: tools/, not packages/.
- `Transport` interface with three concrete adapters: Hermes (HTTP+SSE), Claude Desktop (stdio JSON-RPC), OpenCode (stdio JSON-RPC). The two stdio adapters share a generic `StdioJsonRpcTransport` parameterised by command/args/env; the concrete `claudeDesktopTransport()` and `opencodeTransport()` factories are 5-line config wrappers.
- Read-only capability matrix per ADR-BENCH-2: `recipes.read`, `recipes.list`, `ingredients.search`, `menu-items.read`. Writes deferred to a future `bench-with-rollback-wrapper` follow-up.
- Stats: per-capability p50, p95, throughput, error rate over a configurable window with optional warmup.
- Markdown report writer per ADR-BENCH-3: one file per run at `docs/bench/<YYYY-MM-DD>-<client>.md`. Versioned in repo so `git log` shows performance evolution and `git diff` between two reports gives a per-run delta. No DB schema, no UI.
- Two synthetic baseline reports committed (Hermes + Claude Desktop) so the directory has anchor files for future `git diff` comparison.
- 13 vitest specs.

**Operator surface:**
- `apps/api/.env.example` — appended `NEXANDRO_AGENT_SIGNATURE_REQUIRED` flag with three-form documentation + `# IMPORTANT` rollout block.
- `docs/operations/m2-mcp-agent-registry-bench-runbook.md` (~290 lines): keypair generation 1-liner, registration via curl, day-N rollout, rollback, agent-side request-signing pseudocode, SSE replay (auto), bench invocation, 5 troubleshooting recipes.
- Cross-runbook forward pointers added to 3a + 3b runbooks.

## What surprised us

- **First-pass green CI.** Stage 1-5 landed in five sequential commits; the PR went from open to merge without a single fix-commit. Compare to 3a (5 CI iterations) and 3b (5 CI iterations). Two factors helped: (1) the slice was structurally narrower per concern (no streaming-handler audit trap; no Nest @Sse() wire format surprise; no schema-typed-vs-string-id surprise — all those were resolved in 3b's retro and the fixes propagated); (2) the bench harness lives outside apps/api so it has its own test loop and didn't risk regressing the apps/api INT specs.
- **Body-in-signature works fine for our payload sizes.** The early concern in design.md was that `JSON.stringify(req.body)` over the parsed body could drift from what the agent serialised. In practice the canonical-JSON convention ("stringify the same parsed object") makes this stable for typical structured payloads, and our payloads are small (chat <100 KB, MCP writes <10 KB). If we ever ship a streaming-body endpoint, a sha256-of-raw-bytes header (`X-Agent-Body-SHA256`) becomes the right move; for now nothing surfaced the issue.
- **The stdio JSON-RPC adapter is more general-purpose than the slice needed.** The Claude Desktop and OpenCode factories are essentially identical — they just point at different binaries with different argv. The shared `StdioJsonRpcTransport` parameterised by `{command, args, env}` is a clean abstraction; adding a fourth client is a 5-line factory. Worth flagging as a reusable building block.
- **Default-OFF flag with comma-list orgs is the right shape.** The literal `true|false|<uuid-list>` makes per-org rollout possible without schema changes, but DOES need operators to maintain a literal in env. A `agent_signature_required` boolean column on `organizations` would be more idiomatic; deferred to a follow-up because the env-var approach is simpler to roll back (delete the org id and restart vs UPDATE then restart). Worth revisiting if the rollout list ever exceeds ~10 orgs.

## What's next

- **Owner UI for `agent_credentials`** — `m2-agent-credentials-ui` filed. Today operators curl/Postman the REST surface; UI ships when integrators ask for it.
- **CLI for credential ops** — `m2-agent-credentials-cli` filed. `tools/agent-cli/register-agent.ts` would automate the keygen + register + secret-store flow; today the runbook documents the 1-liner.
- **CI-scheduled bench** — `m2-mcp-bench-ci` filed. Wire `tools/mcp-bench/` into a GitHub Actions matrix with regression detection (commit a baseline report, fail if p95 regresses by >X%). Today the maintainer runs the bench manually.
- **Keypair rotation** — `m2-agent-credential-rotation` filed. Today rotation is "revoke + re-register"; an explicit rotation API would be safer (atomic swap of public key without a window where neither is valid).
- **Multi-tenant SaaS / IdP integration** — `m3-agent-jwt-bridge` filed. Today the agent identity model is nexandro-internal (we manage credentials in our DB); if nexandro becomes multi-tenant SaaS with external IdPs in M3, JWT/OIDC bridging lands then.
- **Per-org `agent_signature_required` column** — escape hatch from the env-var staged rollout once the list grows.

## Process notes

- **Cadence A worked again.** Five stages, five commits, one PR. Total wall-clock was longer than 3b (~5-7 days estimated; actual was within range) but the bench harness was a bigger chunk of the work than the proposal anticipated — three transport adapters + smoke testing without real binaries took meaningful time.
- **CI green first-pass after 5 iterations on 3b.** Two slices in a row would have been a coincidence; three suggests the lessons codified mid-3b stuck. Notable lessons that paid off this slice: streaming-handler audit emission (3b memory) made me NOT use `@AuditAggregate` on the chat path again; SSE wire-format MessageEvent shape (3b memory) made the Hermes-relay frame format right on the first try; UUID schema constraint (3b memory) made me aware that any new aggregate type needed a UUID-shaped id. **Three CI cycles avoided.**
- **Per-package vitest is fast.** `tools/mcp-bench/` has its own vitest config and ran 13 tests in 292ms. Worth replicating for any future `tools/*` package — the rag-proxy + rag-corpus precedent (Python pytest) plus this one (Node vitest) cement the convention: standalone toolchain per `tools/<name>/`.
- **No INT-spec adjustments needed for the new BC.** Stage 1 passed CI INT first try. The 3b TestAppModule pattern (TypeOrmModule + SharedModule + TestAuthMiddleware + agent-credentials/audit-log/idempotency wiring) is now well-established; copying-it-and-adjusting was a 10-minute exercise.
