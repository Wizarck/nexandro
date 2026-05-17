import { MetricCard } from '@nexandro/ui-kit';
import type { BlastRadiusModel, Criticality } from '../api/aiObs.types';
import { formatPctInt } from '../lib/format';

interface BlastRadiusCardProps {
  models: BlastRadiusModel[];
}

const CRIT_LABEL: Readonly<Record<Criticality, string>> = {
  critical: 'CRÍTICO',
  medium: 'MEDIO',
  low: 'BAJO',
  deprecated: 'DEPRECATION',
};

const CRIT_COLOR: Readonly<Record<Criticality, string>> = {
  critical: 'var(--color-destructive)',
  medium: 'var(--color-status-below-target-fg)',
  low: 'var(--color-accent)',
  deprecated: 'var(--color-mute)',
};

/**
 * j8 chrome #3 — blast radius widget. Renders one card per model
 * with criticality-coded `border-left`. Per ADR-WIDGET-CATALOGUE,
 * this widget always renders (architecture transparency), even when
 * the model count is zero.
 */
export function BlastRadiusCard({ models }: BlastRadiusCardProps) {
  return (
    <MetricCard
      eyebrow="Dependencia AI · si un modelo cae, ¿qué capacidades mueren?"
      aria-label="Blast radius widget"
      wide
    >
      {models.length === 0 ? (
        <p
          className="text-sm text-(--color-mute)"
          style={{ color: 'var(--color-mute)' }}
        >
          Sin modelos activos en el rango seleccionado.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {models.map((m) => (
            <div
              key={m.model}
              className="rounded-md border border-(--color-border) p-3"
              style={{ borderLeft: `3px solid ${CRIT_COLOR[m.criticality]}` }}
            >
              <strong
                className="block text-sm"
                style={
                  m.criticality === 'deprecated'
                    ? { textDecoration: 'line-through', color: 'var(--color-mute)' }
                    : undefined
                }
              >
                {m.model}
              </strong>
              <span
                className="text-xs font-medium"
                style={{ color: CRIT_COLOR[m.criticality] }}
              >
                {CRIT_LABEL[m.criticality]} · {formatPctInt(m.trafficPct)} del tráfico
              </span>
              {m.dependents.length > 0 && (
                <ul
                  className="m-0 mt-1 list-disc pl-3.5 text-[11px] text-(--color-mute)"
                  style={{ color: 'var(--color-mute)' }}
                >
                  {m.dependents.map((dep) => (
                    <li key={dep}>{dep}</li>
                  ))}
                </ul>
              )}
              <div
                className="mt-1 border-t border-dashed border-(--color-border) pt-1 text-[11px]"
                style={{
                  borderTopColor: 'var(--color-border)',
                  color:
                    m.deprecation != null
                      ? 'var(--color-destructive)'
                      : 'var(--color-mute)',
                }}
              >
                {m.deprecation != null
                  ? `Migra a ${m.deprecation.migrateTo} antes de ${m.deprecation.effectiveAt}.`
                  : `Fallback: ${m.fallback}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </MetricCard>
  );
}
