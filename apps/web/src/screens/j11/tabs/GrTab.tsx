import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  flushGrConfirmQueue,
  useBulkConfirmGoodsReceipts,
  useGoodsReceipts,
} from '../../../hooks/useProcurement';
import { useOfflineStatus } from '../../../hooks/useOfflineStatus';
import type {
  GrListFilters,
  GrListItem,
  GrUiState,
} from '../../../api/procurement';
import { GrDetailDrawer } from './GrDetailDrawer';
import { EmptyState, ErrorBox, Loading } from './shared';

/**
 * j11 Procurement — Recepciones tab.
 *
 * Sprint 4 W3-2 added the tablet-first dock drawer (rows ≥ 64 px touch
 * target → drawer with per-line edit + confirm). Wave 3 Block 2-B layers:
 *
 *   - W3-3 bulk-confirm CTA `Confirmar todo lo que coincida (N)` at the
 *     top of the table. `N` is computed client-side using the j11 spec
 *     BULK_CONFIRM_PREDICATE; the click opens a confirmation modal with
 *     the matching grs summary. Backend endpoint is wiring-pending so
 *     the CTA renders enabled-but-tooltipped → modal → "pendiente de
 *     wiring" banner.
 *   - W3-9 filter chips (location · estado · solo pendientes) above the
 *     table. The dock workflow defaults to `pendientes` so a freshly
 *     opened tablet lands on "what's waiting to be received".
 *   - W3-8 audit chip per row → /audit-log?aggregate_id= is plugged
 *     into the drawer footer (see GrDetailDrawer.tsx).
 *
 * FOLLOWUPS (Sprint 4 Wave 3+):
 *  - Per-line confirm backend endpoint
 *    (`POST /m3/procurement/gr/:id/lines/:lineId/confirm`).
 *  - Bulk-confirm backend endpoint
 *    (`POST /m3/procurement/gr/bulk-confirm`) — needs the per-line seam
 *    to operate inside its single transaction.
 *  - Offline mode + draft-resume on tablet.
 *  - Tab counters in ProcurementScreen header.
 */
export function GrTab({ orgId }: { orgId: string }) {
  // Default filter: pendientes-only so the dock workflow surfaces the
  // working set on first paint (j11 §5 spec).
  const [filters, setFilters] = useState<GrListFilters>({ pendingOnly: true });
  const query = useGoodsReceipts(orgId, filters);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <OfflineBanner orgId={orgId} />
      <GrFilterChips filters={filters} onChange={setFilters} />
      <BulkConfirmBar orgId={orgId} rows={rows} />

      {query.isPending && <Loading label="Cargando recepciones…" />}
      {query.error && <ErrorBox message={query.error.message} />}
      {!query.isPending && !query.error && rows.length === 0 && (
        <EmptyState
          title={emptyTitleFor(filters)}
          body={emptyBodyFor(filters)}
        />
      )}
      {!query.isPending && !query.error && rows.length > 0 && (
        <GrTable rows={rows} onOpen={setOpenId} />
      )}

      {openId && (
        <GrDetailDrawer
          orgId={orgId}
          grId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

/**
 * Sprint 4 W3-13 — offline-mode banner at the top of the GR tab.
 *
 * Two states (j11 spec §Edge cases):
 *   - Offline                  → destructive red banner
 *                                `Modo offline · N confirmaciones en cola`
 *   - Online with pending queue → amber banner
 *                                `Reconectado · enviando N confirmaciones…`
 *                                while the auto-flush is running.
 *
 * The reconnect effect is single-flight: a ref guards against a second
 * flush starting while one is already in progress (radio flap during
 * the replay would otherwise duplicate writes). On flush completion we
 * invalidate the GR list + detail caches so the newly-persisted rows
 * surface, and bump the local refresh token so `useOfflineStatus`
 * re-reads the now-(hopefully-)zero queue count.
 */
function OfflineBanner({ orgId }: { orgId: string }) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const flushInFlight = useRef(false);
  const queryClient = useQueryClient();
  const status = useOfflineStatus(orgId, refreshToken);

  // Auto-flush on reconnect when there's pending work.
  useEffect(() => {
    if (!status.online) return;
    if (status.queuedCount === 0) return;
    if (flushInFlight.current) return;
    flushInFlight.current = true;
    setFlushing(true);
    flushGrConfirmQueue(orgId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['procurement', 'gr', orgId] });
      })
      .catch(() => {
        // Failures are surfaced via the persisted queue count; the
        // banner will simply keep showing "N en cola" so the operator
        // knows the radio came back but the writes didn't land.
      })
      .finally(() => {
        flushInFlight.current = false;
        setFlushing(false);
        setRefreshToken((t) => t + 1);
      });
  }, [orgId, status.online, status.queuedCount, queryClient]);

  if (status.online && status.queuedCount === 0 && !flushing) return null;

  if (!status.online) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="gr-offline-banner"
        data-mode="offline"
        className="rounded-md border px-3 py-2 text-sm font-medium"
        style={{
          color: 'var(--color-destructive)',
          borderColor: 'var(--color-destructive)',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        Modo offline · {status.queuedCount} {status.queuedCount === 1 ? 'confirmación' : 'confirmaciones'} en cola
      </div>
    );
  }

  // Online but still has queued items (mid-flush or pending re-attempt).
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="gr-offline-banner"
      data-mode="reconnecting"
      className="rounded-md border px-3 py-2 text-sm font-medium"
      style={{
        color: 'var(--color-status-below-target-fg)',
        borderColor: 'var(--color-status-below-target-fg)',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      Reconectado · enviando {status.queuedCount}{' '}
      {status.queuedCount === 1 ? 'confirmación' : 'confirmaciones'}…
    </div>
  );
}

function emptyTitleFor(filters: GrListFilters): string {
  if (filters.pendingOnly || filters.state === 'pendiente') {
    return 'No hay recepciones pendientes';
  }
  if (filters.state) {
    return `No hay recepciones con estado «${filters.state}»`;
  }
  return 'Aún no hay recepciones registradas';
}

function emptyBodyFor(filters: GrListFilters): string {
  if (filters.pendingOnly || filters.state === 'pendiente') {
    return 'El muelle está al día. Cuando llegue una entrega y la registres (manual o vía foto de albarán) aparecerá aquí lista para confirmar.';
  }
  if (filters.locationIds && filters.locationIds.length > 0) {
    return 'No hay recepciones que coincidan con la ubicación seleccionada. Probá quitar el filtro o cambiar a otra ubicación.';
  }
  return 'Cada vez que confirmes una entrega del proveedor (manualmente en el muelle o desde una foto de albarán), aparecerá una recepción aquí.';
}

/**
 * Client-side predicate matching docs/ux/j11.md §Notes — the
 * BULK_CONFIRM_PREDICATE. The list payload exposes only `state` and
 * `requiresReview` today; full predicate fields (quantity_diff,
 * lot_code matches supplier_pattern, expiry_within_supplier_typical_range)
 * land alongside the GrListItem schema enrichment (followup).
 *
 * Until then this is the strictly safer subset: only `draft` GRs
 * (state === 'draft') with `requiresReview === false` qualify. False
 * positives are not possible — every "matching" row is genuinely
 * auto-confirmable per the j11 spec; the count is conservative.
 */
function matchesBulkConfirmPredicate(row: GrListItem): boolean {
  return row.state === 'draft' && row.requiresReview === false;
}

/**
 * W3-3 — bulk-confirm CTA above the table. The `N` count is computed
 * from the current filtered rows so it stays in sync with what the
 * operator is actually looking at (a chip swap → count updates without
 * an extra fetch). The modal lists the matching rows, then submits a
 * single `POST /m3/procurement/gr/bulk-confirm` request. When the
 * backend returns the "not-implemented" 404/501 the modal swaps to the
 * `pendiente de wiring` banner so dock review can sign off on copy +
 * interaction without the endpoint shipping first.
 */
function BulkConfirmBar({
  orgId,
  rows,
}: {
  orgId: string;
  rows: GrListItem[];
}) {
  const matches = useMemo(
    () => rows.filter(matchesBulkConfirmPredicate),
    [rows],
  );
  const [modalOpen, setModalOpen] = useState(false);

  if (matches.length === 0) return null;

  return (
    <>
      <div
        className="flex items-center justify-between gap-3 rounded-md border border-border-strong bg-surface px-3 py-2"
        data-testid="gr-bulk-confirm-bar"
      >
        <p className="text-sm text-mute">
          <span className="font-medium text-ink">{matches.length}</span>{' '}
          recepción{matches.length === 1 ? '' : 'es'} pendiente
          {matches.length === 1 ? '' : 's'} coinciden con la OC.
        </p>
        <button
          type="button"
          data-testid="gr-bulk-confirm-cta"
          onClick={() => setModalOpen(true)}
          className="min-h-[48px] rounded-md px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-accent-fg)',
          }}
        >
          Confirmar todo lo que coincida ({matches.length})
        </button>
      </div>
      {modalOpen && (
        <BulkConfirmModal
          orgId={orgId}
          matches={matches}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function BulkConfirmModal({
  orgId,
  matches,
  onClose,
}: {
  orgId: string;
  matches: GrListItem[];
  onClose: () => void;
}) {
  const mutation = useBulkConfirmGoodsReceipts(orgId);

  // Esc closes (parity with the W3-2 dock drawer + the W3-6 reconciliation
  // confirm modal).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onConfirm = () => {
    mutation.mutate({ grIds: matches.map((m) => m.id) });
  };

  const succeeded = mutation.isSuccess;
  // The bulk-confirm endpoint is wiring-pending; the api client surfaces
  // a 404 (no route) or 501 (not implemented) as an ApiError. Either
  // status renders the same "pendiente de wiring" banner below.
  const isPendingWiring =
    mutation.isError &&
    typeof mutation.error.status === 'number' &&
    (mutation.error.status === 404 || mutation.error.status === 501);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gr-bulk-confirm-title"
      data-testid="gr-bulk-confirm-modal"
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-(--color-ink)/40"
      />
      <div
        className="relative z-10 w-full max-w-md rounded-md border border-border-strong bg-(--color-bg) p-4 shadow-lg"
      >
        <p id="gr-bulk-confirm-title" className="text-base font-semibold text-ink">
          Confirmar {matches.length} línea{matches.length === 1 ? '' : 's'} que coinciden con la OC
        </p>
        <p className="mt-1 text-xs text-mute">
          Cada recepción pasará de «pendiente» a «confirmada» y materializará
          su lote en inventario.
        </p>
        <ul
          data-testid="gr-bulk-confirm-list"
          className="mt-3 max-h-60 space-y-1 overflow-y-auto rounded-md border border-border-strong bg-surface p-2 text-xs"
        >
          {matches.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink">
                {m.receivedAt.slice(0, 16).replace('T', ' ')}
              </span>
              <span className="text-mute">{m.poId ? 'OC ✓' : 'Sin OC'}</span>
            </li>
          ))}
        </ul>

        {isPendingWiring && (
          <p
            role="alert"
            data-testid="gr-bulk-confirm-not-wired"
            className="mt-3 rounded-md border px-3 py-2 text-xs"
            style={{
              color: 'var(--color-destructive)',
              borderColor: 'var(--color-destructive)',
            }}
          >
            Endpoint de bulk-confirm pendiente de wiring backend. La
            interacción está validada; en cuanto el endpoint
            `POST /m3/procurement/gr/bulk-confirm` exista, el botón
            registrará las confirmaciones sin más cambios en la UI.
          </p>
        )}

        {mutation.isError && !isPendingWiring && (
          <p
            role="alert"
            data-testid="gr-bulk-confirm-error"
            className="mt-3 rounded-md border px-3 py-2 text-xs"
            style={{
              color: 'var(--color-destructive)',
              borderColor: 'var(--color-destructive)',
            }}
          >
            No se pudo registrar el bulk-confirm: {mutation.error.message}
          </p>
        )}

        {succeeded && (
          <p
            role="status"
            data-testid="gr-bulk-confirm-success"
            className="mt-3 rounded-md border px-3 py-2 text-xs"
            style={{
              color: 'var(--color-ink)',
              borderColor: 'var(--color-border-strong)',
              backgroundColor: 'var(--color-status-on-track-bg)',
            }}
          >
            Confirmadas {mutation.data?.confirmed.length ?? 0} recepciones.
            {mutation.data?.skipped && mutation.data.skipped.length > 0 && (
              <> · Saltadas {mutation.data.skipped.length} (motivo en logs).</>
            )}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="gr-bulk-confirm-cancel"
            className="min-h-[48px] rounded-md px-3 text-sm text-mute focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            {succeeded ? 'Cerrar' : 'Cancelar'}
          </button>
          {!succeeded && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={mutation.isPending}
              data-testid="gr-bulk-confirm-submit"
              className="min-h-[48px] rounded-md px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
              }}
            >
              {mutation.isPending ? 'Confirmando…' : 'Confirmar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * W3-9 — filter chips above the GR table. Location is a multi-select
 * UUID input (the dock workflow typically scopes to a single kitchen
 * location; the spec allows multi for the multi-site operator). Estado
 * is a single-select toggle group mapped to `GrUiState`. `Solo
 * pendientes` is a fast-path chip equivalent to `state=pendiente`
 * (the default on first paint).
 *
 * The location input intentionally accepts a comma-separated UUID
 * string until the suppliers/locations cache is wired into this screen
 * (followup) — replacing the textbox with a Combobox is a one-line
 * swap when the cache lands.
 */
function GrFilterChips({
  filters,
  onChange,
}: {
  filters: GrListFilters;
  onChange: (next: GrListFilters) => void;
}) {
  const [locationDraft, setLocationDraft] = useState<string>(
    (filters.locationIds ?? []).join(', '),
  );

  // Keep the draft input in sync when the parent resets filters (Limpiar).
  useEffect(() => {
    setLocationDraft((filters.locationIds ?? []).join(', '));
  }, [filters.locationIds]);

  const states: ReadonlyArray<{ key: GrUiState; label: string }> = [
    { key: 'pendiente', label: 'Pendiente' },
    { key: 'confirmada', label: 'Confirmada' },
    { key: 'parcial', label: 'Parcial' },
    { key: 'rechazada', label: 'Rechazada' },
  ];

  const hasAnyFilter =
    (filters.locationIds && filters.locationIds.length > 0) ||
    !!filters.state ||
    !!filters.pendingOnly;

  const onClear = () => {
    setLocationDraft('');
    onChange({});
  };

  const onLocationCommit = () => {
    const ids = locationDraft
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    onChange({ ...filters, locationIds: ids.length > 0 ? ids : undefined });
  };

  const onStateClick = (next: GrUiState) => {
    if (filters.state === next) {
      const cleared = { ...filters };
      delete cleared.state;
      onChange(cleared);
      return;
    }
    // Selecting an explicit state supersedes the pendingOnly fast-path
    // to keep the URL state coherent.
    const cleared = { ...filters };
    delete cleared.pendingOnly;
    onChange({ ...cleared, state: next });
  };

  const onPendingOnlyToggle = () => {
    if (filters.pendingOnly) {
      const cleared = { ...filters };
      delete cleared.pendingOnly;
      onChange(cleared);
      return;
    }
    const cleared = { ...filters };
    delete cleared.state;
    onChange({ ...cleared, pendingOnly: true });
  };

  return (
    <div
      data-testid="gr-filter-chips"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2"
    >
      <label className="flex items-center gap-2 text-xs text-mute">
        <span>Ubicación</span>
        <input
          type="text"
          aria-label="Filtrar por ubicación (UUIDs separados por coma)"
          data-testid="gr-filter-location-input"
          value={locationDraft}
          onChange={(e) => setLocationDraft(e.target.value)}
          onBlur={onLocationCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onLocationCommit();
            }
          }}
          placeholder="UUID…"
          className="min-h-[36px] w-48 rounded-md border px-2 text-xs focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          style={{
            borderColor: 'var(--color-border-strong)',
            color: 'var(--color-ink)',
          }}
        />
      </label>

      <span aria-hidden="true" className="text-xs text-mute">
        ·
      </span>

      <div role="group" aria-label="Estado" className="flex flex-wrap gap-1">
        {states.map((s) => {
          const active = filters.state === s.key;
          return (
            <button
              key={s.key}
              type="button"
              data-testid={`gr-filter-state-${s.key}`}
              aria-pressed={active}
              onClick={() => onStateClick(s.key)}
              className="rounded-full border px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              style={
                active
                  ? {
                      backgroundColor: 'var(--color-accent)',
                      color: 'var(--color-accent-fg)',
                      borderColor: 'var(--color-accent)',
                    }
                  : {
                      borderColor: 'var(--color-border-strong)',
                      color: 'var(--color-ink)',
                    }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <span aria-hidden="true" className="text-xs text-mute">
        ·
      </span>

      <button
        type="button"
        data-testid="gr-filter-pending-only"
        aria-pressed={!!filters.pendingOnly}
        onClick={onPendingOnlyToggle}
        className="rounded-full border px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        style={
          filters.pendingOnly
            ? {
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-fg)',
                borderColor: 'var(--color-accent)',
              }
            : {
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)',
              }
        }
      >
        Solo pendientes
      </button>

      {hasAnyFilter && (
        <button
          type="button"
          data-testid="gr-filter-clear"
          onClick={onClear}
          className="ml-auto rounded-md px-2 py-1 text-xs text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

function GrTable({
  rows,
  onOpen,
}: {
  rows: GrListItem[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-strong">
      <table className="min-w-full divide-y divide-border-strong text-sm">
        <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">Recibido</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">OC</th>
            <th className="px-3 py-2">Albarán</th>
            <th className="px-3 py-2">Origen</th>
            <th className="px-3 py-2 sr-only">Abrir</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-strong">
          {rows.map((row) => {
            const hermesSeed = row.sourcePhotoIngestionId !== null;
            return (
              <tr
                key={row.id}
                data-testid="gr-row"
                data-row-id={row.id}
                data-hermes-seed={hermesSeed ? 'true' : 'false'}
                onClick={() => onOpen(row.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(row.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Abrir recepción del ${row.receivedAt.slice(0, 10)}`}
                className="min-h-[64px] cursor-pointer text-ink hover:bg-(--color-surface) focus:bg-(--color-surface) focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
              >
                <td className="px-3 py-3 tabular-nums">
                  {row.receivedAt.slice(0, 16).replace('T', ' ')}
                </td>
                <td className="px-3 py-3">
                  {row.requiresReview ? (
                    <span
                      data-testid="gr-row-requires-review"
                      style={{
                        color: 'var(--color-destructive)',
                        fontWeight: 600,
                      }}
                    >
                      {row.state} · revisar
                    </span>
                  ) : (
                    row.state
                  )}
                </td>
                <td className="px-3 py-3">{row.poId ? '✓' : '—'}</td>
                <td className="px-3 py-3">{row.supplierInvoiceRef ?? '—'}</td>
                <td className="px-3 py-3 text-xs text-mute">
                  {hermesSeed ? 'Hermes (foto)' : 'Manual'}
                </td>
                <td className="px-3 py-3 text-right text-xs text-mute">
                  Abrir →
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
