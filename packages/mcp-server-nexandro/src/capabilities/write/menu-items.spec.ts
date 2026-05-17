import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('menu-items write capabilities', () => {
  it('menu-items.create posts the body to /menu-items', async () => {
    const h = makeWriteHarness();
    await h.invoke('menu-items.create', {
      organizationId: 'org-1',
      recipeId: 'r-1',
      locationId: 'l-1',
      channel: 'DINE_IN',
      sellingPrice: 12.5,
      targetMargin: 0.65,
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/menu-items');
    expect(req.body).toMatchObject({
      organizationId: 'org-1',
      recipeId: 'r-1',
      channel: 'DINE_IN',
      sellingPrice: 12.5,
    });
  });

  it('menu-items.update lifts organizationId to query', async () => {
    const h = makeWriteHarness();
    await h.invoke('menu-items.update', {
      organizationId: 'org-1',
      id: 'mi-1',
      sellingPrice: 13.5,
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PUT');
    expect(req.url).toBe(
      'http://api.test/menu-items/mi-1?organizationId=org-1',
    );
    expect(req.body).toEqual({ sellingPrice: 13.5 });
  });

  it('menu-items.delete sends DELETE with query and no body', async () => {
    const h = makeWriteHarness();
    await h.invoke('menu-items.delete', {
      organizationId: 'org-1',
      id: 'mi-1',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe(
      'http://api.test/menu-items/mi-1?organizationId=org-1',
    );
    expect(req.body).toBeUndefined();
  });
});
