import 'reflect-metadata';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import type { LotRepository } from '../../inventory/lot/application/lot.repository';
import type { Lot } from '../../inventory/lot/domain/lot.entity';
import type { GoodsReceiptRepository } from '../../procurement/gr/application/gr.repository';
import type { GoodsReceipt } from '../../procurement/gr/domain/goods-receipt.entity';
import { PhotoIngestionRoutingService } from './photo-ingestion-routing.service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const LOCATION_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const EXISTING_LOT_ID = '66666666-6666-4666-8666-666666666666';
const EXISTING_GR_ID = '77777777-7777-4777-8777-777777777777';

function buildSvc() {
  const lotRepo = {
    findBySourcePhotoIngestionId: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<LotRepository, 'findBySourcePhotoIngestionId' | 'save'>
  >;
  const grRepo = {
    findBySourcePhotoIngestionId: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<GoodsReceiptRepository, 'findBySourcePhotoIngestionId' | 'save'>
  >;
  const events = new EventEmitter2();
  const emitSpy = jest.spyOn(events, 'emitAsync');
  const svc = new PhotoIngestionRoutingService(
    lotRepo as unknown as LotRepository,
    grRepo as unknown as GoodsReceiptRepository,
    events,
  );
  return { svc, lotRepo, grRepo, events, emitSpy };
}

function productEnvelope(overrides: Partial<Record<string, unknown>> = {}): AuditEventEnvelope {
  return {
    organizationId: ORG_ID,
    aggregateType: 'photo_ingestion_item',
    aggregateId: ITEM_ID,
    actorUserId: USER_ID,
    actorKind: 'user',
    payloadAfter: {
      photoId: 'photo-1',
      kind: 'product',
      status: 'signed',
      overallConfidence: 0.95,
      modelVersion: 'gpt-4o-vision',
      promptVersion: 'v1',
      signedAt: new Date('2026-05-15T00:00:00Z').toISOString(),
      signedByUserId: USER_ID,
      llmExtraction: {
        fields: [
          { name: 'gtin', value: '5901234123457', confidence: 0.98 },
          { name: 'quantity', value: 12, confidence: 0.97 },
          { name: 'unit', value: 'kg', confidence: 0.99 },
          { name: 'location_id', value: LOCATION_ID, confidence: 0.99 },
          { name: 'supplier_id', value: SUPPLIER_ID, confidence: 0.95 },
          ...(overrides.fields as Array<{ name: string; value: unknown; confidence: number }> ?? []),
        ],
      },
      operatorCorrection: null,
      ...overrides,
    },
  };
}

function invoiceEnvelope(overrides: Partial<Record<string, unknown>> = {}): AuditEventEnvelope {
  return {
    organizationId: ORG_ID,
    aggregateType: 'photo_ingestion_item',
    aggregateId: ITEM_ID,
    actorUserId: USER_ID,
    actorKind: 'user',
    payloadAfter: {
      photoId: 'photo-2',
      kind: 'invoice',
      status: 'signed',
      overallConfidence: 0.93,
      modelVersion: 'gpt-4o-vision',
      promptVersion: 'v1',
      signedAt: new Date('2026-05-15T00:00:00Z').toISOString(),
      signedByUserId: USER_ID,
      llmExtraction: {
        fields: [
          { name: 'supplier_invoice_ref', value: 'INV-2026-0042', confidence: 0.97 },
          { name: 'supplier_id', value: SUPPLIER_ID, confidence: 0.95 },
          { name: 'received_at_location_id', value: LOCATION_ID, confidence: 0.96 },
          { name: 'received_at', value: '2026-05-14T12:30:00Z', confidence: 0.94 },
          {
            name: 'line_items',
            value: JSON.stringify([
              { qty: 3, unit: 'kg', description: 'Tomate triturado' },
              { qty: 5, unit: 'un', description: 'Aceite oliva' },
            ]),
            confidence: 0.9,
          },
        ],
      },
      operatorCorrection: null,
      ...overrides,
    },
  };
}

describe('PhotoIngestionRoutingService.routeSigned', () => {
  it('AC-ROUTE-7: envelope shape invalid (no payload_after) → skip with envelope:invalid-shape', async () => {
    const { svc, emitSpy } = buildSvc();
    const result = await svc.routeSigned({
      organizationId: ORG_ID,
      aggregateType: 'photo_ingestion_item',
      aggregateId: ITEM_ID,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: null,
    });
    expect(result).toEqual({
      routed: false,
      skipReason: ['envelope:invalid-shape'],
    });
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('AC-ROUTE-7: envelope kind invalid (kind="other") → skip with envelope:invalid-shape', async () => {
    const { svc } = buildSvc();
    const result = await svc.routeSigned({
      organizationId: ORG_ID,
      aggregateType: 'photo_ingestion_item',
      aggregateId: ITEM_ID,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: { kind: 'other' },
    });
    expect(result.routed).toBe(false);
    expect(result.skipReason).toEqual(['envelope:invalid-shape']);
  });

  it('AC-ROUTE-1: product happy path → calls lotRepo.save + emits PHOTO_INGESTION_DOWNSTREAM_ROUTED', async () => {
    const { svc, lotRepo, emitSpy } = buildSvc();
    lotRepo.findBySourcePhotoIngestionId.mockResolvedValue(null);
    lotRepo.save.mockImplementation(async (lot) => lot as Lot);

    const result = await svc.routeSigned(productEnvelope());

    expect(result.routed).toBe(true);
    expect(result.downstreamAggregateType).toBe('lot');
    expect(result.downstreamAggregateId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(lotRepo.save).toHaveBeenCalledTimes(1);

    const savedLot = lotRepo.save.mock.calls[0]![0] as Lot;
    expect(savedLot.organizationId).toBe(ORG_ID);
    expect(savedLot.locationId).toBe(LOCATION_ID);
    expect(savedLot.supplierId).toBe(SUPPLIER_ID);
    expect(savedLot.quantityReceived).toBe(12);
    expect(savedLot.unit).toBe('kg');
    expect(savedLot.sourcePhotoIngestionId).toBe(ITEM_ID);

    const routedEmit = emitSpy.mock.calls.find(
      ([ch]) => ch === AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED,
    );
    expect(routedEmit).toBeDefined();
    const env = routedEmit![1] as AuditEventEnvelope;
    expect(env.organizationId).toBe(ORG_ID);
    expect(env.aggregateId).toBe(ITEM_ID);
    expect(env.aggregateType).toBe('photo_ingestion_item');
    expect(env.actorKind).toBe('system');
    expect((env.payloadAfter as Record<string, unknown>).downstreamAggregateType).toBe('lot');
    expect((env.payloadAfter as Record<string, unknown>).alreadyRouted).toBeUndefined();
  });

  it('AC-ROUTE-2: invoice happy path → calls grRepo.save + emits PHOTO_INGESTION_DOWNSTREAM_ROUTED with lineItemsHint', async () => {
    const { svc, grRepo, emitSpy } = buildSvc();
    grRepo.findBySourcePhotoIngestionId.mockResolvedValue(null);
    grRepo.save.mockImplementation(async (gr) => gr as GoodsReceipt);

    const result = await svc.routeSigned(invoiceEnvelope());

    expect(result.routed).toBe(true);
    expect(result.downstreamAggregateType).toBe('goods_receipt');
    expect(grRepo.save).toHaveBeenCalledTimes(1);

    const savedGr = grRepo.save.mock.calls[0]![0] as GoodsReceipt;
    expect(savedGr.organizationId).toBe(ORG_ID);
    expect(savedGr.supplierId).toBe(SUPPLIER_ID);
    expect(savedGr.receivedAtLocationId).toBe(LOCATION_ID);
    // Falls back to signer when receiving_user_id field is absent
    expect(savedGr.receivingUserId).toBe(USER_ID);
    expect(savedGr.supplierInvoiceRef).toBe('INV-2026-0042');
    expect(savedGr.state).toBe('draft');
    expect(savedGr.sourcePhotoIngestionId).toBe(ITEM_ID);

    const env = emitSpy.mock.calls.find(
      ([ch]) => ch === AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED,
    )![1] as AuditEventEnvelope;
    const payload = env.payloadAfter as Record<string, unknown>;
    expect(payload.kind).toBe('invoice');
    expect(payload.downstreamAggregateType).toBe('goods_receipt');
    expect(Array.isArray(payload.lineItemsHint)).toBe(true);
    expect((payload.lineItemsHint as unknown[]).length).toBe(2);
  });

  it('AC-ROUTE-3: product re-fire when lot already exists → returns alreadyRouted=true without re-save', async () => {
    const { svc, lotRepo, emitSpy } = buildSvc();
    lotRepo.findBySourcePhotoIngestionId.mockResolvedValue({
      id: EXISTING_LOT_ID,
    } as Lot);

    const result = await svc.routeSigned(productEnvelope());

    expect(result).toEqual({
      routed: true,
      downstreamAggregateType: 'lot',
      downstreamAggregateId: EXISTING_LOT_ID,
      alreadyRouted: true,
    });
    expect(lotRepo.save).not.toHaveBeenCalled();
    const env = emitSpy.mock.calls.find(
      ([ch]) => ch === AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED,
    )![1] as AuditEventEnvelope;
    expect((env.payloadAfter as Record<string, unknown>).alreadyRouted).toBe(true);
  });

  it('AC-ROUTE-3: invoice re-fire when gr already exists → returns alreadyRouted=true without re-save', async () => {
    const { svc, grRepo, emitSpy } = buildSvc();
    grRepo.findBySourcePhotoIngestionId.mockResolvedValue({
      id: EXISTING_GR_ID,
    } as GoodsReceipt);

    const result = await svc.routeSigned(invoiceEnvelope());

    expect(result.alreadyRouted).toBe(true);
    expect(result.downstreamAggregateId).toBe(EXISTING_GR_ID);
    expect(grRepo.save).not.toHaveBeenCalled();
    expect(
      emitSpy.mock.calls.some(
        ([ch]) => ch === AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED,
      ),
    ).toBe(true);
  });

  it('AC-ROUTE-4: product missing gtin → emits PHOTO_INGESTION_ROUTING_SKIPPED with missing:gtin', async () => {
    const { svc, lotRepo, emitSpy } = buildSvc();
    lotRepo.findBySourcePhotoIngestionId.mockResolvedValue(null);
    const env = productEnvelope();
    // strip gtin from llmExtraction
    (env.payloadAfter as { llmExtraction: { fields: Array<{ name: string }> } }).llmExtraction.fields =
      (env.payloadAfter as { llmExtraction: { fields: Array<{ name: string }> } }).llmExtraction.fields.filter(
        (f) => f.name !== 'gtin',
      );

    const result = await svc.routeSigned(env);

    expect(result.routed).toBe(false);
    expect(result.skipReason).toContain('missing:gtin');
    expect(lotRepo.save).not.toHaveBeenCalled();

    const skippedEmit = emitSpy.mock.calls.find(
      ([ch]) => ch === AuditEventType.PHOTO_INGESTION_ROUTING_SKIPPED,
    );
    expect(skippedEmit).toBeDefined();
    const skipEnv = skippedEmit![1] as AuditEventEnvelope;
    expect((skipEnv.payloadAfter as Record<string, unknown>).reason).toEqual(
      expect.arrayContaining(['missing:gtin']),
    );
  });

  it('AC-ROUTE-4: invoice missing supplierInvoiceRef → emits SKIPPED', async () => {
    const { svc, grRepo } = buildSvc();
    grRepo.findBySourcePhotoIngestionId.mockResolvedValue(null);
    const env = invoiceEnvelope();
    (env.payloadAfter as { llmExtraction: { fields: Array<{ name: string }> } }).llmExtraction.fields =
      (env.payloadAfter as { llmExtraction: { fields: Array<{ name: string }> } }).llmExtraction.fields.filter(
        (f) => f.name !== 'supplier_invoice_ref',
      );

    const result = await svc.routeSigned(env);

    expect(result.routed).toBe(false);
    expect(result.skipReason).toContain('missing:supplierInvoiceRef');
    expect(grRepo.save).not.toHaveBeenCalled();
  });

  it('AC-ROUTE-5: multi-tenant — organizationId from envelope is forwarded as first param to both lookup and save', async () => {
    const { svc, lotRepo } = buildSvc();
    lotRepo.findBySourcePhotoIngestionId.mockResolvedValue(null);
    lotRepo.save.mockImplementation(async (lot) => lot as Lot);

    const otherOrg = '88888888-8888-4888-8888-888888888888';
    const env = productEnvelope();
    env.organizationId = otherOrg;

    await svc.routeSigned(env);

    expect(lotRepo.findBySourcePhotoIngestionId).toHaveBeenCalledWith(
      otherOrg,
      ITEM_ID,
    );
    const savedLot = lotRepo.save.mock.calls[0]![0] as Lot;
    expect(savedLot.organizationId).toBe(otherOrg);
  });

  it('AC-ROUTE-8: unique-violation race on lot save → returns alreadyRouted=true after re-lookup', async () => {
    const { svc, lotRepo, emitSpy } = buildSvc();
    lotRepo.findBySourcePhotoIngestionId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: EXISTING_LOT_ID } as Lot);
    const pgErr: Error & { code?: string } = Object.assign(new Error('duplicate'), {
      code: '23505',
    });
    lotRepo.save.mockRejectedValue(pgErr);

    const result = await svc.routeSigned(productEnvelope());

    expect(result).toEqual({
      routed: true,
      downstreamAggregateType: 'lot',
      downstreamAggregateId: EXISTING_LOT_ID,
      alreadyRouted: true,
    });
    const env = emitSpy.mock.calls.find(
      ([ch]) => ch === AuditEventType.PHOTO_INGESTION_DOWNSTREAM_ROUTED,
    )![1] as AuditEventEnvelope;
    expect((env.payloadAfter as Record<string, unknown>).alreadyRouted).toBe(true);
  });

  it('AC-ROUTE-8: non-unique-violation persistence error → emits SKIPPED with invariant reason', async () => {
    const { svc, lotRepo, emitSpy } = buildSvc();
    lotRepo.findBySourcePhotoIngestionId.mockResolvedValue(null);
    lotRepo.save.mockRejectedValue(new Error('connection lost'));

    const result = await svc.routeSigned(productEnvelope());

    expect(result.routed).toBe(false);
    expect(result.skipReason?.[0]).toMatch(/^invariant:/);
    expect(
      emitSpy.mock.calls.some(
        ([ch]) => ch === AuditEventType.PHOTO_INGESTION_ROUTING_SKIPPED,
      ),
    ).toBe(true);
  });
});
