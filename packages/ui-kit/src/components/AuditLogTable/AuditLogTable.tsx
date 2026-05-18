import { Fragment } from 'react';
import { cn } from '../../lib/cn';
import { AuditLogRowDetail } from '../AuditLogRowDetail';
import { humanizeEventType } from './humanizeEventType';
import type { AuditLogRow, AuditLogTableProps } from './AuditLogTable.types';

/**
 * Presentational table for the audit_log query result. The consumer owns
 * the data fetch + filter state; this component renders rows with click-to-
 * expand semantics and surfaces the selected row's payload via the inline
 * `<AuditLogRowDetail>`.
 *
 * 6 columns: timestamp, event_type, aggregate, actor, reason, expand toggle.
 * Click any row body to toggle its expansion; the expand chevron in the last
 * column reflects the state.
 */
export function AuditLogTable({
  rows,
  expandedRowId,
  onToggleExpand,
  loading = false,
}: AuditLogTableProps) {
  if (loading && rows.length === 0) {
    return <SkeletonRows />;
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong p-8 text-center text-mute">
        No hay eventos para los filtros aplicados.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">Fecha (UTC)</th>
            <th className="px-3 py-2">Evento</th>
            <th className="px-3 py-2">Agregado</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Razón</th>
            <th className="px-3 py-2 text-right">{}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expanded = expandedRowId === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  className={cn(
                    'cursor-pointer border-t border-border-subtle hover:bg-surface-muted',
                    expanded && 'bg-surface-muted',
                  )}
                  onClick={() => onToggleExpand(row.id)}
                  aria-expanded={expanded}
                >
                  <td className="px-3 py-2 font-mono text-xs">{formatTimestamp(row.createdAt)}</td>
                  <td className="px-3 py-2 text-xs" title={row.eventType}>
                    {/* Audit 2026-05-18 L1-7: human-readable Spanish verb
                        instead of raw `RECIPE_ALLERGENS_OVERRIDE_CHANGED`.
                        Original enum preserved in `title` for power users. */}
                    {humanizeEventType(row.eventType)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.aggregateType}:{row.aggregateId.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wide text-mute">
                      {row.actorKind}
                    </span>{' '}
                    {row.agentName ?? row.actorUserId ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-mute" title={row.reason ?? undefined}>
                    {row.reason ? truncate(row.reason, 60) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-mute">
                    <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                    <span className="sr-only">{expanded ? 'Contraer fila' : 'Expandir fila'}</span>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-t border-border-subtle bg-surface-muted">
                    <td colSpan={6} className="px-3 py-3">
                      <AuditLogRowDetail
                        payloadBefore={row.payloadBefore}
                        payloadAfter={row.payloadAfter}
                        reason={row.reason}
                        citationUrl={row.citationUrl}
                        snippet={row.snippet}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 rounded-lg border border-border-subtle p-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-8 animate-pulse rounded bg-surface-muted"
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">Cargando eventos…</span>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  // YYYY-MM-DD HH:MM:SS in UTC. The audit_log row stores ISO-8601 UTC.
  return iso.slice(0, 19).replace('T', ' ');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export type { AuditLogRow };
