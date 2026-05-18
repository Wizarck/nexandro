import { useMemo } from 'react';
import { useGoodsReceipts } from '../../../hooks/useProcurement';
import type { GrListItem } from '../../../api/procurement';
import { EmptyState, ErrorBox, Loading } from './shared';

/**
 * j11 Procurement — Recepciones tab.
 *
 * FOLLOWUPS (Sprint 4 Wave 3):
 *  - GR line-by-line dock UX (j11 §4-5) with editable cantidad/lote/expiry
 *  - Bulk-confirm CTA `Confirmar todo lo que coincida (N)`
 *  - Hermes pre-fill banner (`Pre-cargado por Hermes · HH:MM · revisar →`)
 *  - Tablet-friendly large-tap rows (≥64 px) for receiving dock
 *  - Offline mode + draft-resume on tablet
 *  - Filter chips + tab counters
 */
export function GrTab({ orgId }: { orgId: string }) {
  const query = useGoodsReceipts(orgId);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);

  if (query.isPending) return <Loading label="Cargando recepciones…" />;
  if (query.error) return <ErrorBox message={query.error.message} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aún no hay recepciones registradas"
        body="Cada vez que confirmes una entrega del proveedor (manualmente en el muelle o desde una foto de albarán), aparecerá una recepción aquí. Próximamente: línea-a-línea con cantidad recibida editable, lote auto-generado, caducidad, y bulk-confirm cuando todo coincide."
      />
    );
  }
  return <GrTable rows={rows} />;
}

function GrTable({ rows }: { rows: GrListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-strong">
      <table className="min-w-full divide-y divide-border-strong text-sm">
        <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">Recibido</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">PO</th>
            <th className="px-3 py-2">Albarán</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-strong">
          {rows.map((row) => (
            <tr key={row.id} className="text-ink">
              <td className="px-3 py-2 tabular-nums">
                {row.receivedAt.slice(0, 16).replace('T', ' ')}
              </td>
              <td className="px-3 py-2">{row.state}</td>
              <td className="px-3 py-2">{row.poId ? '✓' : '—'}</td>
              <td className="px-3 py-2">{row.supplierInvoiceRef ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
