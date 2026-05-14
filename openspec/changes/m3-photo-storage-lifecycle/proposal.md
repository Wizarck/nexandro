## Why

FR33 requires that every photo ingested by M3 (invoice photos, product photos, HACCP corrective-action photos) is persisted to durable storage with a signed-URL access pattern and a retention-bound lifecycle. Today, the M3 vision-LLM provider seam (slice #16 `m3-vision-llm-provider-di-otel`) accepts a base64 image as input and immediately discards it after extraction. The slice #17 HITL review UX (`m3-photo-ingest-hitl-review`) is BLOCKED on a stable `photo_url` it can render alongside the extracted fields and persist into `audit_log.payload_after.photo_url`.

Architecture-m3.md ADR-037 names the policy: **MinIO (local dev) / S3 (production) signed-URL storage, thumbnail-forever + full-res 90-day default retention, daily archival cron, never inline images in DB rows**. This slice ships the canonical `apps/api/src/photo-storage/` bounded context — entity, repository, service, retention cron — so every downstream consumer (slice #17 HITL, slice #13 recall dossier, slice #15 APPCC export) has a stable handle.

This slice is **backend-only** (no UX) per gate-c-slice-list-m3-2026-05-14.md row #18. UI consumers reference the returned `photo_id` + signed URLs.

| Downstream consumer | Reference into photo-storage |
|---|---|
| `m3-photo-ingest-hitl-review` (#17) | invoice + product photos persisted on upload, `photo_url` rendered in HITL queue |
| `m3-recall-86-flag-dispatch` (#13) | dossier section "lot affected" embeds signed URL into PDF |
| `m3-appcc-export-multilingual` (#15) | corrective-action photos referenced from PDF bundle |
| `m3-audit-log-hash-chain-hardening` (#21, merged) | `PHOTO_UPLOADED` + `PHOTO_DELETED` events extend the M3 channel set |

## What Changes

- **Migration `0032_create_photos_table.ts`** — new `photos` table with 11 columns:
  - `id uuid PK`, `organization_id uuid NOT NULL FK organizations` (multi-tenant gate)
  - `s3_key text NOT NULL` (canonical object-storage key — `org/<orgId>/photos/<uuid>.<ext>`)
  - `mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/heic'))`
  - `byte_size integer NOT NULL CHECK (byte_size > 0)` (uploaded payload size — supports per-org quota in M3.x)
  - `uploaded_by_user_id uuid NOT NULL FK users`
  - `retention_class text NOT NULL CHECK (retention_class IN ('full_res_90d','thumbnail_indefinite','legal_hold'))` (per ADR-037)
  - `deleted_at timestamptz NULL` (soft-delete first; hard-delete after 7-day grace)
  - `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
  - 2 indexes:
    - `(organization_id, created_at DESC)` — per-org listing + retention scan
    - `(retention_class, created_at) WHERE deleted_at IS NULL` — partial index for retention cron (drops once `deleted_at` is set)
- **`apps/api/src/photo-storage/`** new BC: `Photo` entity, `PhotoRepository` (multi-tenant gated), `PhotoStorageService` (signed-URL generation), `PhotoRetentionScheduler` (`@Cron('0 3 * * *')` daily 03:00 UTC).
- **Signed-URL generation**: HMAC-SHA256 over `<bucket>/<s3_key>?expires=<unix-ts>` with the storage backend's secret key. 1h TTL for upload URLs (PUT), 24h TTL for read URLs (GET). Inline implementation (no AWS SDK dependency) — the S3-compatible HTTP API accepts pre-signed URLs as documented in `s3-presigned-url-v4` spec. MinIO is wire-compatible.
- **Retention enforcer**: 2-phase. Phase 1 (soft-delete) marks `deleted_at = now()` on `full_res_90d` rows where `created_at < now() - 90 days`. Phase 2 (hard-delete) calls `DELETE` against the S3 object + removes the row when `deleted_at < now() - 7 days`. `thumbnail_indefinite` rows are never deleted. `legal_hold` rows are exempt from soft + hard delete (manual override flow lives in M3.x).
- **Events emitted INLINE** (no `@opentrattos/contracts` import — Wave 2.1+ hard constraint):
  - `PHOTO_UPLOADED` event with payload `{ photo_id, organization_id, mime_type, byte_size, retention_class, uploaded_by_user_id }`
  - `PHOTO_DELETED` event with payload `{ photo_id, organization_id, deleted_at, reason: 'retention_90d' | 'manual' }`
- **AuditLogSubscriber extension**: `apps/api/src/audit-log/application/audit-log.subscriber.ts` gains 2 new `@OnEvent` handlers (`onPhotoUploaded`, `onPhotoDeleted`) plus 2 entries in `AuditEventType` + `AuditEventTypeName` maps (slice #21 m3-audit-log-hash-chain-hardening pattern; this slice extends the M3 channel set per ADR-AUDIT-EMIT-EVENTS).
- **BREAKING**: none. No M2 entities touched. The audit-log subscriber extension is additive (new `@OnEvent` channels do not affect existing subscribers).

## Capabilities

### New Capabilities

- `photo-storage`: canonical `Photo` entity, repository (read + write, multi-tenant gated), service for signed-URL generation, retention enforcer cron. Foundation for FR33 (signed-URL storage + 90-day retention + audit linking).

### Modified Capabilities

- `audit-log`: extends `AuditEventType` + `AuditEventTypeName` maps + the subscriber class with 2 new handlers (`PHOTO_UPLOADED`, `PHOTO_DELETED`). No behaviour change for existing event types. Per slice #21 `ADR-SUBSCRIBER-FAN-OUT`: the audit-log BC is the sole owner of `audit_log` writes; new event sources extend the single subscriber class.

## Impact

- **Prerequisites**: slice #21 `m3-audit-log-hash-chain-hardening` (MERGED at `d596868`) — the subscriber pattern + envelope shape this slice extends. No other M3 prerequisites; slice #16 vision-LLM provider DI (Wave 2.1) is parallel-track and consumes `PhotoStorageService` once both merge.
- **Code**:
  - `apps/api/src/photo-storage/` (new BC). ~550 LOC.
  - `apps/api/src/migrations/0032_create_photos_table.ts`. ~80 LOC.
  - `apps/api/src/audit-log/application/audit-log.subscriber.ts` extension (+ ~10 LOC for 2 handlers).
  - `apps/api/src/audit-log/application/types.ts` extension (+ ~6 LOC for new event-type constants).
  - Tests: ~12 new tests across signed-URL stability, retention 2-phase cron, multi-tenant gate, subscriber handler wiring.
- **Performance**:
  - Two indexes prevent table scans for retention cron + per-org listing.
  - Daily cron scans `(retention_class='full_res_90d', created_at < now() - 90d, deleted_at IS NULL)` — uses the partial index. At ~10 photos/day/org × 30 orgs × 90 days = ~27k rows scanned per night. Negligible.
  - Signed-URL generation is pure HMAC computation — sub-1ms per URL. No I/O.
- **Storage growth**: `photos` table row ~120 bytes. At 10 photos/day × 30 orgs × 365 days = ~110k rows/year = ~13 MB. Negligible. Object storage growth (the actual images) is the real cost driver — ~2 MB/photo × 110k = ~220 GB/year before retention kicks in. Steady-state after 90 days: ~55 GB hot + thumbnails-forever ~5 GB/year accrual.
- **Audit**: every photo upload emits `PHOTO_UPLOADED` event; every soft-delete (Phase 1) emits `PHOTO_DELETED` with `reason='retention_90d'` or `reason='manual'`. Hard-delete (Phase 2) is an internal cleanup and does NOT emit a separate event (the soft-delete audit row is the canonical record). Aggregate is `aggregate_type='photo'`, `aggregate_id=photo_id`. Retention class via `computeRetentionClass()` in slice #21's `RETENTION_BY_EVENT_NAME` is `'operational'` (default) — photos are not regulatory themselves; the `audit_log` row that REFERENCES the photo is what gets the regulatory class via its own event type.
- **Rollback**: drop `photos` table in a follow-up migration. Subscriber class reverts to slice #21's just-merged state. No M2 or other M3 data depends on `photos`. Worst-case rollback during downstream slice #17 development: slice #17 fixtures stop resolving signed URLs but no audit-log integrity loss.
- **Out of scope** (claimed by other slices, do not pre-empt):
  - Photo upload via MCP capability `inventory.ingest-invoice-photo` → slice #17 (HITL backend).
  - Thumbnail generation (256x256 WebP) — deferred to slice #17, which is the first slice with an actual UX surface that needs the thumbnail. This slice persists ONLY full-res; the `retention_class='thumbnail_indefinite'` value is reserved in the CHECK constraint for slice #17 to use.
  - Legal-hold workflow (Owner manually overrides retention) — deferred to M3.x; the `'legal_hold'` retention class is reserved in CHECK.
  - Per-organization retention-override config — deferred to M3.x; this slice uses the global 90-day default.
- **Parallelism**: this slice writes exclusively to `apps/api/src/photo-storage/` + `apps/api/src/migrations/0032_*` + 2 extension hunks in `apps/api/src/audit-log/application/*.ts`. Peer parallel subagents on #19 (AI obs budget — writes to `apps/api/src/ai-observability/budget/`) and #20 (AI obs UI — writes to `apps/web/src/m3/ai-obs/` + ui-kit) are file-path disjoint EXCEPT for the audit-log subscriber: #19 also extends the subscriber with a `BUDGET_TIER_CROSSED` handler. Different event names + different methods — concatenable merge conflict if the merge happens within minutes; resolve by keeping both handler sets.
