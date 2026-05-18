import { useMemo } from 'react';
import { useReconciliation } from '../../../hooks/useProcurement';
import type { ReconciliationListItem } from '../../../api/procurement';
import { EmptyState, ErrorBox, Loading } from './shared';

/**
 * j11 Procurement — Reconciliación tab.
 *
 * Backend aggregate landed in PR #226 (entity + migration) + PR #227
 * (repository + detector + service + real controller). This tab now
 * lists real reconciliations when the GR confirmation flow seeds them
 * (the GR → detector hook is a followup).
 *
 * FOLLOWUPS (Sprint 4 Wave 3):
 *  - Resolution drawer with side-by-side PO-vs-GR diff (j11 §6)
 *  - Resolution actions: Aceptar diferencia / Solicitar nota de crédito / Devolver
 *  - Owner approval gate above `procurement_approval_threshold_eur` (ADR-038)
 *  - Audit chip per row → /audit-log?aggregate_id=
 *  - Filter chips (state · supplier · discrepancy type)
 */
export function ReconciliationTab({ orgId }: { orgId: string }) {
  const query = useReconciliation(orgId);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);

  if (query.isPending) return <Loading label="Cargando reconciliaciones…" />;
  if (query.error) return <ErrorBox message={query.error.message} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aún no hay reconciliaciones abiertas"
        body="Cuando una recepción no cuadre con su OC (cantidad, precio, producto o lote no conforme) abriremos una reconciliación aquí. Próximamente: comparación PO-vs-GR en drawer, y acciones de resolución (aceptar diferencia · solicitar nota de crédito · devolver)."
      />
    );
  }
  return <ReconciliationTable rows={rows} />;
}

function ReconciliationTable({ rows }: { rows: ReconciliationListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-strong">
      <table className="min-w-full divide-y divide-border-strong text-sm">
        <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">PO#</th>
            <th className="px-3 py-2">Discrepancia</th>
            <th className="px-3 py-2">Diff</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-strong">
          {rows.map((row) => (
            <tr key={row.id} className="text-ink">
              <td className="px-3 py-2 font-medium">{row.poNumber}</td>
              <td className="px-3 py-2">{row.discrepancyType}</td>
              <td className="px-3 py-2">{row.diff}</td>
              <td className="px-3 py-2">{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
