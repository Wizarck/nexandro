import type { ReverseAnchorKind, TraceNode } from '@nexandro/ui-kit';
import { api } from './client';

/**
 * REST client for the Recall trace surface (M3 Wave 2.5 slice #12).
 *
 * Endpoints:
 *   GET /m3/recall/trace/forward?organizationId=…&lotId=…
 *   GET /m3/recall/trace/reverse?organizationId=…&anchorId=…&anchorKind=…
 *
 * Both endpoints require OWNER or MANAGER role (enforced server-side
 * by `@Roles('OWNER','MANAGER')`).
 */

export async function getForwardTrace(
  organizationId: string,
  lotId: string,
): Promise<TraceNode> {
  const params = new URLSearchParams({ organizationId, lotId });
  return api<TraceNode>(`/m3/recall/trace/forward?${params.toString()}`);
}

export async function getReverseTrace(
  organizationId: string,
  anchorId: string,
  anchorKind: ReverseAnchorKind,
): Promise<TraceNode> {
  const params = new URLSearchParams({
    organizationId,
    anchorId,
    anchorKind,
  });
  return api<TraceNode>(`/m3/recall/trace/reverse?${params.toString()}`);
}
