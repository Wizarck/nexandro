import { api } from './client';

/**
 * REST client for the j12 HITL review surface (slice #17b
 * m3-photo-ingest-review-ui). All shapes are INLINED per ADR-J12-NO-
 * CONTRACTS-IMPORT — slice #17a (parallel worktree) owns the BC.
 * Master-merge resolver picks up any drift mechanically.
 */

export type IngestionKind = 'invoice' | 'product';

export type IngestionStatus =
  | 'pending_review'
  | 'auto_filled'
  | 'signed'
  | 'rejected';

export interface BoundingBox {
  fieldName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface IngestionField {
  fieldName: string;
  label: string;
  extractedValue: string;
  operatorValue: string;
  confidence: number;
  boundingBox: BoundingBox | null;
}

export interface IngestionExtraction {
  modelVersion: string;
  promptVersion: string;
  overallConfidence: number;
  auditLogId: string | null;
}

/**
 * Append-only retro-correction history entry — mirrors backend
 * `CorrectionsHistoryEntry`. The audit-trail surfaced by
 * `CorrectionsHistoryList` in j12 (slice
 * `m3.x-photo-ingest-retroactive-correction-ui`).
 *
 * `previousCorrection.fields` is the verbatim snapshot of the operator's
 * fields BEFORE this entry was written; the UI derives the "fields
 * changed" count by comparing each entry against either the next entry
 * (or the current `IngestionItem.fields` for the most recent entry).
 */
export interface CorrectionsHistoryPreviousFieldDto {
  fieldName: string;
  operatorValue: string;
}

export interface CorrectionsHistoryEntryDto {
  correctionId: string;
  /** ISO-8601 UTC timestamp. */
  correctedAt: string;
  correctedByUserId: string;
  /** Optional operator-supplied rationale, ≤500 chars. */
  reason: string | null;
  /** Snapshot of the operatorCorrection fields BEFORE this entry. */
  previousCorrection: {
    fields: ReadonlyArray<CorrectionsHistoryPreviousFieldDto>;
  };
  contentHash: string;
}

export interface IngestionItem {
  itemId: string;
  organizationId: string;
  kind: IngestionKind;
  status: IngestionStatus;
  photoUrl: string | null;
  thumbnailUrl: string | null;
  hint: string;
  uploadedAt: string;
  extraction: IngestionExtraction;
  fields: ReadonlyArray<IngestionField>;
  boundingBoxes: ReadonlyArray<BoundingBox>;
  /** ISO-8601 UTC. `null` for items not yet signed. */
  signedAt: string | null;
  /** UUID of the signer (OWNER or MANAGER). `null` until signed. */
  signedByUserId: string | null;
  /**
   * Append-only history of retroactive corrections (newest last). Empty
   * `[]` for items never retro-corrected.
   */
  correctionsHistory: ReadonlyArray<CorrectionsHistoryEntryDto>;
}

export interface ListHitlQueueParams {
  organizationId: string;
  status?: IngestionStatus | 'all';
  kind?: IngestionKind | 'all';
  limit?: number;
  scope?: 'mine' | 'all' | 'rejected' | 'signed';
}

export interface ListHitlQueueResponse {
  items: ReadonlyArray<IngestionItem>;
}

export interface SignIngestionRequest {
  organizationId: string;
  itemId: string;
  actorUserId: string;
  fields: ReadonlyArray<{
    fieldName: string;
    operatorValue: string;
  }>;
}

export interface SignIngestionResponse {
  itemId: string;
  status: 'signed';
  signedAt: string;
  auditLogId: string;
  downstreamAggregateType: 'invoice' | 'product';
  downstreamAggregateId: string;
}

export interface ReclassifyIngestionRequest {
  organizationId: string;
  itemId: string;
  actorUserId: string;
  newKind: IngestionKind;
  reason?: string;
}

export interface ReclassifyIngestionResponse {
  itemId: string;
  kind: IngestionKind;
  auditLogId: string;
}

/**
 * Body for `POST /m3/photo-ingest/items/:itemId/retroactive-correction`.
 * Mirrors `RetroactiveCorrectionDto` in `apps/api`. `correctedByUserId` is
 * inferred server-side from the auth context — NOT in the body.
 */
export interface RetroactiveCorrectionRequest {
  organizationId: string;
  itemId: string;
  fieldCorrections: ReadonlyArray<{
    fieldName: string;
    operatorValue: string;
  }>;
  reason?: string;
}

/** Mirrors `RetroactiveCorrectionResult`. `idempotent: true` means no write happened. */
export interface RetroactiveCorrectionResponse {
  itemId: string;
  status: 'signed';
  correctionsHistoryLength: number;
  idempotent: boolean;
}

export interface UploadPhotoRequest {
  organizationId: string;
  actorUserId: string;
  photoId: string;
  kind: IngestionKind;
  capability:
    | 'inventory.ingest-invoice-photo'
    | 'inventory.ingest-product-photo';
}

export interface UploadPhotoResponse {
  itemId: string;
  status: IngestionStatus;
}

function buildQueueQuery(p: ListHitlQueueParams): string {
  const s = new URLSearchParams();
  s.set('organizationId', p.organizationId);
  if (p.status && p.status !== 'all') s.set('status', p.status);
  if (p.kind && p.kind !== 'all') s.set('kind', p.kind);
  if (typeof p.limit === 'number') s.set('limit', String(p.limit));
  if (p.scope) s.set('scope', p.scope);
  return s.toString();
}

export async function listHitlQueue(
  params: ListHitlQueueParams,
): Promise<ListHitlQueueResponse> {
  return api<ListHitlQueueResponse>(
    `/m3/photo-ingest/items?${buildQueueQuery(params)}`,
  );
}

export async function getIngestionItem(
  organizationId: string,
  itemId: string,
): Promise<IngestionItem> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<IngestionItem>(
    `/m3/photo-ingest/items/${itemId}?${qs}`,
  );
}

export async function signIngestion(
  input: SignIngestionRequest,
): Promise<SignIngestionResponse> {
  return api<SignIngestionResponse>(
    `/m3/photo-ingest/items/${input.itemId}/sign`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function reclassifyIngestion(
  input: ReclassifyIngestionRequest,
): Promise<ReclassifyIngestionResponse> {
  return api<ReclassifyIngestionResponse>(
    `/m3/photo-ingest/items/${input.itemId}/reclassify`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function uploadPhoto(
  input: UploadPhotoRequest,
): Promise<UploadPhotoResponse> {
  return api<UploadPhotoResponse>(`/m3/photo-ingest/items`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function retroactiveCorrectIngestion(
  input: RetroactiveCorrectionRequest,
): Promise<RetroactiveCorrectionResponse> {
  // Backend expects `fieldCorrections` with shape `{ name, value }` per
  // `FieldCorrectionDto` (apps/api). The UI layer carries the more
  // descriptive `{ fieldName, operatorValue }` shape internally; remap on
  // the wire so the DTO validation passes.
  const body = {
    organizationId: input.organizationId,
    fieldCorrections: input.fieldCorrections.map((f) => ({
      name: f.fieldName,
      value: f.operatorValue,
    })),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  };
  return api<RetroactiveCorrectionResponse>(
    `/m3/photo-ingest/items/${input.itemId}/retroactive-correction`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}
