import { MetricCard } from '@opentrattos/ui-kit';
import type { CostTotalWidget as CostTotalData } from '../api/aiObs.types';
import { formatEur, formatFreshness, formatPct } from '../lib/format';

interface CostTotalWidgetProps {
  data: CostTotalData;
  dataUpdatedAt: number;
  onRefresh: () => void;
}

/**
 * j8 widget #2: total spend + budget bar with 50 / 75 / 90 / 100 %
 * ticks. The bar fill is `--color-accent` because spend is data, not
 * danger (j8 mock §color rule).
 */
export function CostTotalWidget({
  data,
  dataUpdatedAt,
  onRefresh,
}: CostTotalWidgetProps) {
  const hasBudget = data.monthlyBudgetEur != null && data.monthlyBudgetEur > 0;
  const fillPct = data.pctConsumed != null
    ? Math.min(1, Math.max(0, data.pctConsumed))
    : null;

  return (
    <MetricCard
      eyebrow="Gasto · mes en curso"
      aria-label="Coste total mensual widget"
      headline={<span className="tabular-nums">{formatEur(data.value)}</span>}
      sub={
        hasBudget
          ? `de un presupuesto mensual de ${formatEur(data.monthlyBudgetEur!)}`
          : 'Presupuesto mensual no configurado'
      }
      footer={<span>{formatFreshness(dataUpdatedAt)}</span>}
      refreshButton={{ onClick: onRefresh, label: 'Refrescar' }}
    >
      {hasBudget && fillPct != null && (
        <div
          role="img"
          aria-label={`Presupuesto consumido al ${formatPct(fillPct)}`}
          className="relative mt-4 h-3"
        >
          <div
            className="h-2 rounded-pill overflow-hidden"
            style={{ background: 'var(--color-surface-2)' }}
          >
            <div
              className="h-full rounded-pill"
              style={{
                width: `${fillPct * 100}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-3">
            {[0.5, 0.75, 0.9, 1].map((tick) => (
              <span
                key={tick}
                aria-hidden="true"
                className="absolute -top-0.5 h-3 w-px"
                style={{
                  left: `${tick * 100}%`,
                  background: 'var(--color-border-strong)',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </MetricCard>
  );
}
