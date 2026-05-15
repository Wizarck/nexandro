# Tasks — m3-photo-ingest-retroactive-correction-handler (Wave 2.8 hardening H1b)

## §0 Pre-flight

- [ ] Verify migration slot 0041 is free at apply time (sibling H1a routing slice may not have merged yet → 0040 reserved for it; this slice claims 0041 regardless of sibling order).
- [ ] Verify current MCP `WRITE_CAPABILITIES` count at apply time (slice #17a shipped 52; smoke registered-keys 59). Adjust the +1 bumps in §7 to match the live counts.

## §1 Types + entity extension

- [ ] Extend `apps/api/src/photo-ingestion/types.ts` with `RetroactiveCorrectionInput`, `RetroactiveCorrectionResult`, `CorrectionsHistoryEntry`.
- [ ] Extend `apps/api/src/photo-ingestion/domain/ingestion-item.entity.ts` with `corrections_history` JSONB column + `correctionsHistory: CorrectionsHistoryEntry[]` field.
- [ ] Extend `apps/api/src/photo-ingestion/domain/errors.ts` with `IngestionItemNotCorrectableError`, `IngestionCorrectionEmptyError`, `IngestionRetroactiveCorrectionStaffForbiddenError`.

## §2 Migration 0041

- [ ] Create `apps/api/src/migrations/0041_photo_ingest_retroactive_correction.ts` (class `PhotoIngestRetroactiveCorrection1700000041000`).
- [ ] `ALTER TABLE photo_ingestion_items ADD COLUMN corrections_history JSONB NOT NULL DEFAULT '[]'::jsonb`.
- [ ] `ALTER TABLE lots ADD COLUMN requires_review BOOLEAN NOT NULL DEFAULT false`.
- [ ] `ALTER TABLE goods_receipts ADD COLUMN requires_review BOOLEAN NOT NULL DEFAULT false`.
- [ ] Partial index `idx_lots_requires_review` `ON lots (organization_id, id) WHERE requires_review = true`.
- [ ] Partial index `idx_goods_receipts_requires_review` `ON goods_receipts (organization_id, id) WHERE requires_review = true`.
- [ ] Symmetric `down()` dropping indexes + columns in reverse order.

## §3 RetroactiveCorrectionService

- [ ] Create `apps/api/src/photo-ingestion/application/retroactive-correction.service.ts`:
  - `apply(orgId, itemId, input)`.
  - Loads row via `IngestionItemRepository.findById(orgId, itemId)`; null → throw `IngestionCrossTenantError` (HTTP 404 — existence-disclosure rule).
  - Asserts `row.status === 'signed'`; otherwise throw `IngestionItemNotCorrectableError`.
  - Computes canonical content hash over `{ fieldCorrections, correctedByUserId }` (sorted keys + lowercased string values + 4-decimal numeric quantisation + SHA-256 hex digest).
  - If `row.correctionsHistory[length-1]?.contentHash === newHash`, return `{ idempotent: true, correctionsHistoryLength: history.length, itemId, status: 'signed' }` (no write, no envelope).
  - Refuses if any field corresponding to a former-reject-band field is empty (preserves the slice #17a invariant).
  - Builds new `operatorCorrection` via the same merge rules as `HitlSignService.buildOperatorCorrection`.
  - Appends `CorrectionsHistoryEntry { correctionId, correctedAt, correctedByUserId, reason, previousCorrection: row.operatorCorrection, contentHash }`.
  - Writes column update via `IngestionItemRepository.save(row)`.
  - Emits `HITL_RETROACTIVE_CORRECTION` envelope (regulatory) via `eventEmitter.emitAsync`. `payloadBefore = { operatorCorrection: previousCorrection, correctionsHistoryLength: oldLength }`. `payloadAfter = { operatorCorrection: newCorrection, correctionsHistoryLength: newLength, contentHash, correctionId, reason }`.

## §4 REST endpoint + DTO

- [ ] Extend `apps/api/src/photo-ingestion/interface/dto/ingestion.dto.ts` with `RetroactiveCorrectionDto` (fieldCorrections + optional reason + optional idempotencyKey).
- [ ] Extend `apps/api/src/photo-ingestion/interface/ingestion.controller.ts` with `POST /m3/photo-ingest/items/:itemId/retroactive-correction`:
  - `@Roles('OWNER', 'MANAGER')`.
  - `assertOrgMatch` against the body's organizationId.
  - Calls `RetroactiveCorrectionService.apply()`.
  - Translates errors: `IngestionCrossTenantError` → 404, `IngestionItemNotCorrectableError` → 422, `IngestionCorrectionEmptyError` → 422.

## §5 PhotoIngestionRevocation BC

- [ ] Create `apps/api/src/photo-ingestion-revocation/photo-ingestion-revocation.module.ts` (registers subscriber + repository, imports `AuditLogModule` for compile-time dep — but NOT for direct audit writes).
- [ ] Create `apps/api/src/photo-ingestion-revocation/application/downstream-revocation.repository.ts`:
  - Two methods: `flagLotsBySourcePhotoIngestion(orgId, itemId)` + `flagGoodsReceiptsBySourcePhotoIngestion(orgId, itemId)`.
  - Each runs `manager.query(...)` via TypeORM EntityManager.
  - Each wraps the probe in try/catch on Postgres error code `42703`; on catch, returns `{ columnExists: false, rows: [] }`. Otherwise returns `{ columnExists: true, rows: <id[]> }`.
- [ ] Create `apps/api/src/photo-ingestion-revocation/application/downstream-revocation.subscriber.ts`:
  - `@OnEvent(AuditEventType.HITL_RETROACTIVE_CORRECTION)` handler `onHitlRetroactiveCorrection(envelope)`.
  - Validates envelope shape (orgId + aggregateId).
  - Probes Lots → emits N `LOT_FLAGGED_FOR_REVIEW` envelopes (one per row).
  - Probes GRs → emits M `GR_FLAGGED_FOR_REVIEW` envelopes (one per row).
  - If EITHER probe returned `columnExists: false`, emits ONE `DOWNSTREAM_REVOCATION_DEFERRED` envelope and short-circuits (i.e. if Lot column is missing, do NOT also probe GR — the routing slice ships both columns in one migration, so absence of one signals absence of both per ADR-COLUMN-EXISTS-GRACEFUL-PROBE).
  - All emissions wrapped in try/catch — log warnings, never propagate.

## §6 Audit subscriber + types extension

- [ ] Extend `apps/api/src/audit-log/application/types.ts`:
  - 3 new `AuditEventType` constants: `LOT_FLAGGED_FOR_REVIEW`, `GR_FLAGGED_FOR_REVIEW`, `DOWNSTREAM_REVOCATION_DEFERRED`.
  - 3 new entries in `AuditEventTypeName`.
  - 3 new entries in `RETENTION_BY_EVENT_NAME` all `'regulatory'`.
- [ ] Extend `apps/api/src/audit-log/application/audit-log.subscriber.ts` with 3 new `@OnEvent` handlers, each invoking `persistEnvelope()`. Single-subscriber pattern — no parallel audit subscriber per ADR-AUDIT-LOG-SUBSCRIBER-EXTENSION-NOT-PARALLEL.
- [ ] Extend `apps/api/src/audit-log/application/types.spec.ts` regulatory-list assertion with the 3 new event names.

## §7 MCP capability

- [ ] Extend `packages/mcp-server-opentrattos/src/capabilities/write/inventory.ts` with `inventory.retroactive-correct-photo-ingestion`:
  - `restMethod: 'POST'`.
  - `restPathTemplate: '/m3/photo-ingest/items/:itemId/retroactive-correction'`.
  - `restPathParams: (input) => ({ itemId: (input as { itemId: string }).itemId })`.
  - `restBodyExtractor` strips `itemId` + `idempotencyKey`.
  - Schema: `itemId` (uuid), `organizationId` (uuid), `fieldCorrections` (existing schema, max 200), optional `reason` (1-500 chars), optional `idempotencyKey`.
- [ ] Extend `packages/mcp-server-opentrattos/src/capabilities/write/inventory.spec.ts` with shape + schema + restBodyExtractor tests for the new capability.
- [ ] Update `packages/mcp-server-opentrattos/src/capabilities/write/index.spec.ts` count (`WRITE_CAPABILITIES` 52 → 53).
- [ ] Update `packages/mcp-server-opentrattos/test/smoke.spec.ts` registered-keys count 59 → 60 + add the new key to the spot-check list.

## §8 App-module wiring

- [ ] Wire `PhotoIngestionRevocationModule` into `apps/api/src/app.module.ts` (concat after `PhotoIngestionModule`).

## §9 Tests

- [ ] `apps/api/src/photo-ingestion/application/retroactive-correction.service.spec.ts` — 6 cases per §Test plan (happy, second-edit, idempotent, not-signed, cross-tenant, empty-field).
- [ ] `apps/api/src/photo-ingestion/interface/ingestion.controller.spec.ts` — extend with 3 cases for the new endpoint (RBAC, cross-org, error mapping).
- [ ] `apps/api/src/photo-ingestion-revocation/application/downstream-revocation.subscriber.spec.ts` — 6 cases (1 lot, 1 GR, both, no-match, column-missing, envelope-shape-invalid).

## Deferred

- UI surface for the retroactive correction operation (j12 extension) → followup `m3.x-photo-ingest-retroactive-correction-ui`. Backend contract this slice exposes drives the UI slice without additional changes.
- Auto-cascading the correction into the downstream Lot / GR snapshot — barred by compliance per ADR-NEVER-AUTO-CASCADE-DOWNSTREAM. The operator review queue is the canonical resolution path.
- Backfill `corrections_history` for items already signed pre-migration — forward-only.
- Cleanup cron for `requires_review = false` after operator clears (separate slice).
- "Operator review queue" widget surfacing `requires_review = true` aggregates — followup `m3.x-operator-review-queue-ui`.
- INT spec with testcontainers + real Postgres `42703` round-trip — followup `m3.x-photo-ingest-retroactive-correction-int`.
- Hard cap on `corrections_history.length` — deferred until operational data shows whether the cap is needed.
- Burst-correction alarming (>5 corrections per item per hour) — deferred to observability backlog `m3.x-correction-burst-alarms`.
- Per-organization model + prompt version pinning extension to the retro-correction envelope — covered by the existing slice #17a deferred `m3.x-photo-ingest-org-model-pin`.
