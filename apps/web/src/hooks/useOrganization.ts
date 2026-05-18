import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  getOrganization,
  putOrganization,
  type OrganizationDto,
  type UpdateOrganizationDto,
} from '../api/organization';

const STALE_5_MIN = 5 * 60 * 1000;

export function useOrganizationQuery(orgId: string | undefined) {
  return useQuery<OrganizationDto, ApiError>({
    queryKey: ['organization', orgId],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getOrganization(orgId);
    },
    enabled: !!orgId,
    staleTime: STALE_5_MIN,
  });
}

export function useOrganizationMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<OrganizationDto, ApiError, UpdateOrganizationDto>({
    mutationFn: (patch) => {
      if (!orgId) throw new Error('orgId required');
      return putOrganization(orgId, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization', orgId] });
    },
  });
}
