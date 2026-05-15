/**
 * Errors for the photo-ingestion BC. `IngestionCrossTenantError` is
 * translated to HTTP 404 (not 403) at the controller to avoid
 * existence-disclosure side channels — same precedent as photo-storage.
 */

export class IngestionItemNotFoundError extends Error {
  readonly code = 'INGESTION_ITEM_NOT_FOUND';
  constructor(itemId: string) {
    super(`Photo-ingestion item not found: ${itemId}`);
    this.name = 'IngestionItemNotFoundError';
  }
}

export class IngestionCrossTenantError extends Error {
  readonly code = 'INGESTION_ITEM_NOT_FOUND';
  constructor(itemId: string) {
    // Same message as not-found by design — no existence disclosure.
    super(`Photo-ingestion item not found: ${itemId}`);
    this.name = 'IngestionCrossTenantError';
  }
}

export class IngestionAlreadySignedError extends Error {
  readonly code = 'INGESTION_ALREADY_SIGNED';
  constructor(itemId: string) {
    super(`Photo-ingestion item already signed: ${itemId}`);
    this.name = 'IngestionAlreadySignedError';
  }
}

export class IngestionRejectBandFieldMissingError extends Error {
  readonly code = 'INGESTION_REJECT_BAND_FIELD_MISSING';
  constructor(fieldName: string) {
    super(
      `Reject-band field "${fieldName}" requires a non-empty operator correction before signing.`,
    );
    this.name = 'IngestionRejectBandFieldMissingError';
  }
}

export class IngestionItemNotSignableError extends Error {
  readonly code = 'INGESTION_ITEM_NOT_SIGNABLE';
  constructor(itemId: string, status: string) {
    super(
      `Photo-ingestion item ${itemId} is in status "${status}"; only "awaiting_review" and "rejected" items can be signed.`,
    );
    this.name = 'IngestionItemNotSignableError';
  }
}

export class IngestionPhotoNotFoundError extends Error {
  readonly code = 'INGESTION_PHOTO_NOT_FOUND';
  constructor(photoId: string) {
    super(`Photo not found or inaccessible: ${photoId}`);
    this.name = 'IngestionPhotoNotFoundError';
  }
}
