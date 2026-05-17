import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { DashboardMenuItem } from '@nexandro/ui-kit';

export interface RankingResult {
  organizationId: string;
  windowDays: number;
  direction: 'top' | 'bottom';
  incomplete: boolean;
  items: DashboardMenuItem[];
}

export function useDashboardMenuItems(
  organizationId: string | undefined,
  direction: 'top' | 'bottom',
  windowDays = 7,
) {
  return useQuery<RankingResult>({
    queryKey: ['dashboard-menu-items', organizationId, direction, windowDays],
    queryFn: async () => {
      if (!organizationId) throw new Error('organizationId required');
      const qs = new URLSearchParams({
        organizationId,
        direction,
        windowDays: String(windowDays),
      });
      return api<RankingResult>(`/dashboard/menu-items?${qs.toString()}`);
    },
    enabled: !!organizationId,
  });
}
