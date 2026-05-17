import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * SupplierItem write capabilities — mirrors apps/api `SupplierItemsController` 1:1.
 *
 *   supplier-items.create           → POST   /supplier-items
 *   supplier-items.update           → PATCH  /supplier-items/:id
 *   supplier-items.promotePreferred → POST   /supplier-items/:id/promote-preferred
 *   supplier-items.delete           → DELETE /supplier-items/:id
 */

const idempotencyKey = z.string().optional();

export const SUPPLIER_ITEMS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'supplier-items.create',
    title: 'Create a supplier item',
    description:
      'Create a SupplierItem (computes costPerBaseUnit on save). purchaseUnitType family must match the ingredient baseUnitType. Proxies POST /supplier-items.',
    schema: {
      supplierId: z.string().uuid(),
      ingredientId: z.string().uuid(),
      purchaseUnit: z.string().min(1).max(100),
      purchaseUnitQty: z.number().positive(),
      purchaseUnitType: z.string().min(1).max(16),
      unitPrice: z.number().positive(),
      isPreferred: z.boolean().optional(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/supplier-items',
  },
  {
    name: 'supplier-items.update',
    title: 'Update a supplier item',
    description:
      'Update a SupplierItem (recomputes costPerBaseUnit). Proxies PATCH /supplier-items/:id.',
    schema: {
      id: z.string().uuid(),
      purchaseUnit: z.string().min(1).max(100).optional(),
      purchaseUnitQty: z.number().positive().optional(),
      purchaseUnitType: z.string().min(1).max(16).optional(),
      unitPrice: z.number().positive().optional(),
      idempotencyKey,
    },
    restMethod: 'PATCH',
    restPathTemplate: '/supplier-items/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'supplier-items.promotePreferred',
    title: 'Promote a supplier item to preferred',
    description:
      'Promote this SupplierItem to preferred (atomically demotes the previous preferred). Proxies POST /supplier-items/:id/promote-preferred.',
    schema: {
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/supplier-items/:id/promote-preferred',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: () => undefined,
  },
  {
    name: 'supplier-items.delete',
    title: 'Delete a supplier item',
    description:
      'Hard-delete a SupplierItem. Proxies DELETE /supplier-items/:id.',
    schema: {
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/supplier-items/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: () => undefined,
  },
];
