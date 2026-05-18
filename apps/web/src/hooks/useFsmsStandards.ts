import { useQuery } from '@tanstack/react-query';
import type { ApiError } from '../api/client';
import { listFsmsStandards, type FsmsStandardResponse } from '../api/fsmsStandards';

const key = (orgId: string | undefined): readonly unknown[] => [
  'fsmsStandards',
  orgId,
];

export function useFsmsStandardsQuery(orgId: string | undefined) {
  return useQuery<FsmsStandardResponse[], ApiError>({
    queryKey: key(orgId),
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return listFsmsStandards(orgId);
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}
