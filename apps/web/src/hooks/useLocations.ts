import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  createLocation,
  deactivateLocation,
  listLocations,
  updateLocation,
  type CreateLocationPayload,
  type LocationResponse,
  type UpdateLocationPayload,
} from '../api/locations';

const key = (orgId: string | undefined): readonly unknown[] => ['locations', orgId];

export function useLocationsQuery(orgId: string | undefined) {
  return useQuery<LocationResponse[], ApiError>({
    queryKey: key(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return listLocations(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCreateLocationMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<LocationResponse, ApiError, Omit<CreateLocationPayload, 'organizationId'>>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return createLocation({ ...payload, organizationId: orgId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}

export function useUpdateLocationMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<LocationResponse, ApiError, { id: string; patch: UpdateLocationPayload }>({
    mutationFn: ({ id, patch }) => updateLocation(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}

export function useDeleteLocationMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<{ id: string }, ApiError, string>({
    mutationFn: deactivateLocation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}
