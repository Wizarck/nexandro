import { useSearchParams } from 'react-router-dom';
import { RoleGuard } from '@nexandro/ui-kit';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';
import { useProcurementCounts } from '../../hooks/useProcurement';
import type { ProcurementCounts } from '../../api/procurement';
import { PoTab } from './tabs/PoTab';
import { GrTab } from './tabs/GrTab';
import { ReconciliationTab } from './tabs/ReconciliationTab';

/**
 * j11 Procurement shell. Three tabs (POs · Recepciones · Reconciliación)
 * behind `?tab=po|gr|recon`. Each tab lives in its own file under tabs/
 * so Sprint 4 Wave 3 expansions can iterate in parallel without conflict.
 *
 * Spec: docs/ux/j11.md (status: canonical M3 MVP).
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

/**
 * Sprint 4 W3-10 — tab counter chips. Counts come from the dedicated
 * `/m3/procurement/reconciliation/counts` endpoint so the header reflects
 * current ops volume without mounting all three tabs. Zero counts are
 * suppressed (no `(0)` clutter); undefined/loading state keeps the bare
 * label so the tab strip stays stable across refetches.
 */
function formatTabLabel(
  key: ProcurementTab,
  counts: ProcurementCounts | undefined,
): string {
  const base = TAB_DEFS.find((t) => t.key === key)!.label;
  if (!counts) return base;
  if (key === 'po') {
    const n = counts.poActive;
    return Number.isFinite(n) && n > 0 ? `${base} (${n})` : base;
  }
  if (key === 'gr') {
    const n = counts.grPending;
    return Number.isFinite(n) && n > 0 ? `${base} (${n} pendientes)` : base;
  }
  const n = counts.reconOpen;
  return Number.isFinite(n) && n > 0 ? `${base} (${n} abiertas)` : base;
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
  const { data: counts } = useProcurementCounts(orgId);

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
          const label = formatTabLabel(t.key, counts);
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`procurement-panel-${t.key}`}
              id={`procurement-tab-${t.key}`}
              data-testid={`procurement-tab-${t.key}`}
              onClick={() => onSelectTab(t.key)}
              className={
                active
                  ? 'border-b-2 border-(--color-accent) px-3 py-2 text-sm font-medium text-ink'
                  : 'border-b-2 border-transparent px-3 py-2 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)'
              }
            >
              {label}
            </button>
          );
        })}
      </nav>

      <section
        id={`procurement-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`procurement-tab-${tab}`}
      >
        {tab === 'po' && <PoTab orgId={orgId} />}
        {tab === 'gr' && <GrTab orgId={orgId} />}
        {tab === 'recon' && <ReconciliationTab orgId={orgId} />}
      </section>
    </>
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
