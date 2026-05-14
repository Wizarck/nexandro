import { cn } from '../../lib/cn';
import type { BadgeChipProps, BadgeChipVariant } from './BadgeChip.types';

/**
 * Pill-shaped status chip consumed across j8 (slice #20 m3-ai-obs-ui).
 *
 * Per ADR-ACCESSIBILITY, the chip carries `role="status"` so screen-
 * readers announce it as a live status, and the accessible name comes
 * from either the explicit `aria-label` or the children text. Colour is
 * never the only differentiator — every variant pairs colour + text.
 *
 * Variant → semantic mapping:
 *  - `info`     → neutral budget tier (0–49 % consumed)
 *  - `warn`     → near-limit budget tier (50–74 %); warn-bg + warn-fg
 *  - `error`    → critical budget tier (75–89 %)
 *  - `fatal`    → over-budget (≥ 100 %); destructive bg
 *  - `p1/p2/p3` → severity chips for the Top5Failures widget
 *  - `neutral`  → quiet placeholder (mute on surface)
 */
const VARIANT_STYLES: Readonly<
  Record<BadgeChipVariant, { bg: string; fg: string; border: string }>
> = {
  info: {
    bg: 'var(--color-surface-2)',
    fg: 'var(--color-mute)',
    border: 'var(--color-border)',
  },
  warn: {
    bg: 'var(--color-warn-bg)',
    fg: 'var(--color-status-below-target-fg)',
    border: 'var(--color-status-below-target-fg)',
  },
  error: {
    bg: 'var(--color-warn-bg)',
    fg: 'var(--color-destructive)',
    border: 'var(--color-destructive)',
  },
  fatal: {
    bg: 'var(--color-destructive)',
    fg: 'var(--color-accent-fg)',
    border: 'var(--color-destructive)',
  },
  p1: {
    bg: 'var(--color-destructive)',
    fg: 'var(--color-accent-fg)',
    border: 'var(--color-destructive)',
  },
  p2: {
    bg: 'var(--color-status-below-target-fg)',
    fg: 'var(--color-accent-fg)',
    border: 'var(--color-status-below-target-fg)',
  },
  p3: {
    bg: 'var(--color-mute)',
    fg: 'var(--color-accent-fg)',
    border: 'var(--color-mute)',
  },
  neutral: {
    bg: 'var(--color-surface)',
    fg: 'var(--color-mute)',
    border: 'var(--color-border)',
  },
};

export function BadgeChip({
  variant,
  children,
  'aria-label': ariaLabel,
  className,
}: BadgeChipProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-sm font-semibold',
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
      {children}
    </span>
  );
}
