import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  getRecallSearch,
  type IncidentSearchKind,
  type IncidentSearchResponse,
} from '../api/recall';
import { useDebouncedValue } from './useDebouncedValue';

const STALE_30_S = 30_000;
const QUERY_DEBOUNCE_MS = 200;

/**
 * TanStack query for `GET /m3/recall/search`. Debounces the `query`
 * field by 200ms per j6.md edge case row + ADR-RECALL-SEARCH-CAP — matches
 * the IncidentSearchField component's own debounce, but the hook-level
 * debounce protects callers that pass `query` from a parent useState
 * (the field already debounces its `onSearch` callback; the hook covers
 * the controlled-component case where the parent threads the value
 * through).
 *
 * The query is disabled when the debounced query is empty so the hook
 * matches the backend's empty-input short-circuit semantics — zero
 * round-trips when there is nothing to search for.
 */
export function useIncidentSearch(params: {
  organizationId: string | undefined;
  query: string;
  types?: readonly IncidentSearchKind[];
  limit?: number;
}) {
  const debouncedQuery = useDebouncedValue(params.query, QUERY_DEBOUNCE_MS);
  const enabled =
    typeof params.organizationId === 'string' &&
    params.organizationId.length > 0 &&
    debouncedQuery.trim().length > 0;

  return useQuery<IncidentSearchResponse, ApiError>({
    queryKey: [
      'recall-search',
      params.organizationId ?? '',
      debouncedQuery.trim(),
      params.types ? [...params.types].sort().join(',') : '',
      params.limit ?? 8,
    ],
    queryFn: () =>
      getRecallSearch({
        organizationId: params.organizationId as string,
        query: debouncedQuery.trim(),
        types: params.types,
        limit: params.limit,
      }),
    enabled,
    staleTime: STALE_30_S,
    placeholderData: (prev) => prev,
  });
}
