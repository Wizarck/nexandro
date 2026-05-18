import { useState } from 'react';
import {
  IncidentSearchField,
  RoleGuard,
  type IncidentSearchHit,
} from '@nexandro/ui-kit';
import { CrisisLayout } from '../../layouts/CrisisLayout';
import { useIncidentSearch } from '../../hooks/useIncidentSearch';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

/**
 * J6 recall investigation landing surface (slice #11 m3-incident-search-
 * multi-anchor). Owner + Manager only.
 *
 * Wrapped in CrisisLayout per j6.md §28+§82: NO top nav, NO sidebar,
 * NO global notifications. The header eyebrow + 4 h countdown comes from
 * CrisisLayout; the regulation footer too. This screen contributes the
 * search field + "Reportar sin lote conocido" ghost link.
 *
 * Per audit 2026-05-18 L1-1: was previously mounted inside the standard
 * <App> layout with normal nav, in direct violation of j6 §28+§82.
 */
export function IncidentSearchFieldScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();

  return (
    <CrisisLayout>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <RoleGuard
          role={['OWNER', 'MANAGER']}
          currentRole={role}
          fallback={<AccessDenied />}
        >
          {orgId ? <Inner orgId={orgId} /> : <SignedOut />}
        </RoleGuard>
      </div>
    </CrisisLayout>
  );
}

function Inner({ orgId }: { orgId: string }) {
  const [queryStr, setQueryStr] = useState('');
  const [lastSelected, setLastSelected] = useState<IncidentSearchHit | null>(
    null,
  );

  const query = useIncidentSearch({
    organizationId: orgId,
    query: queryStr,
  });

  const onSearch = (next: string) => {
    setQueryStr(next);
  };
  const onSelect = (hit: IncidentSearchHit) => {
    setLastSelected(hit);
  };

  return (
    <>
      <IncidentSearchField
        hits={query.data?.hits ?? []}
        loading={query.isFetching}
        onSearch={onSearch}
        onSelect={onSelect}
      />
      {query.error && (
        <p
          role="alert"
          className="mt-3 rounded border border-(--color-danger-fg) bg-surface px-3 py-2 text-sm text-(--color-danger-fg)"
        >
          Error al buscar: {query.error.message}
        </p>
      )}
      {lastSelected && (
        <div className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-mute">
          Última selección — <span className="text-ink">{lastSelected.label}</span>
          {' · '}
          <span>{lastSelected.kind}</span>
        </div>
      )}
      {/* j6.md §40 — fallback escape hatch when the operator has no lot
          anchor (supplier called with a symptom but no batch number yet). */}
      {queryStr.length > 0 && !query.isFetching && (query.data?.hits ?? []).length === 0 && (
        <p className="mt-4 text-sm text-mute">
          Sin coincidencias. Refina la búsqueda — o{' '}
          <a
            href="/recall/report-unknown-lot"
            className="underline hover:text-ink"
          >
            reporta sin lote conocido
          </a>
          .
        </p>
      )}
    </>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium">
        Solo el Owner y el Manager pueden iniciar una investigación de retirada.
      </p>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p>Inicia sesión para iniciar una investigación.</p>
    </div>
  );
}
