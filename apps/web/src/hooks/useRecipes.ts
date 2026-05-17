import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { RecipeListItem } from '@nexandro/ui-kit';

interface RecipeDto {
  id: string;
  name: string;
  isActive: boolean;
}

export function useRecipes(organizationId: string | undefined, search: string) {
  return useQuery<RecipeListItem[]>({
    queryKey: ['recipes', organizationId, search],
    queryFn: async () => {
      if (!organizationId) throw new Error('organizationId required');
      const qs = new URLSearchParams({
        organizationId,
        ...(search ? { search } : {}),
      });
      const dtos = await api<RecipeDto[]>(`/recipes?${qs.toString()}`);
      return dtos.map((d) => ({
        id: d.id,
        name: d.name,
        displayLabel: d.name,
        isActive: d.isActive,
      }));
    },
    enabled: !!organizationId,
  });
}
