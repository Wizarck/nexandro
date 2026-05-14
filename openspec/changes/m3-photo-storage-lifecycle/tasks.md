## 1. Migration 0032 — photos table + 2 indexes

- [ ] 1.1 `apps/api/src/migrations/0032_create_photos_table.ts` — create `photos` table per design.md ADR-PHOTO-METADATA-TABLE (10 columns: id, organization_id, s3_key, mime_type, byte_size, uploaded_by_user_id, retention_class, deleted_at, created_at, updated_at) with CHECK constraints on `mime_type` (jpeg|png|webp|heic), `byte_size > 0`, `retention_class` (full_res_90d|thumbnail_indefinite|legal_hold)
- [ ] 1.2 Same migration: FK constraints to `organizations(id)` and `users(id)`
- [ ] 1.3 Same migration: create `idx_photos_org_created` on `(organization_id, created_at DESC)`
- [ ] 1.4 Same migration: create `idx_photos_retention_class_created` partial index on `(retention_class, created_at) WHERE deleted_at IS NULL`
- [ ] 1.5 Down migration drops indexes then table

## 2. Domain layer — Photo entity + errors

- [ ] 2.1 `apps/api/src/photo-storage/domain/photo.entity.ts` — TypeORM entity matching migration 0032; `mime_type` typed as union `'image/jpeg'|'image/png'|'image/webp'|'image/heic'`; `retention_class` typed as `'full_res_90d'|'thumbnail_indefinite'|'legal_hold'`; `byte_size` integer (no numericTransformer needed — not a numeric column)
- [ ] 2.2 `Photo.create(props)` static factory — generates UUID, builds `s3_key` from `org/<orgId>/photos/<uuid>.<ext>`, sets `deleted_at = null`, validates inputs (UUID format, mime_type in enum, byte_size > 0)
- [ ] 2.3 `apps/api/src/photo-storage/domain/errors.ts`:
  - `PhotoNotFoundError` (HTTP 404)
  - `PhotoCrossTenantError` (HTTP 404 — disguise to avoid existence disclosure)
  - `PhotoUploadNotConfirmedError` (HTTP 422 — S3 object missing or size-mismatch on `HEAD`)
  - `InvalidMimeTypeError`, `InvalidPhotoSizeError`, `InvalidRetentionClassError`

## 3. Events module — inline (no @opentrattos/contracts)

- [ ] 3.1 `apps/api/src/photo-storage/domain/events.ts`:
  - `export const PHOTO_UPLOADED_CHANNEL = 'm3.photo-storage.photo-uploaded' as const`
  - `export const PHOTO_DELETED_CHANNEL = 'm3.photo-storage.photo-deleted' as const`
  - `export interface PhotoUploadedPayload { photo_id; organization_id; mime_type; byte_size; retention_class; uploaded_by_user_id; s3_key }`
  - `export interface PhotoDeletedPayload { photo_id; organization_id; deleted_at; reason: 'retention_90d' | 'manual' }`
  - `buildPhotoUploadedEvent(input): AuditEventEnvelope<null, PhotoUploadedPayload>` — sets `aggregateType='photo'`, `actorKind='user'`
  - `buildPhotoDeletedEvent(input): AuditEventEnvelope<null, PhotoDeletedPayload>` — sets `aggregateType='photo'`, `actorKind='system'` for retention-triggered, `actorKind='user'` for manual

## 4. Application layer — repository + service + scheduler

- [ ] 4.1 `apps/api/src/photo-storage/application/photo.repository.ts`:
  - `findById(organizationId, photoId): Promise<Photo | null>` — uses `idx_photos_org_created`
  - `listByOrg(organizationId, limit, offset): Promise<Photo[]>` — same index
  - `save(photo): Promise<Photo>`
  - `findCandidatesForSoftDelete(beforeDate, batchSize): Promise<Photo[]>` — partial-index path (cron Phase 1)
  - `findCandidatesForHardDelete(beforeDate, batchSize): Promise<Photo[]>` — cron Phase 2
  - `softDelete(photoId, deletedAt): Promise<void>` — used by Phase 1 + manual deletion
  - `hardDelete(photoId): Promise<void>` — used by Phase 2; throws if `deleted_at IS NULL`
  - Every method takes `organizationId` as first param EXCEPT the cron-scoped `findCandidates*` (cron iterates all orgs by design)
- [ ] 4.2 `apps/api/src/photo-storage/application/photo-storage.service.ts`:
  - `generateUploadUrl(organizationId, photoId, mimeType): { url, s3Key, expiresAt }` — 1h TTL HMAC-SHA256
  - `generateReadUrl(organizationId, photoId): { url, expiresAt }` — 24h TTL; validates ownership; throws `PhotoCrossTenantError` on mismatch
  - `registerUpload(input): Promise<Photo>` — calls S3 `HEAD` to verify object exists + matches `byteSize`; persists row; emits `PHOTO_UPLOADED` event
  - `softDeletePhoto(organizationId, photoId, reason): Promise<void>` — emits `PHOTO_DELETED` event
  - Inline AWS Sigv4 implementation (no @aws-sdk dependency); env-driven endpoint + bucket + region + credentials
- [ ] 4.3 `apps/api/src/photo-storage/application/photo-retention.scheduler.ts`:
  - `@Cron('0 3 * * *', { name: 'photo-retention' })` daily at 03:00 UTC
  - `runRetention()`: invokes `runPhase1SoftDelete()` then `runPhase2HardDelete()`
  - `runPhase1SoftDelete()`: paginates `findCandidatesForSoftDelete(now - 90d, 100)`; for each row sets `deleted_at`, emits `PHOTO_DELETED` with `reason='retention_90d'`; per-row try/catch (REQ-EX-7-style scheduler resilience)
  - `runPhase2HardDelete()`: paginates `findCandidatesForHardDelete(now - 7d, 100)`; for each row calls `s3DeleteObject(s3Key)` then `repository.hardDelete()`; per-row try/catch
  - Env flag `OPENTRATTOS_PHOTO_RETENTION_ENABLED=false` short-circuits the cron
- [ ] 4.4 `apps/api/src/photo-storage/application/sigv4.ts`:
  - Pure functions `canonicalRequest()`, `stringToSign()`, `signingKey()`, `presignUrl()` per AWS Signature V4 spec
  - No NestJS imports; tested in isolation against AWS-documented known vectors

## 5. AuditLogSubscriber extension (slice #21 pattern)

- [ ] 5.1 `apps/api/src/audit-log/application/types.ts`:
  - Add `PHOTO_UPLOADED: 'm3.photo-storage.photo-uploaded'` and `PHOTO_DELETED: 'm3.photo-storage.photo-deleted'` to `AuditEventType` const
  - Add corresponding `AuditEventTypeName` entries: `'m3.photo-storage.photo-uploaded': 'PHOTO_UPLOADED'`, `'m3.photo-storage.photo-deleted': 'PHOTO_DELETED'`
  - Leave `RETENTION_BY_EVENT_NAME` unchanged — both events default to `'operational'` (PHOTO events are not regulatory; the upstream event that references the photo URL is the regulatory record)
- [ ] 5.2 `apps/api/src/audit-log/application/audit-log.subscriber.ts`:
  - Add new section `// ---- Slice #18 m3-photo-storage-lifecycle ----` after the existing M3 channels
  - Add `@OnEvent(AuditEventType.PHOTO_UPLOADED) onPhotoUploaded(payload): Promise<void> { return this.persistEnvelope(AuditEventType.PHOTO_UPLOADED, payload); }`
  - Add `@OnEvent(AuditEventType.PHOTO_DELETED) onPhotoDeleted(payload): Promise<void> { return this.persistEnvelope(AuditEventType.PHOTO_DELETED, payload); }`

## 6. Module wiring (NestJS)

- [ ] 6.1 `apps/api/src/photo-storage/photo-storage.module.ts` — `TypeOrmModule.forFeature([Photo])`, providers: `PhotoRepository`, `PhotoStorageService`, `PhotoRetentionScheduler`; exports: `PhotoStorageService` (read-only public surface for slice #17 to consume)
- [ ] 6.2 `apps/api/src/app.module.ts` — import `PhotoStorageModule` after `EmailDispatchModule` with M3 Wave 2.4 comment
- [ ] 6.3 No controller in this slice (no REST/MCP surface); slice #17 wires the upload controller

## 7. Unit tests

- [ ] 7.1 `photo.entity.spec.ts`:
  - `Photo.create()` happy path: produces entity with `deleted_at=null`, `s3_key` matches `org/<orgId>/photos/<uuid>.<ext>`
  - Invalid mime_type throws `InvalidMimeTypeError`
  - Invalid byte_size (0, negative) throws `InvalidPhotoSizeError`
  - Invalid retention_class throws `InvalidRetentionClassError`
  - `createdAt = new Date()` set in returned entity (since @CreateDateColumn doesn't fire outside DB context)
- [ ] 7.2 `sigv4.spec.ts`:
  - Known-vector test: AWS-documented inputs produce AWS-documented signature byte-for-byte
  - `presignUrl()` deterministic given fixed timestamp
  - URL contains required query params (`X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Expires`, `X-Amz-SignedHeaders`, `X-Amz-Signature`)
- [ ] 7.3 `photo-storage.service.spec.ts`:
  - `generateUploadUrl` returns 1h TTL
  - `generateReadUrl` validates ownership; cross-tenant call throws `PhotoCrossTenantError`
  - `generateReadUrl` on soft-deleted photo throws `PhotoNotFoundError`
  - `registerUpload` calls S3 HEAD, refuses when object missing
  - `registerUpload` emits `PHOTO_UPLOADED` event after row commit
  - `softDeletePhoto` emits `PHOTO_DELETED` with provided reason
- [ ] 7.4 `photo-retention.scheduler.spec.ts`:
  - Phase 1 soft-deletes 91-day-old `full_res_90d` row + emits `PHOTO_DELETED` with `reason='retention_90d'`
  - Phase 1 skips `thumbnail_indefinite` and `legal_hold`
  - Phase 2 hard-deletes 8-day-old soft-deleted row + calls S3 DELETE
  - Phase 2 skips rows within 7-day grace
  - Idempotency: re-running cron after partial run does not double-process
  - Env flag off short-circuits cron
- [ ] 7.5 `audit-log.subscriber.spec.ts` — extend with slice #18 cases:
  - `PHOTO_UPLOADED` envelope persisted with `event_type='PHOTO_UPLOADED'`
  - `PHOTO_DELETED` envelope persisted with `event_type='PHOTO_DELETED'`

## 8. Integration tests (against Postgres + MinIO testcontainers)

- [ ] 8.1 `photo-storage.int-spec.ts` — uses M2 testcontainer harness + MinIO container from `docker-compose.test.yml`
- [ ] 8.2 End-to-end: `generateUploadUrl` → `PUT` against MinIO → `registerUpload` → `photos` row exists → `generateReadUrl` → `GET` returns the bytes
- [ ] 8.3 Multi-tenant leakage: seed orgA + orgB photos; iterate every `PhotoRepository` method; assert no cross-org rows returned
- [ ] 8.4 Cross-tenant signed URL refusal: `generateReadUrl(orgA, orgB_photoId)` throws `PhotoCrossTenantError`
- [ ] 8.5 Retention cron e2e: insert a 91-day-old row; run scheduler; assert `deleted_at` set + `audit_log` row appears; advance simulated time; run scheduler; assert hard-delete + S3 object gone

## 9. Migration smoke + rollback verification

- [ ] 9.1 Run migration 0032 against a fresh M3-state database; assert `pg_indexes` shows both indexes on `photos`
- [ ] 9.2 Insert a row that violates the `mime_type` CHECK; assert constraint violation
- [ ] 9.3 Run down migration; assert `photos` table dropped; re-run up; assert idempotent

## 10. Documentation + handoff

- [ ] 10.1 `apps/api/src/photo-storage/README.md` — BC purpose, public surface (`PhotoStorageService`), what's claimed by downstream slices (#17 photo-ingest HITL, #13 recall dossier, #15 APPCC export)
- [ ] 10.2 Update `docs/operations/` with a brief deploy note: env vars `OPENTRATTOS_PHOTO_STORAGE_*` required; MinIO bootstrap snippet for self-hosted

## 11. CI + PR hygiene

- [ ] 11.1 `pnpm -w typecheck` passes
- [ ] 11.2 `pnpm -w lint --max-warnings=0` passes
- [ ] 11.3 `pnpm -w test` passes (unit + INT)
- [ ] 11.4 `openspec validate m3-photo-storage-lifecycle` returns 0
- [ ] 11.5 PR description cites the slice contract row (#18), migration slot claimed (0032), and the cross-cutting subscriber extension hunk (audit-log.subscriber.ts + types.ts) — coordinate with slice #19 if both PRs merge same day (concatenable handler conflict)
