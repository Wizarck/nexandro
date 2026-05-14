import type { Anomaly } from '../api/aiObs.types';
import { formatRelativeTime } from '../lib/format';

interface AnomalyChipProps {
  anomaly: Anomaly | null;
}

/**
 * j8 chrome #1 — anomaly banner. Conditional render: suppressed when
 * the overview payload reports no anomalies. Per the j8 mock, the
 * banner uses `--warn-bg` + a 3px `--warn-fg` left border.
 */
export function AnomalyChip({ anomaly }: AnomalyChipProps) {
  if (!anomaly) return null;
  return (
    <div
      role="region"
      aria-label="Anomalía detectada"
      className="rounded-lg border border-(--color-status-below-target-fg) p-3"
      style={{
        background: 'var(--color-warn-bg)',
        borderLeft: '3px solid var(--color-status-below-target-fg)',
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: 'var(--color-status-below-target-fg)',
            color: 'var(--color-accent-fg)',
          }}
        >
          Anomalía
        </span>
        <strong className="text-sm">
          Coste de <code className="font-mono text-xs">{anomaly.subject}</code>{' '}
          {anomaly.multiplier.toFixed(1)}× sobre {anomaly.baseline}
        </strong>
      </div>
      <div className="text-xs text-(--color-mute)" style={{ color: 'var(--color-mute)' }}>
        {anomaly.detail} · Detectado {formatRelativeTime(anomaly.detectedAt)} ·{' '}
        <a
          href={`/audit-log?eventType=AI_TOKEN_USAGE&q=${encodeURIComponent(anomaly.subject)}`}
          className="text-(--color-accent-press) underline-offset-2 hover:underline"
          style={{ color: 'var(--color-accent-press)' }}
        >
          Ver eventos →
        </a>
      </div>
    </div>
  );
}
