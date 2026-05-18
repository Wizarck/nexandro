import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  commitCategoriesImport,
  previewCategoriesImport,
  type CategoriesCommitPayload,
  type CategoriesCommitResult,
  type CategoriesPreviewResult,
} from '../api/categoriesImport';

/**
 * Sprint 4 W2-3b — TanStack Query mutations for the categories CSV import.
 *
 * `usePreviewCategoriesImportMutation` uploads the file and returns the
 * server-side plan (no DB mutation). `useCommitCategoriesImportMutation`
 * persists the plan and invalidates the categories tree query so the
 * caller surface refreshes automatically.
 */

const categoriesKey = (orgId: string | undefined): readonly unknown[] =>
  ['categories', orgId];

export function usePreviewCategoriesImportMutation(orgId: string | undefined) {
  return useMutation<CategoriesPreviewResult, ApiError, File>({
    mutationFn: (file) => {
      if (!orgId) throw new Error('orgId required');
      return previewCategoriesImport(orgId, file);
    },
  });
}

export function useCommitCategoriesImportMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<CategoriesCommitResult, ApiError, CategoriesCommitPayload>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return commitCategoriesImport(orgId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey(orgId) });
    },
  });
}
