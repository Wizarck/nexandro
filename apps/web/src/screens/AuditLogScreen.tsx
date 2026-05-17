import { useEffect, useMemo, useState } from 'react';
import {
  AuditLogFilters,
  AuditLogTable,
  EMPTY_AUDIT_FILTER_VALUES,
  RoleGuard,
  type AuditLogFilterValues,
  type AuditLogRow,
} from '@nexandro/ui-kit';
import { buildExportUrl, type AppliedAuditLogFilter } from '../api/auditLog';
import { useAuditLogQuery } from '../hooks/useAuditLog';
import { useCurrentOrgId, useCurrentRole } from '../lib/currentUser';

const PAGE_SIZE = 50;

/**
 * Owner+Manager browse UI for the canonical audit_log. Composed of:
 * - <RoleGuard role={['OWNER','MANAGER']}>: client-side render gate.
 *   Server `@Roles('OWNER','MANAGER')` on /audit-log stays the
 *   authoritative permission check.
 * - <AuditLogFilters>: controlled filter form. Apply commits the form
 *   state into the applied state, which the hook reads.
 * - <AuditLogTable>: presentational rows + drill-down. Click a row to
 *   expand its payload_before/payload_after.
 * - "Load more" footer increments the applied filter's offset.
 * - "Exportar CSV" opens GET /audit-log/export.csv with current filters.
 */
export function AuditLogScreen() {
  const role = useCurrentRole();
  const orgId = useCurrentOrgId();

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <h2 className="text-2xl font-semibold text-ink">Auditoría</h2>
      <RoleGuard role={['OWNER', 'MANAGER']} currentRole={role} fallback={<AccessDenied />}>
        {orgId ? <Inner orgId={orgId} /> : <SignedOut />}
      </RoleGuard>
    </div>
  );
}

function Inner({ orgId }: { orgId: string }) {
  // Form state — what the user is editing.
  const [form, setForm] = useState<AuditLogFilterValues>({ ...EMPTY_AUDIT_FILTER_VALUES });
  // Applied state — what the hook fetches with. Diverges from form on Apply.
  const [applied, setApplied] = useState<AppliedAuditLogFilter>({
    ...EMPTY_AUDIT_FILTER_VALUES,
    organizationId: orgId,
    limit: PAGE_SIZE,
    offset: 0,
  });

  // Accumulate rows across Load-more clicks. Resets on Apply / Reset.
  const [accumulated, setAccumulated] = useState<AuditLogRow[]>([]);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const query = useAuditLogQuery(applied);

  useEffect(() => {
    if (query.data?.rows) {
      if (applied.offset === 0) {
        setAccumulated(query.data.rows);
      } else {
        setAccumulated((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const merged = prev.slice();
          for (const r of query.data.rows) {
            if (!seen.has(r.id)) merged.push(r);
          }
          return merged;
        });
      }
    }
  }, [query.data, applied.offset]);

  const total = query.data?.total ?? 0;
  const hasMore = useMemo(() => total > accumulated.length, [total, accumulated.length]);

  const onApply = () => {
    setExpandedRowId(null);
    setAccumulated([]);
    setApplied({ ...form, organizationId: orgId, limit: PAGE_SIZE, offset: 0 });
  };

  const onReset = () => {
    setForm({ ...EMPTY_AUDIT_FILTER_VALUES });
    setExpandedRowId(null);
    setAccumulated([]);
    setApplied({
      ...EMPTY_AUDIT_FILTER_VALUES,
      organizationId: orgId,
      limit: PAGE_SIZE,
      offset: 0,
    });
  };

  const onLoadMore = () => {
    setApplied((prev) => ({ ...prev, offset: prev.offset + PAGE_SIZE }));
  };

  const onExportCsv = () => {
    window.open(buildExportUrl(applied), '_blank', 'noopener,noreferrer');
  };

  const onToggleExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <AuditLogFilters
        values={form}
        onChange={setForm}
        onApply={onApply}
        onReset={onReset}
        onExportCsv={onExportCsv}
        applying={query.isFetching && applied.offset === 0}
      />
      {query.error && (
        <p role="alert" className="rounded border border-(--color-danger-fg) bg-surface px-3 py-2 text-sm text-(--color-danger-fg)">
          Error al cargar la auditoría: {query.error.message}
        </p>
      )}
      <AuditLogTable
        rows={accumulated}
        expandedRowId={expandedRowId}
        onToggleExpand={onToggleExpand}
        loading={query.isPending}
      />
      <div className="flex items-center justify-between text-xs text-mute">
        <span>{`${accumulated.length} de ${total} eventos`}</span>
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={query.isFetching}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
          >
            {query.isFetching ? 'Cargando…' : 'Cargar más'}
          </button>
        )}
      </div>
    </>
  );
}

function AccessDenied() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p className="font-medium">Solo el Owner y el Manager pueden consultar la auditoría.</p>
      <p className="mt-1 text-xs">Si crees que esto es un error, contacta con el administrador del sistema.</p>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-6 text-mute">
      <p>Inicia sesión para consultar la auditoría.</p>
    </div>
  );
}
