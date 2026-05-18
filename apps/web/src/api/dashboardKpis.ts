import { api } from './client';

export interface KpiMoney {
  valueEur: number | null;
  note?: string;
}

export interface KpiPct {
  value: number | null;
}

export interface DashboardKpis {
  organizationId: string;
  windowDays: number;
  hasMenuItems: boolean;
  sales: KpiMoney;
  cost: KpiMoney;
  marginEur: KpiMoney;
  marginPct: KpiPct;
  deltaVsPrev: null;
}

export async function getDashboardKpis(
  organizationId: string,
  windowDays = 7,
): Promise<DashboardKpis> {
  const params = new URLSearchParams({
    organizationId,
    windowDays: String(windowDays),
  });
  return api<DashboardKpis>(`/dashboard/kpis?${params.toString()}`);
}
