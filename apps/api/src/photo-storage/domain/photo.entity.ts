import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  InvalidMimeTypeError,
  InvalidPhotoIdError,
  InvalidPhotoSizeError,
  InvalidRetentionClassError,
} from './errors';

export type PhotoMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic';
const PHOTO_MIME_TYPES: readonly PhotoMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

export type PhotoRetentionClass =
  | 'full_res_90d'
  | 'thumbnail_indefinite'
  | 'legal_hold';
const PHOTO_RETENTION_CLASSES: readonly PhotoRetentionClass[] = [
  'full_res_90d',
  'thumbnail_indefinite',
  'legal_hold',
];

const MIME_TO_EXT: Record<PhotoMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Inputs for {@link Photo.create}. `id` is optional — when omitted, a UUIDv4
 * is generated and the `s3_key` is derived as `org/<orgId>/photos/<uuid>.<ext>`.
 */
export interface PhotoCreateProps {
  id?: string;
  organizationId: string;
  mimeType: PhotoMimeType;
  byteSize: number;
  uploadedByUserId: string;
  retentionClass: PhotoRetentionClass;
}

/**
 * Photo metadata row. The image bytes live in S3-compatible object storage
 * (MinIO local / S3 production) per ADR-PHOTO-STORAGE-BACKEND. This row
 * persists ONLY the addressable key + lifecycle metadata.
 *
 * Per ADR-PHOTO-METADATA-TABLE:
 *  - `s3_key` stored explicitly (not reconstructed) for bucket-migration safety
 *  - `byte_size integer` (20MB application cap; integer covers 2.1GB)
 *  - `retention_class` text + CHECK with all 3 future values reserved
 *  - `deleted_at` NULLABLE — Phase 1 marks soft-delete; Phase 2 hard-deletes
 *
 * Mutation flows owned by this slice:
 *  - Creation → `PhotoStorageService.registerUpload()` (post-PUT confirmation)
 *  - Soft-delete → `PhotoRetentionScheduler.runPhase1SoftDelete()` (cron-driven)
 *  - Hard-delete → `PhotoRetentionScheduler.runPhase2HardDelete()` (cron-driven)
 *
 * Multi-tenant invariant enforced at the repository layer (every method
 * gates on `organizationId`).
 */
@Entity({ name: 'photos' })
@Index('idx_photos_org_created', ['organizationId', 'createdAt'])
export class Photo {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 's3_key', type: 'text' })
  s3Key!: string;

  @Column({ name: 'mime_type', type: 'text' })
  mimeType!: PhotoMimeType;

  @Column({ name: 'byte_size', type: 'integer' })
  byteSize!: number;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId!: string;

  @Column({ name: 'retention_class', type: 'text' })
  retentionClass!: PhotoRetentionClass;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Construct a new Photo. Does NOT persist; callers use
   * `PhotoRepository.save(photo)` after building.
   *
   * Validation:
   *  - `organizationId` + `uploadedByUserId` must be valid UUIDs
   *  - `id`, if supplied, must be a valid UUID; otherwise generated
   *  - `mimeType` must be in the allowed set (CHECK enforced at DB too)
   *  - `byteSize` must be a positive integer
   *  - `retentionClass` must be in the allowed set
   */
  static create(props: PhotoCreateProps): Photo {
    Photo.validateUuid('organizationId', props.organizationId);
    Photo.validateUuid('uploadedByUserId', props.uploadedByUserId);
    if (props.id !== undefined) Photo.validateUuid('id', props.id);
    Photo.validateMimeType(props.mimeType);
    Photo.validateByteSize(props.byteSize);
    Photo.validateRetentionClass(props.retentionClass);

    const photo = new Photo();
    photo.id = props.id ?? randomUUID();
    photo.organizationId = props.organizationId;
    photo.mimeType = props.mimeType;
    photo.byteSize = props.byteSize;
    photo.uploadedByUserId = props.uploadedByUserId;
    photo.retentionClass = props.retentionClass;
    photo.s3Key = Photo.buildS3Key(
      props.organizationId,
      photo.id,
      props.mimeType,
    );
    photo.deletedAt = null;
    // Set createdAt/updatedAt defensively — @CreateDateColumn only fires
    // inside the DB context; tests/unit code that doesn't round-trip
    // through TypeORM expect non-null timestamps.
    const now = new Date();
    photo.createdAt = now;
    photo.updatedAt = now;
    return photo;
  }

  /**
   * Canonical s3_key shape: `org/<orgId>/photos/<photoId>.<ext>`. The
   * `org/` prefix exists so a hypothetically-leaked S3 access key shows
   * up in bucket access logs under a recognisable prefix.
   */
  static buildS3Key(
    organizationId: string,
    photoId: string,
    mimeType: PhotoMimeType,
  ): string {
    const ext = MIME_TO_EXT[mimeType];
    return `org/${organizationId}/photos/${photoId}.${ext}`;
  }

  private static validateUuid(field: string, value: string): void {
    if (!UUID_RX.test(value)) {
      throw new InvalidPhotoIdError(`${field} is not a valid UUID: ${value}`);
    }
  }

  private static validateMimeType(mimeType: string): void {
    if (!PHOTO_MIME_TYPES.includes(mimeType as PhotoMimeType)) {
      throw new InvalidMimeTypeError(mimeType);
    }
  }

  private static validateByteSize(byteSize: number): void {
    if (!Number.isInteger(byteSize) || byteSize <= 0) {
      throw new InvalidPhotoSizeError(byteSize);
    }
  }

  private static validateRetentionClass(retentionClass: string): void {
    if (
      !PHOTO_RETENTION_CLASSES.includes(retentionClass as PhotoRetentionClass)
    ) {
      throw new InvalidRetentionClassError(retentionClass);
    }
  }
}
