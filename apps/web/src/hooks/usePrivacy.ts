import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  cancelDeletion,
  enableTwoFactor,
  exportMyData,
  getPrivacyState,
  patchDpoContact,
  patchRetentionPolicy,
  rotateApiToken,
  scheduleDeletion,
  type CancelDeleteResponse,
  type DeleteOrganizationResponse,
  type DpoContact,
  type PrivacyState,
  type RetentionPolicy,
  type StubResponse,
} from '../api/privacy';

const STALE_5_MIN = 5 * 60 * 1000;

const privacyKey = (orgId: string | undefined): [string, string | undefined] =>
  ['privacy-state', orgId];

export function usePrivacyStateQuery(orgId: string | undefined) {
  return useQuery<PrivacyState, ApiError>({
    queryKey: privacyKey(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getPrivacyState(orgId);
    },
    enabled: !!orgId,
    staleTime: STALE_5_MIN,
  });
}

/**
 * Trigger the ZIP export + hand the resulting Blob to the browser via a
 * temporary `<a download>` so the file lands on the user's disk without
 * navigating away. Returns a Promise that resolves when the click has
 * fired so callers can transition to a "✓ Descarga lista" state.
 */
export function useExportMyDataMutation(orgId: string | undefined) {
  return useMutation<{ blob: Blob; filename: string }, ApiError, void>({
    mutationFn: async () => {
      if (!orgId) throw new Error('orgId required');
      const { blob, filename } = await exportMyData(orgId);
      // Trigger download via a temporary anchor — fully synchronous so
      // a click handler stays connected to the user gesture (some
      // browsers gate downloads on that).
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { blob, filename };
    },
  });
}

export function useScheduleDeletionMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<DeleteOrganizationResponse, ApiError, void>({
    mutationFn: () => {
      if (!orgId) throw new Error('orgId required');
      return scheduleDeletion(orgId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: privacyKey(orgId) });
    },
  });
}

export function useCancelDeletionMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<CancelDeleteResponse, ApiError, void>({
    mutationFn: () => {
      if (!orgId) throw new Error('orgId required');
      return cancelDeletion(orgId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: privacyKey(orgId) });
    },
  });
}

export function useRetentionPolicyMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<PrivacyState, ApiError, Partial<RetentionPolicy>>({
    mutationFn: (patch) => {
      if (!orgId) throw new Error('orgId required');
      return patchRetentionPolicy(orgId, patch);
    },
    onSuccess: (data) => {
      qc.setQueryData(privacyKey(orgId), data);
    },
  });
}

export function useDpoContactMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<PrivacyState, ApiError, DpoContact | null>({
    mutationFn: (contact) => {
      if (!orgId) throw new Error('orgId required');
      return patchDpoContact(orgId, contact);
    },
    onSuccess: (data) => {
      qc.setQueryData(privacyKey(orgId), data);
    },
  });
}

export function useTwoFactorMutation() {
  return useMutation<StubResponse, ApiError, void>({
    mutationFn: () => enableTwoFactor(),
  });
}

export function useRotateApiTokenMutation() {
  return useMutation<StubResponse, ApiError, void>({
    mutationFn: () => rotateApiToken(),
  });
}
