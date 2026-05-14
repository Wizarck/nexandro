// ============================================================
// M3 PurchaseOrder contracts (slice m3-po-aggregate, Wave 2.2)
// ============================================================
//
// Read models + 6 PO event-envelope shapes consumed by downstream slices
// (#7 GR reconciliation, #8 procurement UI, #21 audit-log hash-chain).
//
// Subscriber registration is OWNED BY slice #21 per ADR-PO-EVENT-TYPES-
// REGISTERED — this slice ONLY declares the shapes. The event types
// exist in the contracts package so #21 can import them by name when
// it batches every M3 BC's `KNOWN_EVENTS` registration in one PR.
//
// Per [[feedback_subagent_apply_typing_fix_cascade]] — array-required-
// non-empty Zod uses `.min(1)`, never `.nonempty()`.

import { z } from 'zod';

// ---------------------------------------------------------------
// Primitive shapes — reused across read models + event payloads.
// ---------------------------------------------------------------

export const PO_STATES = [
  'draft',
  'sent',
  'partially_received',
  'received',
  'closed',
  'cancelled',
] as const;

export const PoStateSchema = z.enum(PO_STATES);
export type PoState = z.infer<typeof PoStateSchema>;

export const PO_MONEY_UNITS = ['kg', 'g', 'L', 'ml', 'un'] as const;
export const PoMoneyUnitSchema = z.enum(PO_MONEY_UNITS);
export type PoMoneyUnit = z.infer<typeof PoMoneyUnitSchema>;

/** ISO 4217 alpha-3 currency code (e.g. EUR, USD). */
export const PoCurrencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'currency must be 3 uppercase letters (ISO 4217)');
export type PoCurrencyCode = z.infer<typeof PoCurrencyCodeSchema>;

// ---------------------------------------------------------------
// PurchaseOrderLineReadModel
// ---------------------------------------------------------------

export const PurchaseOrderLineReadModelSchema = z.object({
  id: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  organizationId: z.string().min(1),
  lineNumber: z.number().int().min(1),
  ingredientId: z.string().min(1),
  quantityOrdered: z.number().positive(),
  unit: PoMoneyUnitSchema,
  unitPrice: z.number().min(0),
  vatRate: z.number().min(0).max(1),
  vatInclusive: z.boolean(),
  lineSubtotal: z.number().min(0),
  lineVat: z.number().min(0),
  lineTotal: z.number().min(0),
});

export type PurchaseOrderLineReadModel = z.infer<
  typeof PurchaseOrderLineReadModelSchema
>;

// ---------------------------------------------------------------
// PurchaseOrderReadModel
// ---------------------------------------------------------------

export const PurchaseOrderReadModelSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  supplierId: z.string().min(1),
  poNumber: z.string().regex(/^PO-\d{4}-\d{4,}$/, 'invalid PO number format'),
  state: PoStateSchema,
  currency: PoCurrencyCodeSchema,
  subtotal: z.number().min(0),
  vatTotal: z.number().min(0),
  total: z.number().min(0),
  expectedDeliveryDate: z.coerce.date().nullable(),
  notes: z.string().nullable(),
  createdByUserId: z.string().min(1),
  sentAt: z.coerce.date().nullable(),
  closedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  /**
   * Lines are required-non-empty per the factory invariant. `.min(1)` is
   * the Wave 2.1 canonical idiom (never `.nonempty()`).
   */
  lines: z.array(PurchaseOrderLineReadModelSchema).min(1),
});

export type PurchaseOrderReadModel = z.infer<typeof PurchaseOrderReadModelSchema>;

// ---------------------------------------------------------------
// Event envelopes — six PO event types.
//
// Per ADR-PO-EVENT-TYPES-REGISTERED: these are DECLARED here but NOT
// emitted (no subscriber registered in apps/api/src/audit-log/audit-log.
// subscriber.ts). Slice #21 batches the registration once every M3 BC
// has shipped.
// ---------------------------------------------------------------

export const PO_AGGREGATE_TYPE = 'purchase_order' as const;

export const PO_EVENT_TYPES = {
  CREATED: 'PO_CREATED',
  SENT: 'PO_SENT',
  RECEIVED_PARTIAL: 'PO_RECEIVED_PARTIAL',
  RECEIVED_FULL: 'PO_RECEIVED_FULL',
  CANCELLED: 'PO_CANCELLED',
  CLOSED: 'PO_CLOSED',
} as const;

const baseEnvelope = z.object({
  organizationId: z.string().min(1),
  aggregateType: z.literal(PO_AGGREGATE_TYPE),
  aggregateId: z.string().min(1),
  actorUserId: z.string().nullable(),
  actorKind: z.enum(['user', 'system', 'agent']),
});

// --- PO_CREATED ---

export const PoCreatedEventPayloadSchema = z.object({
  po: PurchaseOrderReadModelSchema,
});

export const PoCreatedEventSchema = baseEnvelope.extend({
  eventType: z.literal(PO_EVENT_TYPES.CREATED),
  payloadAfter: PoCreatedEventPayloadSchema,
});

export type PoCreatedEvent = z.infer<typeof PoCreatedEventSchema>;

// --- PO_SENT ---

export const PoSentEventPayloadSchema = z.object({
  poId: z.string().min(1),
  sentAt: z.coerce.date(),
  actorUserId: z.string().min(1),
});

export const PoSentEventSchema = baseEnvelope.extend({
  eventType: z.literal(PO_EVENT_TYPES.SENT),
  payloadAfter: PoSentEventPayloadSchema,
});

export type PoSentEvent = z.infer<typeof PoSentEventSchema>;

// --- PO_RECEIVED_PARTIAL ---

export const PoReceivedPartialEventPayloadSchema = z.object({
  poId: z.string().min(1),
  receivedLineIds: z.array(z.string().min(1)).min(1),
  remainingQuantitiesByLine: z.record(z.string(), z.number().min(0)),
});

export const PoReceivedPartialEventSchema = baseEnvelope.extend({
  eventType: z.literal(PO_EVENT_TYPES.RECEIVED_PARTIAL),
  payloadAfter: PoReceivedPartialEventPayloadSchema,
});

export type PoReceivedPartialEvent = z.infer<typeof PoReceivedPartialEventSchema>;

// --- PO_RECEIVED_FULL ---

export const PoReceivedFullEventPayloadSchema = z.object({
  poId: z.string().min(1),
  finalDeliveryAt: z.coerce.date(),
});

export const PoReceivedFullEventSchema = baseEnvelope.extend({
  eventType: z.literal(PO_EVENT_TYPES.RECEIVED_FULL),
  payloadAfter: PoReceivedFullEventPayloadSchema,
});

export type PoReceivedFullEvent = z.infer<typeof PoReceivedFullEventSchema>;

// --- PO_CANCELLED ---

export const PoCancelledEventPayloadSchema = z.object({
  poId: z.string().min(1),
  reason: z.string().min(1),
  actorUserId: z.string().min(1),
});

export const PoCancelledEventSchema = baseEnvelope.extend({
  eventType: z.literal(PO_EVENT_TYPES.CANCELLED),
  payloadAfter: PoCancelledEventPayloadSchema,
});

export type PoCancelledEvent = z.infer<typeof PoCancelledEventSchema>;

// --- PO_CLOSED ---

export const PoClosedEventPayloadSchema = z.object({
  poId: z.string().min(1),
  closedAt: z.coerce.date(),
  actorUserId: z.string().min(1),
});

export const PoClosedEventSchema = baseEnvelope.extend({
  eventType: z.literal(PO_EVENT_TYPES.CLOSED),
  payloadAfter: PoClosedEventPayloadSchema,
});

export type PoClosedEvent = z.infer<typeof PoClosedEventSchema>;

// ---------------------------------------------------------------
// Discriminated union over all six PO events.
// ---------------------------------------------------------------

export const PoEventSchema = z.discriminatedUnion('eventType', [
  PoCreatedEventSchema,
  PoSentEventSchema,
  PoReceivedPartialEventSchema,
  PoReceivedFullEventSchema,
  PoCancelledEventSchema,
  PoClosedEventSchema,
]);

export type PoEvent = z.infer<typeof PoEventSchema>;
