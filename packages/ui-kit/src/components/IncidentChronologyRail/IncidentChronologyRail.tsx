import { cn } from '../../lib/cn';
import type { IncidentChronologyRailProps } from './IncidentChronologyRail.types';

/**
 * J7 region #7 — vertical chronology rail.
 *
 * Per j7.md: laptop sidebar / phone bottom drawer. Reads from audit_log
 * envelopes (the host queries; this component just renders). Carries
 * `role="log"` with `aria-live="polite"` so screen readers announce
 * new events as they arrive.
 */
export function IncidentChronologyRail({
  entries,
  drawer = false,
  title = 'Cronología',
  className,
}: IncidentChronologyRailProps) {
  return (
    <aside
      role="log"
      aria-live="polite"
      aria-label={title}
      className={cn(
        drawer
          ? 'fixed inset-x-0 bottom-0 z-20 max-h-[40vh] overflow-y-auto'
          : 'sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto',
        'rounded-lg border px-4 py-3',
        className,
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
      data-testid="chronology-rail"
      data-drawer={drawer}
    >
      <h3
        className="mb-3 text-xs font-semibold uppercase tracking-[0.04em]"
        style={{ color: 'var(--color-mute)' }}
      >
        {title}
      </h3>
      <ol className="relative space-y-3 border-l pl-3" style={{ borderColor: 'var(--color-border)' }}>
        {entries.map((entry) => (
          <li key={entry.id} className="text-sm">
            <div
              className="text-xs"
              style={{ color: 'var(--color-mute)' }}
            >
              {entry.createdAt}
              {entry.actor ? ` · ${entry.actor}` : ''}
            </div>
            <div style={{ color: 'var(--color-ink)' }}>
              {entry.label ?? entry.eventType}
            </div>
            {entry.snippet && (
              <div
                className="text-xs mt-0.5"
                style={{ color: 'var(--color-mute)' }}
              >
                {entry.snippet}
              </div>
            )}
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-sm" style={{ color: 'var(--color-mute)' }}>
            Sin eventos registrados.
          </li>
        )}
      </ol>
    </aside>
  );
}
