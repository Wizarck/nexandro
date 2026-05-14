## Context

M3 introduces 3 photo-ingestion seams (invoice photos via `inventory.ingest-invoice-photo`, product photos via `inventory.ingest-product-photo`, HACCP corrective-action photos), but slice #16 (`m3-vision-llm-provider-di-otel`, MERGED) only defines the provider DI surface — the photo itself is discarded after vision-LLM extraction. FR33 + ADR-037 require durable, signed-URL-mediated persistence with a 90-day retention policy and audit-log linking.

Slice #17 (`m3-photo-ingest-hitl-review`) is the first UX consumer; it needs a stable `photo_id` to render the HITL queue. Slices #13 (recall dossier) + #15 (APPCC export) embed signed URLs into PDF exports. This slice is the **infrastructure layer** that all of them sit on top of.

Architecture-m3.md (line 202-206) names the policy:

> Photos persist to object storage (MinIO local / S3 production) at upload. URL stored in `audit_log.payload_after.photo_url`. Thumbnail (256×256 WebP) persists indefinitely; full-res 90-day retention default (configurable per org). Daily archival cron (same worker as ADR-029) deletes full-res past retention. Signed URL per access (24h validity); never inlined in DB rows.

NFR-INT-4 names the abstraction: `MinIO (S3-compatible API) for self-hosted + AWS S3 for Enterprise SaaS. Single DI abstraction; same code path.` NFR-REL-3 names the failure-mode invariant: `Image-first, audit_log-second persistence order — system never persists an audit_log row referencing a non-existent image.`

This slice is the backend foundation. No UX. Slice #17 owns the actual ingestion pipeline (invoke vision-LLM, build extraction, surface HITL review queue).

## Goals / Non-Goals

**Goals:**

- Persistent `photos` table with stable schema for downstream consumers (slices #13, #15, #17).
- S3-compatible object-storage abstraction usable against MinIO (local dev) AND AWS S3 (production) via the same env-driven config.
- Signed-URL generation for upload (1h TTL) + read (24h TTL) per ADR-037.
- 90-day retention enforced via a daily 03:00 UTC cron, 2-phase delete (soft-delete then hard-delete after 7-day grace).
- `PHOTO_UPLOADED` + `PHOTO_DELETED` audit-log events emitted via the slice-#21 subscriber pattern.
- Multi-tenant invariant at the repository layer: every method takes `organizationId` first.
- Image-first, DB-row-second persistence order per NFR-REL-3.

**Non-Goals:**

- Thumbnail (256×256 WebP) generation — deferred to slice #17 (the first UX surface that needs thumbnails). The `retention_class='thumbnail_indefinite'` value IS reserved in the CHECK constraint for slice #17 to use without a follow-up migration.
- Per-organization retention-override config — deferred to M3.x (no operator UX in MVP).
- Legal-hold workflow — deferred to M3.x. The `'legal_hold'` value is reserved in the CHECK constraint.
- MCP photo-upload capability (`inventory.ingest-invoice-photo`) — deferred to slice #17.
- Photo-deduplication via content-hash — deferred to M3.x (no business value at MVP scale; ~10 photos/day/org).
- The vision-LLM extraction itself — slice #16's DI seam + slice #17's pipeline own this.
- Cold-storage archival (S3 Glacier) — deferred to M3.x; this slice hard-deletes after 7-day grace.

## Decisions

### ADR-PHOTO-STORAGE-BACKEND — S3-compatible object storage

The system SHALL use S3-compatible object storage for photo persistence. Storage backend is selected at boot via env vars:
- `OPENTRATTOS_PHOTO_STORAGE_ENDPOINT` — base URL (e.g., `http://minio.local:9000` for dev; `https://s3.eu-central-1.amazonaws.com` for prod)
- `OPENTRATTOS_PHOTO_STORAGE_BUCKET` — bucket name (e.g., `opentrattos-photos-prod`)
- `OPENTRATTOS_PHOTO_STORAGE_REGION` — region (used in signature computation; default `us-east-1` for MinIO)
- `OPENTRATTOS_PHOTO_STORAGE_ACCESS_KEY_ID`, `OPENTRATTOS_PHOTO_STORAGE_SECRET_ACCESS_KEY` — auth credentials

The `PhotoStorageService` ships with an inline AWS Signature V4 + pre-signed URL implementation (no AWS SDK dependency); the wire protocol is identical between MinIO and AWS S3. Cross-tested in CI against a MinIO container.

**Rationale**: NFR-INT-4 mandates the single-abstraction approach. The AWS SDK pulls in ~30 MB of transitive deps and has its own request-signing complexities; an inline HMAC-SHA256 + canonical-request implementation is ~120 LOC and trivially auditable.

**Rejected alternatives**:
1. **Filesystem persistence under `apps/api/uploads/`**. Rejected: doesn't scale beyond single-node deploy; signed-URL semantics require a proxy layer; can't migrate to cloud later without a data move.
2. **DB-blob persistence in a `photo_data bytea` column**. Rejected: NFR-SEC-6 explicitly bans inlined images in DB rows; PostgreSQL toast pressure at scale; backup size explosion.
3. **AWS SDK v3 (`@aws-sdk/client-s3`)**. Rejected: bundle size penalty; vendor lock; the pre-signed URL HMAC primitive is the only S3 surface we use.

### ADR-SIGNED-URL-TTL — 1h upload, 24h read

The system SHALL issue pre-signed URLs with:
- **Upload (`PUT`)**: 1-hour TTL. Client receives URL + uploads directly; server is not on the upload data path.
- **Read (`GET`)**: 24-hour TTL. Sufficient for HITL queue browsing + recall dossier PDF render + APPCC export bundle.

The TTLs are baked into `PhotoStorageService.generateUploadUrl()` / `generateReadUrl()` and not configurable per-call (configuration is per-deployment via env, deferred to M3.x). Operators tuning TTL values find them documented in this ADR + the deploy runbook.

**Rationale**: 1h upload is the AWS S3 recommended max for client-initiated single-PUT (avoids stuck idle uploads after a network blip). 24h read covers the longest plausible session length (chef logs in Monday morning, reviews Friday's photos) without forcing re-fetch. Per-request signing makes a leaked URL self-expiring rather than a permanent token.

**Rejected alternatives**:
1. **Public bucket + ACL-gated**. Rejected: cross-org isolation hard to enforce at the bucket level; one mis-tag leaks all photos.
2. **Permanent URLs**. Rejected: leaked URL = permanent data exfiltration vector. Signed URLs with TTL bound the blast radius.

### ADR-RETENTION-90-DAY — 2-phase soft-then-hard delete with 7-day grace

The system SHALL enforce 90-day retention on `full_res_90d` photos via a daily cron at 03:00 UTC. The cron runs in 2 phases:

**Phase 1 — Soft-delete**: identifies rows where `retention_class='full_res_90d' AND created_at < now() - 90 days AND deleted_at IS NULL`. For each row:
- Sets `deleted_at = now()`
- Emits `PHOTO_DELETED` event with `reason: 'retention_90d'`
- Does NOT call S3 DELETE (the object remains addressable via signed URL during grace window)

**Phase 2 — Hard-delete**: identifies rows where `deleted_at IS NOT NULL AND deleted_at < now() - 7 days`. For each row:
- Calls S3 `DELETE` against `s3_key`
- Deletes the row from `photos`
- Emits NO additional audit event (Phase 1 row is the canonical audit record)

The 7-day grace lets an operator restore an erroneously-deleted photo (manual SQL `UPDATE photos SET deleted_at = NULL` + soft-delete audit row reversal — manual ops procedure documented in the deploy runbook). After grace expires, recovery requires S3 backup restoration.

`retention_class='thumbnail_indefinite'` and `retention_class='legal_hold'` rows are SKIPPED by both phases.

**Rationale**: ADR-037 mandates daily archival; the 2-phase pattern matches industry convention (Stripe Files, AWS S3 Lifecycle) and provides operator recovery without infrastructure complexity. The 7-day grace is the standard "oops" window in compliance/GDPR-erasure flows.

**Rejected alternatives**:
1. **Single-phase hard-delete on day 90**. Rejected: zero recovery window; one bad cron run = permanent data loss.
2. **S3 Lifecycle rules on the bucket (no app-side cron)**. Rejected: per-org retention override (M3.x roadmap) impossible without app-side decision logic; AWS S3 Lifecycle is bucket-wide.
3. **Configurable retention via `organizations.retention_days`**. Rejected: not MVP; deferred to M3.x.

### ADR-PHOTO-METADATA-TABLE — `photos` table schema

Photos persist as discrete rows in a new `photos` table with these columns:

| col | type | nullable | note |
|---|---|---|---|
| `id` | uuid | NO | PK; same as the UUID encoded into `s3_key` |
| `organization_id` | uuid | NO | multi-tenant gate; FK `organizations` |
| `s3_key` | text | NO | canonical object-storage key — `org/<orgId>/photos/<uuid>.<ext>` |
| `mime_type` | text | NO | CHECK in (`image/jpeg`,`image/png`,`image/webp`,`image/heic`) |
| `byte_size` | integer | NO | CHECK > 0; supports per-org quota in M3.x |
| `uploaded_by_user_id` | uuid | NO | FK `users` |
| `retention_class` | text | NO | CHECK in (`full_res_90d`,`thumbnail_indefinite`,`legal_hold`) |
| `deleted_at` | timestamptz | YES | NULL = active; NOT NULL = soft-deleted, awaiting hard-delete |
| `created_at` | timestamptz | NO | M2 convention |
| `updated_at` | timestamptz | NO | M2 convention |

Two indexes:
1. `idx_photos_org_created` on `(organization_id, created_at DESC)` — per-org listing (slice #17 HITL queue: "all photos uploaded in the last N days for org X").
2. `idx_photos_retention_class_created` on `(retention_class, created_at) WHERE deleted_at IS NULL` — partial index for retention cron. Once `deleted_at IS NOT NULL`, the row drops out of the index; the index stays narrow even as soft-deletes accumulate.

**Why `s3_key` stored explicitly?** S3 Object Lifecycle (rename, move-to-archive) breaks if the application reconstructs the key from `<orgId>/<uuid>`. Explicit `s3_key` survives bucket migrations.

**Why `byte_size integer` not `bigint`?** Photo size cap is enforced application-side at 20 MB; `integer` covers up to 2.1 GB and saves 4 bytes/row.

**Why `retention_class` text + CHECK rather than enum?** Matches the m2-audit-log + slice #1 pattern; Postgres enums require a migration to extend; text + CHECK with all 3 future values pre-declared lets slice #17 (thumbnail) and M3.x (legal_hold) flow without a migration.

### ADR-AUDIT-EMIT-EVENTS — `PHOTO_UPLOADED` + `PHOTO_DELETED` via slice #21 subscriber

The system SHALL emit `PHOTO_UPLOADED` on every successful photo upload and `PHOTO_DELETED` on every soft-delete (Phase 1 of retention cron, or future manual deletion). Both events use the `AuditEventEnvelope` shape from `apps/api/src/audit-log/application/types.ts`.

This slice EXTENDS slice #21's just-merged `AuditLogSubscriber` class with 2 new `@OnEvent` handlers + 2 new entries in `AuditEventType` + `AuditEventTypeName` maps. The pattern is identical to the M3 channels block already in the subscriber (slice #1 LOT_CREATED, slice #5 COST_SNAPSHOT_RECORDED, etc.):

```typescript
// In AuditEventType:
PHOTO_UPLOADED: 'm3.photo-storage.photo-uploaded',
PHOTO_DELETED: 'm3.photo-storage.photo-deleted',

// In AuditEventTypeName:
'm3.photo-storage.photo-uploaded': 'PHOTO_UPLOADED',
'm3.photo-storage.photo-deleted': 'PHOTO_DELETED',

// In AuditLogSubscriber:
@OnEvent(AuditEventType.PHOTO_UPLOADED)
onPhotoUploaded(payload: AuditEventEnvelope): Promise<void> {
  return this.persistEnvelope(AuditEventType.PHOTO_UPLOADED, payload);
}

@OnEvent(AuditEventType.PHOTO_DELETED)
onPhotoDeleted(payload: AuditEventEnvelope): Promise<void> {
  return this.persistEnvelope(AuditEventType.PHOTO_DELETED, payload);
}
```

`aggregate_type='photo'`, `aggregate_id=<photo_id>`. `actor_kind='user'` for uploads (uploader), `actor_kind='system'` for retention-cron-triggered deletions.

**Why extend the existing subscriber rather than create a new one?** ADR-SUBSCRIBER-FAN-OUT (slice #21 design.md): "audit-log BC is the sole owner of audit_log writes". Adding a second subscriber competing for the same channel violates the invariant + risks double-writes.

**Retention class for these events**: both `PHOTO_UPLOADED` and `PHOTO_DELETED` default to `'operational'` via `computeRetentionClass()` (the lookup table only promotes to `'regulatory'` for events with regulatory footprint like HACCP, lot creation, GR confirmation). Photo events are operational — the regulatory record is the upstream consumer event (e.g., a HACCP corrective-action record that references the photo URL).

**Rejected alternatives**:
1. **Emit-and-forget (no audit row)**. Rejected: NFR-SEC-6 ties photos to `audit_log.payload_after.photo_url`; there must be an explicit audit trail of upload + deletion for GDPR-erasure forensics.
2. **New `PhotoAuditSubscriber` BC**. Rejected: violates ADR-SUBSCRIBER-FAN-OUT; the slice #21 retro explicitly chose single-class fan-out.

### ADR-MULTI-TENANT-GATE — `organizationId` required on every operation

Every `PhotoRepository` method takes `organizationId` as the **first parameter** and includes it in the WHERE clause. `PhotoStorageService.generateReadUrl(orgId, photoId)` validates that the photo belongs to the requesting org before signing the URL. Cross-tenant access throws `PhotoCrossTenantError` (HTTP 404 to avoid leaking existence).

The `s3_key` includes `org/<orgId>/...` as a prefix so even a hypothetically-leaked S3 access key would be discoverable in audit (bucket access logs show the prefix).

**Rationale**: matches the slice #1 + slice #5 + slice #6 multi-tenant pattern. Returning 404 (not 403) on cross-tenant access prevents existence-disclosure side channels.

**Rejected alternative**: bucket-per-org. Rejected: AWS S3 caps at 100 buckets/account by default; 30 orgs hit limits at customer scale; bucket creation is async and adds onboarding latency.

### ADR-IMAGE-FIRST-PERSISTENCE — upload object, THEN persist DB row

Per NFR-REL-3: the system MUST never persist an `audit_log` row referencing a non-existent image. Concrete order in `PhotoStorageService.registerUpload()`:

1. Client `PUT`s the image to the pre-signed URL (server is off the data path).
2. Client calls `POST /photos/register` with `{ photo_id, mime_type, byte_size, retention_class }`.
3. Server `HEAD`s the S3 object to verify it exists with the expected `Content-Length` matching `byte_size`. If absent or size-mismatch, returns `PhotoUploadNotConfirmedError` (HTTP 422) without persisting.
4. Server INSERTs the `photos` row.
5. Server emits `PHOTO_UPLOADED` event.

If step 5's emission fails (the EventEmitter throws), the row is committed but the audit row is missing; a nightly reconciliation job (M3.x followup) catches this. The reverse failure (audit row written, photo row not committed) is impossible because the emit is post-commit.

**Rationale**: NFR-REL-3 hard requirement. Two-step register-after-upload pattern is industry-standard (Stripe Uploads, GitHub Issue Attachments).

**Rejected alternative**: synchronous server-proxied upload. Rejected: 20MB photos × N concurrent uploads = memory pressure on api server; signed URL pushes the I/O cost to client + S3.

## Risks / Trade-offs

- **[Risk]** MinIO and AWS S3 signature implementations diverge in edge cases (URL-encoding of special chars in object keys, host header in canonical request). **Mitigation**: integration test asserts a generated signed URL successfully `PUT`s + `GET`s against a MinIO testcontainer in CI; same fixture re-runs against a sandbox AWS S3 bucket in nightly post-merge.
- **[Risk]** Cron-based retention is single-replica; if the api server crashes mid-cron, partial deletion. **Mitigation**: cron is idempotent — each photo's state transition (`active → soft-deleted → hard-deleted`) is checked at row level; re-running the cron picks up where the crashed run left off. No external lock service.
- **[Risk]** Signed-URL leak via copy-paste from chat. **Mitigation**: 24h TTL on read; can't be re-issued without server-side auth.
- **[Risk]** Per-org quota not enforced in MVP. **Mitigation**: `byte_size` column persisted from day one; M3.x quota slice queries `SUM(byte_size) GROUP BY organization_id`.
- **[Trade-off]** Inline HMAC-SHA256 implementation rather than AWS SDK. **Trade-off**: 120 LOC of crypto code we own vs. 30 MB of vendor code. Crypto is well-understood (RFC 4868 + AWS Signature V4 docs); INT test pins the signature output against a known vector.
- **[Trade-off]** No content-addressable dedup. **Trade-off**: ~10 photos/day/org × 30 orgs × 365 = ~110k photos/year, ~10% dup rate = ~11k wasted slots. At 2 MB each = 22 GB. Cost of S3 storage at €0.023/GB/month = ~€6/month wasted; not worth implementing dedup at MVP.

## Migration Plan

1. **Stage 1 — Schema only** (this PR):
   - Run migration 0032 on staging.
   - No data; no behavior change in M2 / earlier M3 slices.
   - Smoke test: `PhotoStorageService.registerUpload(...)` writes a row + reads it back; multi-tenant leakage test passes against MinIO test fixture.
2. **Stage 2 — Downstream integration** (slice #17 photo-ingest HITL):
   - Slice #17 calls `PhotoStorageService.generateUploadUrl()` → invokes vision-LLM → calls `registerUpload()` after confirmed PUT.
   - First real `photos` rows appear.
3. **Stage 3 — Retention activates** (first cron run, day 91 post-deploy):
   - First `full_res_90d` photos enter the soft-delete window.
   - Operator observes the audit log accumulates `PHOTO_DELETED` rows daily.
4. **Rollback strategy**:
   - Down migration drops `photos` table.
   - Subscriber extension reverts (single-file diff against slice #21).
   - Object storage bucket retained — orphan objects are tolerable until M3.x manual cleanup.
   - No data dependency from other slices yet (slice #17 not merged).

## Open Questions

- **MinIO version pin**: should the testcontainer pin a specific MinIO release (e.g., `minio/minio:RELEASE.2025-04-08T15-41-24Z`)? **Proposed answer**: yes, pin in `docker-compose.test.yml` to avoid silent signature-spec drift; bump in a dedicated maintenance slice if/when AWS S3 Signature V5 ships.
- **Per-org retention override**: should this slice add an `organizations.photo_retention_days` column even if unused? **Proposed answer**: no; YAGNI. The M3.x slice that ships the override UI also adds the column. Adding it now without UI = dead schema for >6 months.
- **HEIC mime type**: do we accept HEIC (iOS default) photos? **Proposed answer**: yes — added to the CHECK constraint. Vision-LLM providers (slice #16 DI) handle HEIC natively; falling back to JPEG-only would force iPhone-using chefs to manually convert.
- **Bucket policy / KMS**: should the bucket be SSE-encrypted? **Proposed answer**: yes for prod; configured at bucket-creation time (ops concern, not app concern). Self-hosted MinIO inherits the operator's filesystem-level encryption choice.
