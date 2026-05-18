import { useMemo, useState } from 'react';
import { useGoodsReceipts } from '../../../hooks/useProcurement';
import type { GrListItem } from '../../../api/procurement';
import { GrDetailDrawer } from './GrDetailDrawer';
import { EmptyState, ErrorBox, Loading } from './shared';

/**
 * j11 Procurement — Recepciones tab.
 *
 * Sprint 4 W3-2 adds the tablet-first dock drawer: rows are now tappable
 * (≥ 64 px touch target), opening a side drawer with per-line edit
 * affordances (cantidad recibida · lote · caducidad · Confirmar). The
 * `Pre-cargado por Hermes …` mute eyebrow lights up on rows seeded by
 * the photo-ingestion-routing BC.
 *
 * FOLLOWUPS (Sprint 4 Wave 3 + later):
 *  - Bulk-confirm CTA `Confirmar todo lo que coincida (N)`
 *  - Per-line confirm backend endpoint
 *    (`POST /m3/procurement/gr/:id/lines/:lineId/confirm`) — see the
 *    docstring on `GrController` + `confirmGoodsReceiptLine` for the
 *    handoff plan
 *  - Offline mode + draft-resume on tablet
 *  - Filter chips (`pendientes` default) + tab counters
 *  - GR_CONFIRMED audit chip per row
 */
export function GrTab({ orgId }: { orgId: string }) {
  const query = useGoodsReceipts(orgId);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const [openId, setOpenId] = useState<string | null>(null);

  if (query.isPending) return <Loading label="Cargando recepciones…" />;
  if (query.error) return <ErrorBox message={query.error.message} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aún no hay recepciones registradas"
        body="Cada vez que confirmes una entrega del proveedor (manualmente en el muelle o desde una foto de albarán), aparecerá una recepción aquí. Próximamente: bulk-confirm cuando todo coincide y filtro «pendientes» por defecto."
      />
    );
  }
  return (
    <>
      <GrTable rows={rows} onOpen={setOpenId} />
      {openId && (
        <GrDetailDrawer
          orgId={orgId}
          grId={openId}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
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
