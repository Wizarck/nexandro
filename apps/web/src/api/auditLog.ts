import type { AuditLogFilterValues, AuditLogRow } from '@nexandro/ui-kit';
import { api } from './client';

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface AppliedAuditLogFilter extends AuditLogFilterValues {
  organizationId: string;
  /** 1..200; defaults to 50. */
  limit: number;
  /** 0-indexed cursor, incremented by limit on Load-more. */
  offset: number;
}

/**
 * Build the query string for `GET /audit-log` from the applied filter.
 * Empty / null values are dropped so the backend receives a clean URL.
 * Date inputs are passed verbatim — apps/api accepts ISO YYYY-MM-DD; the
 * service expands them to a full timestamp range.
 */
function buildQuery(filter: AppliedAuditLogFilter): string {
  const params = new URLSearchParams();
  params.set('organizationId', filter.organizationId);
  if (filter.eventType.length > 0) {
    params.set('eventType', filter.eventType.join(','));
  }
  if (filter.aggregateType) params.set('aggregateType', filter.aggregateType);
  if (filter.actorKind) params.set('actorKind', filter.actorKind);
  if (filter.since) params.set('since', filter.since);
  if (filter.until) params.set('until', filter.until);
  if (filter.q) params.set('q', filter.q);
  params.set('limit', String(filter.limit));
  params.set('offset', String(filter.offset));
  return params.toString();
}

export async function getAuditLog(filter: AppliedAuditLogFilter): Promise<AuditLogPage> {
  const qs = buildQuery(filter);
  return api<AuditLogPage>(`/audit-log?${qs}`);
}

/**
 * Build the URL for `GET /audit-log/export.csv` with the same applied
 * filters minus pagination (the backend ignores limit/offset on the export
 * path; the cap is enforced via X-Audit-Log-Export-Truncated).
 */
export function buildExportUrl(filter: AppliedAuditLogFilter): string {
  const exportFilter = { ...filter, limit: 50, offset: 0 };
  const qs = buildQuery(exportFilter);
  // `/api` is the Vite proxy prefix in dev; in prod the host is the same.
  return `/api/audit-log/export.csv?${qs}`;
}
