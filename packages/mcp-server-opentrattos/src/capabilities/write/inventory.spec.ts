import { INVENTORY_WRITE_CAPABILITIES } from './inventory.js';

describe('INVENTORY_WRITE_CAPABILITIES (slice #17a m3-photo-ingest-backend)', () => {
  it('contains exactly 3 entries', () => {
    expect(INVENTORY_WRITE_CAPABILITIES).toHaveLength(3);
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
});
