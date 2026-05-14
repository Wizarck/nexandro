import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import type {
  SpecRangeReadbackProps,
  SpecRangeStatus,
} from './SpecRangeReadback.types';

/**
 * j10 region #4 — live spec-range readback (slice #10 m3-haccp-ui).
 *
 * Per ADR-J10-LIVE-READBACK-CLIENT-SIDE (design.md), status derivation
 * is purely client-side: no server roundtrip per keystroke. The
 * component exposes the status via the live region so screen-readers
 * announce in/out-of-spec transitions as the operator types.
 *
 * `aria-live="polite"` is required per j10 §Notes for implementation.
 */
export function SpecRangeReadback({
  specMin,
  specMax,
  currentValue,
  unit,
  className,
}: SpecRangeReadbackProps) {
  const status: SpecRangeStatus = useMemo(() => {
    const raw = currentValue?.toString().trim() ?? '';
    if (raw === '') return 'idle';
    const value = Number(raw);
    if (Number.isNaN(value)) return 'idle';
    if (value < specMin || value > specMax) return 'out-of-spec';
    return 'in-spec';
  }, [currentValue, specMin, specMax]);

  const rangeLabel = `${formatNumber(specMin)} a ${formatNumber(specMax)} ${unit}`;

  return (
    <p
      role="status"
      aria-live="polite"
      data-status={status}
      className={cn(
        'mt-2 inline-flex items-center gap-1 text-sm font-medium',
        className,
      )}
      style={{
        color: STATUS_COLOR[status],
        fontWeight: status === 'idle' ? 500 : 600,
      }}
    >
      <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
      <span>{statusCopy(status, rangeLabel)}</span>
    </p>
  );
}

const STATUS_COLOR: Readonly<Record<SpecRangeStatus, string>> = {
  idle: 'var(--color-mute)',
  'in-spec': 'var(--color-success)',
  'out-of-spec': 'var(--color-destructive)',
};

const STATUS_GLYPH: Readonly<Record<SpecRangeStatus, string>> = {
  idle: '·',
  'in-spec': '✓',
  'out-of-spec': '⚠',
};

function statusCopy(status: SpecRangeStatus, rangeLabel: string): string {
  if (status === 'in-spec') return `Dentro de rango (${rangeLabel})`;
  if (status === 'out-of-spec') {
    return 'Fuera de rango · se requiere acción correctiva';
  }
  return `Rango aceptable: ${rangeLabel}`;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
