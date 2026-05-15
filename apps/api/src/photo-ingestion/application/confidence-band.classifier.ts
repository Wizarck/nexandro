import {
  CONFIDENCE_AUTO_FILL,
  CONFIDENCE_FLAG_FOR_REVIEW,
} from '../domain/constants';
import type { ConfidenceBand } from '../types';

/**
 * Classify a single confidence value `c` into one of three bands per
 * ADR-034.
 *
 *  - `c >= 0.85` → `auto_fill`
 *  - `0.60 <= c < 0.85` → `flag_for_review`
 *  - `c < 0.60` (incl. NaN / negative / >1 sentinels) → `reject`
 *
 * Inclusive comparison: `0.85` exactly = auto-fill; `0.60` exactly =
 * flag-for-review. The iron-rule HITL contract is implemented here at
 * code level; no env var, no tenant override.
 *
 * NaN handling: the early reject branch covers `NaN` since `NaN >= x`
 * is always `false`. We return `reject` to keep the classifier
 * monotonic and total — no thrown error from an outage producer.
 */
export function classifyField(confidence: number): ConfidenceBand {
  if (!Number.isFinite(confidence)) return 'reject';
  if (confidence >= CONFIDENCE_AUTO_FILL) return 'auto_fill';
  if (confidence >= CONFIDENCE_FLAG_FOR_REVIEW) return 'flag_for_review';
  return 'reject';
}
