import { useState } from 'react';
import {
  RecallTraceTree,
  RoleGuard,
  type TraceMode,
} from '@nexandro/ui-kit';
import { useForwardTrace, useReverseTrace } from '../../hooks/useRecallTrace';
import { useCurrentOrgId, useCurrentRole } from '../../lib/currentUser';

/**
 * j6 recall-investigate screen (partial — M3 Wave 2.5 slice #12).
 *
 * This slice ships the trace tree component mounted with a placeholder
 * lot-id selector. Slice #11 (`m3-incident-search-multi-anchor`,
 * parallel) ships the actual search surface that produces the anchor;
 * slice #13 (`m3-recall-86-flag-dispatch`) wires the two together.
 *
 * Today the screen accepts a lotId from a simple input — sufficient
 * for back-end smoke testing + the j6 mock walkthrough.
 *
 * RBAC: OWNER + MANAGER only (mirrors AuditLogScreen). Server-side
 * `@Roles('OWNER','MANAGER')` is the authoritative permission check.
 */
export function RecallTraceTreeScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      <h2 className="text-2xl font-semibold text-(--color-ink)">
        Trazabilidad — Investigación de recall
      </h2>
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
  const [mode, setMode] = useState<TraceMode>('forward');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [draftLotId, setDraftLotId] = useState('');

  const forwardQuery = useForwardTrace(
    orgId,
    mode === 'forward' ? selectedLotId : null,
  );
  // Reverse anchor selection is deferred to slice #13 (search → anchor
  // wiring). The hook is mounted with a null anchor so it stays idle
  // until the consumer toggles it; the structure is present for
  // forward-compat with slice #13's integration.
  const reverseQuery = useReverseTrace(orgId, null);

  const activeQuery = mode === 'forward' ? forwardQuery : reverseQuery;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 rounded-lg border border-(--color-border) p-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = draftLotId.trim();
          setSelectedLotId(trimmed.length > 0 ? trimmed : null);
        }}
      >
        <label className="flex flex-1 flex-col text-sm">
          <span className="mb-1 text-(--color-mute)">Lote a investigar</span>
          <input
            type="text"
            value={draftLotId}
            onChange={(event) => setDraftLotId(event.target.value)}
            placeholder="UUID del lote"
            className="rounded-md border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm text-(--color-ink)"
          />
        </label>
        <button
          type="submit"
          className="min-h-[48px] rounded-md border border-(--color-ink) bg-(--color-ink) px-4 py-2 text-sm text-(--color-surface)"
        >
          Trazar
        </button>
      </form>

      {activeQuery.error && (
        <p
          role="alert"
          className="rounded border border-(--color-danger-fg) bg-(--color-surface) px-3 py-2 text-sm text-(--color-danger-fg)"
        >
          Error al cargar la trazabilidad: {activeQuery.error.message}
        </p>
      )}

      <RecallTraceTree
        tree={activeQuery.data ?? null}
        mode={mode}
        onModeChange={setMode}
        loading={activeQuery.isPending && Boolean(selectedLotId)}
      />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-dashed border-(--color-border) p-6 text-(--color-mute)">
      <p className="font-medium">
        Solo el Owner y el Manager pueden investigar la trazabilidad.
      </p>
      <p className="mt-1 text-xs">
        Si crees que esto es un error, contacta con el administrador del sistema.
      </p>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="rounded-lg border border-dashed border-(--color-border) p-6 text-(--color-mute)">
      <p>Inicia sesión para investigar la trazabilidad.</p>
    </div>
  );
}
