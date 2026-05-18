import { useState } from 'react';
import {
  deriveSeverity,
  type RetroactiveCategory,
  type RetroactiveQueueRowProps,
  type RetroactiveSeverity,
} from './RetroactiveQueueRow.types';

/**
 * `<RetroactiveQueueRow />` — single row of the j13 retroactive
 * reconciliation queue per `docs/ux/j13.md` §4 (Master-approved
 * 2026-05-18, all 5 §8 questions resolved).
 *
 * Implements:
 *   - 3 severity tiers (mute / amber / paprika) via a 4 px left rule —
 *     the v3 audit (file `audit-2026-05-18-v3-detail-08-...`) called out
 *     replacing the inline `⊙` glyph with a primitive left-rule.
 *   - 2 primary CTAs: `Re-firmar con nuevo X` + `Mantener firma`.
 *   - 1 tertiary CTA: `Ver diff →` (placeholder until the
 *     `<CorrectionsHistoryDiffModal>` adapter ships in the follow-up
 *     slice).
 *   - Tiered Mantener firma / Re-sign confirm per Master decision #3:
 *     1-click below 5 % impact threshold, typed-reason modal above.
 *   - Default-new re-sign value pre-filled per Master decision #4.
 *
 * NOT implemented in this PR (parked for follow-up slices):
 *   - The `Escalar a Owner` tertiary (v3 audit Top-5 flag #4 — needs
 *     audit_log event type registration first).
 *   - Cluster-confirm for shared `correction_id` (v3 audit Top-5 flag
 *     #3 — requires spec §7 amendment).
 *   - Real backend wiring (`m3_review_queue` API integration).
 */
const SEVERITY_STYLES: Record<
  RetroactiveSeverity,
  { borderColor: string; dotColor: string; label: string }
> = {
  paprika: {
    borderColor: 'var(--color-destructive)',
    dotColor: 'var(--color-destructive)',
    label: 'Alto impacto',
  },
  amber: {
    borderColor: 'var(--color-status-below-target-fg)',
    dotColor: 'var(--color-status-below-target-fg)',
    label: 'Impacto medio',
  },
  mute: {
    borderColor: 'var(--color-border-strong)',
    dotColor: 'var(--color-mute)',
    label: 'Bajo impacto',
  },
};

const CATEGORY_RESIGN_LABEL: Record<RetroactiveCategory, string> = {
  coste: 'Re-firmar con nuevo coste',
  allergen: 'Re-firmar con nueva matriz',
  procurement: 'Acuse de baja proveedor',
  lot: 'Aceptar downgrade',
};

const DEFAULT_HIGH_IMPACT_THRESHOLD = 5;
const REASON_MAX = 200;

export function RetroactiveQueueRow({
  row,
  onReSign,
  onMaintain,
  onOpenDiff,
  highImpactThresholdPct = DEFAULT_HIGH_IMPACT_THRESHOLD,
}: RetroactiveQueueRowProps) {
  const severity = deriveSeverity(row.impactPct, row.allergenRelevant);
  const isHighImpact = row.impactPct > highImpactThresholdPct;
  const severityStyle = SEVERITY_STYLES[severity];

  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reason, setReason] = useState('');

  const reSignLabel = CATEGORY_RESIGN_LABEL[row.category];

  const handleReSignClick = () => {
    if (isHighImpact) {
      setReason('');
      setReasonModalOpen(true);
      return;
    }
    onReSign(row, 'non-material');
  };

  const handleReasonSubmit = () => {
    const trimmed = reason.trim().slice(0, REASON_MAX);
    if (trimmed.length === 0) return;
    onReSign(row, trimmed);
    setReasonModalOpen(false);
  };

  return (
    <li
      data-testid="retroactive-queue-row"
      data-row-id={row.id}
      data-severity={severity}
      data-category={row.category}
      className="rounded-lg border bg-surface p-4"
      style={{
        borderColor: 'var(--color-border-strong)',
        borderLeftColor: severityStyle.borderColor,
        borderLeftWidth: '4px',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-label={`Severidad: ${severityStyle.label}`}
          role="status"
          className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: severityStyle.dotColor }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {row.headline}
            <span className="text-mute"> · {row.downstream}</span>
          </p>
          <p className="mt-1 text-xs text-mute">
            firmado {formatSignedAt(row.signedAt)} por {row.signedBy};
            detectado {row.detectedRelative} por {row.triggerLabel}
          </p>
          {row.allergenRelevant && (
            <p
              className="mt-1 text-xs font-semibold"
              style={{ color: 'var(--color-destructive)' }}
            >
              Cambio con relevancia alérgena
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleReSignClick}
              data-action="re-sign"
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
            >
              {reSignLabel}
            </button>
            <button
              type="button"
              onClick={() => onMaintain(row)}
              data-action="maintain"
              className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={{
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)',
              }}
            >
              Mantener firma
            </button>
            <button
              type="button"
              onClick={() => onOpenDiff(row)}
              data-action="open-diff"
              className="ml-auto inline-flex items-center text-sm underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={{ color: 'var(--color-accent-press)' }}
            >
              Ver diff →
            </button>
          </div>
        </div>
      </div>

      {reasonModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`reason-${row.id}-title`}
          data-testid="retroactive-resign-reason-modal"
          className="mt-3 rounded-md border bg-(--color-bg) p-3"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          <p id={`reason-${row.id}-title`} className="text-sm font-medium text-ink">
            Razón de la re-firma (alto impacto · &gt;{highImpactThresholdPct} %)
          </p>
          <p className="mt-1 text-xs text-mute">
            Default: <span className="font-medium">{row.newValueLabel}</span>
          </p>
          <textarea
            aria-label="Razón de la re-firma"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
            maxLength={REASON_MAX}
            rows={2}
            className="mt-2 w-full rounded-md border bg-surface p-2 text-sm focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-ink)' }}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setReasonModalOpen(false)}
              className="rounded-md px-3 py-1.5 text-sm text-mute focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleReasonSubmit}
              disabled={reason.trim().length === 0}
              className="rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
            >
              Confirmar re-firma
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function formatSignedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export type { RetroactiveQueueDemoRow } from './RetroactiveQueueRow.types';
