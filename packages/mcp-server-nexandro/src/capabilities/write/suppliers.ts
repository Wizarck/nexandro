import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Supplier write capabilities — mirrors apps/api `SuppliersController` 1:1.
 *
 *   suppliers.create  → POST   /suppliers
 *   suppliers.update  → PATCH  /suppliers/:id
 *   suppliers.delete  → DELETE /suppliers/:id
 */

const idempotencyKey = z.string().optional();
const country = z.string().regex(/^[A-Z]{2}$/);

export const SUPPLIERS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'suppliers.create',
    title: 'Create a supplier',
    description: 'Create a new Supplier. Proxies POST /suppliers.',
    schema: {
      organizationId: z.string().uuid(),
      name: z.string().min(1).max(200),
      country,
      contactName: z.string().max(200).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(32).optional(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/suppliers',
  },
  {
    name: 'suppliers.update',
    title: 'Update a supplier',
    description:
      'Update a Supplier (mutable fields). Proxies PATCH /suppliers/:id.',
    schema: {
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      country: country.optional(),
      contactName: z.string().max(200).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(32).optional(),
      idempotencyKey,
    },
    restMethod: 'PATCH',
    restPathTemplate: '/suppliers/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'suppliers.delete',
    title: 'Soft-delete a supplier',
    description:
      'Soft-delete a Supplier (sets isActive=false). Proxies DELETE /suppliers/:id.',
    schema: {
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/suppliers/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: () => undefined,
  },
];
