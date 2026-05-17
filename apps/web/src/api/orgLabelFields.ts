import type { LabelFieldsFormValues } from '@nexandro/ui-kit';
import { api } from './client';

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

interface LabelFieldsResponseDto extends LabelFieldsFormValues {
  organizationId: string;
}

/**
 * GET /organizations/:id/label-fields — Owner+Manager. Returns the org's
 * persisted label-rendering config minus the organizationId discriminator
 * (the consumer already has the orgId).
 */
export async function getOrgLabelFields(orgId: string): Promise<LabelFieldsFormValues> {
  const dto = await api<LabelFieldsResponseDto>(`/organizations/${orgId}/label-fields`);
  // Strip organizationId; the form values shape is org-agnostic.
  return stripOrgId(dto);
}

/**
 * PUT /organizations/:id/label-fields — Owner only. Returns the persisted
 * config wrapped in the WriteResponseDto envelope (data + missingFields +
 * nextRequired); we unwrap and discard the missingFields hint here because
 * the form has no concept of nextRequired (Article 9 mandatory-field
 * validation runs at render time per Wave 1.6 design).
 */
export async function putOrgLabelFields(
  orgId: string,
  values: LabelFieldsFormValues,
): Promise<LabelFieldsFormValues> {
  const wrap = await api<WriteEnvelope<LabelFieldsResponseDto>>(
    `/organizations/${orgId}/label-fields`,
    {
      method: 'PUT',
      body: JSON.stringify(values),
    },
  );
  return stripOrgId(wrap.data);
}

function stripOrgId(dto: LabelFieldsResponseDto): LabelFieldsFormValues {
  const out: LabelFieldsFormValues = {};
  if (dto.businessName !== undefined) out.businessName = dto.businessName;
  if (dto.contactInfo !== undefined) out.contactInfo = dto.contactInfo;
  if (dto.postalAddress !== undefined) out.postalAddress = dto.postalAddress;
  if (dto.brandMarkUrl !== undefined) out.brandMarkUrl = dto.brandMarkUrl;
  if (dto.pageSize !== undefined) out.pageSize = dto.pageSize;
  if (dto.printAdapter !== undefined) out.printAdapter = dto.printAdapter;
  return out;
}
