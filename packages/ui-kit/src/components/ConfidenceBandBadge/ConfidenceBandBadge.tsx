import { cn } from '../../lib/cn';
import type {
  ConfidenceBand,
  ConfidenceBandBadgeProps,
} from './ConfidenceBandBadge.types';

/**
 * j12 ConfidenceBandBadge (slice #17b m3-photo-ingest-review-ui).
 *
 * Per ADR-J12-CONFIDENCE-THRESHOLDS-DUPLICATED the boundary constants
 * `0.85` (auto-fill) and `0.60` (flag-for-review) live both here AND in
 * slice #17a's `apps/api/src/photo-ingestion/constants.ts`. The
 * duplication is bounded by the proposal-checklist gate; master-merge
 * resolver picks up any drift.
 *
 * Per ADR-034 + j12 §Decisions: dot + colour + text, never colour-only.
 * Operators with colour-vision differences still read the band.
 */
export const AUTO_FILL_THRESHOLD = 0.85;
export const FLAG_FOR_REVIEW_THRESHOLD = 0.6;

export function deriveBand(confidence: number): ConfidenceBand {
  if (confidence >= AUTO_FILL_THRESHOLD) return 'auto_fill';
  if (confidence >= FLAG_FOR_REVIEW_THRESHOLD) return 'flag_for_review';
  return 'reject';
}

const BAND_STYLES: Readonly<
  Record<
    ConfidenceBand,
    { dot: string; fg: string; bg: string; border: string; text: string }
  >
> = {
  auto_fill: {
    dot: 'var(--color-success)',
    fg: 'var(--color-success)',
    bg: 'var(--color-surface)',
    border: 'var(--color-border)',
    text: 'auto-fill',
  },
  flag_for_review: {
    dot: 'var(--color-mute)',
    fg: 'var(--color-mute)',
    bg: 'var(--color-surface)',
    border: 'var(--color-border)',
    text: 'revisar',
  },
  reject: {
    dot: 'var(--color-destructive)',
    fg: 'var(--color-destructive)',
    bg: 'var(--color-surface)',
    border: 'var(--color-destructive)',
    text: 'Manual',
  },
};

export function ConfidenceBandBadge({
  confidence,
  label,
  className,
}: ConfidenceBandBadgeProps) {
  const band = deriveBand(confidence);
  const style = BAND_STYLES[band];
  const text = label ?? style.text;
  return (
    <span
      role="status"
      aria-label={`Confianza ${band.replace('_', ' ')}: ${text}`}
      data-band={band}
      data-confidence={confidence.toFixed(2)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold',
        'border tabular-nums',
        className,
      )}
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        borderColor: style.border,
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          backgroundColor: style.dot,
          display: 'inline-block',
        }}
      />
      {text}
    </span>
  );
}
