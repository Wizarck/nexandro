import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * IAM location write capabilities — mirrors apps/api `LocationController` 1:1.
 *
 *   iam.locations.create  → POST   /locations
 *   iam.locations.update  → PATCH  /locations/:id
 *   iam.locations.delete  → DELETE /locations/:id
 */

const idempotencyKey = z.string().optional();
const locationType = z.enum([
  'RESTAURANT',
  'BAR',
  'DARK_KITCHEN',
  'CATERING',
  'CENTRAL_PRODUCTION',
]);

export const IAM_LOCATIONS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'iam.locations.create',
    title: 'Create a location',
    description: 'Create a new Location for an organization. Proxies POST /locations.',
    schema: {
      organizationId: z.string().uuid(),
      name: z.string().min(1).max(200),
      address: z.string().max(500).optional(),
      type: locationType,
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/locations',
  },
  {
    name: 'iam.locations.update',
    title: 'Update a location',
    description:
      'Update a Location (mutable fields). Proxies PATCH /locations/:id.',
    schema: {
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      address: z.string().max(500).optional(),
      type: locationType.optional(),
      idempotencyKey,
    },
    restMethod: 'PATCH',
    restPathTemplate: '/locations/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'iam.locations.delete',
    title: 'Soft-delete a location',
    description:
      'Soft-delete a Location (sets isActive=false; idempotent). Proxies DELETE /locations/:id.',
    schema: {
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/locations/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: () => undefined,
  },
];
