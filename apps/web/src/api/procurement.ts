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

/**
 * Single PO with lines + monetary breakdown — powers the j11 PO detail
 * drawer (Sprint 4 W3-1). Matches `PoDetailResponseDto` in
 * apps/api/src/procurement/po/interface/po.controller.ts.
 */
export interface PoLine {
  id: string;
  lineNumber: number;
  ingredientId: string;
  quantityOrdered: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  vatInclusive: boolean;
  lineSubtotal: number;
  lineVat: number;
  lineTotal: number;
}

export interface PoDetail extends PoListItem {
  subtotal: number;
  vatTotal: number;
  notes: string | null;
  sentAt: string | null;
  closedAt: string | null;
  lines: PoLine[];
}

export async function getPurchaseOrderById(
  organizationId: string,
  id: string,
): Promise<PoDetail> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<PoDetail>(`/m3/procurement/po/${id}?${qs}`);
}

export async function cancelPurchaseOrder(
  organizationId: string,
  id: string,
  reason: string,
): Promise<PoDetail> {
  return api<PoDetail>(`/m3/procurement/po/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ organizationId, reason }),
  });
}

export async function closePurchaseOrder(
  organizationId: string,
  id: string,
): Promise<PoDetail> {
  return api<PoDetail>(`/m3/procurement/po/${id}/close`, {
    method: 'POST',
    body: JSON.stringify({ organizationId }),
  });
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

export type ReconciliationDiscrepancyType =
  | 'cantidad'
  | 'precio'
  | 'producto'
  | 'lote-no-conforme';

export type ReconciliationState =
  | 'abierta'
  | 'aceptada'
  | 'nota-credito'
  | 'devuelta';

export type ResolvableReconciliationState = Exclude<
  ReconciliationState,
  'abierta'
>;

/**
 * Structured diff payload — `Record<string, unknown>` mirrors the backend
 * `jsonb` column. Per discrepancy type (docs/ux/j11.md §6 + entity comment):
 *   - cantidad         → { expectedQty, actualQty, unit, deltaPct }
 *   - precio           → { expectedUnitPrice, actualUnitPrice, currency, deltaPct }
 *   - producto         → { expectedProductId, actualProductId }
 *   - lote-no-conforme → { lotId, reason }
 * All variants also include `{ grLineId, poLineId }` from the detector.
 */
export type ReconciliationDiff = Record<string, unknown>;

export interface ReconciliationListItem {
  id: string;
  poId: string | null;
  poNumber: string | null;
  grId: string;
  supplierId: string;
  discrepancyType: ReconciliationDiscrepancyType;
  diff: ReconciliationDiff;
  state: ReconciliationState;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNotes: string | null;
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

export interface ResolveReconciliationPayload {
  state: ResolvableReconciliationState;
  notes?: string;
}

/**
 * POST /m3/procurement/reconciliation/:id/resolve (Sprint 4 W3-5+W3-6).
 * Owner-only at the API layer — the j11 drawer enforces the Manager
 * disabled-state up-front so the request is never sent without the
 * required role.
 */
export async function resolveReconciliation(
  organizationId: string,
  id: string,
  payload: ResolveReconciliationPayload,
): Promise<ReconciliationListItem> {
  return api<ReconciliationListItem>(
    `/m3/procurement/reconciliation/${id}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify({
        organizationId,
        state: payload.state,
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
      }),
    },
  );
}
