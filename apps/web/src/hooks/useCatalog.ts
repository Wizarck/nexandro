import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  createCategory,
  deleteCategory,
  listCategoryTree,
  listUoms,
  type CategoryResponse,
  type CreateCategoryPayload,
  type UoMDefinition,
} from '../api/catalog';

const categoriesKey = (orgId: string | undefined): readonly unknown[] =>
  ['categories', orgId];

export function useCategoriesQuery(orgId: string | undefined) {
  return useQuery<CategoryResponse[], ApiError>({
    queryKey: categoriesKey(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return listCategoryTree(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCreateCategoryMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<CategoryResponse, ApiError, Omit<CreateCategoryPayload, 'organizationId'>>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return createCategory({ ...payload, organizationId: orgId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey(orgId) });
    },
  });
}

export function useDeleteCategoryMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<{ id: string }, ApiError, string>({
    mutationFn: deleteCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesKey(orgId) });
    },
  });
}

// UoM is canonical static data; cache aggressively.
export function useUomsQuery() {
  return useQuery<UoMDefinition[], ApiError>({
    queryKey: ['uoms'],
    queryFn: listUoms,
    staleTime: 60 * 60 * 1000,
  });
}
