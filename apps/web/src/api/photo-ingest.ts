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
}

export interface ListHitlQueueParams {
  organizationId: string;
  status?: IngestionStatus | 'all';
  kind?: IngestionKind | 'all';
  limit?: number;
  scope?: 'mine' | 'all' | 'rejected';
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
