/**
 * Inline confirmation strip — J6 region #6. NOT a modal.
 *
 * Per j6.md "Confirmation strip, not a modal": tapping the J6 sticky CTA
 * expands this strip directly below the button. A single confirm pill
 * + a ghost back link. Confirming dispatches; ghost-back restores the
 * trace tree.
 *
 * Post-dispatch the same strip morphs in place to a receipt — the host
 * swaps `mode` from `'confirm'` to `'receipt'`.
 */
export type RecallConfirmationStripMode = 'confirm' | 'receipt';

export interface RecallConfirmationStripProps {
  /** Visible mode of the strip. */
  mode: RecallConfirmationStripMode;
  /** Question or receipt headline ("¿Cortar servicio…" / "Dossier dispatched…"). */
  message: string;
  /** Confirm pill label (defaults to 'Sí, despachar ahora'). Only used in confirm mode. */
  confirmLabel?: string;
  /** Ghost back link label (defaults to 'Volver'). Only used in confirm mode. */
  cancelLabel?: string;
  /** Receipt link label + handler (e.g. 'ver dossier →'). Only used in receipt mode. */
  receiptLink?: { label: string; onClick: () => void };
  /** Confirm pill click handler. */
  onConfirm?: () => void;
  /** Ghost-back click handler. */
  onCancel?: () => void;
  /** When true, the confirm pill is disabled (in-flight). */
  busy?: boolean;
  className?: string;
}
