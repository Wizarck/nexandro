import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('recipes write capabilities', () => {
  it('recipes.create posts the body to /recipes', async () => {
    const h = makeWriteHarness();
    await h.invoke('recipes.create', {
      organizationId: '11111111-1111-4111-8111-111111111111',
      name: 'Tomato Sauce',
      description: 'Slow-cooked',
      wasteFactor: 0.05,
      lines: [],
      idempotencyKey: 'idem-1',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/recipes');
    expect(req.body).toEqual({
      organizationId: '11111111-1111-4111-8111-111111111111',
      name: 'Tomato Sauce',
      description: 'Slow-cooked',
      wasteFactor: 0.05,
      lines: [],
      idempotencyKey: 'idem-1',
    });
    expect(req.headers['Idempotency-Key']).toBe('idem-1');
    expect(req.headers['X-Agent-Capability']).toBe('recipes.create');
    expect(req.headers['Content-Type']).toBe('application/json');
  });

  it('recipes.update lifts organizationId to query and id to path; strips both from body', async () => {
    const h = makeWriteHarness();
    await h.invoke('recipes.update', {
      organizationId: '22222222-2222-4222-8222-222222222222',
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Renamed',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PUT');
    expect(req.url).toBe(
      'http://api.test/recipes/33333333-3333-4333-8333-333333333333?organizationId=22222222-2222-4222-8222-222222222222',
    );
    expect(req.body).toEqual({ name: 'Renamed' });
  });

  it('recipes.setLineSource uses two path params', async () => {
    const h = makeWriteHarness();
    await h.invoke('recipes.setLineSource', {
      organizationId: 'org-1',
      id: 'r-1',
      lineId: 'l-2',
      sourceOverrideRef: 'si-9',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PUT');
    expect(req.url).toBe(
      'http://api.test/recipes/r-1/lines/l-2/source?organizationId=org-1',
    );
    expect(req.body).toEqual({ sourceOverrideRef: 'si-9' });
  });

  it('recipes.delete sends no body', async () => {
    const h = makeWriteHarness();
    await h.invoke('recipes.delete', {
      organizationId: 'org-1',
      id: 'r-1',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://api.test/recipes/r-1?organizationId=org-1');
    expect(req.body).toBeUndefined();
  });

  it('recipes.setAllergensOverride forwards the override payload', async () => {
    const h = makeWriteHarness();
    await h.invoke('recipes.setAllergensOverride', {
      organizationId: 'org-1',
      id: 'r-1',
      add: ['gluten'],
      remove: [],
      reason: 'finishing-step sesame',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PUT');
    expect(req.url).toBe(
      'http://api.test/recipes/r-1/allergens-override?organizationId=org-1',
    );
    expect(req.body).toEqual({
      add: ['gluten'],
      remove: [],
      reason: 'finishing-step sesame',
    });
  });

  it('recipes.setDietFlagsOverride forwards flags + reason', async () => {
    const h = makeWriteHarness();
    await h.invoke('recipes.setDietFlagsOverride', {
      organizationId: 'org-1',
      id: 'r-1',
      flags: ['vegan'],
      reason: 'verified by certified supplier',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.url).toBe(
      'http://api.test/recipes/r-1/diet-flags-override?organizationId=org-1',
    );
    expect(req.body).toEqual({
      flags: ['vegan'],
      reason: 'verified by certified supplier',
    });
  });

  it('recipes.setCrossContamination forwards note + structured allergens', async () => {
    const h = makeWriteHarness();
    await h.invoke('recipes.setCrossContamination', {
      organizationId: 'org-1',
      id: 'r-1',
      note: 'Made on shared line with peanuts',
      allergens: ['peanut'],
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.url).toBe(
      'http://api.test/recipes/r-1/cross-contamination?organizationId=org-1',
    );
    expect(req.body).toEqual({
      note: 'Made on shared line with peanuts',
      allergens: ['peanut'],
    });
  });
});
