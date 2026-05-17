## Why

Slice #17a `m3-photo-ingest-backend` (Wave 2.8) declared the `HITL_RETROACTIVE_CORRECTION` audit channel + wired the matching `@OnEvent` handler in `AuditLogSubscriber`, but **nothing currently emits this event**. The post-sign correction operation ("operator realised the supplier name / quantity / total on a previously-signed item was wrong") has no user-facing surface and no downstream effect on already-derived aggregates (Lot, GR draft) that may have been routed from the original signed extraction.

This is the H1b hardening slice for the M3 wave. It closes the loop on three forensic + compliance gaps that block production rollout:

1. **EU AI Act forensic chain of custody.** Article 13 requires the AI provider to retain the model's hypothesis AND the operator's truth for every HITL transition. Today, signing once stores both `llmExtraction` + `operatorCorrection`, but a *second* operator correction silently has no canonical record. Without an append-only `corrections_history`, the audit trail loses the intermediate truth — a regulator asking "what did the operator say in revision N-1?" cannot get an answer.

2. **Downstream contamination risk.** When a signed photo-ingestion item has already been routed downstream (a Lot has been created from a product photo's signed extraction; a GR draft has been created from an invoice photo's signed extraction), correcting the source ingestion silently leaves the downstream aggregate stale. Auto-mutating the downstream snapshot is barred by compliance (operator review is mandatory — the corrected quantity may invalidate previously-issued labels, recall windows, cost snapshots), so the downstream aggregate MUST be flagged for review without auto-cascading.

3. **RBAC asymmetry.** STAFF can sign HITL items (per j12 slice #17a) but should NOT be able to retroactively rewrite already-signed records — that's a MANAGER+OWNER gate per the personas-jtbd matrix (compliance-affecting writes belong to the role that owns the audit trail). The asymmetry is currently undefined.

The slice ships:

- **Producer**: `POST /m3/photo-ingestion/items/:id/retroactive-correction` (MANAGER+OWNER) + `RetroactiveCorrectionService` + new `inventory.retroactive-correct-photo-ingestion` MCP write capability.
- **Storage**: migration `0041_photo_ingest_retroactive_correction` adding `corrections_history JSONB NOT NULL DEFAULT '[]'` to `photo_ingestion_items` + `requires_review BOOLEAN NOT NULL DEFAULT false` to `lots` and `goods_receipts` (with partial indexes on the operator-review queues).
- **Downstream-revocation listener**: a separate NestJS subscriber (`PhotoIngestionRevocationSubscriber`) that consumes `HITL_RETROACTIVE_CORRECTION`, probes for downstream aggregates with column-not-exists graceful degradation, flags the aggregate via `requires_review=true`, and emits one of three new regulatory audit envelopes: `LOT_FLAGGED_FOR_REVIEW`, `GR_FLAGGED_FOR_REVIEW`, or `DOWNSTREAM_REVOCATION_DEFERRED`.

Slot **0041** is claimed per `master/docs/openspec-slice-module-3.md` line 126 — `m3-ai-obs-budget-tier-emitter` reserved `041-042` but only shipped a single migration; remaining slot 0041 is rolled into the H1b hardening allocation per Gate C amendment 2026-05-15. The sibling slice `m3-photo-ingest-downstream-routing` (H1a) running in parallel claims **0040**.

## What Changes

### Backend (apps/api/src/photo-ingestion/)

- **`apps/api/src/photo-ingestion/types.ts`** — extend inline contracts:
  - `RetroactiveCorrectionInput { fieldCorrections: PhotoIngestionField[]; correctedByUserId: string; reason?: string }`.
  - `RetroactiveCorrectionResult { itemId: string; status: 'signed'; correctionsHistoryLength: number; idempotent: boolean }`.
  - `CorrectionsHistoryEntry { correctionId: string; correctedAt: string; correctedByUserId: string; reason: string | null; previousCorrection: PhotoIngestionExtraction; contentHash: string }`.

- **`apps/api/src/photo-ingestion/domain/ingestion-item.entity.ts`** — add `@Column({ name: 'corrections_history', type: 'jsonb', default: () => "'[]'::jsonb" }) correctionsHistory: CorrectionsHistoryEntry[] = []`. Append-only at write time per ADR-APPEND-ONLY-CORRECTIONS-HISTORY.

- **`apps/api/src/photo-ingestion/domain/errors.ts`** — add:
  - `IngestionItemNotCorrectableError(itemId, status)` — refusal when status !== 'signed'. HTTP 422.
  - `IngestionCorrectionEmptyError(fieldName)` — required (formerly-reject-band) field has empty value. HTTP 422.
  - `IngestionRetroactiveCorrectionStaffForbiddenError` — STAFF role rejected. HTTP 403.

- **`apps/api/src/photo-ingestion/application/retroactive-correction.service.ts`** — new `RetroactiveCorrectionService`:
  - `apply(orgId, itemId, input): Promise<RetroactiveCorrectionResult>`.
  - Asserts item exists in org + status === 'signed' (cross-tenant → 404 per existence-disclosure rule).
  - Computes `contentHash` over a canonical JSON serialisation of `input.fieldCorrections` (sorted-by-name keys + lowercased string values for case-insensitive dedup) + `correctedByUserId`. If the same hash appears as the latest `correctionsHistory[length-1].contentHash`, no-op and return `{ idempotent: true, correctionsHistoryLength: history.length }` per ADR-IDEMPOTENT-VIA-CONTENT-HASH.
  - Builds `previousCorrection = row.operatorCorrection` (the snapshot being superseded — never null at this state because `status='signed'` guarantees a prior operator correction).
  - Constructs the new `operatorCorrection` via the same merge rules as `HitlSignService.buildOperatorCorrection` (operator-edited fields pin confidence=1.0, unedited fields preserve the prior correction's values).
  - Appends a `CorrectionsHistoryEntry { correctionId: randomUUID(), correctedAt: now.toISOString(), correctedByUserId, reason, previousCorrection, contentHash }` to `correctionsHistory`. The new latest `operatorCorrection` replaces the column; prior corrections are preserved ONLY on the history array (never mutated).
  - Emits `HITL_RETROACTIVE_CORRECTION` envelope:
    - `aggregateType='photo_ingestion_item'`, `aggregateId=item.id`.
    - `actorUserId=correctedByUserId`, `actorKind='user'`.
    - `payloadBefore = { operatorCorrection: previousCorrection, correctionsHistoryLength: history.length - 1 }`.
    - `payloadAfter = { operatorCorrection: newCorrection, correctionsHistoryLength: history.length, contentHash, correctionId, reason }`.

- **`apps/api/src/photo-ingestion/interface/ingestion.controller.ts`** — add endpoint:
  - `POST /m3/photo-ingestion/items/:itemId/retroactive-correction` — `@Roles('OWNER', 'MANAGER')` (no STAFF). Body: `RetroactiveCorrectionDto`. Returns 200 on success, 200 with `idempotent: true` on duplicate hash, 422 on not-corrected status / empty required field, 404 on cross-tenant.
  - DTO: `RetroactiveCorrectionDto extends `class-validator validation similar to `SignItemDto` plus optional `reason: string @Length(1, 500)`.

- **`apps/api/src/photo-ingestion/photo-ingestion.module.ts`** — wire `RetroactiveCorrectionService` into providers + exports.

### Downstream-revocation BC (apps/api/src/photo-ingestion-revocation/)

A new bounded context — separated from `photo-ingestion` because routing/revocation is a *cross-aggregate* concern that may legitimately scale to a separate microservice in Nexandro Enterprise. The BC's only job is to consume `HITL_RETROACTIVE_CORRECTION` and produce the downstream-flagging envelopes.

- **`apps/api/src/photo-ingestion-revocation/photo-ingestion-revocation.module.ts`** — registers the subscriber + repository.
- **`apps/api/src/photo-ingestion-revocation/application/downstream-revocation.subscriber.ts`** — `@OnEvent(AuditEventType.HITL_RETROACTIVE_CORRECTION)` handler:
  - Asserts envelope shape (org + aggregateId).
  - Probes `lots WHERE source_photo_ingestion_id = $1 AND organization_id = $2`. If the column does not exist (PG error code `42703` "undefined_column" — sibling routing slice not yet merged), emit `DOWNSTREAM_REVOCATION_DEFERRED` envelope and return.
  - If the column exists, count + flag matching Lot rows (`UPDATE lots SET requires_review = true WHERE …`). For EACH flagged Lot, emit one `LOT_FLAGGED_FOR_REVIEW` envelope (regulatory) carrying `payloadAfter = { lotId, sourcePhotoIngestionId, correctionId, reason }`.
  - Same probe for `goods_receipts WHERE source_photo_ingestion_id = $1 AND organization_id = $2`. Emit `GR_FLAGGED_FOR_REVIEW` envelopes per flagged GR row.
  - Wraps every emission in try/catch — a transient DB failure logs but does NOT propagate (the audit-log subscriber pattern, applied transitively here).
- **`apps/api/src/photo-ingestion-revocation/application/downstream-revocation.repository.ts`** — narrow Postgres helper that runs `manager.query(...)` with bind params; encapsulates the `42703` graceful-probe via try/catch.

### Audit-log envelopes

- **`apps/api/src/audit-log/application/types.ts`** — extend with 3 new entries (all `'regulatory'`):
  - `LOT_FLAGGED_FOR_REVIEW` ↔ `m3.photo-ingestion-revocation.lot-flagged-for-review`.
  - `GR_FLAGGED_FOR_REVIEW` ↔ `m3.photo-ingestion-revocation.gr-flagged-for-review`.
  - `DOWNSTREAM_REVOCATION_DEFERRED` ↔ `m3.photo-ingestion-revocation.deferred`.

- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — 3 new `@OnEvent` handlers via the standard `persistEnvelope()` path (single-subscriber pattern, slice #21 ADR-SUBSCRIBER-FAN-OUT). The same subscriber that listens on `HITL_RETROACTIVE_CORRECTION` (declared on slice #17a) persists these 3 new types — no parallel audit subscriber per the hard constraint.

- **`apps/api/src/audit-log/application/types.spec.ts`** — extends the regulatory parametric test with the 3 new entries.

### Migration 0041

- **`apps/api/src/migrations/0041_photo_ingest_retroactive_correction.ts`** — `PhotoIngestRetroactiveCorrection1700000041000`:
  - `ALTER TABLE photo_ingestion_items ADD COLUMN corrections_history JSONB NOT NULL DEFAULT '[]'::jsonb`.
  - `ALTER TABLE lots ADD COLUMN requires_review BOOLEAN NOT NULL DEFAULT false`.
  - `ALTER TABLE goods_receipts ADD COLUMN requires_review BOOLEAN NOT NULL DEFAULT false`.
  - Partial index `idx_lots_requires_review` `ON lots (organization_id, id) WHERE requires_review = true` — fast operator review queue scan.
  - Partial index `idx_goods_receipts_requires_review` `ON goods_receipts (organization_id, id) WHERE requires_review = true`.
  - Symmetric `down()` drops indexes + columns.

### MCP capability

- **`packages/mcp-server-nexandro/src/capabilities/write/inventory.ts`** — add `inventory.retroactive-correct-photo-ingestion`:
  - Title: "Apply a retroactive correction to a previously-signed photo-ingestion item".
  - Description names the chain-of-custody preservation + the downstream-review side effect.
  - `restMethod='POST'`, `restPathTemplate='/m3/photo-ingestion/items/:itemId/retroactive-correction'`, `restPathParams: input => ({ itemId: input.itemId })`, `restBodyExtractor` strips `itemId` + `idempotencyKey`.
  - Schema: same `fieldCorrectionSchema` as the sign capability + optional `reason: z.string().min(1).max(500).optional()`.
- **`packages/mcp-server-nexandro/src/capabilities/write/inventory.spec.ts`** — extend with shape + schema tests for the new capability.
- **`packages/mcp-server-nexandro/src/capabilities/write/index.spec.ts`** — count 52 → 53 (or whatever the current barrel total is — see tasks.md §0 pre-flight).
- **`packages/mcp-server-nexandro/test/smoke.spec.ts`** — count 59 → 60.

### Tests (apps/api)

- **Unit**:
  - `retroactive-correction.service.spec.ts` — happy path, not-signed status refusal, cross-tenant 404, idempotent content-hash path (apply twice → second call returns `idempotent: true` + no envelope emitted), append-only history (history length increments + previousCorrection captured), reject-band field empty-value error.
  - `ingestion.controller.spec.ts` — extend with the new endpoint: RBAC metadata (STAFF blocked), cross-org 403, 422 error→HTTP mapping.
  - `photo-ingestion-revocation/application/downstream-revocation.subscriber.spec.ts` — happy path (Lot probe finds 2 rows → 2 LOT_FLAGGED_FOR_REVIEW envelopes + UPDATE; GR probe finds 1 row → 1 GR_FLAGGED_FOR_REVIEW + UPDATE), column-not-exists graceful path (`42703` thrown → DOWNSTREAM_REVOCATION_DEFERRED emitted, no envelopes for Lot/GR), no-match path (column exists, 0 rows → no envelopes emitted), envelope-shape validation refusal.
- **Optional INT** (deferred to followup per §Deferred): `apps/api/test/int/photo-ingest-retroactive-correction.int.spec.ts` — testcontainers Postgres + real subscriber + verify append-only history + UPDATE persisted.

### Wire into AppModule

- **`apps/api/src/app.module.ts`** — adds `PhotoIngestionRevocationModule` after `PhotoIngestionModule`.

## Capabilities

### New Capabilities

- `photo-ingestion-retroactive-correction`: post-sign correction operation with append-only history. EU AI Act forensic preservation. Idempotent via content hash. MANAGER+OWNER only.
- `photo-ingestion-downstream-revocation`: side-effect subscriber that flags downstream Lot / GR aggregates for operator review when their source photo-ingestion is retro-corrected. Column-not-exists graceful fallback so the slice lands independently of the sibling routing slice.

### Modified Capabilities

- `photo-ingestion`: extends with the retroactive correction REST endpoint + `RetroactiveCorrectionService` + `corrections_history` column on the entity.
- `m2-audit-log`: extends with 3 new regulatory event types + 3 new subscriber handlers on the single canonical `AuditLogSubscriber`.
- `m2-mcp-write-capabilities`: adds 1 new write capability (`inventory.retroactive-correct-photo-ingestion`).

## Impact

- **Prerequisites**:
  - Slice #17a `m3-photo-ingest-backend` — MERGED 2026-05-15. Consumes `HitlSignService`'s `signed` state machine + `photo_ingestion_items` table + the `HITL_RETROACTIVE_CORRECTION` audit channel.
- **Parallel sibling (graceful interop — do NOT import)**:
  - Slice `m3-photo-ingest-downstream-routing` (H1a, in flight) adds `source_photo_ingestion_id` columns on `lots` and `goods_receipts`. This slice probes for those columns and emits `DOWNSTREAM_REVOCATION_DEFERRED` when absent, so the slices land in any order without breaking each other.
- **Code**:
  - Backend `photo-ingestion` BC extension: ~350 LOC (service + types + entity column + DTO + controller endpoint).
  - New `photo-ingestion-revocation` BC: ~180 LOC (module + subscriber + repository).
  - Audit-log types + subscriber extension: ~40 LOC delta.
  - Migration 0041: ~70 LOC.
  - MCP capability: ~40 LOC.
  - Tests: ~600 LOC across 4 spec files.
- **Performance**:
  - Retroactive correction: 1 read + 1 hash compute + 1 update + 1 envelope emit. ~7 ms local. Bounded.
  - Downstream-revocation subscriber: 2 indexed scans (`source_photo_ingestion_id` lookups) + ≤ N UPDATE rows. N is typically 1 (a signed photo-ingestion produces one Lot OR one GR draft); the partial index supports a follow-up "review queue" without full-table scan.
- **Storage growth**:
  - `corrections_history` JSONB: each retro-correction appends one entry (~2-4 KB). Bounded by operator behaviour (the typical pathological case is 3-5 corrections per item; an "operator gone wild" attack surface is bounded by RBAC + audit-log alarms).
  - `requires_review` BOOL: 1 byte per row, partial-indexed only for `true`.
- **Audit**: 4 envelope types total (HITL_RETROACTIVE_CORRECTION on emit + 3 downstream flagging events). All `regulatory`.
- **Rollback**:
  - Migration 0041's `down()` drops the 3 columns + 2 indexes. The 3 new audit event types continue to exist in `types.ts`; removing them is safe (the subscriber handlers become no-ops). The new BC + service can be deleted as a unit.
- **Out of scope** (deferred):
  - UI surface for retroactive correction (j12 detail extension).
  - Auto-cascade of the correction into the downstream Lot / GR snapshot — compliance bars this (operator must review manually).
  - Backfill `corrections_history` for items already signed pre-migration (forward-only).
  - Cleanup cron for `requires_review = false` (operator-driven for now).
  - "Operator review queue" UI widget surfacing `requires_review=true` aggregates.
  - INT spec with testcontainers + real Postgres `42703` round-trip.
- **Parallelism**: file-path scope = `apps/api/src/photo-ingestion/**` (extends 3 files + adds 2) + `apps/api/src/photo-ingestion-revocation/**` (new BC) + `apps/api/src/migrations/0041_photo_ingest_retroactive_correction.ts` + `apps/api/src/audit-log/application/{types,audit-log.subscriber,types.spec}.ts` (mechanical 3-entry adds) + `apps/api/src/app.module.ts` (one-line import) + `packages/mcp-server-nexandro/src/capabilities/write/{inventory.ts,inventory.spec.ts,index.spec.ts}` + `packages/mcp-server-nexandro/test/smoke.spec.ts` (count bump). Zero conflict with the sibling routing slice — both edit disjoint files except `apps/api/src/app.module.ts` and the migration directory (different slot numbers, separate files).
- **Effort estimate**: M (~1300 LOC application + ~600 LOC tests).
