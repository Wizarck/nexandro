# Design — m3-photo-ingest-backend (Wave 2.8, slice #17a/22)

## Context

This slice ships the **operational + audit + classification** half of FR28-FR31 + FR44 — the j12 surface that turns supplier-invoice photos and product photos into typed rows. The j12 UI lives in slice #17b m3-photo-review-ui (parallel sibling, merges at master). The vision-LLM provider DI surface lives in slice #16 m3-vision-llm-provider-di-otel (MERGED — we consume it). The pre-signed-URL photo backend lives in slice #18 m3-photo-storage-lifecycle (MERGED — we consume it).

Master HEAD: `a95e15f` (slice #15 m3-appcc-i18n-ui).

## Decisions

### Decision A — ADR-034 thresholds are code-level locked, not operator-tunable

Per architecture-m3.md ADR-034 + j12 §Decisions: the EU AI Act's "HITL by design" principle is satisfied only if the operator CANNOT lower the auto-fill band ("everything auto-fills now") AND CANNOT raise it ("everything goes to HITL"). The thresholds live at `apps/api/src/photo-ingestion/domain/constants.ts`:

```ts
export const CONFIDENCE_AUTO_FILL = 0.85;
export const CONFIDENCE_FLAG_FOR_REVIEW = 0.6;
```

There is no env var, no tenant override, no MCP capability to mutate them. The only way to change them is a code change to `constants.ts` — which lands a code review + a CI test signal + an entry in the migration log. ADR-034 explicitly forbids surface-tunable thresholds.

**Banding rule (per ADR-034 + verified by `confidence-band.classifier.spec.ts`):**

- `c >= 0.85` → `auto_fill`
- `0.60 <= c < 0.85` → `flag_for_review`
- `c < 0.60` OR `!Number.isFinite(c)` → `reject`

Inclusive `>=` comparison: `0.85` exactly = auto_fill, `0.60` exactly = flag_for_review. The IEEE 754 boundary test pins this: any future refactor that swaps `>=` for `>` fails immediately.

### Decision B — Status precedence: reject > flag > overall < auto-fill > auto_filled

When `IngestionService.ingest` classifies the full extraction:

1. ANY field whose confidence is in the reject band → `status = rejected` (emit `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE`).
2. ANY field in the flag band → `status = awaiting_review` (emit `PHOTO_INGESTION_AWAITING_REVIEW`).
3. `overallConfidence < 0.85` (even when every field is `>= 0.85`) → `status = awaiting_review`.
4. Else → `status = auto_filled` (emit `PHOTO_INGESTION_AUTO_FILLED`).

The defensive "overall in flag band" branch (3) covers the edge case where a vision-LLM provider returns a low per-field mean even though individual fields look confident — the operator should still review.

Null extraction is its own branch — see Decision D.

### Decision C — ALL llmExtraction + operatorCorrection are stored together (FR32 forensic foundation)

Per j12 §Decisions: both JSONB payloads live side-by-side on the `photo_ingestion_items` row AND in the `audit_log.payload_after` of every `PHOTO_INGESTION_SIGNED` envelope. This is non-negotiable — the EU AI Act forensic discipline + the AI Suspicion Score backfill (M3.x) + prompt tuning all require knowing what the vision-LLM said AND what the operator entered.

The row's `operatorCorrection` is `null` until sign-time. At sign-time it is written exactly once. The row's `llmExtraction` is NEVER overwritten — even on reclassify (the reclassify path is event-only in v1; the row is left alone, the audit envelope captures the intent).

### Decision D — Iron-rule null-on-outage contract from slice #16, locally enforced

`VisionLlmProvider.extract()` returns `Promise<VisionLlmOutputValue | null>`. Per slice #16 ADR-038, `null` means "provider outage" — never "no fields found". This slice enforces the contract on the consumer side: a `null` return is mapped to `status = 'rejected'` + emit `PHOTO_EXTRACTION_FAILED` + `llm_extraction = null` on the row. The operator can still complete the row manually from the j12 detail surface; the row stays signable.

### Decision E — Reject-band field enforcement at sign-time (HITL audit chain)

Per j12 §Decisions + FR30: every field whose original LLM confidence was `< 0.60` MUST be present + non-empty in the operator's `fieldCorrections` payload before the row can be signed. The check runs in `HitlSignService` BEFORE any write — a missing field throws `IngestionRejectBandFieldMissingError` (HTTP 422). Empty-string / NaN / `null` values count as missing.

Operator-edited fields are stored at `confidence: 1.0` — they're trusted by definition. Future reclassifies / re-ingest paths can treat the operatorCorrection as a fully-trusted seed.

### Decision F — `PHOTO_INGESTION_SIGNED` envelope carries BOTH payloads in `payload_after`

The sign envelope is the canonical forensic record. Its `payload_after` carries:

```ts
{
  photoId, kind, status: 'signed', overallConfidence,
  modelVersion, promptVersion, signedAt, signedByUserId,
  llmExtraction,        // the original LLM extraction, unmodified
  operatorCorrection,   // the operator's edits
}
```

`payload_before` carries the prior status + the `llmExtraction` snapshot (redundant by construction but makes the row self-contained for forensic replay).

### Decision G — Status state machine

```
pending_extraction (rare, v1 is synchronous)
       │
       ▼
   ┌─────────┐    null extraction      ┌──────────┐
   │  ingest │ ──────────────────────► │ rejected │ ◄─── reject-band field
   └─────────┘                         └──────────┘
        │                                  │
        │  every field >= 0.85 +           │  operator sign
        │  overall >= 0.85                 ▼
        │                                ┌────────┐
        ▼                                │ signed │
   ┌────────────┐    flag-band field    └────────┘
   │ auto_filled│ ──── never; aggregate ─►   ▲
   └────────────┘                            │
        │                                    │  operator sign
        ▼                                    │
   ┌─────────────────┐                       │
   │ awaiting_review │ ──────────────────────┘
   └─────────────────┘
```

`expired` is reserved for a future retention-window cron mover. The DB CHECK constraint covers all 6 states so M3.x state additions land without a migration.

### Decision H — Audit aggregate type `photo_ingestion_item`

Per slice #21 ADR-CROSS-BC-SUBSCRIBER-LOCATION: every envelope carries `aggregateType='photo_ingestion_item'` + `aggregateId=<itemUuid>`. The existing `ix_audit_log_aggregate` index drives per-row chronology projections in j12. The actor on the ingest envelopes is `actorKind='system'` (the vision-LLM produced the row, not a user); the sign envelope is `actorKind='user'` + `actorUserId=<signedByUserId>`.

### Decision I — Migration slot 0039 (next-free at slice claim time)

`master/docs/openspec-slice-module-3.md` line 123 reserved slot 039 for this slice. At master HEAD `a95e15f` the highest used slot is 0038 (slice #14 export bundles), so `0039` is uncontested. The migration file is `0039_create_photo_ingestion_items_table.ts` with class `CreatePhotoIngestionItems1700000039000`.

### Decision J — Two indexes per ADR-031

- `idx_photo_ingestion_items_org_status_created` `(organization_id, status, created_at DESC)` — drives the HITL queue list (the dominant query: `WHERE organization_id=$1 AND status='awaiting_review' ORDER BY created_at DESC LIMIT 50`).
- `idx_photo_ingestion_items_org_photo` `(organization_id, photo_id)` — drives photo-anchored lookups (re-ingest dedup probe + future recall trace by photo_id).

Both are full indexes (no partial WHERE clause). Soft-delete via `deleted_at` is reserved for the operator-hide UX; v1 leaves it null and the j12 surface filters in the query layer.

### Decision K — Inline contracts, no `packages/contracts` import

Per Wave 2.5+ design guidance: all types this BC exposes — internal AND external (REST DTOs + audit envelope payloads) — are declared in `apps/api/src/photo-ingestion/types.ts`. Slice #17b j12 UI mirrors the URL contract WITHOUT importing from this file (parallel-merge pattern).

### Decision L — `reclassify` is event-only in v1

`POST /items/:itemId/reclassify` emits `PHOTO_INGESTION_RECLASSIFIED` but does NOT re-run the vision-LLM pipeline. The endpoint surface is wired now so slice #17b's j12 detail page has a contract to call. The actual re-extraction consumer lands in a followup slice — design intent is: the consumer reads the envelope, calls back into `IngestionService.ingest` with the same `photoId`, and produces a fresh row (the original row is left intact for the audit chain).

### Decision M — `HITL_RETROACTIVE_CORRECTION` channel is reserved (handler wired, emit-side deferred)

Per j12 §Decisions: the post-sign correction surface ("operator realised the previously-signed quantity was wrong") is in scope conceptually. v1 wires the audit subscriber so the channel is bus-ready; the emit-side surface (REST endpoint + service method) is deferred to a followup slice. Documented in tasks.md §Deferred.

## Tradeoffs

- **Tradeoff 1 — Synchronous ingest vs async queue.** v1 awaits the vision-LLM provider synchronously inside `IngestionService.ingest`. For typical photos (~5-8s round-trip per slice #16's planning) this is fine; the controller times out at 30s if the provider hangs. A future async path (insert `pending_extraction` row, return immediately, run extraction in a worker) lands in M3.x. The cost: callers pay the latency. The win: simpler code, no background queue, one round-trip.
- **Tradeoff 2 — Per-field confidence `1.0` for operator edits.** We pin operator-edited fields to `confidence=1.0` so re-classification of the merged extraction yields `auto_fill` for them. The alternative — `null` confidence — forces every downstream consumer to handle the missing-value case. Pinning to `1.0` keeps the field-confidence shape stable AND captures the operator-trust semantics. The forensic chain still distinguishes "LLM said X with confidence 0.4" from "operator entered X" because the original `llm_extraction` is preserved on the row + envelope.
- **Tradeoff 3 — Default capability tag derived from `kind` if caller omits it.** The controller fills `capability = 'inventory.ingest-invoice-photo' | 'inventory.ingest-product-photo'` when the DTO doesn't supply one. This keeps direct REST callers ergonomic; MCP callers always supply their canonical capability name. Cost: a tiny bit of magic. Win: keeps the test+REST surface lean.

## Open questions / risks

- **R1 — Empty-fields extraction**: what if the vision-LLM returns `fields: []`? Slice #16's Zod schema (`VisionLlmOutput.fields.min(1)`) blocks this at the boundary, so it never reaches our classifier. If a future provider sneaks past, our `computeOverallConfidence` returns `0` and the status falls to `rejected` — defensible.
- **R2 — Per-photo idempotency**: re-ingesting the same `photoId` produces a fresh row each time (the controller doesn't enforce dedup). The `idx_photo_ingestion_items_org_photo` index makes the dedup probe cheap if a future caller wants it. For v1, the j12 surface is responsible for not re-triggering on accident.
- **R3 — Manager scope on the queue**: v1 stores no `location_id` on the row, so Manager scope collapses to org-scoped. Tracked in tasks.md §Deferred — the row column + filter will land alongside the IAM hierarchical-scope slice (M4+).
