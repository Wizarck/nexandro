import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import { MarginPanel } from '../MarginPanel';
import type {
  DashboardMenuItem,
  MenuItemRankerProps,
} from './MenuItemRanker.types';

/**
 * Owner Sunday-night dashboard ranker. Stacked-scrollable on mobile per Gate D
 * decision 2b; tap-to-expand inline (no route change) per decision 1b.
 * Cards reuse `<MarginPanel>` from #12 — same status thresholds + colours,
 * single source of truth for visual margin classification.
 */
export function MenuItemRanker({
  top,
  bottom,
  loading = false,
  // Audit 2026-05-18 L0-1: was English ("Add MenuItems to see the ranking.")
  // — a developer placeholder string on the Owner persona's primary screen.
  emptyStateCopy = 'Aún no hay platos para clasificar. Cuando registres tus primeros platos, verás aquí los 5 con mejor margen y los 5 que necesitan atención.',
  locale = 'es-ES',
  onViewDetails,
  className,
}: MenuItemRankerProps) {
  if (loading) {
    return (
      <div
        role="region"
        aria-label="Owner dashboard ranking"
        aria-busy="true"
        className={cn('animate-pulse space-y-3', className)}
      >
        <div className="h-24 rounded-md bg-surface-2" />
        <div className="h-24 rounded-md bg-surface-2" />
        <div className="h-24 rounded-md bg-surface-2" />
      </div>
    );
  }

  if (top.length === 0 && bottom.length === 0) {
    return (
      <div
        role="region"
        aria-label="Owner dashboard ranking"
        className={cn(
          'rounded-md border border-border bg-surface p-4 text-sm text-mute',
          className,
        )}
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        {emptyStateCopy}
      </div>
    );
  }

  return (
    <div
      className={cn('grid grid-cols-1 gap-6 md:grid-cols-2', className)}
      role="region"
      aria-label="Owner dashboard ranking"
    >
      {top.length > 0 && (
        <RankSection title="Mejor margen" items={top} locale={locale} onViewDetails={onViewDetails} />
      )}
      {bottom.length > 0 && (
        <RankSection
          title="Necesita atención"
          items={bottom}
          locale={locale}
          onViewDetails={onViewDetails}
        />
      )}
    </div>
  );
}

function RankSection({
  title,
  items,
  locale,
  onViewDetails,
}: {
  title: string;
  items: DashboardMenuItem[];
  locale: string;
  onViewDetails?: (item: DashboardMenuItem) => void;
}) {
  return (
    <section aria-label={title}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-mute">
        {title}
      </h3>
      <ul className="list-none space-y-3 p-0">
        {items.map((item) => (
          <li key={item.menuItemId}>
            <RankCard item={item} locale={locale} onViewDetails={onViewDetails} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RankCard({
  item,
  locale,
  onViewDetails,
}: {
  item: DashboardMenuItem;
  locale: string;
  onViewDetails?: (item: DashboardMenuItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const headingId = `ranker-${item.menuItemId}-h`;
  return (
    <article
      aria-labelledby={headingId}
      className="rounded-md border border-border bg-surface p-3"
      style={{ borderWidth: '1px', borderStyle: 'solid' }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`${headingId}-detail`}
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-sm text-left',
          'hover:bg-surface-2',
        )}
        style={{ minHeight: 'var(--touch-target-min)' }}
      >
        <div className="flex-1">
          <h4 id={headingId} className="text-base font-semibold text-ink">
            {item.displayLabel}
          </h4>
          <p className="text-xs uppercase tracking-wide text-mute">{item.channel}</p>
        </div>
        <div
          className="rounded-pill px-2 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: statusBg(item.margin.status),
            color: statusFg(item.margin.status),
          }}
        >
          {item.margin.statusLabel}
        </div>
        {expanded ? (
          <ChevronUp aria-hidden="true" size={18} className="text-mute" />
        ) : (
          <ChevronDown aria-hidden="true" size={18} className="text-mute" />
        )}
      </button>

      {expanded && (
        <div id={`${headingId}-detail`} className="mt-3 space-y-3">
          <MarginPanel report={item.margin} locale={locale} />
          {onViewDetails && (
            <button
              type="button"
              onClick={() => onViewDetails(item)}
              className="text-sm font-semibold text-accent hover:text-accent-press"
              style={{ minHeight: 'var(--touch-target-min)' }}
            >
              Ver detalle de costes →
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function statusBg(status: string): string {
  switch (status) {
    case 'on_target':
      return 'var(--color-status-on-target)';
    case 'below_target':
      return 'var(--color-status-below-target)';
    case 'at_risk':
      return 'var(--color-status-at-risk)';
    default:
      return 'var(--color-status-unknown)';
  }
}

function statusFg(status: string): string {
  switch (status) {
    case 'on_target':
      return 'var(--color-accent-fg)';
    case 'below_target':
      return 'var(--color-status-below-target-fg)';
    case 'at_risk':
      return 'var(--color-status-at-risk-fg)';
    default:
      return 'var(--color-status-unknown-fg)';
  }
}
