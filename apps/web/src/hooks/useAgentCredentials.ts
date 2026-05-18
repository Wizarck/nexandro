import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  createAgentCredential,
  deleteAgentCredential,
  listAgentCredentials,
  revokeAgentCredential,
  type AgentCredentialResponse,
  type CreateAgentCredentialPayload,
} from '../api/agentCredentials';

const KEY = ['agent-credentials'] as const;

export function useAgentCredentialsQuery() {
  return useQuery<AgentCredentialResponse[], ApiError>({
    queryKey: KEY,
    queryFn: listAgentCredentials,
    staleTime: 30_000,
  });
}

export function useCreateAgentCredentialMutation() {
  const qc = useQueryClient();
  return useMutation<AgentCredentialResponse, ApiError, CreateAgentCredentialPayload>({
    mutationFn: createAgentCredential,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useRevokeAgentCredentialMutation() {
  const qc = useQueryClient();
  return useMutation<AgentCredentialResponse, ApiError, string>({
    mutationFn: revokeAgentCredential,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteAgentCredentialMutation() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, ApiError, string>({
    mutationFn: deleteAgentCredential,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
