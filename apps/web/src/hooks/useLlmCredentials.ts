import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  clearLlmCredential,
  getLlmCredentialStatus,
  testLlmCredential,
  upsertLlmCredential,
  type LlmCredentialStatus,
  type UpsertLlmCredentialPayload,
} from '../api/llmCredentials';

/**
 * Sprint 4 W2-1b — React Query hooks for the BYO LLM provider key surface.
 * Each mutation invalidates the per-org status cache so the section can
 * re-render `hasKey` + last-test metadata without manual plumbing.
 */

const key = (orgId: string | undefined) => ['llm-credentials', orgId] as const;

export function useLlmCredentialsStatus(orgId: string | undefined) {
  return useQuery<LlmCredentialStatus, ApiError>({
    queryKey: key(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getLlmCredentialStatus(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useUpsertLlmCredentialMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, UpsertLlmCredentialPayload>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return upsertLlmCredential(orgId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}

export function useTestLlmCredentialMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<LlmCredentialStatus, ApiError, void>({
    mutationFn: () => {
      if (!orgId) throw new Error('orgId required');
      return testLlmCredential(orgId);
    },
    onSuccess: (status) => {
      qc.setQueryData(key(orgId), status);
    },
  });
}

export function useClearLlmCredentialMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => {
      if (!orgId) throw new Error('orgId required');
      return clearLlmCredential(orgId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}
