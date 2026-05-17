import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('external-catalog write capabilities', () => {
  it('external-catalog.sync posts to /external-catalog/sync with no body', async () => {
    const h = makeWriteHarness();
    await h.invoke('external-catalog.sync', {});
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/external-catalog/sync');
    expect(req.body).toBeUndefined();
  });

  it('external-catalog.sync forwards Idempotency-Key when provided', async () => {
    const h = makeWriteHarness();
    await h.invoke('external-catalog.sync', { idempotencyKey: 'idem-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.headers['Idempotency-Key']).toBe('idem-1');
  });
});
