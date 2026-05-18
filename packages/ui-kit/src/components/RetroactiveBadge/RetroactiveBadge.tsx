import { cn } from '../../lib/cn';
import type { RetroactiveBadgeProps } from './RetroactiveBadge.types';

/**
 * `<RetroactiveBadge />` — pill linking to `/m3/review-queue` per
 * `docs/ux/j13.md` §5 (Master-approved 2026-05-18).
 *
 * Visual rules (decision #5):
 *   - count > 0           → paprika-fill pill with "Cambios retroactivos · N".
 *   - count === 0, show   → mute outline pill with "Cambios retroactivos · 0 / N esta semana".
 *   - count === 0, hide   → render null (used when an EmptyStateCard already covers).
 *
 * Defaults to `zeroState='show'` because the always-on affordance keeps
 * the surface in the persona's mental model even on empty weeks (v3
 * roundtable unanimous, §8 #5).
 *
 * The badge is a real `<a>` link so right-click + keyboard nav work;
 * downstream surfaces that need a non-link rendering can wrap the
 * children themselves.
 */
const DEFAULT_HREF = '/m3/review-queue';

export function RetroactiveBadge({
  count,
  venue,
  zeroState = 'show',
  weeklyTotal,
  href = DEFAULT_HREF,
  className,
}: RetroactiveBadgeProps) {
  if (count === 0 && zeroState === 'hide') return null;

  const isActive = count > 0;
  const safeWeekly = typeof weeklyTotal === 'number' ? Math.max(0, weeklyTotal) : 0;

  const label = isActive
    ? `${count} ${count === 1 ? 'pendiente' : 'pendientes'}`
    : `0 / ${safeWeekly} esta semana`;
  const ariaLabel = isActive
    ? `Cambios retroactivos: ${count} ${count === 1 ? 'pendiente' : 'pendientes'}${venue ? ` en ${venue}` : ''}`
    : `Cambios retroactivos: 0 de ${safeWeekly} esta semana${venue ? ` en ${venue}` : ''}`;

  return (
    <a
      href={href}
      role="status"
      data-state={isActive ? 'active' : 'zero'}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-xs font-semibold no-underline transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-(--color-focus)',
        className,
      )}
      style={{
        backgroundColor: isActive
          ? 'var(--color-destructive)'
          : 'var(--color-surface)',
        color: isActive
          ? 'var(--color-accent-fg)'
          : 'var(--color-mute)',
        borderColor: isActive
          ? 'var(--color-destructive)'
          : 'var(--color-border-strong)',
      }}
    >
      <span aria-hidden="true" className="leading-none">
        Cambios retroactivos
      </span>
      <span aria-hidden="true" className="opacity-70">·</span>
      <span aria-hidden="true" className="tabular-nums leading-none">
        {label}
      </span>
      {venue && (
        <span
          aria-hidden="true"
          className="ml-1 rounded-pill border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{
            borderColor: isActive
              ? 'var(--color-accent-fg)'
              : 'var(--color-border)',
            color: isActive
              ? 'var(--color-accent-fg)'
              : 'var(--color-mute)',
            backgroundColor: 'transparent',
          }}
        >
          {venue}
        </span>
      )}
    </a>
  );
}
