import { cn } from '../../lib/cn';
import type {
  DispatchReceiptCardProps,
  DispatchReceiptRow,
  DispatchReceiptStatus,
} from './DispatchReceiptCard.types';

const STATUS_GLYPH: Record<DispatchReceiptStatus, string> = {
  delivered: '✓',
  retrying: '⚠',
  failed: '✗',
  pending: '·',
};

const STATUS_LABEL: Record<DispatchReceiptStatus, string> = {
  delivered: 'entregado',
  retrying: 'reintentando',
  failed: 'fallo final',
  pending: 'pendiente',
};

const STATUS_FG: Record<DispatchReceiptStatus, string> = {
  delivered: 'var(--color-status-on-target-fg, var(--color-ink))',
  retrying: 'var(--color-status-below-target-fg)',
  failed: 'var(--color-destructive)',
  pending: 'var(--color-mute)',
};

/**
 * J7 region #3 — `DispatchReceiptCard`.
 *
 * Lists every recipient's delivery state. NOT a nested-card grid; per
 * DESIGN.md §6 the surface is a flat table with `--color-border` rules
 * between rows.
 *
 * Per j7.md edge case "Permanent failure shows ✗ fallo final with a
 * Reenviar manualmente ghost action", failed rows expose a button when
 * `onManualResend` is provided.
 */
export function DispatchReceiptCard({
  rows,
  onManualResend,
  className,
}: DispatchReceiptCardProps) {
  return (
    <section
      role="region"
      aria-label="Estado de entrega del dossier"
      className={cn(
        'rounded-lg border px-4 py-3',
        className,
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
      data-testid="dispatch-receipt-card"
    >
      <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {rows.map((row) => (
          <li key={row.address} className="py-2 text-sm">
            <DispatchRow row={row} onManualResend={onManualResend} />
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-2 text-sm" style={{ color: 'var(--color-mute)' }}>
            Sin destinatarios registrados.
          </li>
        )}
      </ul>
    </section>
  );
}

function DispatchRow({
  row,
  onManualResend,
}: {
  row: DispatchReceiptRow;
  onManualResend?: (recipientAddress: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          style={{ color: STATUS_FG[row.status] }}
          className="font-semibold"
        >
          {STATUS_GLYPH[row.status]}
        </span>
        <span className="font-mono" style={{ color: 'var(--color-ink)' }}>
          {row.address}
        </span>
        <span
          className="text-xs"
          style={{ color: STATUS_FG[row.status] }}
          aria-label={`Estado: ${STATUS_LABEL[row.status]}`}
        >
          {STATUS_LABEL[row.status]}
          {row.attempt !== undefined && row.status === 'retrying'
            ? ` · intento ${row.attempt}/3`
            : ''}
          {row.deliveredAt ? ` · ${row.deliveredAt}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        {row.auditLogRowRef && (
          <button
            type="button"
            onClick={row.auditLogRowRef.onClick}
            className="underline-offset-2 hover:underline"
            style={{ color: 'var(--color-mute)' }}
          >
            audit_log {row.auditLogRowRef.rowId.slice(0, 8)} →
          </button>
        )}
        {row.status === 'failed' && onManualResend && (
          <button
            type="button"
            onClick={() => onManualResend(row.address)}
            data-variant="manual-resend"
            className="underline-offset-2 hover:underline"
            style={{ color: 'var(--color-accent)' }}
          >
            Reenviar manualmente
          </button>
        )}
      </div>
    </div>
  );
}
