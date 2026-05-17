import { useState } from 'react';
import {
  IncidentSearchField,
  RoleGuard,
  type IncidentSearchHit,
} from '@nexandro/ui-kit';
import { useIncidentSearch } from '../../hooks/useIncidentSearch';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

/**
 * Partial J6 recall investigation screen (slice #11 m3-incident-search-
 * multi-anchor). Owner + Manager only.
 *
 * This slice ships the search field + dropdown only. The trace tree
 * (slice #12) and dispatch CTA bar (slice #13) mount in subsequent
 * slices. On hit selection, the screen currently logs to the console;
 * slice #12 wires the trace tree pivot.
 *
 * Per j6.md §1+§8 — header is just the eyebrow + clock; this slice's
 * partial screen renders a minimal title + the search field full-width.
 */
export function IncidentSearchFieldScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h2
        className="text-xl font-semibold text-ink"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Investigación de retirada
      </h2>
      <p className="mt-1 text-sm text-mute">
        Lote, proveedor, ingrediente o síntoma — la lista se actualiza al
        teclear.
      </p>
      <div className="mt-4">
        <RoleGuard
          role={['OWNER', 'MANAGER']}
          currentRole={role}
          fallback={<AccessDenied />}
        >
          {orgId ? <Inner orgId={orgId} /> : <SignedOut />}
        </RoleGuard>
      </div>
    </div>
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
