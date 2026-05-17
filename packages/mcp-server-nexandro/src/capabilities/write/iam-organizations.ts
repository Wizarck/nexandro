import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * IAM organization write capabilities — mirrors apps/api `OrganizationController` 1:1.
 *
 *   iam.organizations.create → POST  /organizations
 *   iam.organizations.update → PATCH /organizations/:id
 */

const idempotencyKey = z.string().optional();

export const IAM_ORGANIZATIONS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'iam.organizations.create',
    title: 'Create an organization',
    description:
      'Create a new Organization (and seed its default category taxonomy). currencyCode is immutable post-creation. Proxies POST /organizations.',
    schema: {
      name: z.string().min(1).max(200),
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
      defaultLocale: z.string().regex(/^[a-z]{2}$/),
      timezone: z.string().min(1).max(64),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/organizations',
  },
  {
    name: 'iam.organizations.update',
    title: 'Update an organization',
    description:
      'Update an Organization (mutable fields). currencyCode is silently stripped per ADR-007. Proxies PATCH /organizations/:id.',
    schema: {
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      defaultLocale: z.string().regex(/^[a-z]{2}$/).optional(),
      timezone: z.string().min(1).max(64).optional(),
      idempotencyKey,
    },
    restMethod: 'PATCH',
    restPathTemplate: '/organizations/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
];
