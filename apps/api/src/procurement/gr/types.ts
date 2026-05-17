import { z } from 'zod';
import type { LotUnit } from '../../inventory/lot/domain/lot.entity';

/**
 * Inline shared types for the procurement.gr BC.
 *
 * Per Wave 2.1 lesson (TS6059 + TS2448 cascade): types stay co-located in
 * this file rather than re-exported through `@nexandro/contracts`.
 * Downstream slices (#8 UI, #11 incident search, #14 APPCC) read these
 * directly from `apps/api/src/procurement/gr/types.ts` via the package
 * graph — no contracts dependency from apps/api.
 *
 * Variance event envelopes are also defined here as plain TS interfaces
 * (no Zod runtime needed for outbound bus emission within the monolith).
 */

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---- Zod schemas (input validation) ----

export const GrLineInputSchema = z.object({
  // Required on every line.
  productId: z.string().regex(UUID_RX),
  qtyReceivedActual: z.number().finite().nonnegative(),
  unitPriceActual: z.number().finite().nonnegative(),
  unit: z.enum(['kg', 'g', 'L', 'ml', 'un']),
  // PO link — NULL for independent GR; matched against header.poId shape.
  poLineId: z.string().regex(UUID_RX).nullable(),
  // For variance + over-receipt checks (read from slice #6's PO line —
  // passed in by the caller because this slice doesn't read PO rows).
  qtyOrdered: z.number().finite().nonnegative().nullable(),
  unitPriceOrdered: z.number().finite().nonnegative().nullable(),
  // Optional per-line shelf-life override (design.md open questions).
  expiresAtOverride: z.date().nullable().optional(),
});

export const CreateGrInputSchema = z.object({
  organizationId: z.string().regex(UUID_RX),
  poId: z.string().regex(UUID_RX).nullable(),
  supplierId: z.string().regex(UUID_RX),
  receivedAt: z.date(),
  receivedAtLocationId: z.string().regex(UUID_RX),
  receivingUserId: z.string().regex(UUID_RX),
  supplierInvoiceRef: z.string().nullable().optional(),
  // .min(1) per Wave 2.1 Zod lesson (NOT .nonempty()).
  lines: z.array(GrLineInputSchema).min(1),
});

export type CreateGrInput = z.infer<typeof CreateGrInputSchema>;
export type GrLineInput = z.infer<typeof GrLineInputSchema>;

// ---- Variance detection ----

export type VarianceKind = 'none' | 'qty' | 'price' | 'both';

export interface VarianceThresholds {
  /** Relative threshold for qty variance, e.g. 0.01 = 1%. */
  qty: number;
  /** Relative threshold for price variance, e.g. 0.01 = 1%. */
  price: number;
  /** Absolute floor for small-qty noise (units of base measurement). */
  absQty: number;
  /** Absolute floor for small-price noise (EUR). */
  absPrice: number;
}

export const DEFAULT_VARIANCE_THRESHOLDS: VarianceThresholds = {
  qty: 0.01,
  price: 0.01,
  absQty: 1.0,
  absPrice: 0.1,
};

export interface VarianceResult {
  kind: VarianceKind;
  qtyDeltaPct?: number;
  priceDeltaPct?: number;
}

// ---- Over-receipt tolerance ----

export interface OverReceiptToleranceConfig {
  /** Default tolerance for bulk goods (kg/g/L/ml). */
  bulkPct: number;
  /** Default tolerance for discrete `un`. */
  discretePct: number;
}

export const DEFAULT_OVER_RECEIPT_TOLERANCE: OverReceiptToleranceConfig = {
  bulkPct: 0.05,
  discretePct: 0.0,
};

// ---- Event types (registered, NOT emitted to audit subscriber yet) ----

/**
 * Bus event-type constants for procurement.gr. Slice #21 wires
 * AuditLogSubscriber to consume these — this slice ONLY emits to the bus.
 * Per ADR-GR-NO-AUDIT-EMIT-HERE.
 */
export const GrEventType = {
  GR_CONFIRMED: 'procurement-gr.confirmed',
  GR_LINE_QTY_VARIANCE: 'procurement-gr.line-qty-variance',
  GR_LINE_PRICE_VARIANCE: 'procurement-gr.line-price-variance',
} as const;
export type GrEventType = (typeof GrEventType)[keyof typeof GrEventType];

export const GR_EVENT_TYPES = Object.values(GrEventType);

/** Persisted (canonical) event-type names — match audit-log convention. */
export const GrEventTypeName = {
  'procurement-gr.confirmed': 'GR_CONFIRMED',
  'procurement-gr.line-qty-variance': 'GR_LINE_QTY_VARIANCE',
  'procurement-gr.line-price-variance': 'GR_LINE_PRICE_VARIANCE',
} as const;

// ---- Outbound event payloads ----

export interface GrConfirmedEventPayload {
  grId: string;
  organizationId: string;
  poId: string | null;
  supplierId: string;
  receivedAt: Date;
  lines: Array<{
    grLineId: string;
    poLineId: string | null;
    productId: string;
    qtyReceivedActual: number;
    unitPriceActual: number;
    lotIdCreated: string;
  }>;
}

export interface GrLineQtyVarianceEventPayload {
  grId: string;
  organizationId: string;
  grLineId: string;
  poLineId: string;
  qtyOrdered: number;
  qtyReceivedActual: number;
  deltaPct: number;
  thresholdPct: number;
}

export interface GrLinePriceVarianceEventPayload {
  grId: string;
  organizationId: string;
  grLineId: string;
  poLineId: string;
  unitPriceOrdered: number;
  unitPriceActual: number;
  deltaPct: number;
  thresholdPct: number;
}

export type VarianceEventEnvelope =
  | { type: typeof GrEventType.GR_LINE_QTY_VARIANCE; payload: GrLineQtyVarianceEventPayload }
  | { type: typeof GrEventType.GR_LINE_PRICE_VARIANCE; payload: GrLinePriceVarianceEventPayload };

// ---- Result envelope ----

export interface ConfirmedLineSummary {
  grLineId: string;
  poLineId: string | null;
  productId: string;
  qtyReceivedActual: number;
  unitPriceActual: number;
  lotIdCreated: string;
  unit: LotUnit;
}

export interface GrConfirmationResult {
  grId: string;
  organizationId: string;
  state: 'confirmed';
  lines: ConfirmedLineSummary[];
  varianceEvents: VarianceEventEnvelope[];
}
