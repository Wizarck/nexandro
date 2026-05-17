import { BadgeChip, MetricCard } from '@nexandro/ui-kit';
import type {
  BudgetStatusWidget as BudgetStatusData,
  Tier,
} from '../api/aiObs.types';
import { formatEur, formatFreshness, formatPctInt } from '../lib/format';

interface BudgetStatusWidgetProps {
  data: BudgetStatusData;
  dataUpdatedAt: number;
  onRefresh: () => void;
}

const TIER_LABELS: Readonly<Record<Tier, string>> = {
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
  fatal: 'Fatal',
};

/**
 * j8 widget #8 (NFR-OBS-10): tier badge + burn-rate copy. When the
 * org has no monthly budget configured, the widget surfaces a CTA to
 * `/owner-settings#ai-budget` so the Owner can set one.
 */
export function BudgetStatusWidget({
  data,
  dataUpdatedAt,
  onRefresh,
}: BudgetStatusWidgetProps) {
  if (data.tier == null || data.pctConsumed == null) {
    return (
      <MetricCard
        eyebrow="Tier · runway"
        aria-label="Estado del presupuesto widget"
        headline={<span className="text-base text-(--color-mute)">Sin presupuesto configurado</span>}
        sub={
          <a
            href="/owner-settings#ai-budget"
            className="text-(--color-accent-press) underline-offset-2 hover:underline"
            style={{ color: 'var(--color-accent-press)' }}
          >
            Configurar presupuesto mensual →
          </a>
        }
        footer={<span>{formatFreshness(dataUpdatedAt)}</span>}
        refreshButton={{ onClick: onRefresh, label: 'Refrescar' }}
      />
    );
  }

  const tierLabel = TIER_LABELS[data.tier];
  const ariaLabel = `Tier de presupuesto: ${tierLabel} — ${formatPctInt(data.pctConsumed)} del mes consumido`;
  const runwayCopy =
    data.daysUntilEmpty == null
      ? `Media 7d ${formatEur(data.avg7dDaily)} / día`
      : `Quedan ~${data.daysUntilEmpty} días al ritmo actual · media 7d ${formatEur(data.avg7dDaily)} / día`;

  return (
    <MetricCard
      eyebrow="Tier · runway"
      aria-label="Estado del presupuesto widget"
      headline={
        <BadgeChip variant={data.tier} aria-label={ariaLabel}>
          {tierLabel} · {formatPctInt(data.pctConsumed)}
        </BadgeChip>
      }
      sub={runwayCopy}
      footer={<span>{formatFreshness(dataUpdatedAt)}</span>}
      refreshButton={{ onClick: onRefresh, label: 'Refrescar' }}
    />
  );
}
