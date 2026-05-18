import { api } from './client';

/**
 * j11 Procurement read surface (Sprint 3 Block C — minimum-viable shell).
 *
 * SHELL ONLY — see the matching backend controllers under
 * apps/api/src/procurement/ (po + gr + reconciliation) for the FOLLOWUP
 * comments enumerating what is intentionally not built. Spec: docs/ux/j11.md.
 */

export interface PoListItem {
  id: string;
  poNumber: string;
  supplierId: string;
  state: string;
  currency: string;
  total: number;
  expectedDeliveryDate: string | null;
  createdAt: string;
}

export interface PoListResponse {
  items: PoListItem[];
  total: number;
}

export async function getPurchaseOrders(
  organizationId: string,
): Promise<PoListResponse> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<PoListResponse>(`/m3/procurement/po?${qs}`);
}

export interface GrListItem {
  id: string;
  poId: string | null;
  supplierId: string;
  receivedAt: string;
  receivedAtLocationId: string;
  state: string;
  requiresReview: boolean;
  supplierInvoiceRef: string | null;
  createdAt: string;
}

export interface GrListResponse {
  items: GrListItem[];
  total: number;
}

export async function getGoodsReceipts(
  organizationId: string,
): Promise<GrListResponse> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<GrListResponse>(`/m3/procurement/gr?${qs}`);
}

export interface ReconciliationListItem {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  discrepancyType: 'cantidad' | 'precio' | 'producto' | 'lote-no-conforme';
  diff: string;
  state: 'abierta' | 'aceptada' | 'nota-credito' | 'devuelta';
  createdAt: string;
}

export interface ReconciliationListResponse {
  items: ReconciliationListItem[];
  total: number;
}

export async function getReconciliations(
  organizationId: string,
): Promise<ReconciliationListResponse> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<ReconciliationListResponse>(
    `/m3/procurement/reconciliation?${qs}`,
  );
}
