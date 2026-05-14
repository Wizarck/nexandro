import { useQuery } from '@tanstack/react-query';
import { getOverview, type AppliedAiObsFilter } from '../api/aiObs';
import type { OverviewResponse } from '../api/aiObs.types';
import { ApiError } from '../../../api/client';

const STALE_30_S = 30_000;

/**
 * TanStack Query hook for `GET /m3/ai-obs/overview`.
 *
 * Per ADR-QUERY-LAYER (slice #20 m3-ai-obs-ui, Wave 2.4): 30 s stale
 * time matches the audit-log convention from Wave 1.19. The hook
 * exposes `dataUpdatedAt` so the consumer widget can render
 * "Actualizado hace N min" per ADR-DATA-FRESHNESS-BADGE.
 */
export function useAiObsOverview(filter: AppliedAiObsFilter) {
  return useQuery<OverviewResponse, ApiError>({
    queryKey: ['ai-obs', 'overview', filter.organizationId, filter.period],
    queryFn: () => getOverview(filter),
    staleTime: STALE_30_S,
    placeholderData: (prev) => prev,
  });
}
