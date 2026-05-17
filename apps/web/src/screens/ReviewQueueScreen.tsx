import { useCallback, useEffect, useMemo, useState } from 'react';
import { RoleGuard } from '@nexandro/ui-kit';
import type {
  ReviewQueueAggregateType,
  ReviewQueueDetails,
  ReviewQueueRow,
} from '../api/review-queue';
import {
  useClearReviewQueueItem,
  useReviewQueueList,
} from '../hooks/useReviewQueue';
import { useCurrentOrgId, useCurrentRole } from '../lib/currentUser';

/**
 * Owner+Manager browse UI for the review-queue surface (slice
 * `m3.x-review-queue-ui`). Lists Lot + GR rows flagged
 * `requires_review=true` by the photo-ingest retroactive-correction
 * listener (PR #157) and lets an operator clear the flag after manual
 * reconciliation. Backend at `/m3/review-queue` (PR #161).
 *
 * Layout: chip-group filter on top, list-on-left + detail-pane-on-right
 * below (j12 pattern). Clear action is one-tap with an in-page toast;
 * `alreadyClear: true` returns from the backend as the same shape so
 * cross-tenant lookups don't disclose existence (ADR-NO-EXISTENCE-
 * DISCLOSURE).
 */

const PAGE_LIMIT = 50;
const TOAST_TTL_MS = 5_000;

type AggregateFilter = 'all' | ReviewQueueAggregateType;

const FILTER_OPTIONS: { value: AggregateFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'lot', label: 'Lotes' },
  { value: 'goods_receipt', label: 'Recepciones' },
];

interface ToastState {
  kind: 'cleared' | 'already-clear' | 'error';
  message: string;
}

export function ReviewQueueScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <h2 className="text-2xl font-semibold text-ink">Cola de revisión</h2>
      <p className="text-sm text-mute">
        Lotes y recepciones marcados para revisión tras una corrección
        retroactiva. Marca como revisado cuando hayas reconciliado.
      </p>
      <RoleGuard role={['OWNER', 'MANAGER']} currentRole={role} fallback={<AccessDenied />}>
        {orgId ? <Inner orgId={orgId} /> : <SignedOut />}
      </RoleGuard>
    </div>
  );
}

function Inner({ orgId }: { orgId: string }) {
  const [filter, setFilter] = useState<AggregateFilter>('all');
  const [selected, setSelected] = useState<ReviewQueueRow | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const query = useReviewQueueList(orgId, {
    aggregateType: filter === 'all' ? undefined : filter,
    limit: PAGE_LIMIT,
  });
  const clearMutation = useClearReviewQueueItem();

  const rows = useMemo<ReviewQueueRow[]>(() => query.data?.rows ?? [], [query.data?.rows]);
  const truncated = query.data?.truncated ?? false;

  // Drop the detail pane when the selected row is no longer in the set
  // (filtered out, cleared, etc.) so we never render stale state.
  useEffect(() => {
    if (selected == null) return;
    const stillThere = rows.some(
      (r) =>
        r.aggregateType === selected.aggregateType &&
        r.aggregateId === selected.aggregateId,
    );
    if (!stillThere) setSelected(null);
  }, [rows, selected]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_TTL_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const onClear = useCallback(
    (row: ReviewQueueRow) => {
      clearMutation.mutate(
        {
          organizationId: orgId,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
        },
        {
          onSuccess: (data) => {
            setToast({
              kind: data.alreadyClear ? 'already-clear' : 'cleared',
              message: data.alreadyClear
                ? 'Ya estaba revisado.'
                : `${labelForAggregate(row.aggregateType)} marcado como revisado.`,
            });
          },
          onError: (err) => {
            setToast({
              kind: 'error',
              message: `Error al marcar como revisado: ${err.message}`,
            });
          },
        },
      );
    },
    [clearMutation, orgId],
  );

  const counts = useMemo(() => {
    let lot = 0;
    let gr = 0;
    for (const r of rows) {
      if (r.aggregateType === 'lot') lot++;
      else gr++;
    }
    return { lot, gr };
  }, [rows]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              aria-pressed={active}
              className={
                'rounded-full border px-3 py-1 text-sm transition-colors ' +
                (active
                  ? 'border-(--color-accent) bg-(--color-accent) text-(--color-accent-fg)'
                  : 'border-border-strong text-mute hover:bg-surface-muted')
              }
            >
              {opt.label}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-mute" data-testid="review-queue-counts">
          {`${rows.length} en cola · ${counts.lot} lotes · ${counts.gr} recepciones`}
        </span>
      </div>

      {query.error && (
        <p
          role="alert"
          className="rounded border border-(--color-danger-fg) bg-surface px-3 py-2 text-sm text-(--color-danger-fg)"
        >
          Error al cargar la cola: {query.error.message}
        </p>
      )}

      {truncated && (
        <p
          role="status"
          className="rounded border border-border-strong bg-surface-muted px-3 py-2 text-xs text-mute"
        >
          Mostrando las {PAGE_LIMIT} más recientes. Ajusta el filtro para acotar.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div>
          {query.isPending ? (
            <SkeletonList />
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border-strong rounded-lg border border-border-strong bg-surface">
              {rows.map((row) => {
                const isSelected =
                  selected?.aggregateType === row.aggregateType &&
                  selected?.aggregateId === row.aggregateId;
                return (
                  <li key={`${row.aggregateType}:${row.aggregateId}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      aria-pressed={isSelected}
                      className={
                        'block w-full px-3 py-2 text-left transition-colors ' +
                        (isSelected
                          ? 'bg-surface-muted border-l-2 border-(--color-accent)'
                          : 'hover:bg-surface-muted border-l-2 border-transparent')
                      }
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
                            (row.aggregateType === 'lot'
                              ? 'bg-(--color-warn-bg) text-(--color-status-below-target-fg)'
                              : 'bg-(--color-accent-soft) text-ink')
                          }
                        >
                          {labelForAggregate(row.aggregateType)}
                        </span>
                        <span className="text-xs text-mute tabular-nums">
                          {formatRelative(row.flaggedAt)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-ink">
                        {summaryFor(row)}
                      </div>
                      <div className="mt-0.5 text-xs text-mute" data-testid="review-queue-row-id">
                        {elideId(row.aggregateId)}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          {selected ? (
            <DetailPane
              row={selected}
              onClear={onClear}
              pending={
                clearMutation.isPending &&
                clearMutation.variables?.aggregateType === selected.aggregateType &&
                clearMutation.variables?.aggregateId === selected.aggregateId
              }
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border-strong p-6 text-sm text-mute">
              Selecciona una fila para ver el detalle.
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          data-testid="review-queue-toast"
          className={
            'fixed bottom-4 right-4 max-w-sm rounded-md border px-3 py-2 text-sm shadow ' +
            (toast.kind === 'error'
              ? 'border-(--color-danger-fg) bg-surface text-(--color-danger-fg)'
              : toast.kind === 'already-clear'
                ? 'border-border-strong bg-surface text-mute'
                : 'border-(--color-accent) bg-surface text-ink')
          }
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

function DetailPane({
  row,
  onClear,
  pending,
}: {
  row: ReviewQueueRow;
  onClear: (row: ReviewQueueRow) => void;
  pending: boolean;
}) {
  return (
    <div
      data-testid="review-queue-detail"
      className="space-y-3 rounded-lg border border-border-strong bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-mute">
            {labelForAggregate(row.aggregateType)}
          </p>
          <p className="font-mono text-sm text-ink">{row.aggregateId}</p>
        </div>
        <button
          type="button"
          onClick={() => onClear(row)}
          disabled={pending}
          className="rounded-md bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-fg) hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? 'Marcando…' : 'Marcar como revisado'}
        </button>
      </div>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <DetailRow label="Marcado">{formatRelative(row.flaggedAt)}</DetailRow>
        <DetailRow label="Recibido">{formatDate(row.details.receivedAt)}</DetailRow>
        {detailRowsFor(row.details)}
        {row.sourcePhotoIngestionId && (
          <DetailRow label="Foto-ingesta">
            <span className="font-mono text-xs">{row.sourcePhotoIngestionId}</span>
          </DetailRow>
        )}
      </dl>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-mute">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </>
  );
}

function detailRowsFor(details: ReviewQueueDetails): React.ReactNode {
  if (details.aggregateType === 'lot') {
    return (
      <>
        <DetailRow label="Ubicación">
          <span className="font-mono text-xs">{details.locationId}</span>
        </DetailRow>
        <DetailRow label="Proveedor">
          {details.supplierId ? (
            <span className="font-mono text-xs">{details.supplierId}</span>
          ) : (
            <span className="text-mute">—</span>
          )}
        </DetailRow>
        <DetailRow label="Unidad">{details.unit}</DetailRow>
      </>
    );
  }
  return (
    <>
      <DetailRow label="Proveedor">
        <span className="font-mono text-xs">{details.supplierId}</span>
      </DetailRow>
      <DetailRow label="Ubicación recepción">
        <span className="font-mono text-xs">{details.receivedAtLocationId}</span>
      </DetailRow>
      <DetailRow label="Ref. albarán">
        {details.supplierInvoiceRef ?? <span className="text-mute">—</span>}
      </DetailRow>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-sm text-mute">
      <p className="font-medium text-ink">Bandeja al día.</p>
      <p className="mt-1">No hay lotes ni recepciones pendientes de revisión.</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul
      data-testid="review-queue-skeleton"
      className="divide-y divide-border-strong rounded-lg border border-border-strong bg-surface"
    >
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-3 py-3">
          <div className="h-3 w-1/3 animate-pulse rounded bg-surface-muted" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-surface-muted" />
        </li>
      ))}
    </ul>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium">
        Solo el Owner y el Manager pueden consultar la cola de revisión.
      </p>
      <p className="mt-1 text-xs">
        Si crees que esto es un error, contacta con el administrador.
      </p>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p>Inicia sesión para consultar la cola de revisión.</p>
    </div>
  );
}

function labelForAggregate(t: ReviewQueueAggregateType): string {
  return t === 'lot' ? 'Lote' : 'Recepción';
}

function summaryFor(row: ReviewQueueRow): string {
  if (row.details.aggregateType === 'lot') {
    return `${row.details.unit} · recibido ${formatDate(row.details.receivedAt)}`;
  }
  const ref = row.details.supplierInvoiceRef
    ? `ref. ${row.details.supplierInvoiceRef}`
    : 'sin ref. de albarán';
  return `${ref} · recibido ${formatDate(row.details.receivedAt)}`;
}

function elideId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatRelative(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const deltaMs = Math.max(0, now - t);
  const mins = Math.floor(deltaMs / 60_000);
  if (mins < 1) return 'hace <1 min';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

// Internal re-exports for tests.
export const __test__ = {
  formatRelative,
  elideId,
  summaryFor,
  labelForAggregate,
};

// Ensure the module is treated as a module by tooling that scans imports.
export type { ReviewQueueRow };
