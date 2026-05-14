import { api } from '../../../api/client';
import type {
  CostByTagResponse,
  FailureRange,
  FailuresResponse,
  OverviewResponse,
  Period,
} from './aiObs.types';

/**
 * Fetch wrappers for the 3 AI Observability dashboard endpoints. Each
 * wrapper produces a query-string URL and delegates to the shared
 * `api<T>()` client.
 *
 * Per ADR-BACKEND-READ-ONLY (slice #20 m3-ai-obs-ui, Wave 2.4), the
 * client only issues GET requests; no PUT/POST/DELETE paths exist.
 */

export interface AppliedAiObsFilter {
  organizationId: string;
  period: Period;
}

export interface AppliedFailuresFilter {
  organizationId: string;
  range: FailureRange;
}

function buildQuery(params: Record<string, string>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qs.set(k, v);
  }
  return qs.toString();
}

export async function getOverview(
  filter: AppliedAiObsFilter,
): Promise<OverviewResponse> {
  const qs = buildQuery({
    organizationId: filter.organizationId,
    period: filter.period,
  });
  return api<OverviewResponse>(`/m3/ai-obs/overview?${qs}`);
}

export async function getCostByTag(
  filter: AppliedAiObsFilter,
): Promise<CostByTagResponse> {
  const qs = buildQuery({
    organizationId: filter.organizationId,
    period: filter.period,
  });
  return api<CostByTagResponse>(`/m3/ai-obs/cost-by-tag?${qs}`);
}

export async function getFailures(
  filter: AppliedFailuresFilter,
): Promise<FailuresResponse> {
  const qs = buildQuery({
    organizationId: filter.organizationId,
    range: filter.range,
  });
  return api<FailuresResponse>(`/m3/ai-obs/failures?${qs}`);
}
