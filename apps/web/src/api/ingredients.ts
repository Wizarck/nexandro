import { api } from './client';

/**
 * Sprint 4 W1-A — frontend bindings for `/ingredients/*` (apps/api ingredients).
 *
 * Backend reality (ingredients.controller.ts + ingredient.dto.ts):
 *   - GET /ingredients returns `{ items, nextCursor }` (cursor-paginated). The
 *     Settings list surface pages through it; the existing tiny
 *     `useIngredients` hook in `hooks/useIngredients.ts` is a J1 RecipeBuilder
 *     search shim that does NOT match this shape (followup to reconcile).
 *   - CREATE requires `categoryId` (UUID) + `baseUnitType` (WEIGHT|VOLUME|UNIT).
 *     `baseUnitType` is immutable post-creation.
 *   - DELETE is soft (isActive=false).
 */

export type BaseUnitType = 'WEIGHT' | 'VOLUME' | 'UNIT';

export const BASE_UNIT_TYPES: ReadonlyArray<BaseUnitType> = [
  'WEIGHT',
  'VOLUME',
  'UNIT',
] as const;

export interface IngredientResponse {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  internalCode: string;
  baseUnitType: BaseUnitType;
  densityFactor: number | null;
  notes: string | null;
  isActive: boolean;
  allergens: string[];
  dietFlags: string[];
  brandName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIngredientPayload {
  organizationId: string;
  categoryId: string;
  name: string;
  baseUnitType: BaseUnitType;
  internalCode?: string;
  notes?: string;
}

export interface UpdateIngredientPayload {
  categoryId?: string;
  name?: string;
  internalCode?: string;
  notes?: string | null;
}

interface PageEnvelope<T> {
  items: T[];
  nextCursor: string | null;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

/**
 * Pages through the cursor-paginated /ingredients endpoint until exhausted.
 * Settings surfaces show all ingredients (typical SMB scale: dozens-to-hundreds);
 * once an org grows past a few hundred we'll move to true paged UI as followup.
 */
export async function listIngredients(
  organizationId: string,
  includeInactive = false,
): Promise<IngredientResponse[]> {
  const all: IngredientResponse[] = [];
  let cursor: string | null = null;
  // Hard cap to avoid runaway loops if the cursor ever fails to terminate.
  for (let i = 0; i < 50; i += 1) {
    const q = new URLSearchParams({ organizationId });
    if (includeInactive) q.set('includeInactive', 'true');
    if (cursor) q.set('cursor', cursor);
    const page: PageEnvelope<IngredientResponse> = await api<
      PageEnvelope<IngredientResponse>
    >(`/ingredients?${q.toString()}`);
    all.push(...page.items);
    if (!page.nextCursor) return all;
    cursor = page.nextCursor;
  }
  return all;
}

export async function createIngredient(
  payload: CreateIngredientPayload,
): Promise<IngredientResponse> {
  const env = await api<WriteEnvelope<IngredientResponse>>('/ingredients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return env.data;
}

export async function updateIngredient(
  id: string,
  patch: UpdateIngredientPayload,
): Promise<IngredientResponse> {
  const env = await api<WriteEnvelope<IngredientResponse>>(
    `/ingredients/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return env.data;
}

export async function deactivateIngredient(id: string): Promise<{ id: string }> {
  const env = await api<WriteEnvelope<{ id: string }>>(
    `/ingredients/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return env.data;
}
