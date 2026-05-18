import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { getDashboardKpis, type DashboardKpis } from '../api/dashboardKpis';

const STALE_60_S = 60_000;

export function useDashboardKpis(orgId: string | undefined, windowDays = 7) {
  return useQuery<DashboardKpis, ApiError>({
    queryKey: ['dashboard', 'kpis', orgId, windowDays],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getDashboardKpis(orgId, windowDays);
    },
    enabled: !!orgId,
    staleTime: STALE_60_S,
  });
}
