import { cn } from '../../lib/cn';
import type { RecallConfirmationStripProps } from './RecallConfirmationStrip.types';

/**
 * Inline confirmation strip — J6 region #6. Renders BELOW the CTA, NOT
 * as a modal stack (per DESIGN.md §6 modal-as-first-thought anti-
 * pattern).
 *
 * Two modes:
 *  - `confirm` — question + confirm pill + ghost back.
 *  - `receipt` — receipt headline + optional link to the dossier.
 */
export function RecallConfirmationStrip({
  mode,
  message,
  confirmLabel = 'Sí, despachar ahora',
  cancelLabel = 'Volver',
  receiptLink,
  onConfirm,
  onCancel,
  busy,
  className,
}: RecallConfirmationStripProps) {
  return (
    <div
      role={mode === 'receipt' ? 'status' : 'group'}
      aria-live={mode === 'receipt' ? 'polite' : undefined}
      className={cn(
        'mt-3 rounded-md px-4 py-3 text-sm',
        'border',
        className,
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
      }}
      data-mode={mode}
    >
      <p className="mb-2">{message}</p>
      {mode === 'confirm' && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-variant="confirm"
            className="rounded-pill px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
            style={{
              backgroundColor: 'var(--color-destructive)',
              color: 'var(--color-accent-fg)',
              border: '1px solid var(--color-destructive)',
            }}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-variant="cancel"
            className="text-sm underline-offset-2 hover:underline"
            style={{ color: 'var(--color-mute)' }}
          >
            {cancelLabel}
          </button>
        </div>
      )}
      {mode === 'receipt' && receiptLink && (
        <button
          type="button"
          onClick={receiptLink.onClick}
          data-variant="receipt-link"
          className="text-sm underline-offset-2 hover:underline"
          style={{ color: 'var(--color-accent)' }}
        >
          {receiptLink.label}
        </button>
      )}
    </div>
  );
}
