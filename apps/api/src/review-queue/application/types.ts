/**
 * Review-queue BC — inline contracts (slice
 * `m3.x-review-queue-backend`). No `packages/contracts` import per
 * ADR-CONTRACTS-INLINE-IN-API.
 *
 * Cross-BC consumers (UI, MCP server) duplicate the shape on their side
 * and the master-merge resolver picks up any drift mechanically.
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
  /** UUID of the source photo-ingestion item that caused the flag. */
  sourcePhotoIngestionId: string | null;
  /** Aggregate-type-specific joined columns. */
  details: ReviewQueueDetails;
  /** ISO-8601 UTC timestamp. Newest-first across the result set. */
  flaggedAt: string;
}

export interface ListFlaggedOptions {
  aggregateType?: ReviewQueueAggregateType;
  /** Clamped to [1, 200]. Default 50. */
  limit?: number;
}

export interface ListFlaggedResult {
  rows: ReviewQueueRow[];
  /** `true` when the matching set strictly exceeds the requested limit. */
  truncated: boolean;
}

export interface ClearReviewResult {
  aggregateType: ReviewQueueAggregateType;
  aggregateId: string;
  cleared: boolean;
  /**
   * `true` when the row's `requires_review` was already `false` (or the
   * row does not exist). No audit envelope is emitted in either case;
   * the response is the same shape so callers don't branch on a missing
   * row vs a no-op clear.
   */
  alreadyClear: boolean;
}

export const REVIEW_QUEUE_DEFAULT_LIMIT = 50;
export const REVIEW_QUEUE_MAX_LIMIT = 200;
