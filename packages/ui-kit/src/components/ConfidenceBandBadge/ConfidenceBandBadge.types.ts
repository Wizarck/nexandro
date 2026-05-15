export type ConfidenceBand = 'auto_fill' | 'flag_for_review' | 'reject';

export interface ConfidenceBandBadgeProps {
  /**
   * Per-field or overall confidence in [0, 1]. The component derives the
   * band purely from this value using `AUTO_FILL_THRESHOLD = 0.85` and
   * `FLAG_FOR_REVIEW_THRESHOLD = 0.60` per ADR-034 + ADR-J12-CONFIDENCE-
   * THRESHOLDS-DUPLICATED. The same derivation runs server-side as the
   * routing gate.
   */
  confidence: number;
  /**
   * Optional override label. When omitted, the component renders the
   * canonical text per band.
   */
  label?: string;
  className?: string;
}
