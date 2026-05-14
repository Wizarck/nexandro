import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';
import type { HeatmapProps } from './Heatmap.types';

/**
 * Fixed-grid heatmap consumed by j8 UsageHeatmapWidget (slice #20
 * m3-ai-obs-ui).
 *
 * Per ADR-ACCESSIBILITY, every cell is a `<button>` with a caller-
 * supplied `aria-label` disclosing day + hour + value. Arrow keys
 * navigate between cells; Space/Enter fires `onCellClick`.
 *
 * Per the j8 mock §motion, cells render statically — no JS-driven
 * colour transitions. Bucketing maps the value to one of 6 OKLCH
 * lightness steps. The lightness ramp lives in the j8 mock at
 * `--heat-0..--heat-5`; we recompute the same OKLCH chain inline so
 * the primitive is self-contained.
 */
const HEAT_OKLCH = [
  'oklch(95% 0.010 190)',
  'oklch(88% 0.030 190)',
  'oklch(78% 0.050 190)',
  'oklch(66% 0.062 190)',
  'oklch(54% 0.072 190)',
  'oklch(44% 0.072 190)',
] as const;

export function Heatmap({
  rows,
  cols,
  rowLabels,
  colLabels,
  cells,
  max,
  cellAriaLabel,
  onCellClick,
  className,
}: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  function focusCell(row: number, col: number): void {
    const clampedRow = Math.max(0, Math.min(rows - 1, row));
    const clampedCol = Math.max(0, Math.min(cols - 1, col));
    const next = containerRef.current?.querySelector<HTMLButtonElement>(
      `button[data-row="${clampedRow}"][data-col="${clampedCol}"]`,
    );
    next?.focus();
  }

  function handleKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number,
    value: number,
  ): void {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusCell(row, col + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusCell(row, col - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusCell(row + 1, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(row - 1, col);
    } else if ((e.key === 'Enter' || e.key === ' ') && onCellClick) {
      e.preventDefault();
      onCellClick(row, col, value);
    }
  }

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-rowcount={rows + 1}
      aria-colcount={cols + 1}
      className={cn('grid gap-[2px] text-xs', className)}
      style={{
        gridTemplateColumns: `80px repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      <span aria-hidden="true" />
      {colLabels.map((label, c) => (
        <span
          key={`col-${c}`}
          role="columnheader"
          aria-colindex={c + 2}
          className="text-center text-(--color-mute) pb-[2px]"
        >
          {label}
        </span>
      ))}

      {Array.from({ length: rows }).map((_, r) => (
        <RowGroup
          key={`row-${r}`}
          row={r}
          rowLabel={rowLabels[r] ?? ''}
          cols={cols}
          cells={cells[r] ?? Array.from({ length: cols }, () => 0)}
          max={max}
          cellAriaLabel={cellAriaLabel}
          onCellClick={onCellClick}
          onKeyDown={handleKeyDown}
        />
      ))}
    </div>
  );
}

interface RowGroupProps {
  row: number;
  rowLabel: string;
  cols: number;
  cells: number[];
  max: number;
  cellAriaLabel: HeatmapProps['cellAriaLabel'];
  onCellClick: HeatmapProps['onCellClick'];
  onKeyDown: (
    e: KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number,
    value: number,
  ) => void;
}

function RowGroup({
  row,
  rowLabel,
  cols,
  cells,
  max,
  cellAriaLabel,
  onCellClick,
  onKeyDown,
}: RowGroupProps) {
  return (
    <>
      <span
        role="rowheader"
        aria-rowindex={row + 2}
        className="self-center pr-2 text-(--color-mute)"
      >
        {rowLabel}
      </span>
      {Array.from({ length: cols }).map((_, c) => {
        const value = cells[c] ?? 0;
        const bucket = bucketFor(value, max);
        return (
          <button
            key={`cell-${row}-${c}`}
            type="button"
            data-row={row}
            data-col={c}
            data-bucket={bucket}
            aria-label={cellAriaLabel(row, c, value)}
            role="gridcell"
            aria-rowindex={row + 2}
            aria-colindex={c + 2}
            tabIndex={row === 0 && c === 0 ? 0 : -1}
            onClick={() => onCellClick?.(row, c, value)}
            onKeyDown={(e) => onKeyDown(e, row, c, value)}
            className="h-6 rounded-[2px] border-0 p-0 outline-offset-2"
            style={{ background: HEAT_OKLCH[bucket] }}
          />
        );
      })}
    </>
  );
}

/**
 * Returns the OKLCH lightness bucket (0..5) for the given value
 * against the matrix max. Zero always falls in bucket 0; the upper 5
 * buckets are evenly distributed.
 */
export function bucketFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const frac = value / max;
  if (frac >= 0.9) return 5;
  if (frac >= 0.7) return 4;
  if (frac >= 0.5) return 3;
  if (frac >= 0.3) return 2;
  if (frac >= 0.1) return 1;
  return 0;
}
