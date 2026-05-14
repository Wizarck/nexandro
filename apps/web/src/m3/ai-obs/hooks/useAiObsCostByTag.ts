import { useQuery } from '@tanstack/react-query';
import { getCostByTag, type AppliedAiObsFilter } from '../api/aiObs';
import type { CostByTagResponse } from '../api/aiObs.types';
import { ApiError } from '../../../api/client';

const STALE_30_S = 30_000;

/**
 * TanStack Query hook for `GET /m3/ai-obs/cost-by-tag`.
 *
 * Per ADR-QUERY-LAYER, separate cache key from overview (the GROUP BY
 * on a JSONB attribute is slower and merits its own cache slot).
 * 30 s stale time matches the overview cadence.
 */
export function useAiObsCostByTag(filter: AppliedAiObsFilter) {
  return useQuery<CostByTagResponse, ApiError>({
    queryKey: ['ai-obs', 'cost-by-tag', filter.organizationId, filter.period],
    queryFn: () => getCostByTag(filter),
    staleTime: STALE_30_S,
    placeholderData: (prev) => prev,
  });
}
