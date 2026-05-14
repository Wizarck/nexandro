import { EmptyStateCard, Heatmap, MetricCard } from '@opentrattos/ui-kit';
import type { HeatmapWidget as HeatmapData } from '../api/aiObs.types';
import { DAY_LABELS, HOUR_LABELS, formatFreshness } from '../lib/format';

interface UsageHeatmapWidgetProps {
  data: HeatmapData;
  dataUpdatedAt: number;
  onRefresh: () => void;
}

const DAY_FULL = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

export function UsageHeatmapWidget({
  data,
  dataUpdatedAt,
  onRefresh,
}: UsageHeatmapWidgetProps) {
  return (
    <MetricCard
      eyebrow="Uso por día × hora · esta semana"
      aria-label="Heatmap de uso por día y hora"
      sub="Patrón típico: pico viernes 09–12 (recepción de pedidos vía foto) · uso bajo domingos."
      wide
      footer={<span>{formatFreshness(dataUpdatedAt)}</span>}
      refreshButton={{ onClick: onRefresh, label: 'Refrescar' }}
    >
      {data.max === 0 ? (
        <EmptyStateCard
          title="Sin actividad en la semana"
          body="El heatmap se rellena en cuanto se ejecuten capacidades AI durante la semana."
        />
      ) : (
        <Heatmap
          rows={7}
          cols={24}
          rowLabels={DAY_LABELS}
          colLabels={HOUR_LABELS}
          cells={data.cells}
          max={data.max}
          cellAriaLabel={(row, col, value) => {
            const day = DAY_FULL[row] ?? '';
            const hour = HOUR_LABELS[col] ?? '';
            if (value === 0) {
              return `${day} ${hour}h: sin actividad`;
            }
            const isPeak = value === data.max;
            return `${day} ${hour}h: ${value} llamadas${
              isPeak ? ' (pico de uso)' : ''
            }`;
          }}
        />
      )}
    </MetricCard>
  );
}
