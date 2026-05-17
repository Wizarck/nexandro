import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('categories write capabilities', () => {
  it('categories.create posts to /categories', async () => {
    const h = makeWriteHarness();
    await h.invoke('categories.create', {
      organizationId: 'org-1',
      name: 'Pasta',
      nameEs: 'Pasta',
      nameEn: 'Pasta',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/categories');
    expect(req.body).toMatchObject({ name: 'Pasta' });
  });

  it('categories.update PATCHes /categories/:id and strips id from body', async () => {
    const h = makeWriteHarness();
    await h.invoke('categories.update', {
      id: 'c-1',
      name: 'Renamed',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PATCH');
    expect(req.url).toBe('http://api.test/categories/c-1');
    expect(req.body).toEqual({ name: 'Renamed' });
  });

  it('categories.delete sends DELETE with no body', async () => {
    const h = makeWriteHarness();
    await h.invoke('categories.delete', { id: 'c-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://api.test/categories/c-1');
    expect(req.body).toBeUndefined();
  });
});
