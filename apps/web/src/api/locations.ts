import { api } from './client';

/**
 * Sprint 3 Block B — frontend bindings for `/locations/*` (apps/api iam).
 */

export type LocationType =
  | 'RESTAURANT'
  | 'BAR'
  | 'DARK_KITCHEN'
  | 'CATERING'
  | 'CENTRAL_PRODUCTION';

export const LOCATION_TYPES: ReadonlyArray<LocationType> = [
  'RESTAURANT',
  'BAR',
  'DARK_KITCHEN',
  'CATERING',
  'CENTRAL_PRODUCTION',
] as const;

export interface LocationResponse {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  type: LocationType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationPayload {
  organizationId: string;
  name: string;
  address?: string;
  type: LocationType;
}

export interface UpdateLocationPayload {
  name?: string;
  address?: string;
  type?: LocationType;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export async function listLocations(
  organizationId: string,
  includeInactive = false,
): Promise<LocationResponse[]> {
  const q = new URLSearchParams({ organizationId });
  if (includeInactive) q.set('includeInactive', 'true');
  return api<LocationResponse[]>(`/locations?${q.toString()}`);
}

export async function createLocation(
  payload: CreateLocationPayload,
): Promise<LocationResponse> {
  const env = await api<WriteEnvelope<LocationResponse>>('/locations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return env.data;
}

export async function updateLocation(
  id: string,
  patch: UpdateLocationPayload,
): Promise<LocationResponse> {
  const env = await api<WriteEnvelope<LocationResponse>>(
    `/locations/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );
  return env.data;
}

export async function deactivateLocation(id: string): Promise<{ id: string }> {
  const env = await api<WriteEnvelope<{ id: string }>>(
    `/locations/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return env.data;
}
