import type { M3AggregateKind } from '../M3AggregateTypeChip/M3AggregateTypeChip.types';

export interface HitlQueueRow {
  itemId: string;
  kind: M3AggregateKind;
  /** Supplier name (invoice) or product name (product). */
  hint: string;
  /** Optional thumbnail URL. Falls back to a placeholder square if absent. */
  thumbnailUrl?: string | null;
  /** Ms epoch when the photo was uploaded. */
  uploadedAt: number;
  /** Per-item overall confidence in [0, 1] for the band badge. */
  overallConfidence: number;
}

export interface HitlQueueListProps {
  rows: ReadonlyArray<HitlQueueRow>;
  selectedItemId: string | null;
  onSelect: (itemId: string) => void;
  /** Fires when the operator clicks the `+ Subir foto` CTA. */
  onUploadClick?: () => void;
  /** Used to compute the relative time label. Defaults to `Date.now()`. */
  now?: number;
  className?: string;
}
