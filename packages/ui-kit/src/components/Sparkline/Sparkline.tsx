import { cn } from '../../lib/cn';
import type { SparklineProps } from './Sparkline.types';

/**
 * Minimal SVG line chart for the j8 dashboard (slice #20 m3-ai-obs-ui).
 *
 * Per ADR-ACCESSIBILITY, the `<svg>` carries `role="img"` + a caller-
 * supplied `aria-label` describing the trend + peak. The peak marker is
 * also exposed via a nested `<title>` so screen readers can announce it
 * when the user hovers or focus reaches the chart.
 *
 * Per the j8 mock §motion, the rendered path is static SVG — no JS-
 * driven animation. `prefers-reduced-motion: reduce` is honoured by the
 * absence of transitions.
 *
 * Layout: 120 × 40 viewBox. The path is normalised so the highest
 * value maps to y=8 and zero maps to y=32, leaving 8px of headroom on
 * each side for the peak marker.
 */
const VIEW_WIDTH = 120;
const VIEW_HEIGHT = 40;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const USABLE_HEIGHT = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;

export function Sparkline({
  data,
  maxValue,
  threshold,
  peak,
  ariaLabel,
  className,
}: SparklineProps) {
  const computedMax = maxValue ?? data.reduce((m, p) => Math.max(m, p.value), 0);
  const yScale = computedMax > 0 ? USABLE_HEIGHT / computedMax : 0;

  const xStep = data.length > 1 ? VIEW_WIDTH / (data.length - 1) : 0;
  const points = data.map((p, i) => {
    const x = i * xStep;
    const y = PAD_TOP + USABLE_HEIGHT - p.value * yScale;
    return { x, y };
  });
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');

  const thresholdY =
    threshold != null && computedMax > 0
      ? PAD_TOP + USABLE_HEIGHT - threshold * yScale
      : null;

  const peakPoint =
    peak != null && data.length > 0
      ? {
          x: peak.index * xStep,
          y: PAD_TOP + USABLE_HEIGHT - peak.value * yScale,
        }
      : null;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className={cn('block h-12 w-full', className)}
    >
      <title>{ariaLabel}</title>
      {thresholdY != null && (
        <line
          x1={0}
          y1={thresholdY}
          x2={VIEW_WIDTH}
          y2={thresholdY}
          stroke="var(--color-border-strong)"
          strokeDasharray="2 3"
          strokeWidth={0.8}
          aria-hidden="true"
        />
      )}
      {data.length > 0 && (
        <path
          d={pathD}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      {peakPoint && (
        <circle
          cx={peakPoint.x}
          cy={peakPoint.y}
          r={2.2}
          fill="var(--color-accent)"
          aria-hidden="true"
        />
      )}
    </svg>
  );
}
