import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Recipe write capabilities — mirrors apps/api `RecipesController` +
 * `RecipesAllergensController` 1:1.
 *
 * Endpoints:
 *   recipes.create               → POST   /recipes
 *   recipes.update               → PUT    /recipes/:id?organizationId=
 *   recipes.setLineSource        → PUT    /recipes/:id/lines/:lineId/source?organizationId=
 *   recipes.delete               → DELETE /recipes/:id?organizationId=
 *   recipes.setAllergensOverride → PUT    /recipes/:id/allergens-override?organizationId=
 *   recipes.setDietFlagsOverride → PUT    /recipes/:id/diet-flags-override?organizationId=
 *   recipes.setCrossContamination → PUT   /recipes/:id/cross-contamination?organizationId=
 */

const idempotencyKey = z.string().optional();

const createRecipeLine = z.object({
  ingredientId: z.string().uuid().nullable().optional(),
  subRecipeId: z.string().uuid().nullable().optional(),
  quantity: z.number().min(0.0001),
  unitId: z.string().min(1).max(16),
  yieldPercentOverride: z.number().min(0).max(1).nullable().optional(),
  sourceOverrideRef: z.string().max(200).nullable().optional(),
});

export const RECIPES_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'recipes.create',
    title: 'Create a recipe',
    description:
      'Create a new Recipe with composition lines. Proxies POST /recipes on the nexandro REST API.',
    schema: {
      organizationId: z.string().uuid(),
      name: z.string().min(1).max(200),
      description: z.string(),
      notes: z.string().nullable().optional(),
      wasteFactor: z.number().min(0).max(0.999),
      lines: z.array(createRecipeLine),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/recipes',
  },
  {
    name: 'recipes.update',
    title: 'Update a recipe',
    description:
      'Update a Recipe (renames + replaces lines + re-runs cycle detection). Proxies PUT /recipes/:id?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      notes: z.string().nullable().optional(),
      wasteFactor: z.number().min(0).max(0.999).optional(),
      lines: z.array(createRecipeLine).optional(),
      idempotencyKey,
    },
    restMethod: 'PUT',
    restPathTemplate: '/recipes/:id',
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
    name: 'recipes.setLineSource',
    title: 'Override the cost source for a recipe line',
    description:
      'Override the cost source for a single RecipeIngredient line. Proxies PUT /recipes/:id/lines/:lineId/source?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      lineId: z.string().uuid(),
      sourceOverrideRef: z.string().max(200).nullable(),
      idempotencyKey,
    },
    restMethod: 'PUT',
    restPathTemplate: '/recipes/:id/lines/:lineId/source',
    restPathParams: (input) => {
      const i = input as { id: string; lineId: string };
      return { id: i.id, lineId: i.lineId };
    },
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: (input) => ({
      sourceOverrideRef: (input as { sourceOverrideRef: string | null })
        .sourceOverrideRef,
    }),
  },
  {
    name: 'recipes.delete',
    title: 'Soft-delete a recipe',
    description:
      'Soft-delete a Recipe (sets isActive=false). Proxies DELETE /recipes/:id?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      idempotencyKey,
    },
    restMethod: 'DELETE',
    restPathTemplate: '/recipes/:id',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: () => undefined,
  },
  {
    name: 'recipes.setAllergensOverride',
    title: 'Override the recipe allergen rollup',
    description:
      'Apply a Manager+ override to the aggregated allergen list (final = aggregated ∪ add − remove). Proxies PUT /recipes/:id/allergens-override?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      add: z.array(z.string()),
      remove: z.array(z.string()),
      reason: z.string().min(1),
      idempotencyKey,
    },
    restMethod: 'PUT',
    restPathTemplate: '/recipes/:id/allergens-override',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: (input) => {
      const i = input as {
        add: string[];
        remove: string[];
        reason: string;
      };
      return { add: i.add, remove: i.remove, reason: i.reason };
    },
  },
  {
    name: 'recipes.setDietFlagsOverride',
    title: 'Override the recipe diet-flag rollup',
    description:
      'Apply a Manager+ override to the inferred diet-flag set (replaces wholesale). Proxies PUT /recipes/:id/diet-flags-override?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      flags: z.array(z.string()),
      reason: z.string().min(1),
      idempotencyKey,
    },
    restMethod: 'PUT',
    restPathTemplate: '/recipes/:id/diet-flags-override',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: (input) => {
      const i = input as { flags: string[]; reason: string };
      return { flags: i.flags, reason: i.reason };
    },
  },
  {
    name: 'recipes.setCrossContamination',
    title: 'Record cross-contamination for a recipe',
    description:
      'Record cross-contamination ("may contain traces of [X]") for a Recipe. Both free-text note and structured allergen tags are required. Proxies PUT /recipes/:id/cross-contamination?organizationId=.',
    schema: {
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      note: z.string().min(1),
      allergens: z.array(z.string()),
      idempotencyKey,
    },
    restMethod: 'PUT',
    restPathTemplate: '/recipes/:id/cross-contamination',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restQueryExtractor: (input) => ({
      organizationId: (input as { organizationId: string }).organizationId,
    }),
    restBodyExtractor: (input) => {
      const i = input as { note: string; allergens: string[] };
      return { note: i.note, allergens: i.allergens };
    },
  },
];
