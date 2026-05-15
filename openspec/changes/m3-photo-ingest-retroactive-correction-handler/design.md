# Design — m3-photo-ingest-retroactive-correction-handler

## Context

Slice #17a `m3-photo-ingest-backend` (Wave 2.8, MERGED 2026-05-15 at master tip `5cca037`) wired the HITL sign loop end-to-end: a HITL queue surfaces low-confidence vision-LLM extractions, operators sign with corrections, BOTH `llmExtraction` and `operatorCorrection` are co-stored on the row + on the `PHOTO_INGESTION_SIGNED` audit envelope for EU AI Act forensic compliance.

What slice #17a deliberately deferred:

1. A **second corrective edit** to an already-signed item. The bus channel `HITL_RETROACTIVE_CORRECTION` + the `@OnEvent` handler exist (slice #17a's audit-log subscriber wires them), but no producer exists. The deferred-spec line in slice #17a tasks.md §Deferred is: *"Retroactive correction handler (HITL_RETROACTIVE_CORRECTION envelope is reserved here but the handler that emits it lives in the post-sign correction flow, deferred to m3.x-photo-ingest-retroactive-correction)."*

2. **Downstream propagation of the correction.** When a signed item has been routed to a Lot (product photo) or a GR draft (invoice photo), correcting the source ingestion leaves the downstream aggregate stale.

This slice closes both gaps. It is the H1b hardening slice; H1a is the parallel `m3-photo-ingest-downstream-routing` (introduces `source_photo_ingestion_id` columns on `lots` + `goods_receipts`).

## Decisions

### ADR-APPEND-ONLY-CORRECTIONS-HISTORY

**Decision**: corrections are append-only. The `operatorCorrection` column on `photo_ingestion_items` always holds the *current* (most recent) correction; a new JSONB column `corrections_history` holds the chain of *prior* corrections in order. Each entry carries `{ correctionId, correctedAt, correctedByUserId, reason, previousCorrection, contentHash }`. The prior `operatorCorrection` snapshot is moved INTO the new history entry; the column is then overwritten with the new correction. Nothing is ever DELETED.

**Why**:
- EU AI Act Article 13 forensic-foundation contract: a regulator asking "what did the operator say in revision N-1" must get a verbatim answer. Today (slice #17a), the answer is "we only have the latest correction" — broken.
- The `audit_log` row for each correction also carries `payloadBefore = previousCorrection` per envelope contract; the row-side history is the operational projection (avoids a join against `audit_log` for the j12 detail surface), the audit row is the canonical chain of custody.
- Soft-delete semantics on `corrections_history` are forbidden: if the operator says "I never made that correction" we want to refute with the chain. (Forensic non-repudiation precedent: HACCP CCP readings, recall dossiers.)

**Why not**:
- *Mutate `operatorCorrection` in place, log to audit_log only.* Rejected: forces every projection that wants the history to traverse the audit_log via 4 indexed seeks. The operational projection of HITL ingestion is queried hot from j12; the few hundred extra bytes per row are cheaper than the join.
- *Store the entire chain on `operatorCorrection` as a versioned array.* Rejected: breaks j12's read-side which expects the SHAPE `{ fields: [...] }` on `operator_correction`. Introduces a backward-incompat the parallel slice #17b UI would have to ride.

### ADR-IDEMPOTENT-VIA-CONTENT-HASH

**Decision**: applying the same retroactive correction twice (same `fieldCorrections` array, same `correctedByUserId`) is a no-op. Idempotency is detected by computing a SHA-256 content hash over a canonical JSON serialisation of the inputs and comparing to the latest history entry's `contentHash`. If they match, the service returns `{ idempotent: true }` without writing, without emitting an envelope.

**Why**:
- The MCP capability surface + Hermes (WhatsApp / Telegram) can retry on transient network failures. A retry MUST NOT inflate the history with duplicate entries.
- The content hash is computed over a *canonical* JSON shape: sorted-by-name keys + lowercased string values + numeric values formatted to 4 decimal places. This avoids false-positive divergence from key-order or whitespace differences.
- An idempotency key on the request body is *additionally* accepted (consistent with the photo-ingest sign endpoint) but is NOT relied on — the content hash works even if the agent forgot the idempotency key.

**Why not**:
- *Idempotency-key only (server-side dedup table).* Rejected as the sole mechanism: a misbehaving agent that re-encodes the same correction with a fresh idempotency key would write twice. The content hash is the safety net.
- *Reject duplicate corrections with HTTP 409.* Rejected: a no-op success is more agent-friendly. The idempotent path can be observed via `result.idempotent: true` for debugging.

### ADR-NEVER-AUTO-CASCADE-DOWNSTREAM

**Decision**: when a retro-correction is applied to a source photo-ingestion that has already been routed to a Lot or a GR draft, the downstream aggregate's *data* is NEVER auto-mutated. Instead, a new `requires_review BOOLEAN` column is flipped to `true` on the downstream row + a regulatory audit envelope (`LOT_FLAGGED_FOR_REVIEW` or `GR_FLAGGED_FOR_REVIEW`) is emitted. Operator review (and any decision to mutate the Lot / GR) is a separate, manual workflow that may invalidate previously-issued labels, recall windows, cost snapshots — none of which can be done silently.

**Why**:
- Compliance bar: a Lot's `quantity_received` is referenced by labels, FIFO/FEFO cost resolution, expiry alerts, recall trace, cost snapshots. Mutating it silently invalidates all of those. The operator must consciously decide which of these need to be re-issued.
- The `requires_review` partial index gives a fast "operator review queue" surface for the future widget (deferred). The default `false` means existing aggregates pay zero query cost when no corrections have happened.
- EU 178/2002 traceability requires every backward edit to leave a visible breadcrumb. Auto-mutating without operator approval is a chain-of-custody violation.

**Why not**:
- *Auto-mutate + log to audit_log.* Rejected per the compliance bar above. The audit_log row would record the mutation, but the operator who issued the label has no signal that the label is now wrong.

### ADR-COLUMN-EXISTS-GRACEFUL-PROBE

**Decision**: the downstream-revocation subscriber MUST work whether or not the sibling H1a slice (`m3-photo-ingest-downstream-routing`) has merged its `source_photo_ingestion_id` columns. The subscriber probes the columns via `manager.query(...)`; if Postgres responds with error code `42703` (undefined_column), the subscriber catches it and emits a `DOWNSTREAM_REVOCATION_DEFERRED` envelope (regulatory) recording that the downstream routing surface was not yet active in this deployment.

**Why**:
- Parallel slice independence: both H1a and H1b should be mergeable in either order. Coupling H1b to H1a's column schema would force a serialised wave.
- The `DOWNSTREAM_REVOCATION_DEFERRED` envelope is regulatory because it documents the FACT that a correction landed without a downstream check — a regulator asking "did you check the Lot impact?" gets an honest "no, the downstream surface wasn't deployed yet". This is a forensic-honesty pattern (silent skip = bad; documented skip = acceptable).
- Postgres SQLSTATE codes are stable across versions; `42703` is the canonical code for `undefined_column` (per Postgres docs §C.3.5 — Syntax Error or Access Rule Violation). The probe is wrapped in try/catch + sqlState check, never in string-matching on the error message.

**Why not**:
- *Read information_schema to check column existence first.* Rejected: 2 extra round-trips per envelope; the try/catch path is single-round-trip on the happy path. Also: information_schema visibility depends on the role's grants, while the actual query failing is the authoritative signal.
- *Hard-couple to the sibling slice via a compile-time import.* Rejected: violates the hard-constraint "do NOT import from `packages/contracts`" + creates a wave-serialisation point.

### ADR-RBAC-MANAGER-ONLY

**Decision**: the retroactive-correction endpoint is gated `@Roles('OWNER', 'MANAGER')`. STAFF — who CAN sign HITL items per slice #17a — CANNOT retro-correct already-signed records.

**Why**:
- Personas-jtbd matrix: compliance-affecting writes belong to the role that owns the audit trail. STAFF sign is a *forward* operation on a row that hasn't yet been written into the regulatory chain; STAFF retro-correct would mean rewriting an already-regulator-visible record.
- Defense in depth: the AGPL community surface uses NestJS `@Roles` decorator; TrattOS Enterprise additionally gates via MCP capability allowlist. Both honour the same MANAGER+OWNER set.

**Why not**:
- *STAFF allowed with audit_log carrying actor_kind='user' actor_user_id=staff*. Rejected: the persona contract is the spec, not the role string.

### ADR-SEPARATE-REVOCATION-BC

**Decision**: the downstream-revocation subscriber lives in a *separate* NestJS BC (`apps/api/src/photo-ingestion-revocation/`), not inside `photo-ingestion`.

**Why**:
- Separation of concerns: `photo-ingestion` owns extraction + HITL queue + signing. `photo-ingestion-revocation` owns the cross-aggregate side effect of a correction (Lot + GR flagging).
- The split makes the dependency direction clean: `photo-ingestion-revocation` depends on `photo-ingestion`'s emitted events (loosely, via the bus) and on the downstream tables (`lots`, `goods_receipts`) — it has NO compile-time dependency on `photo-ingestion`'s service surface.
- Future TrattOS Enterprise may legitimately scale this into a separate microservice (the revocation flow may need to fan out to additional downstream consumers — kitchen-display invalidation, recall-window re-issue, cost-snapshot rebuilds). The separate BC pre-positions for that.
- The new BC's only public surface is its module; the subscriber + repository are internal. No new controller, no new REST endpoint.

**Why not**:
- *Inline the subscriber in `photo-ingestion`.* Rejected: violates the hard constraint *"the downstream-revocation subscriber is a DIFFERENT class (own NestJS provider)"*.

### ADR-AUDIT-LOG-SUBSCRIBER-EXTENSION-NOT-PARALLEL

**Decision**: the 3 new audit event types (`LOT_FLAGGED_FOR_REVIEW`, `GR_FLAGGED_FOR_REVIEW`, `DOWNSTREAM_REVOCATION_DEFERRED`) are persisted by the SINGLE existing `AuditLogSubscriber` (in `apps/api/src/audit-log/application/audit-log.subscriber.ts`) — extended with 3 new `@OnEvent` handlers. No parallel audit subscriber.

**Why**:
- The hard-constraint pattern from slice #21 (`m3-audit-log-hash-chain-hardening`): the audit-log BC is the sole owner of `audit_log` writes. A parallel subscriber would race the hash-chain ordering invariant.
- The 3 new handlers are 3 lines each — `persistEnvelope(channel, payload)`. No state, no translation. Mechanical extension.

## Risks / Trade-offs

### Risk 1: `corrections_history` grows unbounded

**Risk**: an operator (or a misbehaving agent) could append corrections in a tight loop, ballooning the JSONB column.

**Mitigation**:
- Idempotency via content hash collapses the trivial "retry same correction" case.
- The RBAC gate (MANAGER+OWNER only) bounds the actor population.
- A future M3.x slice can introduce a hard cap (e.g., "if corrections_history.length > 50, refuse with HTTP 422 + suggest reclassify"). For v1 the column is reasonable on size.
- Audit-log alarming on burst correction events (more than 5 per item per hour) is a deferred M3.x observability hook.

### Risk 2: subscriber emits LOT/GR envelopes for rows we did NOT update

**Risk**: a race where two parallel HITL_RETROACTIVE_CORRECTION events for the same item fire the subscriber twice, both flag the same Lot, and we double-emit.

**Mitigation**:
- The UPDATE on `lots.requires_review` is naturally idempotent (`SET requires_review = true` from `true` is a no-op at the row level; Postgres records the UPDATE but the truth-table-value is unchanged).
- We emit one envelope per row found per subscriber invocation. The audit-log subscriber dedups via the hash-chain ordering — duplicate envelopes get distinct row IDs but identical payloads, which is the correct chain-of-custody record (a regulator wants to see that the operator triggered 2 corrections, not 1).
- A future M3.x slice can collapse via an idempotency-key per `(itemId, correctionId)` if duplicate envelopes ever become a query-side problem.

### Risk 3: column-not-exists probe miscategorises a real DB error as "deferred"

**Risk**: a transient Postgres error that happens to surface SQLSTATE `42703` (e.g., a corrupted system catalog) would silently emit `DOWNSTREAM_REVOCATION_DEFERRED` instead of failing loudly.

**Mitigation**:
- The probe code logs a `logger.warn` whenever `42703` is hit AND captures the exact error message. The audit envelope's `payloadAfter.reason` carries the message verbatim.
- Operations runbook (deferred to followup) documents the dashboard query for `DOWNSTREAM_REVOCATION_DEFERRED` count; a sudden burst signals a real problem, not just a slice-ordering mismatch.
- The graceful path is opt-in via a single try/catch around the probe query. If we later decide the graceful path is too lenient, removing it is a 5-line change.

### Risk 4: content-hash collision between semantically-different corrections

**Risk**: SHA-256 over canonical JSON could in theory collide for two different correction payloads.

**Mitigation**:
- SHA-256 collision is computationally infeasible (no known collisions). The risk is theoretical.
- We hash a CANONICAL serialisation (sorted keys, lowercased strings, numeric quantisation to 4 decimals — same precision boundary used by `numeric(18,4)` columns elsewhere) so the hash captures the semantic shape.
- An accidental match would manifest as a "silent no-op when the operator expected a write" — operationally annoying but not a data integrity hazard. The operator can append a `reason` to force a different hash on the retry.

## Migration mapping

Slot 0041 per `master/docs/openspec-slice-module-3.md` (post-Gate-C amendment 2026-05-15 reassigning unused slots from `m3-ai-obs-budget-tier-emitter`).

`down_revision` chain: `0040_<sibling-routing-topic>` (if H1a merges first) OR `0039_create_photo_ingestion_items_table` (if H1b merges first). TypeORM resolves the chain by ascending integer prefix at boot — the `down_revision` field is NOT modelled explicitly in TypeORM migrations (per release-management.md §6.4.2 the verbose suffix carries the linkage). Both orderings yield a valid forward chain because the additive ALTER TABLE statements are commutative.

## Test plan

- Unit (apps/api/src/photo-ingestion/application/retroactive-correction.service.spec.ts):
  - happy path: signed item → apply → status remains 'signed', correctionsHistory length 0→1, new operatorCorrection equals input, envelope emitted with previousCorrection.
  - second correction: apply twice with DIFFERENT inputs → history length 0→1→2, envelope emitted twice with each previousCorrection.
  - idempotent: apply twice with SAME inputs → history length 0→1, second call returns `{ idempotent: true }`, only ONE envelope emitted.
  - not-signed status: item in 'awaiting_review' → throws IngestionItemNotCorrectableError → HTTP 422.
  - cross-tenant: item belongs to orgB → throws IngestionCrossTenantError → HTTP 404 (no existence disclosure).
  - empty value on a formerly-reject-band field: throws IngestionCorrectionEmptyError → HTTP 422.
- Unit (apps/api/src/photo-ingestion-revocation/application/downstream-revocation.subscriber.spec.ts):
  - happy path 1 lot: probe returns 1 lot row → UPDATE called → 1 LOT_FLAGGED_FOR_REVIEW envelope emitted.
  - happy path 1 GR: probe returns 1 GR row → UPDATE called → 1 GR_FLAGGED_FOR_REVIEW envelope emitted.
  - happy path both: 2 lots + 1 GR → 3 envelopes emitted in order (LOTs first, GR second).
  - no downstream: probes return 0 rows → 0 envelopes emitted.
  - column-not-exists: probe throws `42703` → 1 DOWNSTREAM_REVOCATION_DEFERRED envelope emitted, no UPDATE called.
  - envelope shape invalid: missing organizationId → handler logs + returns, no envelopes emitted.
- Unit (apps/api/src/photo-ingestion/interface/ingestion.controller.spec.ts):
  - RBAC: STAFF rejected with 403, MANAGER + OWNER allowed.
  - cross-org body mismatch: 403.
  - error→HTTP mapping: 404 / 422 / 200 (idempotent) / 200 (success).
- Audit types spec extension: 3 new `'regulatory'` entries verified.
- MCP unit (packages/mcp-server-opentrattos/src/capabilities/write/inventory.spec.ts):
  - new capability shape: name, restMethod, restPathTemplate, restPathParams, restBodyExtractor (strips itemId + idempotencyKey), schema accepts optional reason.
- MCP smoke (packages/mcp-server-opentrattos/test/smoke.spec.ts):
  - count assertion 59 → 60.
