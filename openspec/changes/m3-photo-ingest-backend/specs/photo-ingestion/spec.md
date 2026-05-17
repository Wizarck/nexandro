# Spec — photo-ingestion (m3-photo-ingest-backend, slice #17a/22, Wave 2.8)

## Capability

The photo-ingestion BC accepts a `photoId` (resolved via slice #18 `PhotoStorageService` to a signed URL) and a `kind` (`'invoice' | 'product'`), routes the image through slice #16 `VisionLlmProvider.extract()`, classifies the overall + per-field confidence per ADR-034, persists an `IngestionItem` row, and emits one of four status-specific events (auto-filled / awaiting-review / rejected-low-confidence / extraction-failed). Operators sign reviewed items via REST + MCP; signing stores BOTH the original LLM extraction and the operator's corrected fields (FR32 forensic foundation), with an audit envelope `retention_class='regulatory'`. The 0.85 / 0.60 thresholds are code-level locked per ADR-034 (no operator-tunable surface).

## Acceptance criteria

### AC-PHOTO-1 — Confidence-band classifier is iron-rule and inclusive

Given a confidence value `c` in `[0.0, 1.0]`:

- `c >= 0.85` → `'auto_fill'`
- `0.60 <= c < 0.85` → `'flag_for_review'`
- `c < 0.60` → `'reject'`

IEEE 754 boundary behaviour: `0.8499999999999999` → `'flag_for_review'`; `0.85` → `'auto_fill'`; `0.8500000000000001` → `'auto_fill'`; `0.5999999999999999` → `'reject'`; `0.6` → `'flag_for_review'`; `0.6000000000000001` → `'flag_for_review'`.

Edge inputs (`NaN`, `+Infinity`, `-Infinity`) raise a domain error rather than silently falling through.

The thresholds live in `apps/api/src/photo-ingestion/domain/constants.ts` as `const` exports. There is no env var, no tenant override, no MCP capability that mutates them. Modification requires a code change + code review + test signal.

### AC-PHOTO-2 — Ingest happy path (auto-fill band)

Given an authenticated Owner / Manager,
when they POST to `/m3/photo-ingest/items` with `{ photoId, kind: 'invoice', capability: 'inventory.ingest-invoice-photo' }`,
and the Vision-LLM returns `{ fields: [...all with confidence >= 0.85], overallConfidence >= 0.85 }`,
the service:

1. resolves the signed photo URL via `PhotoStorageService.resolveReadUrl(orgId, photoId)`,
2. calls `VisionLlmProvider.extract({ photoUrl, tag: 'photo-ingest-invoice', capability })`,
3. classifies overall as `'auto_fill'`,
4. inserts an `IngestionItem` row with `status='auto_filled'`, `llmExtraction = response`, `operatorCorrection = null`,
5. emits `PHOTO_INGESTION_AUTO_FILLED` on the bus,
6. the `AuditLogSubscriber` persists the envelope with `aggregate_type='photo_ingestion'`, `aggregate_id=item.id`, `retention_class='regulatory'`, `payload_after` containing the full `llmExtraction`,
7. returns `201` with `{ itemId, status: 'auto_filled' }`.

### AC-PHOTO-3 — Ingest awaiting-review path

Given the same setup but with at least one field's `confidence` in `[0.60, 0.85)`:

The service classifies overall as `'flag_for_review'`, persists with `status='awaiting_review'`, and emits `PHOTO_INGESTION_AWAITING_REVIEW`. The item appears in the HITL queue for the operator's role + scope.

### AC-PHOTO-4 — Ingest rejected-low-confidence path

Given the same setup but with `overallConfidence < 0.60` OR every field in the reject band:

The service classifies overall as `'reject'`, persists with `status='rejected'`, emits `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE`, AND marks every reject-band field as operator-required for the subsequent sign flow.

### AC-PHOTO-5 — Vision-LLM outage path

Given `VisionLlmProvider.extract()` returns `null` (per slice #16's iron-rule null-on-outage contract):

The service persists an `IngestionItem` with `status='rejected'`, `overallConfidence=0`, `llmExtraction={ fields: [], overallConfidence: 0, modelVersion: '<unknown>', promptVersion: '<unknown>' }`, and emits `PHOTO_EXTRACTION_FAILED` (NOT `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE` — the failure mode is semantically distinct: the operator cannot rely on partial extraction; they must enter everything manually). The row remains signable via the standard HITL flow.

### AC-PHOTO-6 — Sign happy path

Given an `IngestionItem` with `status='awaiting_review'`,
when an authenticated Owner / Manager POSTs to `/items/:id/sign` with `{ fieldCorrections: [...all reject-band fields non-empty, plus optional corrections to flag-band fields], signedByUserId }`,
the service:

1. asserts current status is `'awaiting_review'` or `'rejected'`,
2. asserts every field that was in the reject band has a non-empty `value` in `fieldCorrections`,
3. writes `operatorCorrection = { fields: fieldCorrections }`,
4. updates `signedAt = now()`, `signedByUserId = body.signedByUserId`, `status = 'signed'`,
5. emits `PHOTO_INGESTION_SIGNED` with `payload_after` containing BOTH the original `llmExtraction` AND the new `operatorCorrection` (per FR32),
6. returns `200` with the updated projection.

### AC-PHOTO-7 — Sign refuses when reject-band field is empty

Given an `IngestionItem` with a reject-band field `proveedor`,
when the operator POSTs `sign` with `fieldCorrections` where `proveedor.value === ''` (or omitted, or null):

The service returns `422 Unprocessable Entity` with error code `INGESTION_REJECT_BAND_FIELD_MISSING` and a body listing the missing field names. No row mutation occurs. No envelope is emitted.

### AC-PHOTO-8 — Sign refuses already-signed item

Given an `IngestionItem` with `status='signed'`,
when an operator POSTs `sign` again:

The service returns `409 Conflict` with `INGESTION_ALREADY_SIGNED`. No row mutation. No envelope emitted. The retroactive-correction path is a SEPARATE event (`HITL_RETROACTIVE_CORRECTION`, deferred to followup) — not a re-sign of the same row.

### AC-PHOTO-9 — HITL queue is RBAC-scoped

Given Owner / Manager / Staff users:

- `GET /items?status=awaiting_review`:
  - **Owner**: returns all org-scoped items in `status='awaiting_review'`, ordered by `createdAt DESC`, capped at `opts.limit` (default 50).
  - **Manager**: returns the subset whose `kind` and source-photo location match the manager's assigned locations. Cross-location items are filtered out at the repository (no app-layer leak).
  - **Staff**: forbidden — `403`.

### AC-PHOTO-10 — Multi-tenant isolation

A request from `orgA` for `itemId` that belongs to `orgB` returns `404 Not Found` (NOT `403` — no existence disclosure). The repository's `findOne()` always passes `organizationId` as the first WHERE clause; cross-tenant rows are never returned.

### AC-PHOTO-11 — Reclassify happy path

Given an `IngestionItem` with `kind='invoice'`,
when an Owner / Manager POSTs `/items/:id/reclassify` with `{ newKind: 'product' }`:

The service mutates `kind = 'product'`, emits `PHOTO_INGESTION_RECLASSIFIED` with `payload_after = { oldKind: 'invoice', newKind: 'product' }`. The audit envelope persists with `retention_class='regulatory'`. The row stays in its current status (no re-classification of the LLM extraction — the operator decided the photo was misrouted, not that the extraction was wrong).

### AC-PHOTO-12 — Audit envelopes carry both extractions on sign

Per FR32: after `AC-PHOTO-6` completes, the `audit_log` envelope for `PHOTO_INGESTION_SIGNED` has:

```json
{
  "payload_after": {
    "itemId": "<uuid>",
    "kind": "invoice",
    "overallConfidence": 0.72,
    "llmExtraction": { "fields": [...original LLM output] },
    "operatorCorrection": { "fields": [...operator's corrected fields] },
    "signedByUserId": "<uuid>",
    "modelVersion": "<provider-reported>",
    "promptVersion": "<provider-reported>"
  }
}
```

Inspectors + future model-tuning passes read both: the LLM's hypothesis AND the operator's truth. This is the forensic foundation for EU AI Act Article 13 transparency obligations.

### AC-PHOTO-13 — MCP capabilities expose the same surface

`inventory.ingest-invoice-photo`, `inventory.ingest-product-photo`, and `inventory.sign-photo-ingestion` are wired in `packages/mcp-server-nexandro/src/capabilities/write/inventory.ts`. The smoke test asserts `WRITE_CAPABILITIES.length === 52` and the registered keys include all three new names. Hermes (WhatsApp / Telegram / chat widget) invokes the same handler that REST hits — no surface fork.
