import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import {
  getGoodsReceipts,
  getPurchaseOrders,
  getReconciliations,
  type GrListResponse,
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
