import { api } from './client';

/**
 * Local mirror of `apps/api/src/recall/types.ts` per ADR-RECALL-CONTRACT-
 * INLINE (slice #11 m3-incident-search-multi-anchor). NO import from
 * `packages/contracts` — the cross-app contract is duplicated here and
 * in the apps/api source of truth.
 *
 * SYNC contract: every field name + type matches
 * `apps/api/src/recall/types.ts` exactly.
 */
export type IncidentSearchKind =
  | 'lot'
  | 'supplier'
  | 'ingredient'
  | 'aggregate';

export interface IncidentSearchHit {
  kind: IncidentSearchKind;
  id: string;
  label: string;
  supportingText: string;
  /** ISO 8601 timestamp; null for non-temporal hits. */
  receivedAt: string | null;
  symptomMatchScore: number;
}

export interface IncidentSearchResponse {
  hits: IncidentSearchHit[];
}

export interface IncidentSearchParams {
  organizationId: string;
  query: string;
  types?: readonly IncidentSearchKind[];
  limit?: number;
}

/**
 * Build query string for `GET /m3/recall/search`. Empty / nullish values
 * are dropped. `types` is serialised as CSV per the backend DTO.
 */
function buildQuery(params: IncidentSearchParams): string {
  const search = new URLSearchParams();
  search.set('organizationId', params.organizationId);
  search.set('q', params.query);
  if (params.types && params.types.length > 0) {
    search.set('types', params.types.join(','));
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  return search.toString();
}

export async function getRecallSearch(
  params: IncidentSearchParams,
): Promise<IncidentSearchResponse> {
  return api<IncidentSearchResponse>(`/m3/recall/search?${buildQuery(params)}`);
}
