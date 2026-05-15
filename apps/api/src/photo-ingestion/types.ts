/**
 * Photo-ingestion BC — inline contracts (slice #17a m3-photo-ingest-backend).
 *
 * No `packages/contracts` import: every shape this BC exposes — both internal
 * (service / repository / classifier inputs) and external (REST DTOs +
 * audit-log envelope payloads) — is declared here. Slice #17b j12 UI mirrors
 * the URL contract WITHOUT importing from this file (parallel-merge pattern
 * per Wave 2.5+ design guidance).
 */

/**
 * Whether a photo is an invoice (downstream → GR draft) or a product photo
 * (downstream → Lot creation). The chosen `kind` also drives the
 * vision-LLM `tag` attribute (`photo-ingest-invoice` / `photo-ingest-product`)
 * for cost drill-down per ADR-VISION-TAG-ATTRIBUTE.
 */
export type IngestionItemKind = 'invoice' | 'product';

/**
 * State machine for a HITL review item.
 *
 *  - `pending_extraction` — row inserted but the vision-LLM call has not yet
 *    completed (only used when the extraction is async; v1 is synchronous,
 *    so most rows never sit in this state).
 *  - `auto_filled` — `overallConfidence >= 0.85` AND every field confidence
 *    `>= 0.85`. Routed downstream without operator review.
 *  - `awaiting_review` — at least one field is in the flag-for-review band
 *    (`0.60 <= c < 0.85`) OR overall confidence is in the flag band. j12
 *    HITL queue surfaces these rows.
 *  - `rejected` — overall confidence `< 0.60` OR vision-LLM returned null.
 *    Operator must complete required fields before signing.
 *  - `signed` — operator confirmed (or auto-fill auto-confirmed downstream
 *    in a future slice). Original llmExtraction + operatorCorrection both
 *    persisted; downstream routing token emitted.
 *  - `expired` — auto-rejected after a future retention window flips the
 *    status. Column reserved here; cron mover is out of scope for v1.
 */
export type IngestionItemStatus =
  | 'pending_extraction'
  | 'auto_filled'
  | 'awaiting_review'
  | 'rejected'
  | 'signed'
  | 'expired';

/**
 * Single extracted field from the vision-LLM. Extends slice #16's base
 * `VisionLlmOutputValue.fields[]` shape with the optional `boundingBox`
 * coordinates the j12 PhotoViewer uses to anchor each field to a region of
 * the source photo.
 *
 * - `boundingBox` MAY be `undefined` if the provider does not emit
 *   coordinates (acceptable for v1; the viewer renders without overlays
 *   gracefully).
 * - Coordinates are normalised `[0, 1]` floats (fraction of photo width /
 *   height) so the viewer can scale to any zoom level.
 */
export interface PhotoIngestionField {
  name: string;
  value: string | number | null;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Augmented extraction payload persisted alongside each ingestion item.
 * Carries the field array plus computed `overallConfidence` (mean over
 * field confidences) and provider provenance (model + prompt version) so
 * the j12 EU AI Act provenance chip can render without an extra round-trip.
 */
export interface PhotoIngestionExtraction {
  fields: PhotoIngestionField[];
  overallConfidence: number;
  modelVersion: string;
  promptVersion: string;
}

/** Confidence-band classification for a single field. */
export type ConfidenceBand = 'auto_fill' | 'flag_for_review' | 'reject';

/** Request input for `IngestionService.ingest`. */
export interface IngestPhotoInput {
  photoId: string;
  kind: IngestionItemKind;
  /**
   * MCP capability identifier driving cost-drill-down + audit-log linkage.
   * Examples: `inventory.ingest-invoice-photo`, `inventory.ingest-product-photo`.
   */
  capability: string;
}

/** Result returned by `IngestionService.ingest` to the controller. */
export interface IngestionResult {
  itemId: string;
  status: IngestionItemStatus;
  overallConfidence: number;
}

/** Input for `HitlSignService.sign`. */
export interface SignIngestionInput {
  /** Operator's corrected fields. May equal the original for accepted fields. */
  fieldCorrections: PhotoIngestionField[];
  signedByUserId: string;
}

/** Filter options for `HitlQueueQuery.listAwaitingReview`. */
export interface HitlQueueOptions {
  limit?: number;
  kind?: IngestionItemKind;
  /**
   * RBAC scope — `'owner'` sees all org rows, `'manager'` sees own +
   * scoped locations. v1 stores no location_id on the row, so manager scope
   * collapses to org-scoped; future slices add location filtering.
   */
  actorScope?: 'owner' | 'manager';
}

/** REST projection row for j12 queue list. */
export interface IngestionQueueRow {
  id: string;
  kind: IngestionItemKind;
  status: IngestionItemStatus;
  photoId: string;
  overallConfidence: number;
  createdAt: string;
  modelVersion: string;
  promptVersion: string;
}

/** REST projection for the j12 detail view. */
export interface IngestionItemDetail extends IngestionQueueRow {
  llmExtraction: PhotoIngestionExtraction;
  operatorCorrection: PhotoIngestionExtraction | null;
  signedAt: string | null;
  signedByUserId: string | null;
  /**
   * Append-only history of retroactive corrections (newest last). Empty
   * `[]` for rows never retro-corrected. Exposed for the j12
   * `CorrectionsHistoryList` sidebar — slice
   * `m3.x-photo-ingest-retroactive-correction-ui`.
   */
  correctionsHistory: CorrectionsHistoryEntry[];
}

/**
 * Append-only history entry for a retroactive correction. The previous
 * `operatorCorrection` snapshot is preserved verbatim per
 * ADR-APPEND-ONLY-CORRECTIONS-HISTORY (EU AI Act Article 13 forensic
 * foundation). Stored as JSONB on the row's `corrections_history` column.
 */
export interface CorrectionsHistoryEntry {
  correctionId: string;
  correctedAt: string;
  correctedByUserId: string;
  reason: string | null;
  previousCorrection: PhotoIngestionExtraction;
  contentHash: string;
}

/** Input for `RetroactiveCorrectionService.apply`. */
export interface RetroactiveCorrectionInput {
  fieldCorrections: PhotoIngestionField[];
  correctedByUserId: string;
  reason?: string;
}

/** Result returned by `RetroactiveCorrectionService.apply`. */
export interface RetroactiveCorrectionResult {
  itemId: string;
  status: 'signed';
  correctionsHistoryLength: number;
  /**
   * When `true`, the input matched the latest history entry's content hash;
   * no row write or envelope emission occurred. Caller idempotent retries
   * MUST observe this signal rather than relying on response equality.
   */
  idempotent: boolean;
}
