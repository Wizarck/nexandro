import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CostDeltaRow } from '@nexandro/ui-kit';

interface CostDeltaResponse {
  rows: CostDeltaRow[];
  fromDate: string;
  toDate: string;
}

export function useRecipeCostDelta(
  recipeId: string | undefined,
  fromIso: string | undefined,
) {
  return useQuery<CostDeltaResponse>({
    queryKey: ['cost-delta', recipeId, fromIso],
    queryFn: async () => {
      if (!recipeId || !fromIso) throw new Error('recipeId + fromIso required');
      return api<CostDeltaResponse>(
        `/recipes/${recipeId}/cost-delta?from=${encodeURIComponent(fromIso)}`,
      );
    },
    enabled: !!recipeId && !!fromIso,
  });
}
