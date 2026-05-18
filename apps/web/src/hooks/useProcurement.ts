import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  cancelPurchaseOrder,
  closePurchaseOrder,
  getGoodsReceipts,
  getPurchaseOrderById,
  getPurchaseOrders,
  getReconciliations,
  resolveReconciliation,
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
