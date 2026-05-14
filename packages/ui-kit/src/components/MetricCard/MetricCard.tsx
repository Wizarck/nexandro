import { cn } from '../../lib/cn';
import type { MetricCardProps } from './MetricCard.types';

/**
 * Bordered widget surface for the j8 AI observability dashboard (slice
 * #20 m3-ai-obs-ui).
 *
 * Per the j8 mock §spatial, widgets are flat-bordered panels — never
 * nested cards. The surface uses `--color-surface` over the page
 * `--color-bg` (Pulcinella palette). Eyebrow + headline + sub follow
 * the Caravaggio hierarchy described in DESIGN.md §3.
 *
 * Per ADR-DATA-FRESHNESS-BADGE, every widget renders a footer with
 * the last-refreshed badge + manual refresh button when the consumer
 * supplies `refreshButton`. The refresh button is keyboard-reachable.
 */
export function MetricCard({
  eyebrow,
  headline,
  sub,
  children,
  wide = false,
  footer,
  refreshButton,
  'aria-label': ariaLabel,
  className,
}: MetricCardProps) {
  return (
    <section
      aria-label={ariaLabel ?? eyebrow}
      className={cn(
        'rounded-lg border border-(--color-border) bg-(--color-surface) px-6 py-4',
        wide && 'col-span-full',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
    >
      <div
        className="text-xs uppercase tracking-[0.04em] text-(--color-mute) mb-2"
        style={{ color: 'var(--color-mute)' }}
      >
        {eyebrow}
      </div>
      {headline != null && (
        <div className="text-2xl font-semibold leading-tight text-(--color-ink) mb-2"
             style={{ color: 'var(--color-ink)' }}>
          {headline}
        </div>
      )}
      {sub != null && (
        <p
          className="text-sm text-(--color-mute) mb-3"
          style={{ color: 'var(--color-mute)' }}
        >
          {sub}
        </p>
      )}
      {children}
      {(footer != null || refreshButton != null) && (
        <div
          className="mt-4 flex items-center justify-between gap-2 text-xs text-(--color-mute)"
          style={{ color: 'var(--color-mute)' }}
        >
          <div>{footer}</div>
          {refreshButton && (
            <button
              type="button"
              onClick={refreshButton.onClick}
              className="text-xs underline-offset-2 hover:underline"
              aria-label={refreshButton.label}
            >
              {refreshButton.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
