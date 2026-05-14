import { MetricCard, Sparkline } from '@opentrattos/ui-kit';
import type { ErrorRateWidget as ErrorRateData } from '../api/aiObs.types';
import { formatFreshness, formatPct } from '../lib/format';

interface ErrorRateWidgetProps {
  data: ErrorRateData;
  dataUpdatedAt: number;
  onRefresh: () => void;
}

/**
 * j8 widget #1: error rate semaphore + sparkline. Per the j8 mock,
 * the semaphore combines colour + glyph (✓/⚠/✗) — never colour-only
 * (ADR-ACCESSIBILITY).
 *
 * Thresholds:
 *  - green ✓ : value < 0.01
 *  - amber ⚠ : 0.01 ≤ value < 0.05
 *  - red   ✗ : value ≥ 0.05
 */
export function ErrorRateWidget({
  data,
  dataUpdatedAt,
  onRefresh,
}: ErrorRateWidgetProps) {
  const { glyph, color, ariaState } = classify(data.value);
  const peakAriaSnippet = data.peak
    ? ` · pico ${formatPct(data.peak.value)} en bucket ${data.peak.index}`
    : '';
  const ariaLabel = `Sparkline error rate: valor actual ${formatPct(data.value)}${peakAriaSnippet}`;

  return (
    <MetricCard
      eyebrow="Error rate · 24h"
      aria-label="Tasa de error widget"
      headline={
        <span className="inline-flex items-center gap-2">
          <span
            aria-label={ariaState}
            className="inline-flex items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-3.5 rounded-full"
              style={{ background: color }}
            />
            <span style={{ color, fontWeight: 700 }} aria-hidden="true">
              {glyph}
            </span>
          </span>
          <span className="tabular-nums">{formatPct(data.value)}</span>
        </span>
      }
      sub="Umbral verde < 1 % · ámbar 1–5 % · rojo > 5 %"
      footer={<span>{formatFreshness(dataUpdatedAt)}</span>}
      refreshButton={{ onClick: onRefresh, label: 'Refrescar' }}
    >
      <Sparkline
        data={data.series}
        threshold={0.01}
        peak={data.peak}
        maxValue={Math.max(0.05, data.peak?.value ?? 0, data.value)}
        ariaLabel={ariaLabel}
      />
    </MetricCard>
  );
}

function classify(value: number): { glyph: string; color: string; ariaState: string } {
  if (value < 0.01) {
    return {
      glyph: '✓',
      color: 'var(--color-success)',
      ariaState: 'Estado: dentro de umbral',
    };
  }
  if (value < 0.05) {
    return {
      glyph: '⚠',
      color: 'var(--color-status-below-target-fg)',
      ariaState: 'Estado: cerca del umbral',
    };
  }
  return {
    glyph: '✗',
    color: 'var(--color-destructive)',
    ariaState: 'Estado: fuera de umbral — investiga',
  };
}
