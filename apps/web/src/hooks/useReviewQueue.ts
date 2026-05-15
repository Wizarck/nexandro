import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  clearReviewQueueItem,
  listReviewQueue,
  type ClearReviewQueueParams,
  type ClearReviewQueueResponse,
  type ListReviewQueueParams,
  type ListReviewQueueResponse,
  type ReviewQueueAggregateType,
} from '../api/review-queue';

/**
 * TanStack Query hooks for the review-queue UI (slice
 * `m3.x-review-queue-ui`). Backend at `/m3/review-queue` is the
 * operator surface for Lot + GR rows flagged `requires_review=true` by
 * the photo-ingest retroactive-correction listener (PR #157).
 */

const QUEUE_STALE_MS = 30_000;

export function useReviewQueueList(
  organizationId: string | undefined,
  opts: { aggregateType?: ReviewQueueAggregateType; limit?: number } = {},
) {
  return useQuery<ListReviewQueueResponse, ApiError>({
    queryKey: [
      'reviewQueue',
      'list',
      organizationId,
      opts.aggregateType ?? 'all',
      opts.limit ?? 50,
    ],
    enabled: typeof organizationId === 'string',
    queryFn: () =>
      listReviewQueue({
        organizationId: organizationId!,
        aggregateType: opts.aggregateType,
        limit: opts.limit,
      } satisfies ListReviewQueueParams),
    staleTime: QUEUE_STALE_MS,
    placeholderData: (prev) => prev,
  });
}

export function useClearReviewQueueItem() {
  const queryClient = useQueryClient();
  return useMutation<
    ClearReviewQueueResponse,
    ApiError,
    ClearReviewQueueParams
  >({
    mutationFn: (input) => clearReviewQueueItem(input),
    onSuccess: (data, variables) => {
      // Idempotent no-op (alreadyClear) writes nothing on the server, so
      // the cache is unchanged — skip the refetch flicker.
      if (data.alreadyClear) return;
      queryClient.invalidateQueries({
        queryKey: ['reviewQueue', 'list', variables.organizationId],
      });
    },
  });
}
