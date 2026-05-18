import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ApiError } from '../api/client';
import type { IngredientListItem } from '@nexandro/ui-kit';
import {
  createIngredient,
  deactivateIngredient,
  listIngredients,
  updateIngredient,
  type CreateIngredientPayload,
  type IngredientResponse,
  type UpdateIngredientPayload,
} from '../api/ingredients';

// ----------------------------------------------------------------------------
// J1 RecipeBuilder search shim (legacy — kept untouched for the existing
// consumer in `screens/RecipeBuilderJ1Screen.tsx`).
//
// Followup: this hook expected a flat array but `/ingredients` is now cursor-
// paginated (`{ items, nextCursor }`). The mismatch predates Sprint 4 W1-A.
// ----------------------------------------------------------------------------

interface IngredientDto {
  id: string;
  name: string;
  brandName?: string | null;
  barcode?: string | null;
  isActive: boolean;
}

export function useIngredients(organizationId: string | undefined, search: string) {
  return useQuery<IngredientListItem[]>({
    queryKey: ['ingredients', organizationId, search],
    queryFn: async () => {
      if (!organizationId) throw new Error('organizationId required');
      const qs = new URLSearchParams({
        organizationId,
        ...(search ? { search } : {}),
      });
      const dtos = await api<IngredientDto[]>(`/ingredients?${qs.toString()}`);
      return dtos.map((d) => ({
        id: d.id,
        name: d.name,
        brandName: d.brandName ?? null,
        barcode: d.barcode ?? null,
        displayLabel: d.name,
        isActive: d.isActive,
      }));
    },
    enabled: !!organizationId,
  });
}

// ----------------------------------------------------------------------------
// Sprint 4 W1-A — Settings CRUD hooks (full IngredientResponse shape, paginated
// list aggregated into a flat array for the Owner ingredients table).
// ----------------------------------------------------------------------------

const listKey = (orgId: string | undefined): readonly unknown[] =>
  ['ingredients-list', orgId];

export function useIngredientsListQuery(orgId: string | undefined) {
  return useQuery<IngredientResponse[], ApiError>({
    queryKey: listKey(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return listIngredients(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCreateIngredientMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    IngredientResponse,
    ApiError,
    Omit<CreateIngredientPayload, 'organizationId'>
  >({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return createIngredient({ ...payload, organizationId: orgId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(orgId) });
    },
  });
}

export function useUpdateIngredientMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    IngredientResponse,
    ApiError,
    { id: string; patch: UpdateIngredientPayload }
  >({
    mutationFn: ({ id, patch }) => updateIngredient(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(orgId) });
    },
  });
}

export function useDeleteIngredientMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<{ id: string }, ApiError, string>({
    mutationFn: deactivateIngredient,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(orgId) });
    },
  });
}
