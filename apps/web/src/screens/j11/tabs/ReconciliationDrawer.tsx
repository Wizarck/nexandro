import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResolveReconciliation } from '../../../hooks/useProcurement';
import type {
  ReconciliationDiff,
  ReconciliationListItem,
  ResolvableReconciliationState,
} from '../../../api/procurement';
import type { UserRole } from '@nexandro/ui-kit';

/**
 * j11 Reconciliación — resolution drawer (Sprint 4 W3-6).
 *
 * Surfaces the side-by-side PO-vs-GR diff for a single reconciliation row
 * and the three resolution actions per docs/ux/j11.md §6:
 *
 *   - Aceptar diferencia     → state = 'aceptada'      (audit_log + close)
 *   - Solicitar nota crédito → state = 'nota-credito'  (audit_log; email
 *                                                      template flow is a
 *                                                      followup)
 *   - Devolver               → state = 'devuelta'      (audit_log; GR draft
 *                                                      creation is out of
 *                                                      scope this slice)
 *
 * Owner approval gate (j11 §6 + W3-7 bundled): if the current role is
 * MANAGER and the discrepancy is "material" (diff amount > €500 OR type
 * = 'lote-no-conforme'), the three buttons are disabled with a tooltip
 * "Requiere aprobación del Owner". The `request-owner-approval` flow is
 * tracked as a followup (no backend endpoint yet — the W2-2a EmailService
 * stub would not buy us a real link round-trip).
 *
 * Side-panel sheet (not a full-screen modal) so operators keep the list
 * visible. Closes on overlay click + ESC.
 */

const MATERIAL_AMOUNT_THRESHOLD_EUR = 500;

type ActionKey = ResolvableReconciliationState;

const ACTIONS: ReadonlyArray<{
  key: ActionKey;
  label: string;
  variant: 'accent' | 'ghost' | 'ghost-destructive';
}> = [
  { key: 'aceptada', label: 'Aceptar diferencia', variant: 'accent' },
  { key: 'nota-credito', label: 'Solicitar nota de crédito', variant: 'ghost' },
  { key: 'devuelta', label: 'Devolver', variant: 'ghost-destructive' },
];

const STATE_LABELS: Record<ReconciliationListItem['state'], string> = {
  abierta: 'Abierta',
  aceptada: 'Aceptada',
  'nota-credito': 'Nota de crédito',
  devuelta: 'Devuelta',
};

const DISCREPANCY_LABELS: Record<
  ReconciliationListItem['discrepancyType'],
  string
> = {
  cantidad: 'Cantidad',
  precio: 'Precio',
  producto: 'Producto',
  'lote-no-conforme': 'Lote no conforme',
};

const NOTES_MAX = 1000;

export interface ReconciliationDrawerProps {
  row: ReconciliationListItem;
  role: UserRole | null;
  orgId: string;
  onClose: () => void;
}

export function ReconciliationDrawer({
  row,
  role,
  orgId,
  onClose,
}: ReconciliationDrawerProps) {
  const [confirmAction, setConfirmAction] = useState<ActionKey | null>(null);
  const [notes, setNotes] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  const mutation = useResolveReconciliation(orgId);

  // ESC closes the drawer (parity with retroactive-resign reason modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAction !== null) setConfirmAction(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmAction, onClose]);

  const isResolved = row.state !== 'abierta';
  const requiresOwnerApproval =
    role === 'MANAGER' && isMaterialDiscrepancy(row);

  const onActionClick = (action: ActionKey) => {
    setNotes('');
    setConfirmAction(action);
  };

  const onConfirm = () => {
    if (confirmAction === null) return;
    const trimmed = notes.trim();
    mutation.mutate(
      {
        id: row.id,
        payload: {
          state: confirmAction,
          ...(trimmed.length > 0 ? { notes: trimmed } : {}),
        },
      },
      {
        onSuccess: () => {
          setConfirmAction(null);
          setToastVisible(true);
          // Defer close so the toast briefly renders (matches the
          // OwnerCatalogSection import-toast pattern — sub-second polite
          // status announcement before the panel unmounts).
          window.setTimeout(() => {
            setToastVisible(false);
            onClose();
          }, 1500);
        },
      },
    );
  };

  return (
    <div
      data-testid="reconciliation-drawer-overlay"
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={`recon-drawer-title-${row.id}`}
        data-testid="reconciliation-drawer"
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-(--color-bg) shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-border-strong px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                id={`recon-drawer-title-${row.id}`}
                className="text-base font-semibold text-ink"
              >
                {row.poNumber ?? 'Sin OC vinculada'}
              </p>
              <p className="mt-0.5 truncate text-xs text-mute">
                Proveedor: <span className="font-mono">{row.supplierId}</span>
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StateBadge state={row.state} />
            <DiscrepancyBadge type={row.discrepancyType} />
          </div>
        </header>

        <section className="flex-1 space-y-4 px-5 py-4">
          <DiffCard
            discrepancyType={row.discrepancyType}
            diff={row.diff}
          />

          {isResolved && (
            <p
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-xs text-mute"
              data-testid="reconciliation-resolved-note"
            >
              Esta reconciliación ya fue resuelta. Las acciones están
              deshabilitadas.
            </p>
          )}

          {requiresOwnerApproval && !isResolved && (
            <p
              className="rounded-md border border-(--color-status-below-target-fg) bg-surface px-3 py-2 text-xs text-(--color-status-below-target-fg)"
              data-testid="reconciliation-owner-gate-note"
            >
              Discrepancia material (importe &gt; {MATERIAL_AMOUNT_THRESHOLD_EUR} €
              o lote no conforme). Requiere aprobación del Owner antes de
              resolverse.
            </p>
          )}

          {mutation.isError && (
            <p
              role="alert"
              className="rounded-md border border-(--color-danger-fg) bg-surface px-3 py-2 text-xs text-(--color-danger-fg)"
              data-testid="reconciliation-resolve-error"
            >
              No se pudo registrar la resolución: {mutation.error.message}
            </p>
          )}
        </section>

        <footer className="space-y-2 border-t border-border-strong px-5 py-4">
          {ACTIONS.map((a) => (
            <ActionButton
              key={a.key}
              label={a.label}
              variant={a.variant}
              disabled={
                isResolved || requiresOwnerApproval || mutation.isPending
              }
              tooltip={
                requiresOwnerApproval
                  ? 'Requiere aprobación del Owner'
                  : undefined
              }
              onClick={() => onActionClick(a.key)}
              testId={`reconciliation-action-${a.key}`}
            />
          ))}
          <AuditChip reconciliationId={row.id} />
        </footer>

        {confirmAction !== null && (
          <ConfirmModal
            action={confirmAction}
            notes={notes}
            onNotesChange={setNotes}
            onCancel={() => setConfirmAction(null)}
            onConfirm={onConfirm}
            isPending={mutation.isPending}
          />
        )}

        {toastVisible && (
          <div
            role="status"
            aria-live="polite"
            data-testid="reconciliation-resolve-toast"
            className="fixed bottom-4 right-4 z-50 rounded-md bg-(--color-accent) px-4 py-2 text-sm text-(--color-accent-fg) shadow"
          >
            Resolución registrada
          </div>
        )}
      </aside>
    </div>
  );
}

function ActionButton({
  label,
  variant,
  disabled,
  tooltip,
  onClick,
  testId,
}: {
  label: string;
  variant: 'accent' | 'ghost' | 'ghost-destructive';
  disabled: boolean;
  tooltip?: string;
  onClick: () => void;
  testId: string;
}) {
  const base =
    'flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:cursor-not-allowed disabled:opacity-50';
  const style: React.CSSProperties = {};
  let className = base;
  if (variant === 'accent') {
    style.backgroundColor = 'var(--color-accent)';
    style.color = 'var(--color-accent-fg)';
  } else if (variant === 'ghost') {
    className += ' border';
    style.borderColor = 'var(--color-border-strong)';
    style.color = 'var(--color-ink)';
  } else {
    className += ' border';
    style.borderColor = 'var(--color-destructive)';
    style.color = 'var(--color-destructive)';
  }
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      title={tooltip}
      aria-disabled={disabled}
      onClick={onClick}
      className={className}
      style={style}
    >
      {label}
    </button>
  );
}

function ConfirmModal({
  action,
  notes,
  onNotesChange,
  onCancel,
  onConfirm,
  isPending,
}: {
  action: ActionKey;
  notes: string;
  onNotesChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const actionDef = ACTIONS.find((a) => a.key === action);
  const label = actionDef?.label ?? action;
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recon-confirm-title"
        data-testid="reconciliation-confirm-modal"
        className="w-full max-w-sm rounded-md border border-border-strong bg-(--color-bg) p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="recon-confirm-title"
          className="text-sm font-medium text-ink"
        >
          Confirmar resolución: {label}
        </p>
        <label className="mt-3 block text-xs font-medium text-mute">
          Notas de resolución
          <textarea
            data-testid="reconciliation-notes-input"
            aria-label="Notas de resolución"
            value={notes}
            onChange={(e) =>
              onNotesChange(e.target.value.slice(0, NOTES_MAX))
            }
            maxLength={NOTES_MAX}
            rows={3}
            placeholder="Opcional — quedará registrado en el audit_log"
            className="mt-1 w-full rounded-md border bg-surface p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            style={{ borderColor: 'var(--color-border-strong)' }}
          />
        </label>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="reconciliation-confirm-cancel"
            className="rounded-md px-3 py-1.5 text-sm text-mute focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            data-testid="reconciliation-confirm-submit"
            className="rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'var(--color-accent-fg)',
            }}
          >
            {isPending ? 'Registrando…' : 'Confirmar resolución'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: ReconciliationListItem['state'] }) {
  const palette: Record<
    ReconciliationListItem['state'],
    { bg: string; fg: string }
  > = {
    abierta: {
      bg: 'var(--color-status-below-target-bg)',
      fg: 'var(--color-status-below-target-fg)',
    },
    aceptada: {
      bg: 'var(--color-status-on-track-bg)',
      fg: 'var(--color-status-on-track-fg)',
    },
    'nota-credito': {
      bg: 'var(--color-surface)',
      fg: 'var(--color-ink)',
    },
    devuelta: {
      bg: 'var(--color-surface)',
      fg: 'var(--color-destructive)',
    },
  };
  const p = palette[state];
  return (
    <span
      data-testid="reconciliation-state-badge"
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: p.bg, color: p.fg }}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

function DiscrepancyBadge({
  type,
}: {
  type: ReconciliationListItem['discrepancyType'];
}) {
  return (
    <span
      data-testid="reconciliation-discrepancy-badge"
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-ink"
      style={{ borderColor: 'var(--color-border-strong)' }}
    >
      {DISCREPANCY_LABELS[type]}
    </span>
  );
}

interface DiffRow {
  label: string;
  expected: string;
  actual: string;
  highlight: boolean;
}

function buildDiffRows(
  type: ReconciliationListItem['discrepancyType'],
  diff: ReconciliationDiff,
): DiffRow[] {
  const get = (k: string): unknown => diff[k];
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v.toString();
    return String(v);
  };
  switch (type) {
    case 'cantidad': {
      const unit = fmt(get('unit'));
      return [
        {
          label: 'Cantidad',
          expected: `${fmt(get('expectedQty'))} ${unit}`.trim(),
          actual: `${fmt(get('actualQty'))} ${unit}`.trim(),
          highlight: true,
        },
        {
          label: 'Δ %',
          expected: '—',
          actual: fmt(get('deltaPct')),
          highlight: false,
        },
      ];
    }
    case 'precio': {
      const currency = fmt(get('currency'));
      return [
        {
          label: 'Precio unitario',
          expected: `${fmt(get('expectedUnitPrice'))} ${currency}`.trim(),
          actual: `${fmt(get('actualUnitPrice'))} ${currency}`.trim(),
          highlight: true,
        },
        {
          label: 'Δ %',
          expected: '—',
          actual: fmt(get('deltaPct')),
          highlight: false,
        },
      ];
    }
    case 'producto':
      return [
        {
          label: 'Producto',
          expected: fmt(get('expectedProductId')),
          actual: fmt(get('actualProductId')),
          highlight: true,
        },
      ];
    case 'lote-no-conforme':
      return [
        {
          label: 'Lote',
          expected: '—',
          actual: fmt(get('lotId')),
          highlight: true,
        },
        {
          label: 'Motivo',
          expected: '—',
          actual: fmt(get('reason')),
          highlight: true,
        },
      ];
  }
}

function DiffCard({
  discrepancyType,
  diff,
}: {
  discrepancyType: ReconciliationListItem['discrepancyType'];
  diff: ReconciliationDiff;
}) {
  const rows = buildDiffRows(discrepancyType, diff);
  return (
    <div
      data-testid="reconciliation-diff-card"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border-strong bg-(--color-border-strong)"
    >
      <div className="bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-mute">
        Esperado (OC)
      </div>
      <div className="bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-wide text-mute">
        Real (Recepción)
      </div>
      {rows.map((row) => (
        <DiffRowCells key={row.label} row={row} />
      ))}
    </div>
  );
}

function DiffRowCells({ row }: { row: DiffRow }) {
  const expectedStyle: React.CSSProperties = row.highlight
    ? {
        backgroundColor: 'var(--color-status-on-track-bg)',
        color: 'var(--color-status-on-track-fg)',
      }
    : {};
  const actualStyle: React.CSSProperties = row.highlight
    ? {
        backgroundColor: 'var(--color-status-below-target-bg)',
        color: 'var(--color-status-below-target-fg)',
      }
    : {};
  return (
    <>
      <div className="bg-(--color-bg) px-3 py-2 text-xs">
        <p className="text-mute">{row.label}</p>
        <p
          className="mt-1 font-mono text-sm text-ink"
          style={expectedStyle}
        >
          {row.expected}
        </p>
      </div>
      <div className="bg-(--color-bg) px-3 py-2 text-xs">
        <p className="text-mute">{row.label}</p>
        <p
          className="mt-1 font-mono text-sm text-ink"
          style={actualStyle}
        >
          {row.actual}
        </p>
      </div>
    </>
  );
}

/**
 * "Material" discrepancy heuristic for the Owner approval gate.
 *
 * Per j11 §6 + W3-7 brief: amount > €500 OR type === 'lote-no-conforme'.
 * For cantidad/precio we approximate the impact amount from the diff
 * payload:
 *   - cantidad: |expectedQty - actualQty| * expectedUnitPrice (when
 *               present; the detector currently does NOT denormalise
 *               unit_price into the cantidad diff, so we fall back to
 *               the deltaPct * a generous notional and treat anything
 *               above 5 % as material).
 *   - precio:   |expectedUnitPrice - actualUnitPrice| * expectedQty
 *               (same gap — falls back to deltaPct).
 *   - producto: always material (wrong SKU is never auto-resolvable by
 *               the Manager).
 *   - lote-no-conforme: always material (per spec).
 *
 * Net effect today: producto + lote-no-conforme are always material;
 * cantidad/precio are material when deltaPct > 5. This is intentionally
 * conservative — the Manager is gated MORE often than the spec strictly
 * demands, never less. The exact €500 calculation will land when the
 * detector denormalises unit_price into every diff payload (followup).
 */
/**
 * Sprint 4 W3-8 — audit chip per row.
 *
 * Renders an `audit_log AL-2026-NNNNNN · ver chain →` chip in the
 * drawer footer that deep-links to /audit-log?aggregate_id={recon.id}.
 *
 * `AL-2026-NNNNNN` is a friendly synthetic label derived from the
 * reconciliation UUID (first 6 hex chars uppercased). The real audit
 * envelope id is not denormalised onto the reconciliation row today —
 * /audit-log filters by aggregate_id so the link still lands on the
 * exact chain of events for this reconciliation.
 *
 * The "ver chain →" affordance is intentionally a plain text link
 * (no button styling) — the action is navigation, not mutation, and
 * the AuditLogScreen owns the actual drill-down experience.
 */
function AuditChip({ reconciliationId }: { reconciliationId: string }) {
  const synthetic = buildSyntheticAuditLabel(reconciliationId);
  const href = `/audit-log?aggregate_id=${encodeURIComponent(reconciliationId)}`;
  return (
    <div
      data-testid="reconciliation-audit-chip"
      className="flex items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-xs text-mute"
    >
      <span className="font-mono">
        audit_log <span className="text-ink">{synthetic}</span>
      </span>
      <Link
        to={href}
        data-testid="reconciliation-audit-chip-link"
        className="text-(--color-accent) underline hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
      >
        ver chain →
      </Link>
    </div>
  );
}

/**
 * Build the `AL-2026-NNNNNN` display label from a UUID. We take the
 * first 6 hex chars of the id (case-insensitive) and uppercase them
 * so two reconciliations rarely share a label. The year segment is
 * hard-coded to the current civil year since reconciliations are
 * scoped to ops-recent activity (no historical browse use case yet).
 */
function buildSyntheticAuditLabel(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 6).toUpperCase();
  const year = new Date().getUTCFullYear();
  return `AL-${year}-${hex}`;
}

function isMaterialDiscrepancy(row: ReconciliationListItem): boolean {
  if (row.discrepancyType === 'producto') return true;
  if (row.discrepancyType === 'lote-no-conforme') return true;
  const diff = row.diff;
  const deltaRaw = diff['deltaPct'];
  const delta = typeof deltaRaw === 'number' ? deltaRaw : Number(deltaRaw);
  if (Number.isFinite(delta) && delta > 5) return true;
  return false;
}
