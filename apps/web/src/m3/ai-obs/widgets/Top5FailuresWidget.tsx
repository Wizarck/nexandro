import { BadgeChip, EmptyStateCard, MetricCard } from '@nexandro/ui-kit';
import type { FailureRange, FailureRow } from '../api/aiObs.types';
import { formatFreshness, formatRelativeTime } from '../lib/format';

interface Top5FailuresWidgetProps {
  data: FailureRow[];
  range: FailureRange;
  dataUpdatedAt: number;
  onRefresh: () => void;
}

const SEVERITY_BORDER: Readonly<Record<FailureRow['severity'], string>> = {
  P1: 'var(--color-destructive)',
  P2: 'var(--color-status-below-target-fg)',
  P3: 'var(--color-mute)',
};

const SEVERITY_BADGE_VARIANT: Readonly<
  Record<FailureRow['severity'], 'p1' | 'p2' | 'p3'>
> = {
  P1: 'p1',
  P2: 'p2',
  P3: 'p3',
};

export function Top5FailuresWidget({
  data,
  range,
  dataUpdatedAt,
  onRefresh,
}: Top5FailuresWidgetProps) {
  const sinceIso = computeSinceIso(range);
  return (
    <MetricCard
      eyebrow={`Top 5 fallos · ${range} · coloreados por severidad`}
      aria-label="Top 5 fallos widget"
      wide
      footer={<span>{formatFreshness(dataUpdatedAt)}</span>}
      refreshButton={{ onClick: onRefresh, label: 'Refrescar' }}
    >
      {data.length === 0 ? (
        <EmptyStateCard
          title="Sin fallos en el rango seleccionado"
          body="No se han observado errores de capacidades AI. Cambia el rango si quieres ver más histórico."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {data.map((row, idx) => {
            const variant = SEVERITY_BADGE_VARIANT[row.severity];
            return (
              <li
                key={row.eventType}
                className="grid grid-cols-[24px_1fr_auto_auto] items-center gap-4 border-t border-(--color-border) py-3 pl-3 text-sm first:border-t-0"
                style={{ borderLeft: `3px solid ${SEVERITY_BORDER[row.severity]}` }}
              >
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
                  style={{
                    background: SEVERITY_BORDER[row.severity],
                    color: 'var(--color-accent-fg)',
                  }}
                >
                  {idx + 1}
                </span>
                <span className="flex items-center gap-2">
                  <BadgeChip variant={variant}>{row.severity}</BadgeChip>
                  <span>{row.eventType}</span>
                </span>
                <span
                  className="tabular-nums"
                  style={{ color: SEVERITY_BORDER[row.severity] }}
                >
                  {row.count} ocurrencia{row.count === 1 ? '' : 's'}
                </span>
                <a
                  href={`/audit-log?eventType=${encodeURIComponent(row.eventType)}&since=${encodeURIComponent(sinceIso)}`}
                  className="text-sm text-(--color-accent-press) underline-offset-2 hover:underline"
                  style={{ color: 'var(--color-accent-press)' }}
                >
                  Ver eventos →
                </a>
                <span
                  className="col-span-3 col-start-2 text-xs text-(--color-mute)"
                  style={{ color: 'var(--color-mute)' }}
                >
                  {row.hint} · Última: {formatRelativeTime(row.lastOccurredAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </MetricCard>
  );
}

function computeSinceIso(range: FailureRange): string {
  const ms = range === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}
