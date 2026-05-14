/**
 * Errors for the photo-storage BC. Per ADR-MULTI-TENANT-GATE,
 * `PhotoCrossTenantError` is translated to HTTP 404 (not 403) to avoid
 * existence-disclosure side channels.
 */

export class PhotoNotFoundError extends Error {
  constructor(photoId: string) {
    super(`Photo not found: ${photoId}`);
    this.name = 'PhotoNotFoundError';
  }
}

export class PhotoCrossTenantError extends Error {
  constructor(photoId: string) {
    // Same message as not-found by design — no existence disclosure.
    super(`Photo not found: ${photoId}`);
    this.name = 'PhotoCrossTenantError';
  }
}

export class PhotoUploadNotConfirmedError extends Error {
  constructor(s3Key: string, detail: string) {
    super(`Photo upload not confirmed for s3_key=${s3Key}: ${detail}`);
    this.name = 'PhotoUploadNotConfirmedError';
  }
}

export class InvalidMimeTypeError extends Error {
  constructor(mimeType: string) {
    super(
      `Invalid mime_type: ${mimeType}. Allowed: image/jpeg, image/png, image/webp, image/heic.`,
    );
    this.name = 'InvalidMimeTypeError';
  }
}

export class InvalidPhotoSizeError extends Error {
  constructor(byteSize: number) {
    super(`Invalid byte_size: ${byteSize}. Must be a positive integer.`);
    this.name = 'InvalidPhotoSizeError';
  }
}

export class InvalidRetentionClassError extends Error {
  constructor(retentionClass: string) {
    super(
      `Invalid retention_class: ${retentionClass}. Allowed: full_res_90d, thumbnail_indefinite, legal_hold.`,
    );
    this.name = 'InvalidRetentionClassError';
  }
}

export class InvalidPhotoIdError extends Error {
  constructor(value: string) {
    super(`Invalid photo id (must be UUID): ${value}`);
    this.name = 'InvalidPhotoIdError';
  }
}
