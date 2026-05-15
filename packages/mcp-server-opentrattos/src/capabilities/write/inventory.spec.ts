import { INVENTORY_WRITE_CAPABILITIES } from './inventory.js';

describe('INVENTORY_WRITE_CAPABILITIES (slice #17a m3-photo-ingest-backend + H1b retroactive + review-queue clear)', () => {
  it('contains exactly 5 entries', () => {
    expect(INVENTORY_WRITE_CAPABILITIES).toHaveLength(5);
  });

  it('every entry names the inventory namespace', () => {
    for (const cap of INVENTORY_WRITE_CAPABILITIES) {
      expect(cap.name.startsWith('inventory.')).toBe(true);
    }
  });

  it('every entry carries an optional idempotencyKey field', () => {
    for (const cap of INVENTORY_WRITE_CAPABILITIES) {
      expect(cap.schema['idempotencyKey']).toBeDefined();
    }
  });

  it('ingest-invoice-photo proxies POST /m3/photo-ingest/items and pins kind=invoice', () => {
    const cap = INVENTORY_WRITE_CAPABILITIES.find(
      (c) => c.name === 'inventory.ingest-invoice-photo',
    );
    expect(cap).toBeDefined();
    expect(cap!.restMethod).toBe('POST');
    expect(cap!.restPathTemplate).toBe('/m3/photo-ingest/items');
    const body = cap!.restBodyExtractor!({
      organizationId: 'org-1',
      photoId: 'photo-1',
      idempotencyKey: 'idem-1',
    }) as Record<string, unknown>;
    expect(body.kind).toBe('invoice');
    expect(body.idempotencyKey).toBeUndefined();
    expect(body.organizationId).toBe('org-1');
    expect(body.photoId).toBe('photo-1');
  });

  it('ingest-product-photo pins kind=product', () => {
    const cap = INVENTORY_WRITE_CAPABILITIES.find(
      (c) => c.name === 'inventory.ingest-product-photo',
    );
    expect(cap).toBeDefined();
    const body = cap!.restBodyExtractor!({
      organizationId: 'org-1',
      photoId: 'photo-1',
    }) as Record<string, unknown>;
    expect(body.kind).toBe('product');
  });

  it('sign-photo-ingestion routes :itemId via restPathParams + strips itemId from body', () => {
    const cap = INVENTORY_WRITE_CAPABILITIES.find(
      (c) => c.name === 'inventory.sign-photo-ingestion',
    );
    expect(cap).toBeDefined();
    expect(cap!.restPathTemplate).toBe('/m3/photo-ingest/items/:itemId/sign');
    expect(typeof cap!.restPathParams).toBe('function');
    const params = cap!.restPathParams!({ itemId: 'item-1' });
    expect(params).toEqual({ itemId: 'item-1' });
    const body = cap!.restBodyExtractor!({
      itemId: 'item-1',
      organizationId: 'org-1',
      fieldCorrections: [{ name: 'supplier_name', value: 'ACME', confidence: 1 }],
      idempotencyKey: 'idem-1',
    }) as Record<string, unknown>;
    expect(body.itemId).toBeUndefined();
    expect(body.idempotencyKey).toBeUndefined();
    expect(body.fieldCorrections).toEqual([
      { name: 'supplier_name', value: 'ACME', confidence: 1 },
    ]);
  });

  it('retroactive-correct-photo-ingestion routes :itemId + strips itemId + idempotencyKey, preserves reason', () => {
    const cap = INVENTORY_WRITE_CAPABILITIES.find(
      (c) => c.name === 'inventory.retroactive-correct-photo-ingestion',
    );
    expect(cap).toBeDefined();
    expect(cap!.restPathTemplate).toBe(
      '/m3/photo-ingest/items/:itemId/retroactive-correction',
    );
    expect(typeof cap!.restPathParams).toBe('function');
    const params = cap!.restPathParams!({ itemId: 'item-1' });
    expect(params).toEqual({ itemId: 'item-1' });
    const body = cap!.restBodyExtractor!({
      itemId: 'item-1',
      organizationId: 'org-1',
      fieldCorrections: [{ name: 'qty', value: 12, confidence: 1 }],
      reason: 'Corrected qty after manual count',
      idempotencyKey: 'idem-1',
    }) as Record<string, unknown>;
    expect(body.itemId).toBeUndefined();
    expect(body.idempotencyKey).toBeUndefined();
    expect(body.organizationId).toBe('org-1');
    expect(body.reason).toBe('Corrected qty after manual count');
    expect(body.fieldCorrections).toEqual([
      { name: 'qty', value: 12, confidence: 1 },
    ]);
  });

  it('clear-review-flag routes :aggregateType + :aggregateId + strips them from body', () => {
    const cap = INVENTORY_WRITE_CAPABILITIES.find(
      (c) => c.name === 'inventory.clear-review-flag',
    );
    expect(cap).toBeDefined();
    expect(cap!.restPathTemplate).toBe(
      '/m3/review-queue/:aggregateType/:aggregateId/clear',
    );
    expect(typeof cap!.restPathParams).toBe('function');
    const params = cap!.restPathParams!({
      aggregateType: 'lot',
      aggregateId: 'lot-1',
    });
    expect(params).toEqual({ aggregateType: 'lot', aggregateId: 'lot-1' });
    const body = cap!.restBodyExtractor!({
      organizationId: 'org-1',
      aggregateType: 'lot',
      aggregateId: 'lot-1',
      idempotencyKey: 'idem-1',
    }) as Record<string, unknown>;
    expect(body.organizationId).toBe('org-1');
    expect(body.aggregateType).toBeUndefined();
    expect(body.aggregateId).toBeUndefined();
    expect(body.idempotencyKey).toBeUndefined();
  });
});
