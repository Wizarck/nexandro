import { cn } from '../../lib/cn';
import type { OutOfSpecStickyWarningProps } from './OutOfSpecStickyWarning.types';

const DEFAULT_MESSAGE =
  'Lectura previa fuera de rango sin acción correctiva · revisar antes de firmar nueva lectura.';

/**
 * j10 region #9 — sticky warning (slice #10 m3-haccp-ui).
 *
 * Per ADR-J10-STICKY-WARNING-AT-MOUNT (design.md), this banner mounts
 * at the top of the surface when a prior reading is out-of-spec
 * without a linked corrective action. It is NOT dismissable; the
 * operator cannot ignore it (j10 §Region 9).
 *
 * Accessibility: `role="alert"` so screen-readers announce on mount
 * (j10 mock accessibility note).
 */
export function OutOfSpecStickyWarning({
  message = DEFAULT_MESSAGE,
  ctaLabel,
  onSeePrior,
  className,
}: OutOfSpecStickyWarningProps) {
  return (
    <div
      role="alert"
      className={cn(
        'mb-4 flex items-center justify-between gap-4 rounded-md border-l-4 p-3 text-sm',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-warn-bg)',
        border: '1px solid var(--color-destructive)',
        borderLeftWidth: '4px',
        color: 'var(--color-destructive)',
      }}
    >
      <span>
        <span aria-hidden="true">⚠ </span>
        {message}
      </span>
      {ctaLabel && onSeePrior && (
        <button
          type="button"
          onClick={onSeePrior}
          className="whitespace-nowrap rounded-md border bg-transparent px-3 py-1 text-sm font-medium"
          style={{
            color: 'var(--color-destructive)',
            borderColor: 'var(--color-destructive)',
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
