import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { MacroRollup } from '@nexandro/ui-kit';

export function useRecipeMacros(
  organizationId: string | undefined,
  recipeId: string | undefined,
) {
  return useQuery<MacroRollup>({
    queryKey: ['recipe-macros', organizationId, recipeId],
    queryFn: async () => {
      if (!organizationId || !recipeId) throw new Error('ids required');
      return api<MacroRollup>(
        `/recipes/${recipeId}/macros?organizationId=${organizationId}`,
      );
    },
    enabled: !!organizationId && !!recipeId,
  });
}
