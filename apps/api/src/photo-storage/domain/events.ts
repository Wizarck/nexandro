import type { AuditEventEnvelope } from '../../audit-log/application/types';
import type { PhotoMimeType, PhotoRetentionClass } from './photo.entity';

/**
 * Bus channel names for the slice #18 m3-photo-storage-lifecycle events.
 *
 * Per Wave 2.1+ hard constraint: events declared INLINE in `apps/api/src/`,
 * NOT imported from `@nexandro/contracts`. The subscriber side (slice
 * #21 AuditLogSubscriber, extended by this slice) consumes the same
 * channel name + envelope shape.
 *
 * Per ADR-AUDIT-EMIT-EVENTS: aggregate_type='photo', aggregate_id=photo_id.
 * Both events default to `retention_class='operational'` via
 * `computeRetentionClass()` (photo events are not regulatory; the upstream
 * event that references the photo URL gets the regulatory class).
 */
export const PHOTO_UPLOADED_CHANNEL = 'm3.photo-storage.photo-uploaded' as const;
export const PHOTO_DELETED_CHANNEL = 'm3.photo-storage.photo-deleted' as const;

export interface PhotoUploadedPayload {
  photo_id: string;
  organization_id: string;
  s3_key: string;
  mime_type: PhotoMimeType;
  byte_size: number;
  retention_class: PhotoRetentionClass;
  uploaded_by_user_id: string;
}

export type PhotoDeletedReason = 'retention_90d' | 'manual';

export interface PhotoDeletedPayload {
  photo_id: string;
  organization_id: string;
  deleted_at: string;
  reason: PhotoDeletedReason;
}

/**
 * Build a `PHOTO_UPLOADED` envelope. `actorKind='user'` since uploads are
 * always user-initiated (the retention cron never uploads).
 */
export function buildPhotoUploadedEvent(input: {
  organizationId: string;
  photoId: string;
  s3Key: string;
  mimeType: PhotoMimeType;
  byteSize: number;
  retentionClass: PhotoRetentionClass;
  uploadedByUserId: string;
}): AuditEventEnvelope<null, PhotoUploadedPayload> {
  return {
    organizationId: input.organizationId,
    aggregateType: 'photo',
    aggregateId: input.photoId,
    actorUserId: input.uploadedByUserId,
    actorKind: 'user',
    payloadBefore: null,
    payloadAfter: {
      photo_id: input.photoId,
      organization_id: input.organizationId,
      s3_key: input.s3Key,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      retention_class: input.retentionClass,
      uploaded_by_user_id: input.uploadedByUserId,
    },
  };
}

/**
 * Build a `PHOTO_DELETED` envelope. `actorKind='system'` for retention-
 * cron-triggered (reason='retention_90d'), `actorKind='user'` for manual.
 */
export function buildPhotoDeletedEvent(input: {
  organizationId: string;
  photoId: string;
  deletedAt: Date;
  reason: PhotoDeletedReason;
  actorUserId?: string | null;
}): AuditEventEnvelope<null, PhotoDeletedPayload> {
  const isSystem = input.reason === 'retention_90d';
  return {
    organizationId: input.organizationId,
    aggregateType: 'photo',
    aggregateId: input.photoId,
    actorUserId: isSystem ? null : (input.actorUserId ?? null),
    actorKind: isSystem ? 'system' : 'user',
    payloadBefore: null,
    payloadAfter: {
      photo_id: input.photoId,
      organization_id: input.organizationId,
      deleted_at: input.deletedAt.toISOString(),
      reason: input.reason,
    },
  };
}
