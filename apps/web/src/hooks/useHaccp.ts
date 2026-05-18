import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getLastOutOfSpecUnresolved,
  listCorrectiveActions,
  listReadings,
  recordReading,
  type CcpSummary,
  type CorrectiveAction,
  type LastOutOfSpecUnresolvedResponse,
  type ListCorrectiveActionsResponse,
  type ListReadingsResponse,
  type RecordReadingInput,
  type RecordReadingResponse,
} from '../api/haccp';
import { ApiError } from '../api/client';

/**
 * TanStack Query hooks for the j10 HACCP record surface (slice #10
 * m3-haccp-ui, Wave 2.6).
 *
 * Per ADR-J10-SUBMIT-WRITES-VIA-MUTATION (design.md), the mutation
 * invalidates the strip + sticky-warning query keys on success so the
 * surface reflects server truth without an optimistic update.
 *
 * `useCcps` returns a static demo list until slice #9 exposes a list
 * endpoint; the consuming surface is wired to the same shape so the
 * follow-up is a one-line swap.
 */

const STALE_30_S = 30_000;

// Per audit 2026-05-18 L0-1 + L1-2:
// - Labels follow org defaultLocale (real-kitchen Spanish).
// - Every CCP carries `dueBy` so the picker can render status — Carmen
//   needs to scan red overdue rows in 2 seconds. Times are RELATIVE to
//   load so the demo always shows variety (one overdue, one due-soon,
//   one due-later).
// - `lastReading.recordedAt` populated to demonstrate the "hace Xh" recency.
const NOW = Date.now();
const ONE_HOUR_MS = 60 * 60 * 1000;
const isoFromNow = (deltaMs: number) => new Date(NOW + deltaMs).toISOString();

const DEMO_CCPS: CcpSummary[] = [
  {
    id: 'ccp-cooling-curve',
    organizationId: 'org-demo',
    name: 'Curva de enfriamiento · cámara de entrantes',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'numeric',
    spec: { min: -2, max: 2, unit: '°C' },
    lastReading: {
      display: '1.5 °C',
      recordedAt: isoFromNow(-2 * ONE_HOUR_MS - 15 * 60_000), // hace 2h 15m
      actor: 'Carmen',
    },
    // Due-soon: within the next ~45 min.
    dueBy: isoFromNow(45 * 60_000),
  },
  {
    id: 'ccp-hot-hold',
    organizationId: 'org-demo',
    name: 'Mantenimiento en caliente · ensaladas',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'numeric',
    spec: { min: 60, max: 75, unit: '°C' },
    // Overdue 51 h — Carmen sees red.
    dueBy: isoFromNow(-51 * ONE_HOUR_MS),
  },
  {
    id: 'ccp-cleaning-fish',
    organizationId: 'org-demo',
    name: 'Limpieza · pase de pescado',
    fsmsRef: 'FSMS-2026-v2',
    inputType: 'checkbox',
    lastReading: {
      display: 'OK',
      recordedAt: isoFromNow(-6 * ONE_HOUR_MS - 30 * 60_000), // hace 6h 30m
      actor: 'Iker',
    },
    // Due in ~4h.
    dueBy: isoFromNow(4 * ONE_HOUR_MS),
  },
];

export function useCcps(organizationId: string | undefined) {
  return useQuery<CcpSummary[], ApiError>({
    queryKey: ['haccp', 'ccps', organizationId],
    enabled: typeof organizationId === 'string',
    queryFn: async () => {
      // Slice #9 follow-up: replace this with a `GET /m3/haccp/ccps`
      // call. For now, demo data scoped to organisation id.
      return DEMO_CCPS.map((c) => ({
        ...c,
        organizationId: organizationId ?? c.organizationId,
      }));
    },
    staleTime: STALE_30_S,
  });
}

export function useRecentReadings(
  organizationId: string | undefined,
  ccpId: string | null,
) {
  return useQuery<ListReadingsResponse, ApiError>({
    queryKey: ['haccp', 'recent-readings', organizationId, ccpId],
    enabled: typeof organizationId === 'string' && ccpId != null,
    queryFn: () => listReadings(organizationId!, ccpId!, 5),
    staleTime: STALE_30_S,
  });
}

export function useLastOutOfSpecUnresolved(
  organizationId: string | undefined,
  ccpId: string | null,
) {
  return useQuery<LastOutOfSpecUnresolvedResponse, ApiError>({
    queryKey: ['haccp', 'last-out-of-spec-unresolved', organizationId, ccpId],
    enabled: typeof organizationId === 'string' && ccpId != null,
    queryFn: () => getLastOutOfSpecUnresolved(organizationId!, ccpId!),
    staleTime: STALE_30_S,
    // Per ADR-J10-STICKY-WARNING-AT-MOUNT, fail open on probe error.
    retry: false,
  });
}

export function useCorrectiveActions(
  organizationId: string | undefined,
  ccpId: string | null,
) {
  return useQuery<ListCorrectiveActionsResponse, ApiError>({
    queryKey: ['haccp', 'corrective-actions', organizationId, ccpId],
    enabled: typeof organizationId === 'string' && ccpId != null,
    queryFn: () => listCorrectiveActions(organizationId!, ccpId!),
    staleTime: STALE_30_S,
  });
}

export function useRecordReading() {
  const queryClient = useQueryClient();
  return useMutation<RecordReadingResponse, ApiError, RecordReadingInput>({
    mutationFn: (input) => recordReading(input),
    onSuccess: (_data, variables) => {
      const { organizationId, ccpId } = variables;
      queryClient.invalidateQueries({
        queryKey: ['haccp', 'recent-readings', organizationId, ccpId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          'haccp',
          'last-out-of-spec-unresolved',
          organizationId,
          ccpId,
        ],
      });
    },
  });
}

// Re-exports for screen consumption.
export type { CcpSummary, CorrectiveAction };
