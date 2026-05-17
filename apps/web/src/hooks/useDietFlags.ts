import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DietFlag, DietFlagsState } from '@nexandro/ui-kit';

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export function useDietFlags(organizationId: string | undefined, recipeId: string | undefined) {
  return useQuery<DietFlagsState>({
    queryKey: ['diet-flags', organizationId, recipeId],
    queryFn: async () => {
      if (!organizationId || !recipeId) throw new Error('ids required');
      return api<DietFlagsState>(
        `/recipes/${recipeId}/diet-flags?organizationId=${organizationId}`,
      );
    },
    enabled: !!organizationId && !!recipeId,
  });
}

export function useDietFlagsOverride(
  organizationId: string | undefined,
  recipeId: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { value: DietFlag[]; reason: string }) => {
      if (!organizationId || !recipeId) throw new Error('ids required');
      const wrap = await api<WriteEnvelope<DietFlagsState>>(
        `/recipes/${recipeId}/diet-flags?organizationId=${organizationId}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );
      return wrap.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diet-flags', organizationId, recipeId] });
    },
  });
}
