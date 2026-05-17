import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('ingredients write capabilities', () => {
  it('ingredients.create posts to /ingredients', async () => {
    const h = makeWriteHarness();
    await h.invoke('ingredients.create', {
      organizationId: 'org-1',
      categoryId: 'cat-1',
      name: 'Tomato',
      baseUnitType: 'WEIGHT',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/ingredients');
    expect(req.body).toMatchObject({ name: 'Tomato', baseUnitType: 'WEIGHT' });
  });

  it('ingredients.update PATCHes /ingredients/:id and strips id from body', async () => {
    const h = makeWriteHarness();
    await h.invoke('ingredients.update', {
      id: 'i-1',
      name: 'Tomato (San Marzano)',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PATCH');
    expect(req.url).toBe('http://api.test/ingredients/i-1');
    expect(req.body).toEqual({ name: 'Tomato (San Marzano)' });
  });

  it('ingredients.delete sends DELETE with no body', async () => {
    const h = makeWriteHarness();
    await h.invoke('ingredients.delete', { id: 'i-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://api.test/ingredients/i-1');
    expect(req.body).toBeUndefined();
  });

  it('ingredients.reactivate posts to the reactivate sub-path', async () => {
    const h = makeWriteHarness();
    await h.invoke('ingredients.reactivate', { id: 'i-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/ingredients/i-1/reactivate');
  });

  it('ingredients.applyOverride lifts organizationId to query', async () => {
    const h = makeWriteHarness();
    await h.invoke('ingredients.applyOverride', {
      organizationId: 'org-1',
      id: 'i-1',
      field: 'allergens',
      value: ['gluten'],
      reason: 'corrected by chef after recipe sampling',
      actorUserId: 'u-1',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe(
      'http://api.test/ingredients/i-1/overrides?organizationId=org-1',
    );
    expect(req.body).toEqual({
      field: 'allergens',
      value: ['gluten'],
      reason: 'corrected by chef after recipe sampling',
      actorUserId: 'u-1',
    });
  });

  it('ingredients.import rejects with a clear "use REST directly" error', async () => {
    const h = makeWriteHarness();
    await expect(h.invoke('ingredients.import', {})).rejects.toThrow(
      /ingredients\.import.*not yet supported.*multipart\/form-data/,
    );
    expect(h.fetchSpy).not.toHaveBeenCalled();
  });
});
