import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  fetchExternalCatalogHealth,
  triggerExternalCatalogSync,
  type ExternalCatalogHealth,
  type SyncResponse,
} from '../api/externalCatalog';

const healthKey = ['externalCatalogHealth'] as const;

export function useExternalCatalogHealthQuery() {
  return useQuery<ExternalCatalogHealth, ApiError>({
    queryKey: healthKey,
    queryFn: fetchExternalCatalogHealth,
    staleTime: 30_000,
  });
}

export function useTriggerExternalCatalogSyncMutation() {
  const qc = useQueryClient();
  return useMutation<SyncResponse, ApiError, void>({
    mutationFn: triggerExternalCatalogSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: healthKey });
    },
  });
}
