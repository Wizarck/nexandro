import { useEffect, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  attachAddendum,
  dispatchIncident,
  getIncident,
  openIncident,
  redispatchIncident,
  type DispatchOutcomeResponse,
  type IncidentProjectionResponse,
  type IncidentResponse,
} from '../api/recall';

const STALE_15_S = 15_000;

/**
 * TanStack hook for `GET /m3/recall/incidents/:id`.
 *
 * Refetches every 15 s while an incident is open or has retrying
 * recipients (per j7.md "retry-status countdown polls the email-
 * dispatch job status every 5 s" — we keep the cadence laxer at 15 s
 * for the projection-as-a-whole; per-recipient polling lands when the
 * email-dispatch job table ships).
 */
export function useIncident(
  organizationId: string | null,
  incidentId: string | null,
): UseQueryResult<IncidentProjectionResponse, ApiError> {
  return useQuery<IncidentProjectionResponse, ApiError>({
    queryKey: ['recall', 'incident', organizationId, incidentId],
    queryFn: () => getIncident(organizationId as string, incidentId as string),
    enabled: Boolean(organizationId && incidentId),
    staleTime: STALE_15_S,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const hasRetry = data.recipientReceipts.some(
        (r) => r.status === 'retrying' || r.status === 'pending',
      );
      return hasRetry ? 5_000 : false;
    },
  });
}

export function useOpenIncident(): UseMutationResult<
  IncidentResponse,
  ApiError,
  {
    organizationId: string;
    lotIds: string[];
    locationIds: string[];
    recipientList: string[];
    reason?: string;
  }
> {
  return useMutation({ mutationFn: openIncident });
}

export function useDispatch86Flag(
  organizationId: string,
  incidentId: string,
): UseMutationResult<
  DispatchOutcomeResponse,
  ApiError,
  {
    recipientList: string[];
    lotIds?: string[];
    locationIds?: string[];
    subject?: string;
    bodyText?: string;
  }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      dispatchIncident(incidentId, { organizationId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['recall', 'incident', organizationId, incidentId],
      });
    },
  });
}

export function useRedispatch(
  organizationId: string,
  incidentId: string,
): UseMutationResult<
  DispatchOutcomeResponse,
  ApiError,
  { recipientList: string[] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      redispatchIncident(incidentId, { organizationId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['recall', 'incident', organizationId, incidentId],
      });
    },
  });
}

export function useAttachAddendum(
  organizationId: string,
  incidentId: string,
): UseMutationResult<
  { addendumId: string; attachedAt: string },
  ApiError,
  {
    text: string;
    attachments?: Array<{
      filename: string;
      contentType: string;
      contentBase64: string;
    }>;
  }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      attachAddendum(incidentId, { organizationId, ...input }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['recall', 'incident', organizationId, incidentId],
      });
    },
  });
}

/**
 * Live countdown to the EU 178/2002 ≤4h response deadline.
 *
 * Per j6.md: rendered with `tabular-nums` so digits don't dance. The
 * hook returns a stable formatted string; the host renders it inside
 * the action bar eyebrow.
 */
export function useCountdownToDeadline(
  legalDeadlineIso: string | null,
): { remainingMs: number; label: string; overdue: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (legalDeadlineIso === null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [legalDeadlineIso]);
  if (legalDeadlineIso === null) {
    return { remainingMs: 0, label: '', overdue: false };
  }
  const deadline = Date.parse(legalDeadlineIso);
  const remainingMs = deadline - now;
  const overdue = remainingMs <= 0;
  const abs = Math.abs(remainingMs);
  const totalSeconds = Math.floor(abs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const label = `${overdue ? '+' : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
  return { remainingMs, label, overdue };
}
