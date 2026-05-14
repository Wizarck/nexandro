export interface OutOfSpecStickyWarningProps {
  /** Banner copy override. Defaults to the j10 §Region 9 string. */
  message?: string;
  /** Action button label (e.g. "Ver previa →"). */
  ctaLabel?: string;
  /** Action handler — typically navigates to the prior reading. */
  onSeePrior?: () => void;
  className?: string;
}
