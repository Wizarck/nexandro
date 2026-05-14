import { EmptyStateCard, MetricCard } from '@opentrattos/ui-kit';
import type { BarRow } from '../api/aiObs.types';
import { formatEur, formatFreshness, formatPctInt } from '../lib/format';

interface BarListWidgetProps {
  eyebrow: string;
  ariaLabel: string;
  data: BarRow[];
  dataUpdatedAt: number;
  onRefresh: () => void;
  emptyTitle: string;
  emptyBody?: string;
}

/**
 * Shared bar-list widget for the 3 cost-by-X widgets (capability,
 * model, tag). Each row shows label + absolute spend + percentage,
 * with an `--color-accent` fill bar below. Bars are decorative —
 * the text values are the source of truth per ADR-ACCESSIBILITY.
 */
export function BarListWidget({
  eyebrow,
  ariaLabel,
  data,
  dataUpdatedAt,
  onRefresh,
  emptyTitle,
  emptyBody,
}: BarListWidgetProps) {
  return (
    <MetricCard
      eyebrow={eyebrow}
      aria-label={ariaLabel}
      footer={<span>{formatFreshness(dataUpdatedAt)}</span>}
      refreshButton={{ onClick: onRefresh, label: 'Refrescar' }}
    >
      {data.length === 0 ? (
        <EmptyStateCard title={emptyTitle} body={emptyBody} />
      ) : (
        <ul className="m-0 list-none p-0">
          {data.map((row) => (
            <li
              key={row.label}
              aria-label={`${row.label}: ${formatEur(row.totalEur)} (${formatPctInt(row.sharePct)} del total)`}
              className="grid grid-cols-[1fr_auto] items-center gap-2 py-1 text-sm"
            >
              <span
                className="text-(--color-ink)"
                style={{ color: 'var(--color-ink)' }}
              >
                {row.label}
              </span>
              <span
                className="tabular-nums text-(--color-mute)"
                style={{ color: 'var(--color-mute)' }}
              >
                {formatEur(row.totalEur)} · {formatPctInt(row.sharePct)}
              </span>
              <span
                aria-hidden="true"
                className="col-span-2 mt-1 block h-2.5 rounded-pill overflow-hidden"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <span
                  className="block h-full rounded-pill"
                  style={{
                    width: `${Math.min(1, Math.max(0, row.sharePct)) * 100}%`,
                    background: 'var(--color-accent)',
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </MetricCard>
  );
}
