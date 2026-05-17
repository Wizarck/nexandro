import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { IngredientListItem } from '@nexandro/ui-kit';

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
