import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('suppliers write capabilities', () => {
  it('suppliers.create posts to /suppliers', async () => {
    const h = makeWriteHarness();
    await h.invoke('suppliers.create', {
      organizationId: 'org-1',
      name: 'Mercato S.R.L.',
      country: 'IT',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/suppliers');
    expect(req.body).toMatchObject({ name: 'Mercato S.R.L.', country: 'IT' });
  });

  it('suppliers.update PATCHes /suppliers/:id', async () => {
    const h = makeWriteHarness();
    await h.invoke('suppliers.update', {
      id: 's-1',
      name: 'Renamed Supplier',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PATCH');
    expect(req.url).toBe('http://api.test/suppliers/s-1');
    expect(req.body).toEqual({ name: 'Renamed Supplier' });
  });

  it('suppliers.delete sends DELETE', async () => {
    const h = makeWriteHarness();
    await h.invoke('suppliers.delete', { id: 's-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://api.test/suppliers/s-1');
  });
});
