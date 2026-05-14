import {
  PO_AGGREGATE_TYPE,
  PO_EVENT_TYPES,
  PoCancelledEventSchema,
  PoClosedEventSchema,
  PoCreatedEventSchema,
  PoCurrencyCodeSchema,
  PoEventSchema,
  PoMoneyUnitSchema,
  PoReceivedFullEventSchema,
  PoReceivedPartialEventSchema,
  PoSentEventSchema,
  PoStateSchema,
  PurchaseOrderLineReadModelSchema,
  PurchaseOrderReadModelSchema,
} from './po';

describe('m3/po contracts', () => {
  describe('primitive schemas', () => {
    it('accepts every documented PoState', () => {
      for (const s of [
        'draft',
        'sent',
        'partially_received',
        'received',
        'closed',
        'cancelled',
      ]) {
        expect(PoStateSchema.parse(s)).toBe(s);
      }
    });

    it('rejects unknown PoState', () => {
      expect(() => PoStateSchema.parse('shipped')).toThrow();
    });

    it('accepts ISO 4217 alpha-3 currency codes', () => {
      expect(PoCurrencyCodeSchema.parse('EUR')).toBe('EUR');
      expect(PoCurrencyCodeSchema.parse('USD')).toBe('USD');
    });

    it('rejects lowercase or wrong-length currency', () => {
      expect(() => PoCurrencyCodeSchema.parse('eur')).toThrow();
      expect(() => PoCurrencyCodeSchema.parse('EURO')).toThrow();
      expect(() => PoCurrencyCodeSchema.parse('EU')).toThrow();
    });

    it('accepts all PoMoneyUnit values', () => {
      for (const u of ['kg', 'g', 'L', 'ml', 'un']) {
        expect(PoMoneyUnitSchema.parse(u)).toBe(u);
      }
    });
  });

  describe('PurchaseOrderLineReadModel', () => {
    it('parses a valid line', () => {
      const out = PurchaseOrderLineReadModelSchema.parse({
        id: 'l1',
        purchaseOrderId: 'po1',
        organizationId: 'org1',
        lineNumber: 1,
        ingredientId: 'ing1',
        quantityOrdered: 5,
        unit: 'kg',
        unitPrice: 8.5,
        vatRate: 0.21,
        vatInclusive: false,
        lineSubtotal: 42.5,
        lineVat: 8.925,
        lineTotal: 51.425,
      });
      expect(out.lineNumber).toBe(1);
    });

    it('rejects vatRate above 1', () => {
      expect(() =>
        PurchaseOrderLineReadModelSchema.parse({
          id: 'l1',
          purchaseOrderId: 'po1',
          organizationId: 'org1',
          lineNumber: 1,
          ingredientId: 'ing1',
          quantityOrdered: 5,
          unit: 'kg',
          unitPrice: 8.5,
          vatRate: 1.5,
          vatInclusive: false,
          lineSubtotal: 1,
          lineVat: 1,
          lineTotal: 1,
        }),
      ).toThrow();
    });
  });

  describe('PurchaseOrderReadModel', () => {
    it('requires at least one line (.min(1), not .nonempty)', () => {
      const base = {
        id: 'po1',
        organizationId: 'org1',
        supplierId: 'sup1',
        poNumber: 'PO-2026-0001',
        state: 'draft' as const,
        currency: 'EUR',
        subtotal: 0,
        vatTotal: 0,
        total: 0,
        expectedDeliveryDate: null,
        notes: null,
        createdByUserId: 'user1',
        sentAt: null,
        closedAt: null,
        createdAt: new Date('2026-05-14T08:00:00Z'),
        updatedAt: new Date('2026-05-14T08:00:00Z'),
        lines: [] as never[],
      };
      expect(() => PurchaseOrderReadModelSchema.parse(base)).toThrow();
    });

    it('rejects malformed PO number', () => {
      const base = {
        id: 'po1',
        organizationId: 'org1',
        supplierId: 'sup1',
        poNumber: 'PO-26-1',
        state: 'draft' as const,
        currency: 'EUR',
        subtotal: 0,
        vatTotal: 0,
        total: 0,
        expectedDeliveryDate: null,
        notes: null,
        createdByUserId: 'user1',
        sentAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lines: [
          {
            id: 'l1',
            purchaseOrderId: 'po1',
            organizationId: 'org1',
            lineNumber: 1,
            ingredientId: 'ing1',
            quantityOrdered: 1,
            unit: 'kg' as const,
            unitPrice: 1,
            vatRate: 0,
            vatInclusive: false,
            lineSubtotal: 1,
            lineVat: 0,
            lineTotal: 1,
          },
        ],
      };
      expect(() => PurchaseOrderReadModelSchema.parse(base)).toThrow();
    });
  });

  describe('event envelopes', () => {
    const baseEnvelopeFields = {
      organizationId: 'org1',
      aggregateType: PO_AGGREGATE_TYPE,
      aggregateId: 'po1',
      actorUserId: 'user1',
      actorKind: 'user' as const,
    };

    it('parses PO_SENT event', () => {
      const out = PoSentEventSchema.parse({
        ...baseEnvelopeFields,
        eventType: PO_EVENT_TYPES.SENT,
        payloadAfter: {
          poId: 'po1',
          sentAt: new Date('2026-05-14T08:00:00Z'),
          actorUserId: 'user1',
        },
      });
      expect(out.eventType).toBe('PO_SENT');
    });

    it('parses PO_CANCELLED event', () => {
      const out = PoCancelledEventSchema.parse({
        ...baseEnvelopeFields,
        eventType: PO_EVENT_TYPES.CANCELLED,
        payloadAfter: {
          poId: 'po1',
          reason: 'duplicate order',
          actorUserId: 'user1',
        },
      });
      expect(out.eventType).toBe('PO_CANCELLED');
    });

    it('parses PO_CLOSED event', () => {
      const out = PoClosedEventSchema.parse({
        ...baseEnvelopeFields,
        eventType: PO_EVENT_TYPES.CLOSED,
        payloadAfter: {
          poId: 'po1',
          closedAt: new Date('2026-05-14T08:00:00Z'),
          actorUserId: 'user1',
        },
      });
      expect(out.eventType).toBe('PO_CLOSED');
    });

    it('parses PO_RECEIVED_PARTIAL event', () => {
      const out = PoReceivedPartialEventSchema.parse({
        ...baseEnvelopeFields,
        eventType: PO_EVENT_TYPES.RECEIVED_PARTIAL,
        payloadAfter: {
          poId: 'po1',
          receivedLineIds: ['l1', 'l2'],
          remainingQuantitiesByLine: { l1: 2, l2: 0 },
        },
      });
      expect(out.payloadAfter.receivedLineIds).toHaveLength(2);
    });

    it('parses PO_RECEIVED_FULL event', () => {
      const out = PoReceivedFullEventSchema.parse({
        ...baseEnvelopeFields,
        eventType: PO_EVENT_TYPES.RECEIVED_FULL,
        payloadAfter: {
          poId: 'po1',
          finalDeliveryAt: new Date('2026-05-14T08:00:00Z'),
        },
      });
      expect(out.eventType).toBe('PO_RECEIVED_FULL');
    });

    it('parses PO_CREATED event with embedded read model', () => {
      const out = PoCreatedEventSchema.parse({
        ...baseEnvelopeFields,
        eventType: PO_EVENT_TYPES.CREATED,
        payloadAfter: {
          po: {
            id: 'po1',
            organizationId: 'org1',
            supplierId: 'sup1',
            poNumber: 'PO-2026-0001',
            state: 'draft',
            currency: 'EUR',
            subtotal: 42.5,
            vatTotal: 8.925,
            total: 51.425,
            expectedDeliveryDate: null,
            notes: null,
            createdByUserId: 'user1',
            sentAt: null,
            closedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lines: [
              {
                id: 'l1',
                purchaseOrderId: 'po1',
                organizationId: 'org1',
                lineNumber: 1,
                ingredientId: 'ing1',
                quantityOrdered: 5,
                unit: 'kg',
                unitPrice: 8.5,
                vatRate: 0.21,
                vatInclusive: false,
                lineSubtotal: 42.5,
                lineVat: 8.925,
                lineTotal: 51.425,
              },
            ],
          },
        },
      });
      expect(out.payloadAfter.po.lines).toHaveLength(1);
    });

    it('discriminated union picks the right schema', () => {
      const evt = {
        organizationId: 'org1',
        aggregateType: PO_AGGREGATE_TYPE,
        aggregateId: 'po1',
        actorUserId: 'user1',
        actorKind: 'user' as const,
        eventType: PO_EVENT_TYPES.SENT,
        payloadAfter: {
          poId: 'po1',
          sentAt: new Date(),
          actorUserId: 'user1',
        },
      };
      const out = PoEventSchema.parse(evt);
      expect(out.eventType).toBe('PO_SENT');
    });
  });
});
