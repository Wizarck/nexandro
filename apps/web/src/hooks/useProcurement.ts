import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  getGoodsReceipts,
  getPurchaseOrderById,
  getPurchaseOrders,
  getReconciliations,
  type GrListResponse,
  type PoDetail,
  type PoListResponse,
  type ReconciliationListResponse,
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

export function useGoodsReceipts(orgId: string | undefined) {
  return useQuery<GrListResponse, ApiError>({
    queryKey: ['procurement', 'gr', orgId],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      return getGoodsReceipts(orgId);
    },
    enabled: !!orgId,
    staleTime: STALE_30_S,
  });
}

/**
 * Single PO detail for the j11 drawer (Sprint 4 W3-1). Disabled when
 * either `orgId` or `id` is missing so the drawer can mount in a
 * `selectedId === null` state without firing a request.
 */
export function usePurchaseOrder(
  orgId: string | undefined,
  id: string | null | undefined,
) {
  return useQuery<PoDetail, ApiError>({
    queryKey: ['procurement', 'po', orgId, id],
    queryFn: () => {
      if (!orgId) throw new Error('orgId required');
      if (!id) throw new Error('id required');
      return getPurchaseOrderById(orgId, id);
    },
    enabled: !!orgId && !!id,
    staleTime: STALE_30_S,
  });
}

/**
 * Cancel a PO (j11 W3-1). On success, invalidates both the active PO
 * list query and the detail query for this id so the drawer + table
 * refetch the new state badge.
 */
export function useCancelPurchaseOrder(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<PoDetail, ApiError, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => {
      if (!orgId) throw new Error('orgId required');
      return cancelPurchaseOrder(orgId, id, reason);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['procurement', 'po', orgId] });
      qc.invalidateQueries({
        queryKey: ['procurement', 'po', orgId, vars.id],
      });
    },
  });
}

/**
 * Close a PO (j11 W3-1). Same invalidation pattern as cancel.
 */
export function useClosePurchaseOrder(orgId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<PoDetail, ApiError, { id: string }>({
    mutationFn: ({ id }) => {
      if (!orgId) throw new Error('orgId required');
      return closePurchaseOrder(orgId, id);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['procurement', 'po', orgId] });
      qc.invalidateQueries({
        queryKey: ['procurement', 'po', orgId, vars.id],
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
