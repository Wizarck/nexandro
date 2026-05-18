import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RoleGuard } from '@nexandro/ui-kit';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';
import {
  useGoodsReceipts,
  usePurchaseOrders,
  useReconciliation,
} from '../../hooks/useProcurement';
import type {
  GrListItem,
  PoListItem,
  ReconciliationListItem,
} from '../../api/procurement';

/**
 * j11 Procurement shell (Sprint 3 Block C — minimum-viable surface).
 *
 * Three tabs (POs · Recepciones · Reconciliación) behind `?tab=po|gr|recon`.
 * Each tab is a read-only list with an empty state. Full j11 spec
 * (drawers, bulk-confirm, Hermes pre-fill, Owner approval gates,
 * offline mode, audit chips, mock-j11-procurement.html) is NOT
 * implemented here — see FOLLOWUP comments below + PR body.
 *
 * Spec: docs/ux/j11.md (status: canonical M3 MVP).
 *
 * FOLLOWUPS:
 *  - PO detail drawer (j11 §3) + draft edit-in-place + Cancelar / Cerrar
 *  - GR line-by-line dock UX (j11 §4-5) + bulk-confirm CTA + Hermes
 *    "Pre-cargado por Hermes" eyebrow
 *  - Reconciliation drawer with side-by-side PO-vs-GR diff (j11 §6) +
 *    resolution actions (Aceptar / Nota de crédito / Devolver)
 *  - Audit chip per row (j11 §7) → routes to /audit-log filtered by
 *    aggregate_id
 *  - Filter chips (location · proveedor · estado) above each tab
 *  - `Nueva OC` primary CTA + create flow
 *  - Tablet-friendly large-tap rows for receiving dock
 *  - Owner approval gate above €threshold (ADR-038 HITL posture)
 *  - Tab counters ("Órdenes de compra (12) · Recepciones (3 pendientes) ·
 *    Reconciliación (2 abiertas)")
 */

type ProcurementTab = 'po' | 'gr' | 'recon';

const TAB_DEFS: ReadonlyArray<{ key: ProcurementTab; label: string }> = [
  { key: 'po', label: 'Órdenes de compra' },
  { key: 'gr', label: 'Recepciones' },
  { key: 'recon', label: 'Reconciliación' },
];

function parseTab(raw: string | null): ProcurementTab {
  if (raw === 'gr' || raw === 'recon') return raw;
  return 'po';
}

export function ProcurementScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <header>
        <h2 className="text-2xl font-semibold text-ink">Compras</h2>
        <p className="mt-1 text-sm text-mute">
          Órdenes de compra, recepciones y reconciliación con proveedores.
        </p>
      </header>
      <RoleGuard
        role={['OWNER', 'MANAGER']}
        currentRole={role}
        fallback={<AccessDenied />}
      >
        {orgId ? <Inner orgId={orgId} /> : <SignedOut />}
      </RoleGuard>
    </div>
  );
}

function Inner({ orgId }: { orgId: string }) {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));

  const onSelectTab = (next: ProcurementTab) => {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated, { replace: true });
  };

  return (
    <>
      <nav
        aria-label="Sub-navegación de Compras"
        role="tablist"
        className="flex gap-2 border-b border-border-strong"
      >
        {TAB_DEFS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`procurement-panel-${t.key}`}
              id={`procurement-tab-${t.key}`}
              onClick={() => onSelectTab(t.key)}
              className={
                active
                  ? 'border-b-2 border-(--color-accent) px-3 py-2 text-sm font-medium text-ink'
                  : 'border-b-2 border-transparent px-3 py-2 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)'
              }
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <section
        id={`procurement-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`procurement-tab-${tab}`}
      >
        {tab === 'po' && <PoListTab orgId={orgId} />}
        {tab === 'gr' && <GrListTab orgId={orgId} />}
        {tab === 'recon' && <ReconciliationListTab orgId={orgId} />}
      </section>
    </>
  );
}

export function PoListTab({ orgId }: { orgId: string }) {
  const query = usePurchaseOrders(orgId);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);

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
  return <PoTable rows={rows} />;
}

export function GrListTab({ orgId }: { orgId: string }) {
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

export function ReconciliationListTab({ orgId }: { orgId: string }) {
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

function PoTable({ rows }: { rows: PoListItem[] }) {
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
            <tr key={row.id} className="text-ink">
              <td className="px-3 py-2 font-medium">{row.poNumber}</td>
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-2 max-w-prose text-sm">{body}</p>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-border-strong p-4 text-sm text-mute">
      {label}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded border border-(--color-danger-fg) bg-surface px-3 py-2 text-sm text-(--color-danger-fg)"
    >
      Error al cargar: {message}
    </p>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium">
        Solo el Owner y el Manager pueden ver la pantalla de Compras.
      </p>
      <p className="mt-1 text-xs">
        Si crees que esto es un error, contacta con el administrador del
        sistema.
      </p>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p>Inicia sesión para ver la pantalla de Compras.</p>
    </div>
  );
}
