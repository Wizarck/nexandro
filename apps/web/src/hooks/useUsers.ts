import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import {
  createUser,
  listUsers,
  type CreateUserPayload,
  type UserResponse,
} from '../api/users';

const key = (orgId: string | undefined): readonly unknown[] => ['users', orgId];

export function useUsersQuery(orgId: string | undefined) {
  return useQuery<UserResponse[], ApiError>({
    queryKey: key(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return listUsers(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

/**
 * "Invite" today is "provision" — see api/users.ts comment for the R8
 * trade-off. The caller is expected to surface the provisional password
 * back to the Owner so they can share it out-of-band.
 */
export function useInviteUserMutation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<UserResponse, ApiError, Omit<CreateUserPayload, 'organizationId'>>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return createUser({ ...payload, organizationId: orgId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(orgId) });
    },
  });
}
