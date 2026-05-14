import { useQuery } from '@tanstack/react-query';
import { getFailures, type AppliedFailuresFilter } from '../api/aiObs';
import type { FailuresResponse } from '../api/aiObs.types';
import { ApiError } from '../../../api/client';

const STALE_5_S = 5_000;

/**
 * TanStack Query hook for `GET /m3/ai-obs/failures`.
 *
 * Per ADR-QUERY-LAYER, 5 s stale time — Top5 failures is the most
 * time-sensitive widget. An attacker exploiting an LLM rate-limit
 * vuln must surface within the next refresh cycle.
 */
export function useAiObsFailures(filter: AppliedFailuresFilter) {
  return useQuery<FailuresResponse, ApiError>({
    queryKey: ['ai-obs', 'failures', filter.organizationId, filter.range],
    queryFn: () => getFailures(filter),
    staleTime: STALE_5_S,
    placeholderData: (prev) => prev,
  });
}
