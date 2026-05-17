import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SupplierItemOption } from '@nexandro/ui-kit';

interface SupplierItemDto {
  id: string;
  supplierName: string;
  price: number;
  currency: string;
  isPreferred: boolean;
  packLabel?: string;
}

export function useSupplierItems(ingredientId: string | undefined) {
  return useQuery<SupplierItemOption[]>({
    queryKey: ['supplier-items', ingredientId],
    queryFn: async () => {
      if (!ingredientId) throw new Error('ingredientId required');
      const dtos = await api<SupplierItemDto[]>(
        `/supplier-items?ingredientId=${ingredientId}`,
      );
      return dtos.map((d) => ({
        id: d.id,
        supplierName: d.supplierName,
        price: Number(d.price),
        currency: d.currency,
        isPreferred: d.isPreferred,
        packLabel: d.packLabel,
      }));
    },
    enabled: !!ingredientId,
  });
}
