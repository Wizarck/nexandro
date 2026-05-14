import { cn } from '../../lib/cn';
import type { RecallActionBarProps } from './RecallActionBar.types';

/**
 * Sticky single-CTA bar — J6 region #5.
 *
 * Per j6.md "Single sticky CTA, not a two-button row": this component
 * renders ONE forward action. The CTA is `<button>` (never a styled
 * `<a>`) so screen-readers + keyboard users get correct semantics.
 *
 * The container sits flush against the viewport bottom with a 24 px
 * gutter; on mobile the CTA spans the full viewport minus that gutter.
 */
export function RecallActionBar({
  label,
  onActivate,
  eyebrow,
  disabled,
  children,
  className,
}: RecallActionBarProps) {
  return (
    <div
      role="region"
      aria-label={label}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 px-4 pb-4 pt-3',
        'bg-(--color-bg)',
        className,
      )}
      style={{ backgroundColor: 'var(--color-bg)' }}
      data-testid="recall-action-bar"
    >
      {eyebrow != null && (
        <div
          className="mb-2 text-center text-xs tracking-[0.04em] tabular-nums"
          style={{ color: 'var(--color-mute)' }}
        >
          {eyebrow}
        </div>
      )}
      <button
        type="button"
        onClick={onActivate}
        disabled={disabled}
        data-variant="destructive"
        className={cn(
          'w-full h-16 rounded-lg font-semibold text-base',
          'transition-opacity disabled:opacity-60',
        )}
        style={{
          backgroundColor: 'var(--color-destructive)',
          color: 'var(--color-accent-fg)',
          border: '1px solid var(--color-destructive)',
        }}
      >
        {label}
      </button>
      {children}
    </div>
  );
}
