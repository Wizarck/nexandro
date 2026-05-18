import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  bulkConfirmGoodsReceipts,
  cancelPurchaseOrder,
  closePurchaseOrder,
  confirmGoodsReceiptLine,
  getGoodsReceiptDetail,
  getGoodsReceipts,
  getPurchaseOrderById,
  getPurchaseOrders,
  getReconciliations,
  resolveReconciliation,
  type BulkConfirmGrPayload,
  type BulkConfirmGrResponse,
  type ConfirmGrLineInput,
  type GrDetail,
  type GrListFilters,
  type GrListResponse,
  type PoDetail,
  type PoListResponse,
  type ReconciliationListItem,
  type ReconciliationListResponse,
  type ResolveReconciliationPayload,
} from '../api/procurement';

const STALE_30_S = 30_000;

/**
 * TanStack queries for the j11 Procurement shell (Sprint 3 Block C).
 * SHELL ONLY — no mutations, no drawer detail, no pagination. The
 * hooks short-circuit when `orgId` is missing so the screen can render
 * its signed-out fallback without firing requests.
 */

export function usePurchaseOrders(orgId: string | undefined) {
  return useQuery<PoListResponse, ApiError>({
    queryKey: ['procurement', 'po', orgId],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getPurchaseOrders(orgId);
    },
    enabled: !!orgId,
    staleTime: STALE_30_S,
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
 * Sprint 4 W3-2 — per-line confirm mutation. The backend endpoint is a
 * documented followup (`GrConfirmationService` only handles full-GR
 * confirmation today); the hook is wired so the UI can call it,
 * surface the rejection, and the moment the backend lands the only
 * change required is removing the stub throw in `procurement.ts`.
 * Invalidates BOTH the GR list and the open-GR detail on success so
 * the dock view stays in sync with the just-confirmed line.
 */
export function useConfirmGrLine(
  orgId: string | undefined,
  grId: string | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { lineId: string; input: ConfirmGrLineInput }
  >({
    mutationFn: ({ lineId, input }) => {
      if (!orgId || !grId) {
        return Promise.reject(new Error('orgId + grId required'));
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

export function useReconciliation(orgId: string | undefined) {
  return useQuery<ReconciliationListResponse, ApiError>({
    queryKey: ['procurement', 'reconciliation', orgId],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getReconciliations(orgId);
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
    },
  });
}
