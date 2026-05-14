import { cn } from '../../lib/cn';
import type { EmptyStateCardProps } from './EmptyStateCard.types';

/**
 * Empty-state surface for j8 widgets that have no data yet (slice #20
 * m3-ai-obs-ui).
 *
 * Per ADR-EMPTY-STATE, first-time orgs (zero `ai_usage_rollup` rows)
 * see this card instead of a broken-looking "—" placeholder or an
 * error. The card is the same size as the populated widget so the
 * grid layout doesn't shift between empty and populated states.
 *
 * Pattern inherited from Wave 1.19 AuditLogTable empty-state ("No hay
 * eventos para los filtros aplicados").
 */
export function EmptyStateCard({
  title,
  body,
  ctaHref,
  ctaLabel,
  className,
}: EmptyStateCardProps) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border border-dashed border-(--color-border-strong) p-6 text-center',
        className,
      )}
      style={{ borderColor: 'var(--color-border-strong)', borderStyle: 'dashed' }}
    >
      <p
        className="text-base font-medium text-(--color-ink)"
        style={{ color: 'var(--color-ink)' }}
      >
        {title}
      </p>
      {body && (
        <p
          className="mt-2 text-sm text-(--color-mute)"
          style={{ color: 'var(--color-mute)' }}
        >
          {body}
        </p>
      )}
      {ctaHref && ctaLabel && (
        <a
          href={ctaHref}
          className="mt-3 inline-block text-sm text-(--color-accent-press) underline-offset-2 hover:underline"
          style={{ color: 'var(--color-accent-press)' }}
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}
