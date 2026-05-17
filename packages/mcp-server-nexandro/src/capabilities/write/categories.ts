import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Category write capabilities — mirrors apps/api `CategoriesController` 1:1.
 *
 *   categories.create  → POST   /categories
 *   categories.update  → PATCH  /categories/:id
 *   categories.delete  → DELETE /categories/:id
 */

const idempotencyKey = z.string().optional();

export const CATEGORIES_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'categories.create',
    title: 'Create a category',
    description:
      'Create a new custom category (isDefault is false). Proxies POST /categories.',
    schema: {
      organizationId: z.string().uuid(),
      parentId: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(100),
      nameEs: z.string().min(1).max(200),
      nameEn: z.string().min(1).max(200),
      sortOrder: z.number().int().min(0).optional(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/categories',
  },
  {
    name: 'categories.update',
    title: 'Update a category',
    description:
      'Rename or reparent a category. Proxies PATCH /categories/:id.',
    schema: {
      id: z.string().uuid(),
      parentId: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(100).optional(),
      nameEs: z.string().min(1).max(200).optional(),
      nameEn: z.string().min(1).max(200).optional(),
      sortOrder: z.number().int().min(0).optional(),
      idempotencyKey,
    },
    restMethod: 'PATCH',
    restPathTemplate: '/categories/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'categories.delete',
    title: 'Delete a category',
    description:
      'Hard-delete a category (RESTRICT: blocked when it has child categories or linked ingredients). Proxies DELETE /categories/:id.',
    schema: {
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/categories/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: () => undefined,
  },
];
