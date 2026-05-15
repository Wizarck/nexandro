import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  getIngestionItem,
  listHitlQueue,
  reclassifyIngestion,
  signIngestion,
  uploadPhoto,
  type IngestionItem,
  type ListHitlQueueResponse,
  type ReclassifyIngestionRequest,
  type ReclassifyIngestionResponse,
  type SignIngestionRequest,
  type SignIngestionResponse,
  type UploadPhotoRequest,
  type UploadPhotoResponse,
} from '../api/photo-ingest';

/**
 * TanStack Query hooks for j12 photo-ingestion HITL review (slice #17b
 * m3-photo-ingest-review-ui, Wave 2.8).
 *
 * The queue uses 30 s polling per ADR-J12 (SSE follow-up M3.x). The
 * sign mutation invalidates queue + item keys but does NOT optimistic-
 * update — the audit_log envelope ID + downstream aggregate ID are
 * server-minted (ADR-J12-SIGN-WRITES-VIA-MUTATION).
 */

const QUEUE_STALE_MS = 30_000;

export function useHitlQueue(
  organizationId: string | undefined,
  opts: { scope?: 'mine' | 'all' | 'rejected'; limit?: number } = {},
) {
  return useQuery<ListHitlQueueResponse, ApiError>({
    queryKey: [
      'photoIngest',
      'queue',
      organizationId,
      opts.scope ?? 'mine',
      opts.limit ?? 20,
    ],
    enabled: typeof organizationId === 'string',
    queryFn: () =>
      listHitlQueue({
        organizationId: organizationId!,
        scope: opts.scope ?? 'mine',
        limit: opts.limit ?? 20,
        status: 'pending_review',
      }),
    staleTime: QUEUE_STALE_MS,
  });
}

export function useIngestionItem(
  organizationId: string | undefined,
  itemId: string | null,
) {
  return useQuery<IngestionItem, ApiError>({
    queryKey: ['photoIngest', 'item', organizationId, itemId],
    enabled: typeof organizationId === 'string' && itemId != null,
    queryFn: () => getIngestionItem(organizationId!, itemId!),
    staleTime: 0,
  });
}

export function useSignIngestion() {
  const queryClient = useQueryClient();
  return useMutation<SignIngestionResponse, ApiError, SignIngestionRequest>({
    mutationFn: (input) => signIngestion(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['photoIngest', 'queue', variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'photoIngest',
          'item',
          variables.organizationId,
          variables.itemId,
        ],
      });
    },
  });
}

export function useReclassifyIngestion() {
  const queryClient = useQueryClient();
  return useMutation<
    ReclassifyIngestionResponse,
    ApiError,
    ReclassifyIngestionRequest
  >({
    mutationFn: (input) => reclassifyIngestion(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['photoIngest', 'queue', variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'photoIngest',
          'item',
          variables.organizationId,
          variables.itemId,
        ],
      });
    },
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation<UploadPhotoResponse, ApiError, UploadPhotoRequest>({
    mutationFn: (input) => uploadPhoto(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['photoIngest', 'queue', variables.organizationId],
      });
    },
  });
}
