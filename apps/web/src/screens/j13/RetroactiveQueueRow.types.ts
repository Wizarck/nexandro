/**
 * Row shape for the j13 retroactive-reconciliation queue per
 * `docs/ux/j13.md` §4 (Master-approved 2026-05-18).
 *
 * Intentionally narrow at the demo-skeleton stage; the eventual
 * `m3_review_queue` API integration (separate follow-up slice) will
 * widen this to cover the four upstream change types catalogued in
 * j13 §3 + the model-version-drift case parked in
 * `docs/audit-2026-05-18-v3-detail-08-cola-revision.md` §3 (suggested
 * spec edit #1).
 */
export type RetroactiveCategory =
  | 'coste'
  | 'allergen'
  | 'procurement'
  | 'lot';

export type RetroactiveSeverity = 'paprika' | 'amber' | 'mute';

export interface RetroactiveQueueDemoRow {
  /** Stable id for keyed rendering + correlation with the diff side-panel. */
  id: string;
  /** Category drives the CTA labels per j13 §4.2 spec follow-up. */
  category: RetroactiveCategory;
  /** Headline subject + delta summary (j13 §4 row anatomy line 1). */
  headline: string;
  /** Downstream artefact label (e.g. "Pizza Margarita"). */
  downstream: string;
  /** Original signer (used in the body sentence). */
  signedBy: string;
  /** ISO-8601 timestamp the original sign-off happened. */
  signedAt: string;
  /** Relative phrase for when the upstream change was detected, e.g. "hace 2 h". */
  detectedRelative: string;
  /** Free-text trigger description, e.g. "extracción albarán PA-2026-887". */
  triggerLabel: string;
  /**
   * Impact in percent (0-100 scale). Drives both severity dot and the
   * confirm-pattern tier per Master decision #3 (5% threshold default).
   */
  impactPct: number;
  /**
   * Whether the change is allergen-relevant. Always escalates severity
   * to paprika per j13 §4 even below the 5% impact threshold.
   */
  allergenRelevant?: boolean;
  /** Pre-filled new value for the re-sign default (Master decision #4). */
  newValueLabel: string;
}

export interface RetroactiveQueueRowProps {
  row: RetroactiveQueueDemoRow;
  /** Fired with the row when the operator commits the re-sign action. */
  onReSign: (row: RetroactiveQueueDemoRow, reason?: string) => void;
  /** Fired with the row when the operator declines (Mantener firma). */
  onMaintain: (row: RetroactiveQueueDemoRow) => void;
  /** Fired with the row when the operator opens the diff side-panel hint. */
  onOpenDiff: (row: RetroactiveQueueDemoRow) => void;
  /**
   * Impact percentage above which the re-sign CTA opens the typed-reason
   * modal (Master decision #3). Defaults to 5 per j13 §8 #3.
   */
  highImpactThresholdPct?: number;
}

/**
 * Derives severity per j13 §4:
 *   - paprika if impact > 5 % OR allergen-relevant.
 *   - amber   if 1-5 % impact.
 *   - mute    otherwise.
 */
export function deriveSeverity(
  impactPct: number,
  allergenRelevant?: boolean,
): RetroactiveSeverity {
  if (allergenRelevant) return 'paprika';
  if (impactPct > 5) return 'paprika';
  if (impactPct >= 1) return 'amber';
  return 'mute';
}
