import { useQuery } from '@tanstack/react-query';
import type { ReverseAnchorKind, TraceNode } from '@nexandro/ui-kit';
import { ApiError } from '../api/client';
import { getForwardTrace, getReverseTrace } from '../api/recallTrace';

/**
 * TanStack queries for the recall trace endpoints.
 *
 * Both queries are guarded by the input being truthy — the hook returns
 * `enabled: false` (no fetch) when the consumer hasn't yet selected a
 * lot / anchor.
 */

const STALE_60_S = 60_000;

export function useForwardTrace(organizationId: string, lotId: string | null) {
  return useQuery<TraceNode, ApiError>({
    queryKey: ['recall-trace', 'forward', organizationId, lotId],
    queryFn: () => getForwardTrace(organizationId, lotId as string),
    enabled: Boolean(organizationId && lotId),
    staleTime: STALE_60_S,
  });
}

export interface ReverseAnchorInput {
  anchorId: string;
  anchorKind: ReverseAnchorKind;
}

export function useReverseTrace(
  organizationId: string,
  anchor: ReverseAnchorInput | null,
) {
  return useQuery<TraceNode, ApiError>({
    queryKey: [
      'recall-trace',
      'reverse',
      organizationId,
      anchor?.anchorId ?? null,
      anchor?.anchorKind ?? null,
    ],
    queryFn: () =>
      getReverseTrace(
        organizationId,
        (anchor as ReverseAnchorInput).anchorId,
        (anchor as ReverseAnchorInput).anchorKind,
      ),
    enabled: Boolean(organizationId && anchor?.anchorId),
    staleTime: STALE_60_S,
  });
}
