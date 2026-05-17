import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Ingredient write capabilities — mirrors apps/api `IngredientsController` 1:1.
 *
 *   ingredients.create        → POST   /ingredients
 *   ingredients.update        → PATCH  /ingredients/:id
 *   ingredients.delete        → DELETE /ingredients/:id
 *   ingredients.reactivate    → POST   /ingredients/:id/reactivate
 *   ingredients.applyOverride → POST   /ingredients/:id/overrides?organizationId=
 *   ingredients.import        → POST   /ingredients/import (multipart — UNSUPPORTED via MCP)
 */

const idempotencyKey = z.string().optional();

const baseUnitTypes = ['WEIGHT', 'VOLUME', 'UNIT'] as const;

export const INGREDIENTS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'ingredients.create',
    title: 'Create an ingredient',
    description:
      'Create a new Ingredient. baseUnitType is immutable post-creation; internalCode auto-generated when omitted. Proxies POST /ingredients.',
    schema: {
      organizationId: z.string().uuid(),
      categoryId: z.string().uuid(),
      name: z.string().min(1).max(200),
      baseUnitType: z.enum(baseUnitTypes),
      internalCode: z.string().min(1).max(64).optional(),
      densityFactor: z.number().positive().optional(),
      notes: z.string().optional(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ingredients',
  },
  {
    name: 'ingredients.update',
    title: 'Update an ingredient',
    description:
      'Update an Ingredient (mutable fields only). Proxies PATCH /ingredients/:id.',
    schema: {
      id: z.string().uuid(),
      categoryId: z.string().uuid().optional(),
      name: z.string().min(1).max(200).optional(),
      internalCode: z.string().min(1).max(64).optional(),
      densityFactor: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      idempotencyKey,
    },
    restMethod: 'PATCH',
    restPathTemplate: '/ingredients/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'ingredients.delete',
    title: 'Soft-delete an ingredient',
    description:
      'Soft-delete an Ingredient (sets isActive=false; idempotent). Proxies DELETE /ingredients/:id.',
    schema: {
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/ingredients/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: () => undefined,
  },
  {
    name: 'ingredients.reactivate',
    title: 'Reactivate an ingredient',
    description:
      'Reactivate a previously soft-deleted Ingredient. Proxies POST /ingredients/:id/reactivate.',
    schema: {
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ingredients/:id/reactivate',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: () => undefined,
  },
  {
    name: 'ingredients.applyOverride',
    title: 'Apply a Manager+ override to an ingredient field',
    description:
      'Merge a per-field override (allergens / dietFlags / etc.) into the Ingredient with an audited reason ≥10 chars. Proxies POST /ingredients/:id/overrides?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      field: z.string(),
      value: z.unknown(),
      reason: z.string().min(10),
      actorUserId: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ingredients/:id/overrides',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: (input) => {
      const i = input as {
        field: string;
        value: unknown;
        reason: string;
        actorUserId: string;
      };
      return {
        field: i.field,
        value: i.value,
        reason: i.reason,
        actorUserId: i.actorUserId,
      };
    },
  },
  {
    name: 'ingredients.import',
    title: 'Bulk-import ingredients from CSV (UNSUPPORTED via MCP)',
    description:
      'Bulk-import ingredients from a CSV file via POST /ingredients/import (multipart/form-data). NOT yet supported via MCP — the MCP transport does not natively carry file uploads. Use the REST endpoint directly with multipart/form-data and the same `Idempotency-Key` semantics.',
    schema: {
      organizationId: z.string().uuid().optional(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ingredients/import',
    // Handler in `index.ts` short-circuits with a clear error before reaching
    // the REST client. These extractors stay in place so the entry shape is
    // identical to the others — keeps tests + tooling consistent.
    restBodyExtractor: () => undefined,
  },
];
