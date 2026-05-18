import { useMemo, useState } from 'react';
import { usePurchaseOrders } from '../../../hooks/useProcurement';
import type { PoListItem } from '../../../api/procurement';
import { EmptyState, ErrorBox, Loading } from './shared';
import { PoDetailDrawer } from './PoDetailDrawer';

/**
 * j11 Procurement — Órdenes de compra tab.
 *
 * Sprint 4 W3-1: rows are now clickable → mounts the PO detail drawer
 * (PoDetailDrawer.tsx). Drawer owns its own fetch via usePurchaseOrder.
 *
 * FOLLOWUPS (Sprint 4 Wave 3):
 *  - Draft edit-in-place
 *  - `Nueva OC` primary CTA + 4-step create flow
 *  - Filter chips (location · proveedor · estado)
 *  - Tab counters (in parent component)
 *  - Audit chip per row → /audit-log?aggregate_id=
 */
export function PoTab({ orgId }: { orgId: string }) {
  const query = usePurchaseOrders(orgId);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (query.isPending) return <Loading label="Cargando órdenes de compra…" />;
  if (query.error) return <ErrorBox message={query.error.message} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aún no hay órdenes de compra activas"
        body="Cuando envíes una OC a un proveedor aparecerá aquí, con su estado (enviada · parcialmente recibida · cerrada) y el total. Próximamente: CTA «Nueva OC», filtros por proveedor y estado, y drawer de detalle con líneas + IVA."
      />
    );
  }
  return (
    <>
      <PoTable rows={rows} onSelect={setSelectedId} />
      {selectedId && (
        <PoDetailDrawer
          orgId={orgId}
          poId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

function PoTable({
  rows,
  onSelect,
}: {
  rows: PoListItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-strong">
      <table className="min-w-full divide-y divide-border-strong text-sm">
        <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">PO#</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Entrega prevista</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-strong">
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer text-ink hover:bg-(--color-surface-strong) focus-within:bg-(--color-surface-strong)"
            >
              <td className="px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  className="text-left text-(--color-accent) underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
                  aria-label={`Ver detalle de ${row.poNumber}`}
                >
                  {row.poNumber}
                </button>
              </td>
              <td className="px-3 py-2">{row.state}</td>
              <td className="px-3 py-2">{row.expectedDeliveryDate ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {row.total.toFixed(2)} {row.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
