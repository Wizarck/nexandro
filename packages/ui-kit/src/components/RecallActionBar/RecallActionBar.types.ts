import type { ReactNode } from 'react';

/**
 * Sticky single-CTA bar that anchors the J6 crisis surface
 * (mock-j6-recall-investigate.html region #5).
 *
 * One forward action — `--destructive` paprika background, 64 px tall.
 * No secondary actions, no cancel button. Back-out is via the
 * breadcrumb in the host shell, NOT a button next to this CTA.
 *
 * Optional `eyebrow` renders the live 4-hour EU 178/2002 countdown
 * (the host owns the timer). `disabled` is supported for the post-
 * confirm in-flight state.
 */
export interface RecallActionBarProps {
  /** Visible label on the CTA button. */
  label: string;
  /** Fired when the operator taps the CTA. */
  onActivate: () => void;
  /** Optional eyebrow text above the CTA (live countdown clock). */
  eyebrow?: ReactNode;
  /** When true, the button is disabled (in-flight dispatch). */
  disabled?: boolean;
  /** When true, render the confirmation strip child below the CTA. */
  children?: ReactNode;
  className?: string;
}
