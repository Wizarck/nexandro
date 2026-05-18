import { useSearchParams } from 'react-router-dom';
import { RoleGuard } from '@nexandro/ui-kit';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';
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
