import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('supplier-items write capabilities', () => {
  it('supplier-items.create posts to /supplier-items', async () => {
    const h = makeWriteHarness();
    await h.invoke('supplier-items.create', {
      supplierId: 's-1',
      ingredientId: 'i-1',
      purchaseUnit: '5 kg Box',
      purchaseUnitQty: 5,
      purchaseUnitType: 'kg',
      unitPrice: 25,
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/supplier-items');
    expect(req.body).toMatchObject({ supplierId: 's-1', ingredientId: 'i-1' });
  });

  it('supplier-items.update PATCHes /supplier-items/:id', async () => {
    const h = makeWriteHarness();
    await h.invoke('supplier-items.update', { id: 'si-1', unitPrice: 30 });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PATCH');
    expect(req.url).toBe('http://api.test/supplier-items/si-1');
    expect(req.body).toEqual({ unitPrice: 30 });
  });

  it('supplier-items.promotePreferred posts to the promote sub-path', async () => {
    const h = makeWriteHarness();
    await h.invoke('supplier-items.promotePreferred', { id: 'si-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe(
      'http://api.test/supplier-items/si-1/promote-preferred',
    );
    expect(req.body).toBeUndefined();
  });

  it('supplier-items.delete sends DELETE', async () => {
    const h = makeWriteHarness();
    await h.invoke('supplier-items.delete', { id: 'si-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://api.test/supplier-items/si-1');
  });
});
