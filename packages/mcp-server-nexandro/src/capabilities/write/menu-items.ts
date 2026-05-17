import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * MenuItem write capabilities — mirrors apps/api `MenuItemsController` 1:1.
 *
 *   menu-items.create  → POST   /menu-items
 *   menu-items.update  → PUT    /menu-items/:id?organizationId=
 *   menu-items.delete  → DELETE /menu-items/:id?organizationId=
 */

const idempotencyKey = z.string().optional();

const channels = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'CATERING'] as const;

export const MENU_ITEMS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'menu-items.create',
    title: 'Create a menu item',
    description:
      'Create a MenuItem (Recipe × Location × Channel). Proxies POST /menu-items.',
    schema: {
      organizationId: z.string().uuid(),
      recipeId: z.string().uuid(),
      locationId: z.string().uuid(),
      channel: z.enum(channels),
      sellingPrice: z.number().min(0.0001),
      targetMargin: z.number().min(0).max(0.999),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/menu-items',
  },
  {
    name: 'menu-items.update',
    title: 'Update a menu item',
    description:
      'Update a MenuItem (channel / sellingPrice / targetMargin). Proxies PUT /menu-items/:id?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      channel: z.enum(channels).optional(),
      sellingPrice: z.number().min(0.0001).optional(),
      targetMargin: z.number().min(0).max(0.999).optional(),
      idempotencyKey,
    },
    restMethod: 'PUT',
    restPathTemplate: '/menu-items/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, organizationId: _org, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'menu-items.delete',
    title: 'Soft-delete a menu item',
    description:
      'Soft-delete a MenuItem (sets isActive=false). Proxies DELETE /menu-items/:id?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/menu-items/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: () => undefined,
  },
];
