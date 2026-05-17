import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { MarginReport } from '@nexandro/ui-kit';

export interface MenuItemDto {
  id: string;
  organizationId: string;
  recipeId: string;
  locationId: string;
  channel: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'CATERING';
  sellingPrice: number;
  targetMargin: number;
  isActive: boolean;
  displayLabel: string;
  recipeDiscontinued: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AllergensRollup {
  aggregated: string[];
  byIngredient: Record<string, string[]>;
  override?: { add: string[]; remove: string[]; reason: string; appliedBy: string; appliedAt: string };
  crossContamination: { note: string | null; allergens: string[] };
}

export function useMenuItems(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['menu-items', organizationId],
    queryFn: async () => {
      if (!organizationId) throw new Error('organizationId required');
      return api<MenuItemDto[]>(
        `/menu-items?organizationId=${organizationId}&isActive=true`,
      );
    },
    enabled: !!organizationId,
  });
}

export function useMargin(organizationId: string | undefined, menuItemId: string | undefined) {
  return useQuery({
    queryKey: ['margin', organizationId, menuItemId],
    queryFn: async () => {
      if (!organizationId || !menuItemId) throw new Error('ids required');
      return api<MarginReport>(
        `/menu-items/${menuItemId}/margin?organizationId=${organizationId}`,
      );
    },
    enabled: !!organizationId && !!menuItemId,
  });
}

export function useAllergens(organizationId: string | undefined, recipeId: string | undefined) {
  return useQuery({
    queryKey: ['allergens', organizationId, recipeId],
    queryFn: async () => {
      if (!organizationId || !recipeId) throw new Error('ids required');
      return api<AllergensRollup>(
        `/recipes/${recipeId}/allergens?organizationId=${organizationId}`,
      );
    },
    enabled: !!organizationId && !!recipeId,
  });
}
