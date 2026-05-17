import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('iam.locations write capabilities', () => {
  it('iam.locations.create posts to /locations', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.locations.create', {
      organizationId: 'org-1',
      name: 'Madrid Centro',
      type: 'RESTAURANT',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/locations');
    expect(req.body).toMatchObject({
      name: 'Madrid Centro',
      type: 'RESTAURANT',
    });
  });

  it('iam.locations.update PATCHes /locations/:id', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.locations.update', { id: 'l-1', name: 'Renamed' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PATCH');
    expect(req.url).toBe('http://api.test/locations/l-1');
    expect(req.body).toEqual({ name: 'Renamed' });
  });

  it('iam.locations.delete sends DELETE', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.locations.delete', { id: 'l-1' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://api.test/locations/l-1');
  });
});
