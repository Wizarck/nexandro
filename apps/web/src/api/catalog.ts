import { api } from './client';

/**
 * Sprint 3 Block B — frontend bindings for the catálogo:
 *   - `/categories/*` (ingredients module, mutable)
 *   - `/uom`           (read-only canonical registry)
 */

// ----------------------------------------------------------------------------
// Categories
// ----------------------------------------------------------------------------

export interface CategoryResponse {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  nameEs: string;
  nameEn: string;
  sortOrder: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryPayload {
  organizationId: string;
  parentId?: string | null;
  name: string;
  nameEs: string;
  nameEn: string;
  sortOrder?: number;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export async function listCategoryTree(organizationId: string): Promise<CategoryResponse[]> {
  const q = new URLSearchParams({ organizationId });
  return api<CategoryResponse[]>(`/categories/tree?${q.toString()}`);
}

export async function createCategory(payload: CreateCategoryPayload): Promise<CategoryResponse> {
  const env = await api<WriteEnvelope<CategoryResponse>>('/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return env.data;
}

export async function deleteCategory(id: string): Promise<{ id: string }> {
  const env = await api<WriteEnvelope<{ id: string }>>(
    `/categories/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return env.data;
}

// ----------------------------------------------------------------------------
// UoM
// ----------------------------------------------------------------------------

export type UoMFamily = 'WEIGHT' | 'VOLUME' | 'UNIT';

export interface UoMDefinition {
  code: string;
  label: string;
  family: UoMFamily;
  factor: number;
}

export async function listUoms(): Promise<UoMDefinition[]> {
  return api<UoMDefinition[]>('/uom');
}
