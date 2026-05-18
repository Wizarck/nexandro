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
  /** Photo-ingestion provenance — set when Hermes seeded the GR draft. */
  sourcePhotoIngestionId: string | null;
  createdAt: string;
}

export interface GrListResponse {
  items: GrListItem[];
  total: number;
}

/**
 * UI-facing filter state for the j11 Recepciones tab (Sprint 4 W3-9).
 *
 * `locationIds` is a multi-select; the API serialises as
 * comma-separated UUIDs. `state` mirrors the j11 §5 visual chips
 * (pendiente / confirmada / parcial / rechazada) — the backend maps
 * them to the domain `GoodsReceiptState` enum
 * (draft / confirmed / cancelled / — `parcial` is reserved for a
 * future domain state and currently returns the empty list).
 *
 * `pendingOnly` is a fast-path equivalent to `state=pendiente` that
 * the dock workflow defaults to so a freshly opened tablet lands on
 * "what's waiting to be received" without a second round-trip.
 */
export type GrUiState =
  | 'pendiente'
  | 'confirmada'
  | 'parcial'
  | 'rechazada';

export interface GrListFilters {
  locationIds?: string[];
  state?: GrUiState;
  pendingOnly?: boolean;
}

export async function getGoodsReceipts(
  organizationId: string,
  filters: GrListFilters = {},
): Promise<GrListResponse> {
  const params = new URLSearchParams({ organizationId });
  if (filters.locationIds && filters.locationIds.length > 0) {
    params.set('locationIds', filters.locationIds.join(','));
  }
  if (filters.state) {
    params.set('state', filters.state);
  }
  if (filters.pendingOnly) {
    params.set('pendingOnly', 'true');
  }
  return api<GrListResponse>(`/m3/procurement/gr?${params.toString()}`);
}

/**
 * Sprint 4 W3-3 — bulk-confirm `pendientes` GRs that match the j11
 * BULK_CONFIRM_PREDICATE (docs/ux/j11.md §Notes-for-implementation).
 *
 * Backend status: NOT yet wired end-to-end. The
 * `GrConfirmationService.confirm()` seam takes a full `CreateGrInput`
 * (header + lines) — it cannot transition an existing draft GR by id
 * alone. Both per-line confirm AND bulk-confirm endpoints are
 * followup-tracked (see the matching FOLLOWUP comment in
 * gr.controller.ts). The frontend ships the CTA in a `disabled`
 * state with an explicit tooltip so dock operators know the
 * affordance exists and is wired-pending; the click path renders a
 * confirmation modal that surfaces the same "pendiente de wiring"
 * banner so review can sign off on copy + interaction shape today.
 */
export interface BulkConfirmGrPayload {
  grIds: string[];
}

export interface BulkConfirmGrResponse {
  confirmed: string[];
  skipped: Array<{ grId: string; reason: string }>;
}

export async function bulkConfirmGoodsReceipts(
  organizationId: string,
  payload: BulkConfirmGrPayload,
): Promise<BulkConfirmGrResponse> {
  return api<BulkConfirmGrResponse>(`/m3/procurement/gr/bulk-confirm`, {
    method: 'POST',
    body: JSON.stringify({
      organizationId,
      grIds: payload.grIds,
    }),
  });
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

export interface GrLineDetail {
  id: string;
  grId: string;
  poLineId: string | null;
  productId: string;
  qtyReceivedActual: number;
  unitPriceActual: number;
  lotIdCreated: string | null;
  /** ISO-8601 (UTC) timestamp; null when the operator did not override. */
  expiresAtOverride: string | null;
  createdAt: string;
}

export interface GrDetail {
  id: string;
  organizationId: string;
  poId: string | null;
  supplierId: string;
  receivedAt: string;
  receivedAtLocationId: string;
  receivingUserId: string;
  supplierInvoiceRef: string | null;
  state: string;
  requiresReview: boolean;
  sourcePhotoIngestionId: string | null;
  createdAt: string;
  updatedAt: string;
  lines: GrLineDetail[];
}

export async function getGoodsReceiptDetail(
  organizationId: string,
  grId: string,
): Promise<GrDetail> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<GrDetail>(`/m3/procurement/gr/${grId}?${qs}`);
}

/**
 * Per-line confirm body — fields the operator can edit at the dock per
 * j11 §5 (cantidad recibida · lote · caducidad).
 *
 * FOLLOWUP (Sprint 4 W3-2 backend gap): the corresponding endpoint
 * `POST /m3/procurement/gr/:id/lines/:lineId/confirm` is not yet wired
 * — `GrConfirmationService.confirm()` operates on full `CreateGrInput`
 * (new draft → confirmed in one shot). The hook below throws an
 * informative error when invoked so the UI can stay shipped with a
 * disabled / TODO `Confirmar` affordance until the backend lands.
 */
export interface ConfirmGrLineInput {
  quantityReceived: number;
  lotCode?: string;
  expiryDate?: string;
}

export async function confirmGoodsReceiptLine(
  _organizationId: string,
  _grId: string,
  _lineId: string,
  _input: ConfirmGrLineInput,
): Promise<never> {
  throw new Error(
    'confirmGoodsReceiptLine: backend endpoint not yet wired — see Sprint 4 W3-2 followup in apps/api/src/procurement/gr/interface/gr.controller.ts',
  );
}

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
