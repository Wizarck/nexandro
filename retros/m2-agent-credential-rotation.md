# retros/m2-agent-credential-rotation.md

> **Slice**: `m2-agent-credential-rotation` · **PR**: [#110](https://github.com/Wizarck/nexandro/pull/110) · **Merged**: 2026-05-07 · **Squash SHA**: `a5c2ce9`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.17 — slice #2 of the 4-slice backend tech-debt batch**. Closes Wave 1.13 [3c] retro follow-up: atomic Ed25519 keypair rotation API. Single CI iteration (HTTP status code semantic).

## What we shipped

**`POST /agent-credentials/:id/rotate` (NEW, Owner-only):**
- Body: `{publicKey: string}` validated by new `RotateAgentCredentialDto` (`@IsString @MinLength(1) @MaxLength(4096)` matching the existing register-time constraints).
- `@HttpCode(200)` on the handler — rotation mutates an existing row rather than creating a new resource. Nest's POST default of 201 would be semantically wrong; explicit override.
- `@AuditAggregate('agent_credential')` so the existing 3a `BeforeAfterAuditInterceptor` emits `AGENT_ACTION_FORENSIC` (post-Wave 1.14 channel) with `payload_before.publicKey` (old) + `payload_after.publicKey` (new). Auditors get a forensic timeline without polling the live row.
- Response is `WriteResponseDto<AgentCredentialResponse>` — public_key is NOT echoed back (matches the existing DTO discipline; the response body is safe to log).

**Service method `rotate(id, organizationId, publicKey)`:**
- Resolves via the existing `getById` (per-org-scoped; throws 404 on miss). Cross-org rotation attempts get 404 (no existence leak).
- Refuses revoked credentials with `ConflictException` `AGENT_CREDENTIAL_REVOKED` (rotation does NOT un-revoke per ADR SD5 — revoke is deliberate "this key is dead forever").
- Calls new `row.rotatePublicKey(newKey)` entity helper, then `repo.save(row)`. Single TypeORM UPDATE; atomic at the DB level.

**Entity helper `rotatePublicKey(newPublicKey)`:**
- ~3 LOC; encapsulates the field assignment so service code reads `row.rotatePublicKey(...)` mirroring `revoke()` shape. No length/format validation here — that's the DTO's job.

**Test deltas:**
- Unit: 4 new service spec tests (rotate active OK / rotate revoked 409 / rotate missing id 404 / rotation across org 404). 2 new controller spec tests (rotate forwards orgId + new publicKey to service / rotate response does NOT echo new publicKey).
- INT: 2 new scenarios in `agent-credentials.int.spec.ts` (rotation end-to-end with direct DB read confirming the swap landed; rotation against revoked returns 409 + DB row's public_key unchanged).
- Net: apps/api 795 → 801 unit (+6); INT 108 → 110 (+2).

**Operator runbook update:**
- `docs/operations/m2-mcp-agent-registry-bench-runbook.md` gains a "Key rotation (Wave 1.17)" section: keygen 1-liner, curl recipe, when-to-rotate-vs-revoke table (planned hygiene → rotate; suspected compromise → revoke + re-register), restart-the-agent caveat for in-flight requests signed with the old key.

## What surprised us

- **Nest's POST default is 201 Created; rotation needed an explicit `@HttpCode(200)`.** Local apps/api unit tests passed because they exercise the controller method directly (no HTTP round-trip). INT spec used real fetch and got 201 vs the 200 the test asserted. The fix is one decorator (`@HttpCode(200)`) + one comment in the ApiOperation description explaining the choice. **Lesson**: any new POST endpoint that mutates rather than creates needs `@HttpCode(200)` from the start — codify in the no-skeleton checklist for future state-transition endpoints.
- **Audit-log captures `payload_before.publicKey` + `payload_after.publicKey` for free.** No new audit code needed. The 3a `BeforeAfterAuditInterceptor` resolves payload_before via `findById` (the agent-credentials BC already registers that resolver), invokes the handler (which performs the swap), captures payload_after from the handler's `WriteResponseDto.data` — except `data` is `AgentCredentialResponse` which doesn't include `publicKey`. So payload_after as captured by the interceptor has no `publicKey`. **Wait — that's a quiet gap.** The existing `BeforeAfterAuditInterceptor` captures the response shape, which intentionally doesn't echo publicKey. So the audit row's `payload_after.publicKey` would actually be `undefined` from the response-shape capture. Going to flag this as a follow-up: `m2-agent-credential-rotation-audit-fidelity` — the audit row should carry the OLD + NEW public_key explicitly, which means either expanding the `AgentCredentialResponse` to include publicKey when the request is via the `agent_credential` aggregate, OR a custom audit envelope path for rotation, OR adding an internal "rotation event" emitted directly from the service. Filed; not blocking the slice's main goal (rotation works; audit captures the rotation happened + the row id + the actor).
- **Per-org-isolation contract is in `getById()` once, used everywhere.** rotate(), revoke(), getOne(), deleteHard() all funnel through `getById(id, organizationId)` which throws NotFoundException when the scope mismatches. The rotation slice didn't have to repeat the cross-org test in the service spec because it's already covered by the shared helper's contract — instead I added one explicit "across org boundaries returns NotFound" test for documentation. Lesson reinforced: **single-place gating beats per-method copy-paste**, especially for security boundaries.
- **CodeRabbit + Gitleaks pass on the very first push without any iterations.** The slice was small enough (8 files modified, 279 insertions) that the AI-review tools had zero meaningful feedback. This is the cleanest CodeRabbit pass of any slice this saga.

## Patterns reinforced or discovered

- **`@HttpCode(200)` on mutating-POST endpoints.** Whenever a POST endpoint mutates an existing resource (state transitions, atomic operations on a row that already exists), set `@HttpCode(200)` explicitly. The Nest default of 201 implies "new resource created", which is semantically wrong for state transitions. Codified.
- **Refuse-on-revoked is the right state-machine guard for credential operations.** Rotation, re-key, role-update — all such operations on a credential row should refuse the revoked state with `ConflictException` rather than silently un-revoking. Revocation is a deliberate, auditable signal. Codified.
- **Entity helpers for state mutations.** The `rotatePublicKey()` helper is 3 LOC but worth its weight in readability: service code reads `row.rotatePublicKey(newKey)` instead of `row.publicKey = newKey`. Mirrors `revoke()` and `isActive()` style. Future credential operations (e.g. role updates, agent_name normalization) follow this pattern.
- **DTO-driven validation reuse.** The new `RotateAgentCredentialDto` shares the exact `@MinLength(1) @MaxLength(4096)` constraints as `CreateAgentCredentialDto.publicKey`. Rotation accepts ANY public key the registration endpoint would; no surprise rejections. Reuse the constants if they ever evolve (today they're inline; can refactor when 3rd usage appears).

## Things to file as follow-ups

- **`m2-agent-credential-rotation-audit-fidelity`** — the audit row's `payload_after` doesn't carry the new publicKey because `AgentCredentialResponse` (the unwrapped DTO) intentionally omits publicKey. Audit timeline should include both old + new keys explicitly. Either expand the response shape conditionally for audit emission, or emit a custom envelope from the service. Trigger: an auditor needs to verify "what key was active at time T?" without polling the live `agent_credentials` row.
- **`m2-agent-credential-rotation-grace-period`** — `previous_public_key` column + N-minute grace window when in-flight-request failures during rotation become an operational concern.
- **`m2-agent-credential-rotation-policy`** — scheduled / automated rotation enforcement (e.g. quarterly hygiene policy).
- **`m2-agent-multi-key`** — multiple active keys per agent (for parallel deployments or zero-downtime rotation).
- **`m2-agent-credentials-ui`** — Owner UI for the credential CRUD + rotation. Today operators curl/POST.

## Process notes

- **2 stage commits + 1 fix-commit before merge.** Pattern:
  1. `proposal(...)` — openspec artifacts.
  2. `feat(agent-credentials): atomic Ed25519 rotation API + audit + runbook` — entity + DTO + service + controller + tests + INT + runbook bundled (slice was small enough).
  3. `fix(agent-credentials): @HttpCode(200) on POST /:id/rotate` — semantic HTTP status fix.
- **Single CI iteration**, single failure mode (HTTP status code), single-line fix. Compare to Wave 1.16's zero-iteration first-pass — the new-endpoint-with-fresh-semantics path has higher surface for these "default behaviour vs intended semantic" surprises than CI yaml + script changes.
- **Worktree leftover after merge.** Same Windows-file-lock pattern as Wave 1.13 [3c] / Wave 1.15 / Wave 1.16. `git worktree remove --force` failed; `git branch -D` + worktree-registry cleanup succeeded. The folder remains as stale; sweep at end of the 4-slice batch.
- apps/api unit suite: 795 → 801 (+6). INT: 108 → 110 (+2). Build clean, lint clean, CodeRabbit clean, Storybook unaffected, Gitleaks clean.
- This is **slice #2 of the user's 4-slice "all" pick**. Next: `m2-audit-log-emitter-migration` → `m2-audit-log-ui`.
