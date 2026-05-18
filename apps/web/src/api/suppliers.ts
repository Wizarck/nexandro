import { api } from './client';

/**
 * Sprint 4 W1-A — frontend bindings for `/suppliers/*` (apps/api suppliers).
 *
 * Backend reality (suppliers.controller.ts + supplier.dto.ts):
 *   - Supplier fields: name, country (ISO alpha-2, required), contactName,
 *     email, phone. No CIF/VAT field — surface contactName/email/phone instead;
 *     CIF is a followup once backend grows the column.
 *   - GET /suppliers returns a flat array (NOT cursor-paginated).
 *   - DELETE is soft (isActive=false).
 */

export interface SupplierResponse {
  id: string;
  organizationId: string;
  name: string;
  country: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierPayload {
  organizationId: string;
  name: string;
  country: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export interface UpdateSupplierPayload {
  name?: string;
  country?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export async function listSuppliers(
  organizationId: string,
  includeInactive = false,
): Promise<SupplierResponse[]> {
  const q = new URLSearchParams({ organizationId });
  if (includeInactive) q.set('includeInactive', 'true');
  return api<SupplierResponse[]>(`/suppliers?${q.toString()}`);
}

export async function createSupplier(
  payload: CreateSupplierPayload,
): Promise<SupplierResponse> {
  const env = await api<WriteEnvelope<SupplierResponse>>('/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return env.data;
}

export async function updateSupplier(
  id: string,
  patch: UpdateSupplierPayload,
): Promise<SupplierResponse> {
  const env = await api<WriteEnvelope<SupplierResponse>>(
    `/suppliers/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return env.data;
}

export async function deactivateSupplier(id: string): Promise<{ id: string }> {
  const env = await api<WriteEnvelope<{ id: string }>>(
    `/suppliers/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return env.data;
}
