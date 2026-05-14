import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  buildPhotoDeletedEvent,
  buildPhotoUploadedEvent,
  PhotoDeletedReason,
  PHOTO_DELETED_CHANNEL,
  PHOTO_UPLOADED_CHANNEL,
} from '../domain/events';
import {
  PhotoCrossTenantError,
  PhotoNotFoundError,
  PhotoUploadNotConfirmedError,
} from '../domain/errors';
import {
  Photo,
  PhotoMimeType,
  PhotoRetentionClass,
} from '../domain/photo.entity';
import { PhotoRepository } from './photo.repository';
import { presignUrl } from './sigv4';

const UPLOAD_TTL_SECONDS = 60 * 60; // 1 hour per ADR-SIGNED-URL-TTL
const READ_TTL_SECONDS = 60 * 60 * 24; // 24 hours per ADR-SIGNED-URL-TTL

/**
 * Storage backend configuration sourced from env. Centralised so tests can
 * stub it without env-var manipulation.
 */
export interface PhotoStorageConfig {
  endpoint: string; // e.g. "minio.local:9000" or "s3.eu-central-1.amazonaws.com"
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  scheme: 'http' | 'https';
}

export const PHOTO_STORAGE_CONFIG = Symbol('PHOTO_STORAGE_CONFIG');

/**
 * Minimal S3 client surface needed by this service. Decoupled from any
 * specific HTTP library so tests can inject a fake; the production wiring
 * provides a `fetch`-based implementation.
 */
export interface PhotoS3Client {
  /**
   * Return `byteSize` of the object at `objectKey`, or `null` if missing.
   * Used by `registerUpload()` to confirm the client's PUT landed before
   * persisting the metadata row (NFR-REL-3 image-first invariant).
   */
  headObject(objectKey: string): Promise<{ byteSize: number } | null>;

  /** Delete the object at `objectKey`. Idempotent — missing object is a no-op. */
  deleteObject(objectKey: string): Promise<void>;
}

export const PHOTO_S3_CLIENT = Symbol('PHOTO_S3_CLIENT');

export interface GenerateUploadUrlResult {
  url: string;
  s3Key: string;
  photoId: string;
  expiresAt: Date;
}

export interface GenerateReadUrlResult {
  url: string;
  expiresAt: Date;
}

export interface RegisterUploadInput {
  organizationId: string;
  photoId: string;
  mimeType: PhotoMimeType;
  byteSize: number;
  uploadedByUserId: string;
  retentionClass: PhotoRetentionClass;
}

/**
 * `PhotoStorageService` — backend for FR33. Per ADR-PHOTO-STORAGE-BACKEND
 * the service composes:
 *  - inline AWS Sigv4 pre-signed URL generation (sigv4.ts)
 *  - S3 client surface for HEAD + DELETE (PhotoS3Client interface)
 *  - PhotoRepository for the metadata row lifecycle
 *  - EventEmitter2 for PHOTO_UPLOADED / PHOTO_DELETED audit emissions
 *
 * Multi-tenant gate at every per-org method. `PhotoCrossTenantError` is
 * translated to HTTP 404 by the controller layer (slice #17) to avoid
 * existence-disclosure.
 */
@Injectable()
export class PhotoStorageService {
  private readonly logger = new Logger(PhotoStorageService.name);

  constructor(
    private readonly repository: PhotoRepository,
    private readonly events: EventEmitter2,
    private readonly config: PhotoStorageConfig,
    private readonly s3: PhotoS3Client,
  ) {}

  /**
   * Generate a pre-signed `PUT` URL for the client to upload directly to
   * the storage backend. 1-hour TTL per ADR-SIGNED-URL-TTL.
   *
   * Returns the URL + the canonical `s3_key` + the generated `photoId` so
   * the caller can subsequently call `registerUpload()` with the same id.
   */
  generateUploadUrl(
    organizationId: string,
    photoId: string,
    mimeType: PhotoMimeType,
    now: Date = new Date(),
  ): GenerateUploadUrlResult {
    const s3Key = Photo.buildS3Key(organizationId, photoId, mimeType);
    const url = presignUrl({
      method: 'PUT',
      bucket: this.config.bucket,
      objectKey: s3Key,
      host: this.config.endpoint,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expiresInSeconds: UPLOAD_TTL_SECONDS,
      contentType: mimeType,
      now,
      scheme: this.config.scheme,
    });
    return {
      url,
      s3Key,
      photoId,
      expiresAt: new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000),
    };
  }

  /**
   * Generate a pre-signed `GET` URL for the client to read the photo.
   * 24-hour TTL per ADR-SIGNED-URL-TTL. Validates ownership; throws
   * `PhotoCrossTenantError` (translated to HTTP 404) on cross-org access.
   * Soft-deleted photos throw `PhotoNotFoundError` (also HTTP 404).
   */
  async generateReadUrl(
    organizationId: string,
    photoId: string,
    now: Date = new Date(),
  ): Promise<GenerateReadUrlResult> {
    const photo = await this.lookupActivePhoto(organizationId, photoId);
    const url = presignUrl({
      method: 'GET',
      bucket: this.config.bucket,
      objectKey: photo.s3Key,
      host: this.config.endpoint,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expiresInSeconds: READ_TTL_SECONDS,
      now,
      scheme: this.config.scheme,
    });
    return {
      url,
      expiresAt: new Date(now.getTime() + READ_TTL_SECONDS * 1000),
    };
  }

  /**
   * Confirm an upload landed in S3 + persist the metadata row + emit
   * `PHOTO_UPLOADED`. Per ADR-IMAGE-FIRST-PERSISTENCE: NFR-REL-3 mandates
   * image-first ordering — the S3 HEAD is the gate; no row is persisted
   * if the object is missing or the size doesn't match.
   */
  async registerUpload(input: RegisterUploadInput): Promise<Photo> {
    const s3Key = Photo.buildS3Key(
      input.organizationId,
      input.photoId,
      input.mimeType,
    );

    const head = await this.s3.headObject(s3Key);
    if (head === null) {
      throw new PhotoUploadNotConfirmedError(s3Key, 'S3 HEAD returned null');
    }
    if (head.byteSize !== input.byteSize) {
      throw new PhotoUploadNotConfirmedError(
        s3Key,
        `byte_size mismatch — head=${head.byteSize} expected=${input.byteSize}`,
      );
    }

    const photo = Photo.create({
      id: input.photoId,
      organizationId: input.organizationId,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      uploadedByUserId: input.uploadedByUserId,
      retentionClass: input.retentionClass,
    });
    const saved = await this.repository.save(photo);

    const envelope = buildPhotoUploadedEvent({
      organizationId: saved.organizationId,
      photoId: saved.id,
      s3Key: saved.s3Key,
      mimeType: saved.mimeType,
      byteSize: saved.byteSize,
      retentionClass: saved.retentionClass,
      uploadedByUserId: saved.uploadedByUserId,
    });
    // Fire-and-forget — emit failures are logged by the bus but never
    // reverse the row commit (NFR-REL-3 image-first ordering).
    await this.events.emitAsync(PHOTO_UPLOADED_CHANNEL, envelope);
    return saved;
  }

  /**
   * Soft-delete a photo. Used by the retention cron (Phase 1) and by
   * hypothetical future manual deletion (M3.x). Idempotent: a row already
   * soft-deleted is left untouched and no duplicate audit event is emitted.
   *
   * For retention-cron callers: `reason='retention_90d'` + `actorUserId=null`.
   * For manual callers: `reason='manual'` + `actorUserId=<user>`.
   */
  async softDeletePhoto(input: {
    organizationId: string;
    photoId: string;
    reason: PhotoDeletedReason;
    actorUserId?: string | null;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    const photo = await this.repository.findById(
      input.organizationId,
      input.photoId,
    );
    if (photo === null) {
      throw new PhotoNotFoundError(input.photoId);
    }
    if (photo.deletedAt !== null) {
      // Idempotent — already soft-deleted.
      return;
    }
    await this.repository.softDelete(input.photoId, now);

    const envelope = buildPhotoDeletedEvent({
      organizationId: input.organizationId,
      photoId: input.photoId,
      deletedAt: now,
      reason: input.reason,
      actorUserId: input.actorUserId ?? null,
    });
    await this.events.emitAsync(PHOTO_DELETED_CHANNEL, envelope);
  }

  /**
   * Internal helper: resolve a Photo gated on org + active state. Throws
   * `PhotoCrossTenantError` on cross-org access (HTTP 404 by controller
   * layer per ADR-MULTI-TENANT-GATE) and `PhotoNotFoundError` on absent or
   * soft-deleted rows.
   */
  private async lookupActivePhoto(
    organizationId: string,
    photoId: string,
  ): Promise<Photo> {
    const photo = await this.repository.findById(organizationId, photoId);
    if (photo === null) {
      throw new PhotoCrossTenantError(photoId);
    }
    if (photo.deletedAt !== null) {
      throw new PhotoNotFoundError(photoId);
    }
    return photo;
  }
}
