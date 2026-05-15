# Spec — photo-ingestion retroactive correction handler (m3-photo-ingest-retroactive-correction-handler, hardening H1b)

## Capability

The photo-ingestion BC accepts a retroactive correction on a previously-signed `IngestionItem`. Each correction:

1. Preserves the prior `operatorCorrection` in an append-only `corrections_history` JSONB column on the row (chain-of-custody per EU AI Act Article 13).
2. Emits a regulatory `HITL_RETROACTIVE_CORRECTION` audit envelope carrying the prior + new corrections in `payload_before` + `payload_after`.
3. Triggers a downstream-revocation side effect: a separate subscriber probes for Lots / GR drafts derived from this item and flags them `requires_review = true` (regulatory envelope per flag). The downstream snapshot is NEVER auto-mutated.

The endpoint is gated MANAGER + OWNER only — STAFF can sign but cannot retro-correct. Applying the same correction twice is idempotent via content hash. The downstream-revocation subscriber gracefully degrades when the sibling routing slice has not yet introduced `source_photo_ingestion_id` columns on `lots` / `goods_receipts`, emitting a regulatory `DOWNSTREAM_REVOCATION_DEFERRED` envelope.

## Acceptance criteria

### AC-RETRO-1 — Endpoint exists with MANAGER+OWNER RBAC

`POST /m3/photo-ingest/items/:itemId/retroactive-correction` is registered on `IngestionController` with `@Roles('OWNER', 'MANAGER')`. STAFF callers receive HTTP 403 from the upstream `RolesGuard`. Unauthenticated callers receive HTTP 401.

The controller method's `@Roles` decorator metadata is asserted in the controller unit spec.

### AC-RETRO-2 — Retroactive correction happy path

Given an `IngestionItem` with `status='signed'` and `operatorCorrection = C0`,
when an authenticated MANAGER POSTs `/items/:id/retroactive-correction` with `{ organizationId, fieldCorrections: [...], reason: 'Operator caught wrong quantity', correctedByUserId }`,
the service:

1. Loads the row via `IngestionItemRepository.findById(orgId, itemId)`.
2. Asserts `row.status === 'signed'`.
3. Builds the new `operatorCorrection = C1` via the same merge rules as the sign flow.
4. Computes a SHA-256 content hash over the canonical JSON of `{ fieldCorrections, correctedByUserId }` (sorted keys + lowercased strings + 4-decimal numerics).
5. Appends `{ correctionId, correctedAt, correctedByUserId, reason, previousCorrection: C0, contentHash }` to `corrections_history`.
6. Sets `row.operatorCorrection = C1`. Persists via `repository.save(row)`.
7. Emits `HITL_RETROACTIVE_CORRECTION` envelope with:
   - `aggregateType='photo_ingestion_item'`, `aggregateId=item.id`.
   - `actorUserId=correctedByUserId`, `actorKind='user'`.
   - `payloadBefore = { operatorCorrection: C0, correctionsHistoryLength: 0 }`.
   - `payloadAfter = { operatorCorrection: C1, correctionsHistoryLength: 1, contentHash, correctionId, reason }`.
8. Returns HTTP 200 with `{ itemId, status: 'signed', correctionsHistoryLength: 1, idempotent: false }`.

### AC-RETRO-3 — Append-only history (no DELETE of prior correction)

After two distinct retroactive corrections on the same item:

- `corrections_history.length === 2`.
- `corrections_history[0].previousCorrection === C0` (the original sign-time correction).
- `corrections_history[1].previousCorrection === C1` (the intermediate correction).
- `row.operatorCorrection === C2` (the latest correction).
- No prior correction value is ever overwritten in place. The audit-log records 2 envelopes — each with its own `previousCorrection` snapshot in `payload_before`.

### AC-RETRO-4 — Idempotent via content hash

Applying the same retroactive correction twice (same `fieldCorrections`, same `correctedByUserId`) MUST NOT inflate the history:

1. First call: `correctionsHistory.length 0 → 1`, envelope emitted, response `{ idempotent: false }`.
2. Second call (same payload): content hash matches `corrections_history[0].contentHash` → no write, no envelope emitted, response `{ idempotent: true, correctionsHistoryLength: 1 }`. HTTP 200.

The content hash is computed over a CANONICAL JSON serialisation:
- Object keys sorted lexicographically.
- String values lowercased (case-insensitive dedup).
- Numeric values formatted to 4 decimal places via `toFixed(4)` (matches `numeric(18,4)` precision elsewhere in M3).
- `correctedByUserId` included.

### AC-RETRO-5 — Refuses non-signed items

Applying a retroactive correction to an item in `status ∈ { 'pending_extraction', 'auto_filled', 'awaiting_review', 'rejected', 'expired' }`:

The service throws `IngestionItemNotCorrectableError`. Controller maps to HTTP 422 with code `INGESTION_ITEM_NOT_CORRECTABLE`. No mutation, no envelope.

Reason: only fully-signed items have a regulatory record to retroactively amend. Earlier states still flow through the normal sign path.

### AC-RETRO-6 — Cross-tenant returns 404 (no existence disclosure)

A MANAGER from orgA POSTs a correction with `:itemId` belonging to orgB:

- `IngestionItemRepository.findById(orgA, itemId)` returns `null`.
- Service throws `IngestionCrossTenantError` (same shape as the slice #17a sign path).
- Controller maps to HTTP 404 with code `INGESTION_ITEM_NOT_FOUND` (NOT 403 — no existence disclosure).

### AC-RETRO-7 — Empty value on formerly-reject-band field refused

If the original `llmExtraction.fields` had a field with confidence < 0.60 (reject band), THAT field MUST still be present + non-empty in the retroactive correction (the same iron-rule contract as the original sign flow). An empty `value` (empty string, null, or NaN-number) → `IngestionCorrectionEmptyError` → HTTP 422. No mutation, no envelope.

### AC-RETRO-8 — Downstream-revocation subscriber: Lot flagging happy path

Given the sibling H1a `m3-photo-ingest-downstream-routing` slice has merged (the `source_photo_ingestion_id` column exists on `lots`),
when `HITL_RETROACTIVE_CORRECTION` fires for `itemId X`,
and 2 `lots` rows exist with `source_photo_ingestion_id = X`,
the `DownstreamRevocationSubscriber`:

1. Probes `lots`: `UPDATE lots SET requires_review = true WHERE organization_id = $1 AND source_photo_ingestion_id = $2 RETURNING id`.
2. Emits 2 `LOT_FLAGGED_FOR_REVIEW` envelopes (one per row), each with `payloadAfter = { lotId, sourcePhotoIngestionId: X, correctionId, reason }`.
3. Probes `goods_receipts` identically.
4. The `AuditLogSubscriber` persists the new envelopes via `persistEnvelope()`.

### AC-RETRO-9 — Downstream-revocation subscriber: GR flagging happy path

Given the sibling H1a slice has merged AND 1 GR draft exists with `source_photo_ingestion_id = X`:

The subscriber emits 1 `GR_FLAGGED_FOR_REVIEW` envelope with `payloadAfter = { goodsReceiptId, sourcePhotoIngestionId: X, correctionId, reason }` and the row's `requires_review` is set to `true`.

### AC-RETRO-10 — Downstream-revocation subscriber: column-not-exists graceful path

Given the sibling H1a slice has NOT yet merged (the `source_photo_ingestion_id` column does NOT exist on `lots` or `goods_receipts`),
when `HITL_RETROACTIVE_CORRECTION` fires,
the subscriber:

1. Issues the probe query.
2. Postgres responds with SQLSTATE `42703` (undefined_column).
3. The repository catches the error specifically on `err.code === '42703'`, returns `{ columnExists: false, rows: [] }`.
4. The subscriber emits ONE `DOWNSTREAM_REVOCATION_DEFERRED` envelope with `payloadAfter = { reason: 'downstream-routing-column-not-present', sqlState: '42703', sourcePhotoIngestionId: X, correctionId }`.
5. Does NOT continue probing the second table — column absence on either signals the routing slice has not landed.
6. Does NOT emit LOT_FLAGGED_FOR_REVIEW / GR_FLAGGED_FOR_REVIEW.

### AC-RETRO-11 — Downstream-revocation subscriber: no-match path

Given the sibling H1a slice HAS merged but 0 rows match the probe (the corrected item was never routed downstream, e.g., the operator corrected immediately after sign before any routing job ran):

The subscriber emits 0 envelopes. No `DOWNSTREAM_REVOCATION_DEFERRED` (the columns exist; the absence of rows is the answer). The row UPDATE returns 0 rows; the audit-log stays untouched.

### AC-RETRO-12 — 3 new audit envelope types are regulatory

`computeRetentionClass(name)` returns `'regulatory'` for:
- `LOT_FLAGGED_FOR_REVIEW`.
- `GR_FLAGGED_FOR_REVIEW`.
- `DOWNSTREAM_REVOCATION_DEFERRED`.

The `RETENTION_BY_EVENT_NAME` map carries all 3. The regulatory-set parametric test in `apps/api/src/audit-log/application/types.spec.ts` includes them.

### AC-RETRO-13 — MCP capability mirrors the REST surface

`inventory.retroactive-correct-photo-ingestion` is registered in the MCP server's write capabilities:
- `restMethod === 'POST'`.
- `restPathTemplate === '/m3/photo-ingest/items/:itemId/retroactive-correction'`.
- `restPathParams(input)` returns `{ itemId: input.itemId }`.
- `restBodyExtractor(input)` returns the input minus `itemId` and `idempotencyKey`.
- Schema validates: `itemId` (uuid), `organizationId` (uuid), `fieldCorrections` (array max 200), optional `reason` (string 1-500), optional `idempotencyKey`.

The smoke spec count assertion increments to 60. The new capability name is present in the spot-check list.

### AC-RETRO-14 — AuditLogSubscriber extension (single subscriber)

The 3 new event types (`LOT_FLAGGED_FOR_REVIEW`, `GR_FLAGGED_FOR_REVIEW`, `DOWNSTREAM_REVOCATION_DEFERRED`) are wired into the SINGLE existing `AuditLogSubscriber` class via 3 new `@OnEvent` handlers — no parallel audit subscriber. The handlers each invoke `persistEnvelope(channel, payload)` per the slice #21 single-subscriber pattern.

The `PhotoIngestionRevocationSubscriber` (in `apps/api/src/photo-ingestion-revocation/`) is a DIFFERENT NestJS provider in a DIFFERENT module — it emits envelopes but does not persist them to `audit_log` directly.

### AC-RETRO-15 — Migration 0041 is symmetric

`up()`:
- ADDs `corrections_history JSONB NOT NULL DEFAULT '[]'::jsonb` to `photo_ingestion_items`.
- ADDs `requires_review BOOLEAN NOT NULL DEFAULT false` to `lots` AND `goods_receipts`.
- CREATEs partial index `idx_lots_requires_review` `ON lots (organization_id, id) WHERE requires_review = true`.
- CREATEs partial index `idx_goods_receipts_requires_review` `ON goods_receipts (organization_id, id) WHERE requires_review = true`.

`down()`:
- DROPs both partial indexes.
- DROPs `requires_review` from `goods_receipts` and `lots`.
- DROPs `corrections_history` from `photo_ingestion_items`.
