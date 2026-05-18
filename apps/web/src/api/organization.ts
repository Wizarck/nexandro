import { api } from './client';

/**
 * Subset of the Organization entity the Settings shell needs. Mirrors the
 * apps/api response shape — extend as new fields land (fiscal identity,
 * DPO, retention).
 */
export interface OrganizationDto {
  id: string;
  name: string;
  currencyCode: string;
  defaultLocale: string;
  timezone: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  defaultLocale?: string;
  timezone?: string;
}

export async function getOrganization(orgId: string): Promise<OrganizationDto> {
  return api<OrganizationDto>(`/organizations/${orgId}`);
}

// apps/api uses PATCH (not PUT) for partial org updates per
// OrganizationController, and returns the WriteResponseDto<T> envelope
// (data + missingFields + nextRequired). We unwrap to the bare DTO here
// since the Settings shell doesn't surface the missing-fields hint.
interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export async function putOrganization(
  orgId: string,
  patch: UpdateOrganizationDto,
): Promise<OrganizationDto> {
  const env = await api<WriteEnvelope<OrganizationDto>>(`/organizations/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return env.data;
}
