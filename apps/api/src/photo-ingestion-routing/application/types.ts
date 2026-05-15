/**
 * Photo-ingestion-routing BC — inline contracts (M3 hardening H1a slice
 * `m3-photo-ingest-downstream-routing`).
 *
 * No `packages/contracts` import: every shape this BC exposes is declared
 * here. This is a pure backend wire (no UI, no REST surface, no MCP
 * capability) so we never share these types across packages.
 */

import type { LotUnit } from '../../inventory/lot/domain/lot.entity';

/**
 * Result of a single routing attempt. Returned by
 * `PhotoIngestionRoutingService.routeSigned()` and used by tests; the
 * subscriber discards the value (the side-effects — DB write + envelope
 * emission — are the contract).
 */
export interface PhotoIngestionRoutingResult {
  /** `true` on successful route (new or idempotent). `false` on skip. */
  routed: boolean;
  /** Downstream aggregate type when `routed === true`. */
  downstreamAggregateType?: 'lot' | 'goods_receipt';
  /** Downstream aggregate id when `routed === true`. */
  downstreamAggregateId?: string;
  /** `true` when the route short-circuited (existing aggregate found). */
  alreadyRouted?: boolean;
  /** Listed skip reasons when `routed === false`. */
  skipReason?: string[];
}

/**
 * Field-map extracted from a `payload_after.operatorCorrection.fields[]`
 * (or `llm_extraction.fields[]` as fallback) for a `product` photo.
 *
 * Fields are populated only when the upstream extraction supplied them;
 * missing fields surface as `undefined` so `validateProductFields` can
 * emit precise skip-reason strings.
 */
export interface ProductPhotoFieldMap {
  gtin?: string;
  expiryDate?: Date | null;
  quantity?: number;
  unit?: LotUnit;
  supplierId?: string | null;
  locationId?: string;
}

/**
 * Line-item hint shape carried in
 * `PHOTO_INGESTION_DOWNSTREAM_ROUTED.payload_after.lineItemsHint` for
 * invoice-kind routes. The j7 procurement UI uses this to pre-populate
 * the GR-confirmation surface. NOT used to create GR-line rows at
 * routing time — slice #7's `GrConfirmationService.confirm()` owns
 * line creation per ADR-FIELD-MAPPING-FAIL-OPEN.
 */
export interface InvoiceLineItemHint {
  productId?: string;
  qty: number;
  unitPrice?: number;
  unit?: LotUnit;
  description?: string;
}

/**
 * Field-map extracted for an `invoice` photo. As with the product map,
 * fields are populated only when the upstream extraction supplied them.
 */
export interface InvoicePhotoFieldMap {
  supplierInvoiceRef?: string;
  supplierId?: string;
  receivedAt?: Date;
  receivedAtLocationId?: string;
  receivingUserId?: string;
  lineItems?: InvoiceLineItemHint[];
}
