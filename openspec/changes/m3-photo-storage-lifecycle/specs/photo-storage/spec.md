## ADDED Requirements

### Requirement: Photos persist to S3-compatible object storage with stable metadata rows

The system SHALL persist every photo to S3-compatible object storage and create a corresponding `photos` table row that records the canonical `s3_key`, MIME type, byte size, uploader, retention class, and timestamps. The system SHALL NOT inline image bytes in any database column.

#### Scenario: Photo upload produces both an object and a row
- **WHEN** a caller invokes `PhotoStorageService.registerUpload({ organizationId, photoId, mimeType, byteSize, retentionClass, uploadedByUserId })` after a successful `PUT` to the pre-signed URL
- **THEN** the service verifies the S3 object exists via `HEAD`, persists a row in `photos` with `deleted_at = NULL`, and emits a `PHOTO_UPLOADED` event

#### Scenario: Photo upload fails when S3 object is missing
- **WHEN** `registerUpload()` is called but no S3 object exists at the expected `s3_key`
- **THEN** the service throws `PhotoUploadNotConfirmedError` and persists NO row (NFR-REL-3 image-first invariant)

#### Scenario: MIME type CHECK enforced at DB level
- **WHEN** any caller attempts to insert a `photos` row with `mime_type='image/gif'` (not in the allowed set)
- **THEN** the database raises a CHECK-constraint violation and the row is not inserted

### Requirement: PhotoStorageService generates pre-signed upload URLs with 1-hour TTL

The system SHALL expose `PhotoStorageService.generateUploadUrl(organizationId, photoId, mimeType)` that returns an HTTPS URL signed with AWS Signature V4 + the storage backend's secret key. The URL SHALL be valid for `PUT` requests against the canonical `s3_key` for exactly 1 hour from issuance.

#### Scenario: Upload URL expires after 1 hour
- **WHEN** an upload URL is generated at time T0 and used at time T0 + 61 minutes
- **THEN** the storage backend returns 403 Forbidden ("Request has expired")

#### Scenario: Upload URL canonical s3_key includes org prefix
- **WHEN** `generateUploadUrl(orgA, photoX, 'image/jpeg')` runs
- **THEN** the encoded `s3_key` matches `org/<orgA>/photos/<photoX>.jpg`

#### Scenario: Signed URL is deterministic given inputs + timestamp
- **WHEN** `generateUploadUrl()` runs twice with the same `(organizationId, photoId, mimeType)` AND a fixed mocked timestamp
- **THEN** the returned URL string is byte-identical (signature reproducibility — unit test pins the HMAC output against a known vector)

### Requirement: PhotoStorageService generates pre-signed read URLs with 24-hour TTL

The system SHALL expose `PhotoStorageService.generateReadUrl(organizationId, photoId)` that returns an HTTPS URL valid for `GET` requests for 24 hours from issuance. The method SHALL validate that the photo belongs to the supplied organization before signing.

#### Scenario: Read URL is signed only for owning organization
- **WHEN** `generateReadUrl(orgA, photoY)` is called and `photoY` belongs to `orgB`
- **THEN** the service throws `PhotoCrossTenantError` (translated to HTTP 404 by the controller layer); no URL is returned

#### Scenario: Read URL is rejected after 24-hour TTL
- **WHEN** a read URL is generated at time T0 and used at time T0 + 25 hours
- **THEN** the storage backend returns 403 Forbidden

#### Scenario: Read URL skips soft-deleted photos
- **WHEN** `generateReadUrl(orgA, photoZ)` is called and `photoZ.deleted_at IS NOT NULL`
- **THEN** the service throws `PhotoNotFoundError`; no URL is returned

### Requirement: Retention cron soft-deletes full_res_90d photos older than 90 days at 03:00 UTC daily

The system SHALL run a `@Cron('0 3 * * *')` job (`PhotoRetentionScheduler.runRetention()`) that performs a 2-phase retention pass. Phase 1 marks soft-delete on `full_res_90d` rows past the 90-day window. Phase 2 hard-deletes soft-deleted rows past the 7-day grace window. `thumbnail_indefinite` and `legal_hold` rows are NEVER deleted.

#### Scenario: Phase 1 soft-deletes a 91-day-old full_res_90d photo
- **WHEN** the retention cron runs and a `full_res_90d` photo has `created_at = now() - 91 days` and `deleted_at IS NULL`
- **THEN** Phase 1 sets `deleted_at = now()` and emits a `PHOTO_DELETED` event with `reason: 'retention_90d'`; no S3 object is deleted

#### Scenario: Phase 2 hard-deletes a soft-deleted photo past 7-day grace
- **WHEN** the retention cron runs and a row has `deleted_at = now() - 8 days`
- **THEN** Phase 2 calls S3 `DELETE` against `s3_key`, removes the row from `photos`, and emits NO additional audit event

#### Scenario: thumbnail_indefinite photos never delete
- **WHEN** the retention cron encounters a row with `retention_class='thumbnail_indefinite'` and `created_at = now() - 5 years`
- **THEN** the cron leaves the row untouched (no soft-delete, no hard-delete)

#### Scenario: legal_hold photos exempt from retention
- **WHEN** the retention cron encounters a row with `retention_class='legal_hold'` and `created_at = now() - 100 years`
- **THEN** the cron leaves the row untouched

#### Scenario: Cron is idempotent under partial failure
- **WHEN** the cron crashes after soft-deleting 5 of 10 candidate rows in Phase 1
- **THEN** the next cron run picks up the remaining 5 candidates AND skips the already-soft-deleted 5 (the WHERE clause filters `deleted_at IS NULL` for Phase 1)

### Requirement: PhotoRepository gates every query on organizationId

The system SHALL expose a `PhotoRepository` whose every public method takes `organizationId` as its first parameter and includes it in every database query. No method SHALL provide a "global" find or list surface.

#### Scenario: Cross-tenant lookup returns null
- **WHEN** `PhotoRepository.findById(orgA, photoId)` is called with a `photoId` that belongs to `orgB`
- **THEN** the method returns `null` (not the orgB Photo)

#### Scenario: List by org omits other-org rows
- **WHEN** `PhotoRepository.listByOrg(orgA, limit, offset)` runs and the database contains 100 photos for `orgA` and 50 for `orgB`
- **THEN** the method returns rows belonging exclusively to `orgA`

#### Scenario: Cross-tenant fixture leakage test passes
- **WHEN** the INT test suite seeds two organizations with overlapping data and runs every public repository method
- **THEN** no method returns rows belonging to the non-queried organization

### Requirement: PHOTO_UPLOADED and PHOTO_DELETED events extend the M3 channel set

The system SHALL declare two new event types `PHOTO_UPLOADED` ('m3.photo-storage.photo-uploaded') and `PHOTO_DELETED` ('m3.photo-storage.photo-deleted') in `apps/api/src/audit-log/application/types.ts`. The `AuditLogSubscriber` class SHALL gain two new `@OnEvent` handlers (`onPhotoUploaded`, `onPhotoDeleted`) that delegate to `persistEnvelope()` per the slice-#21 pattern.

#### Scenario: PHOTO_UPLOADED event persists to audit_log
- **WHEN** `PhotoStorageService.registerUpload()` emits a `PHOTO_UPLOADED` envelope and the subscriber handler runs
- **THEN** an `audit_log` row is written with `event_type='PHOTO_UPLOADED'`, `aggregate_type='photo'`, `aggregate_id=<photo_id>`, `actor_kind='user'`, `actor_user_id=<uploader_id>`

#### Scenario: PHOTO_DELETED event from retention cron uses system actor
- **WHEN** the retention cron Phase 1 emits a `PHOTO_DELETED` envelope
- **THEN** the `audit_log` row has `actor_kind='system'`, `actor_user_id=NULL`, and `payload_after.reason='retention_90d'`

#### Scenario: Subscriber handler is idempotent at envelope validation
- **WHEN** an envelope with malformed shape (missing `aggregateId`) is dispatched to `onPhotoUploaded()`
- **THEN** the handler logs a skip-warning and returns without persisting (matches `validateEnvelope` returning null path)

### Requirement: Multi-tenant invariant verified by INT test against real Postgres + MinIO

The system SHALL provide an integration test that runs against a real Postgres test container AND a real MinIO test container, seeds two organizations with overlapping photo data, and asserts that every public service method gates on `organizationId`. The test SHALL run on every PR via CI.

#### Scenario: Cross-tenant signed read URL is refused
- **WHEN** the INT test seeds `orgA.photoX` + `orgB.photoY`, then calls `PhotoStorageService.generateReadUrl(orgA, photoY)`
- **THEN** the call throws `PhotoCrossTenantError`; no signed URL leaks the cross-org resource

#### Scenario: Cross-tenant register is refused
- **WHEN** an attacker submits `registerUpload({ organizationId: orgA, photoId: orgB_photoId, … })` after PUT-ing to an `s3_key` that lives under `org/<orgB>/`
- **THEN** the service verifies the `s3_key` prefix matches `organizationId` and refuses (`PhotoCrossTenantError`)

### Requirement: Signed URL generation is implementation-locked at unit-test level

The system SHALL implement AWS Signature V4 + pre-signed URL generation inline (no AWS SDK dependency). A unit test SHALL pin the generated signature against a known vector (matching AWS docs example) so any future refactor that breaks signature compatibility fails CI before reaching the integration tier.

#### Scenario: Known-vector test holds across refactor
- **WHEN** `PhotoStorageService.generateUploadUrl()` runs with the AWS-documented test input (access key `AKIAIOSFODNN7EXAMPLE`, secret `wJalrXUtnFEMI/...`, fixed timestamp `20130524T000000Z`, bucket `examplebucket`, key `test.txt`)
- **THEN** the generated signature matches the AWS-documented expected output exactly
