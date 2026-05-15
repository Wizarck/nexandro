import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  getIngestionItem,
  listHitlQueue,
  reclassifyIngestion,
  retroactiveCorrectIngestion,
  signIngestion,
  uploadPhoto,
  type IngestionItem,
  type ListHitlQueueResponse,
  type ReclassifyIngestionRequest,
  type ReclassifyIngestionResponse,
  type RetroactiveCorrectionRequest,
  type RetroactiveCorrectionResponse,
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
  opts: { scope?: 'mine' | 'all' | 'rejected' | 'signed'; limit?: number } = {},
) {
  const scope = opts.scope ?? 'mine';
  // Map UI scope → backend status filter. The default queue is the HITL
  // pending-review set; the `signed` scope opens the retro-correction
  // surface per `m3.x-photo-ingest-retroactive-correction-ui`.
  const status = scope === 'signed' ? 'signed' : 'pending_review';
  return useQuery<ListHitlQueueResponse, ApiError>({
    queryKey: ['photoIngest', 'queue', organizationId, scope, opts.limit ?? 20],
    enabled: typeof organizationId === 'string',
    queryFn: () =>
      listHitlQueue({
        organizationId: organizationId!,
        scope,
        limit: opts.limit ?? 20,
        status,
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

/**
 * Retroactive correction for already-signed items (slice
 * `m3.x-photo-ingest-retroactive-correction-ui`). Server returns
 * `idempotent: true` when the input content hash matches the latest
 * history entry; callers should branch on that flag rather than treating
 * every 200 as a write.
 */
export function useRetroactiveCorrection() {
  const queryClient = useQueryClient();
  return useMutation<
    RetroactiveCorrectionResponse,
    ApiError,
    RetroactiveCorrectionRequest
  >({
    mutationFn: (input) => retroactiveCorrectIngestion(input),
    onSuccess: (data, variables) => {
      // Idempotent retries write nothing, so cache need not change. Skip
      // the invalidation to avoid a needless refetch flicker.
      if (data.idempotent) return;
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
