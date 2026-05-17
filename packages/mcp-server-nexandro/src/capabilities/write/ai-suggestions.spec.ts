import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('ai-suggestions write capabilities', () => {
  it('ai-suggestions.yield posts to /ai-suggestions/yield', async () => {
    const h = makeWriteHarness();
    await h.invoke('ai-suggestions.yield', {
      organizationId: 'org-1',
      ingredientId: 'i-1',
      contextHash: 'ctx-1',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/ai-suggestions/yield');
    expect(req.body).toMatchObject({
      organizationId: 'org-1',
      ingredientId: 'i-1',
      contextHash: 'ctx-1',
    });
  });

  it('ai-suggestions.waste posts to /ai-suggestions/waste', async () => {
    const h = makeWriteHarness();
    await h.invoke('ai-suggestions.waste', {
      organizationId: 'org-1',
      recipeId: 'r-1',
      contextHash: 'ctx-1',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/ai-suggestions/waste');
  });

  it('ai-suggestions.accept omits value when not provided', async () => {
    const h = makeWriteHarness();
    await h.invoke('ai-suggestions.accept', {
      id: 's-1',
      organizationId: 'org-1',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/ai-suggestions/s-1/accept');
    expect(req.body).toEqual({ organizationId: 'org-1' });
  });

  it('ai-suggestions.accept includes a tweaked value when provided', async () => {
    const h = makeWriteHarness();
    await h.invoke('ai-suggestions.accept', {
      id: 's-1',
      organizationId: 'org-1',
      value: 0.9,
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.body).toEqual({ organizationId: 'org-1', value: 0.9 });
  });

  it('ai-suggestions.reject forwards reason', async () => {
    const h = makeWriteHarness();
    await h.invoke('ai-suggestions.reject', {
      id: 's-1',
      organizationId: 'org-1',
      reason: 'value disagrees with our supplier sheet',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/ai-suggestions/s-1/reject');
    expect(req.body).toEqual({
      organizationId: 'org-1',
      reason: 'value disagrees with our supplier sheet',
    });
  });
});
