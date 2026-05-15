import { api } from './client';

/**
 * Inline contract shapes for the review-queue UI (slice
 * `m3.x-review-queue-ui`). Mirrors `apps/api/src/review-queue/application/
 * types.ts` per ADR-CONTRACTS-INLINE-IN-API — the master-merge resolver
 * surfaces drift mechanically.
 */

export type ReviewQueueAggregateType = 'lot' | 'goods_receipt';

export const REVIEW_QUEUE_AGGREGATE_TYPES: ReviewQueueAggregateType[] = [
  'lot',
  'goods_receipt',
];

export interface ReviewQueueLotDetails {
  aggregateType: 'lot';
  receivedAt: string;
  locationId: string;
  supplierId: string | null;
  unit: string;
}

export interface ReviewQueueGrDetails {
  aggregateType: 'goods_receipt';
  receivedAt: string;
  supplierId: string;
  supplierInvoiceRef: string | null;
  receivedAtLocationId: string;
}

export type ReviewQueueDetails =
  | ReviewQueueLotDetails
  | ReviewQueueGrDetails;

export interface ReviewQueueRow {
  aggregateType: ReviewQueueAggregateType;
  aggregateId: string;
  organizationId: string;
  sourcePhotoIngestionId: string | null;
  details: ReviewQueueDetails;
  flaggedAt: string;
}

export interface ListReviewQueueParams {
  organizationId: string;
  aggregateType?: ReviewQueueAggregateType;
  limit?: number;
}

export interface ListReviewQueueResponse {
  rows: ReviewQueueRow[];
  truncated: boolean;
}

export interface ClearReviewQueueParams {
  organizationId: string;
  aggregateType: ReviewQueueAggregateType;
  aggregateId: string;
}

export interface ClearReviewQueueResponse {
  aggregateType: ReviewQueueAggregateType;
  aggregateId: string;
  cleared: boolean;
  alreadyClear: boolean;
}

export async function listReviewQueue(
  params: ListReviewQueueParams,
): Promise<ListReviewQueueResponse> {
  const qs = new URLSearchParams();
  qs.set('organizationId', params.organizationId);
  if (params.aggregateType) qs.set('aggregateType', params.aggregateType);
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  return api<ListReviewQueueResponse>(`/m3/review-queue?${qs.toString()}`);
}

export async function clearReviewQueueItem(
  params: ClearReviewQueueParams,
): Promise<ClearReviewQueueResponse> {
  return api<ClearReviewQueueResponse>(
    `/m3/review-queue/${params.aggregateType}/${params.aggregateId}/clear`,
    {
      method: 'POST',
      body: JSON.stringify({ organizationId: params.organizationId }),
    },
  );
}
