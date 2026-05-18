import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  bulkConfirmGoodsReceipts,
  cancelPurchaseOrder,
  closePurchaseOrder,
  confirmGoodsReceiptLine,
  createPurchaseOrder,
  getGoodsReceiptDetail,
  getGoodsReceipts,
  getProcurementCounts,
  getPurchaseOrderById,
  getPurchaseOrders,
  getReconciliations,
  resolveReconciliation,
  type BulkConfirmGrPayload,
  type BulkConfirmGrResponse,
  type ConfirmGrLineInput,
  type CreatePoPayload,
  type GrDetail,
  type GrListFilters,
  type GrListResponse,
  type PoDetail,
  type PoListFilters,
  type PoListResponse,
  type ProcurementCounts,
  type ReconciliationListFilters,
  type ReconciliationListItem,
  type ReconciliationListResponse,
  type ResolveReconciliationPayload,
} from '../api/procurement';
import { enqueue as enqueueOfflineAction } from '../lib/offlineQueue';

const STALE_30_S = 30_000;

/**
 * TanStack queries for the j11 Procurement shell (Sprint 3 Block C).
 * SHELL ONLY — no mutations, no drawer detail, no pagination. The
 * hooks short-circuit when `orgId` is missing so the screen can render
 * its signed-out fallback without firing requests.
 */

/**
 * Sprint 4 W3-9 — filter chips. Filters are folded into the query key so
 * each chip combination keeps its own cache entry; switching chips
 * therefore refetches without invalidating the prior view.
 */
export function usePurchaseOrders(
  orgId: string | undefined,
  filters: PoListFilters = {},
) {
  return useQuery<PoListResponse, ApiError>({
    queryKey: ['procurement', 'po', orgId, filters],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getPurchaseOrders(orgId, filters);
    },
    enabled: !!orgId,
    staleTime: STALE_30_S,
  });
}

/**
 * Sprint 4 W3-11 — Nueva OC mutation. On success we invalidate every
 * PO list cache entry (any filter combination) so the new PO surfaces
 * regardless of which chip set the operator is currently viewing.
 */
export function useCreatePurchaseOrder(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<PoDetail, ApiError, CreatePoPayload>({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return createPurchaseOrder(orgId, payload);
    },
    onSuccess: (detail) => {
      qc.invalidateQueries({ queryKey: ['procurement', 'po', orgId] });
      // Pre-warm the detail query cache so opening the new PO's drawer
      // skips the round-trip.
      qc.setQueryData(['procurement', 'po', orgId, detail.id], detail);
    },
  });
}

/**
 * PO detail (Sprint 4 W3-1) — owns its own fetch so the drawer can mount
 * independently of the list. Returns null query if id is missing.
 */
export function usePurchaseOrder(
  orgId: string | undefined,
  id: string | null,
) {
  return useQuery<PoDetail, ApiError>({
    queryKey: ['procurement', 'po', orgId, id],
    queryFn: () => {
      if (!orgId || !id) throw new Error('orgId+id required');
      return getPurchaseOrderById(orgId, id);
    },
    enabled: !!orgId && !!id,
    staleTime: STALE_30_S,
  });
}

export function useCancelPo(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<PoDetail, ApiError, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => {
      if (!orgId) throw new Error('orgId required');
      return cancelPurchaseOrder(orgId, id, reason);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['procurement', 'po', orgId] });
      qc.invalidateQueries({ queryKey: ['procurement', 'po', orgId, vars.id] });
    },
  });
}

export function useClosePo(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<PoDetail, ApiError, { id: string }>({
    mutationFn: ({ id }) => {
      if (!orgId) throw new Error('orgId required');
      return closePurchaseOrder(orgId, id);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['procurement', 'po', orgId] });
      qc.invalidateQueries({ queryKey: ['procurement', 'po', orgId, vars.id] });
    },
  });
}

/**
 * Sprint 4 W3-9 — filtered GR list. `filters` is part of the cache
 * key so two tabs viewing the same org with different chip selections
 * share neither cache nor in-flight requests. The hook is backwards-
 * compatible: callers that don't pass `filters` (Sprint 3 shell path)
 * get the unfiltered most-recent-50 surface unchanged.
 */
export function useGoodsReceipts(
  orgId: string | undefined,
  filters: GrListFilters = {},
) {
  return useQuery<GrListResponse, ApiError>({
    queryKey: ['procurement', 'gr', orgId, filters],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getGoodsReceipts(orgId, filters);
    },
    enabled: !!orgId,
    staleTime: STALE_30_S,
  });
}

/**
 * Sprint 4 W3-3 — bulk-confirm wrapper. The hook calls the (currently
 * NOT-wired) `POST /m3/procurement/gr/bulk-confirm` endpoint; on the
 * 404 the GR tab surfaces the "pendiente de wiring" banner so the
 * dock operator gets explicit feedback instead of a silent no-op.
 * Cache invalidation matches the per-line confirm hook so a successful
 * batch refreshes both the list and any open detail drawer.
 */
export function useBulkConfirmGoodsReceipts(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    BulkConfirmGrResponse,
    ApiError,
    BulkConfirmGrPayload
  >({
    mutationFn: (payload) => {
      if (!orgId) throw new Error('orgId required');
      return bulkConfirmGoodsReceipts(orgId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procurement', 'gr', orgId] });
    },
  });
}

/**
 * Sprint 4 W3-2 — single-GR detail for the dock drawer (j11 §5).
 * Short-circuits when `orgId` or `grId` is missing so the screen can mount
 * the drawer container conditionally without firing requests.
 */
export function useGoodsReceipt(
  orgId: string | undefined,
  grId: string | undefined,
) {
  return useQuery<GrDetail, ApiError>({
    queryKey: ['procurement', 'gr', orgId, 'detail', grId],
    queryFn: () => {
      if (!orgId || !grId) throw new Error('orgId + grId required');
      return getGoodsReceiptDetail(orgId, grId);
    },
    enabled: !!orgId && !!grId,
    staleTime: STALE_30_S,
  });
}

/**
 * Sprint 4 W3-13 — queue-action discriminator + payload shape used by
 * the offline replay handler. Kept narrow on purpose: the only action
 * the GR dock queues today is per-line confirm; if/when bulk-confirm
 * is added the type union grows here.
 */
export const GR_CONFIRM_ACTION_TYPE = 'procurement.gr.confirmLine';

export interface QueuedGrConfirmPayload {
  grId: string;
  lineId: string;
  input: ConfirmGrLineInput;
}

/**
 * Sprint 4 W3-2 — per-line confirm mutation. The backend endpoint is a
 * documented followup (`GrConfirmationService` only handles full-GR
 * confirmation today); the hook is wired so the UI can call it,
 * surface the rejection, and the moment the backend lands the only
 * change required is removing the stub throw in `procurement.ts`.
 * Invalidates BOTH the GR list and the open-GR detail on success so
 * the dock view stays in sync with the just-confirmed line.
 *
 * Sprint 4 W3-13 — offline-aware. When `navigator.onLine === false`
 * at submit time we enqueue the action into the per-org IndexedDB
 * queue (see `lib/offlineQueue`) and resolve with a synthetic
 * `{ queued: true }` envelope so the optimistic UI can advance. The
 * GrTab banner picks up the queued count from `useOfflineStatus` and
 * shows "Modo offline · N confirmaciones en cola"; `flushGrConfirmQueue`
 * (called from the banner's reconnect effect) replays the queue
 * sequentially.
 */
export interface OfflineQueuedAck {
  queued: true;
}

export function useConfirmGrLine(
  orgId: string | undefined,
  grId: string | undefined,
  options?: { onQueued?: () => void },
) {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { lineId: string; input: ConfirmGrLineInput }
  >({
    mutationFn: async ({ lineId, input }) => {
      if (!orgId || !grId) {
        throw new Error('orgId + grId required');
      }
      // Offline path — enqueue + return synthetic ack. We deliberately
      // do NOT throw: a thrown mutation surfaces as `error` in the UI,
      // which would block the operator from progressing to the next
      // line. Instead we resolve with `{ queued: true }` and let the
      // GR tab banner inform them the row is queued.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const payload: QueuedGrConfirmPayload = { grId, lineId, input };
        await enqueueOfflineAction({
          orgId,
          type: GR_CONFIRM_ACTION_TYPE,
          payload,
          createdAt: Date.now(),
        });
        options?.onQueued?.();
        const ack: OfflineQueuedAck = { queued: true };
        return ack;
      }
      return confirmGoodsReceiptLine(orgId, grId, lineId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'gr', orgId] });
      queryClient.invalidateQueries({
        queryKey: ['procurement', 'gr', orgId, 'detail', grId],
      });
    },
  });
}

/**
 * Sprint 4 W3-13 — flush helper used by the GrTab reconnect effect.
 * Replays every queued GR-confirm action for `orgId` against the real
 * backend endpoint. Failures stay in the queue for the next attempt
 * (see `offlineQueue.flush` docstring). On flush completion the caller
 * is expected to invalidate the GR list/detail caches so the freshly
 * persisted confirmations surface.
 */
export async function flushGrConfirmQueue(orgId: string) {
  const { flush } = await import('../lib/offlineQueue');
  return flush(orgId, async (action) => {
    if (action.type !== GR_CONFIRM_ACTION_TYPE) {
      // Foreign actions are ignored (and intentionally NOT removed) so
      // a future action type can be replayed by its own handler.
      throw new Error(`unhandled action type: ${action.type}`);
    }
    const payload = action.payload as QueuedGrConfirmPayload;
    await confirmGoodsReceiptLine(
      action.orgId,
      payload.grId,
      payload.lineId,
      payload.input,
    );
  });
}

export function useReconciliation(
  orgId: string | undefined,
  filters: ReconciliationListFilters = {},
) {
  // Cache key includes filters so each chip combination is its own
  // cache entry. Sort to keep key stable when callers pass arrays in
  // a different order (e.g. set-iteration vs sorted UI state).
  const states = [...(filters.states ?? [])].sort();
  const discrepancyTypes = [...(filters.discrepancyTypes ?? [])].sort();
  const supplierIds = [...(filters.supplierIds ?? [])].sort();
  return useQuery<ReconciliationListResponse, ApiError>({
    queryKey: [
      'procurement',
      'reconciliation',
      orgId,
      { states, discrepancyTypes, supplierIds },
    ],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getReconciliations(orgId, {
        states: states.length > 0 ? states : undefined,
        discrepancyTypes:
          discrepancyTypes.length > 0 ? discrepancyTypes : undefined,
        supplierIds: supplierIds.length > 0 ? supplierIds : undefined,
      });
    },
    enabled: !!orgId,
    staleTime: STALE_30_S,
  });
}

/**
 * Sprint 4 W3-10 — tab counters. One light call surfaces the 3 counts
 * the ProcurementScreen header chips need. Stale time matches the list
 * queries; resolves cascade-invalidate the count via the mutation
 * `onSuccess` below.
 */
export function useProcurementCounts(orgId: string | undefined) {
  return useQuery<ProcurementCounts, ApiError>({
    queryKey: ['procurement', 'counts', orgId],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getProcurementCounts(orgId);
    },
    enabled: !!orgId,
    staleTime: STALE_30_S,
  });
}

/**
 * Mutation wrapping `POST /m3/procurement/reconciliation/:id/resolve`
 * for the j11 resolution drawer (Sprint 4 W3-6). On success we
 * invalidate the reconciliation list so the row's state badge + the
 * empty-state count refresh without a full reload.
 */
export function useResolveReconciliation(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    ReconciliationListItem,
    ApiError,
    { id: string; payload: ResolveReconciliationPayload }
  >({
    mutationFn: ({ id, payload }) => {
      if (!orgId) throw new Error('orgId required');
      return resolveReconciliation(orgId, id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['procurement', 'reconciliation', orgId],
      });
      // W3-10: resolving a reconciliation drops it out of the "abierta"
      // count, so the tab counter chip needs a refresh too.
      qc.invalidateQueries({
        queryKey: ['procurement', 'counts', orgId],
      });
    },
  });
}
