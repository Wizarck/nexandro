import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('iam.organizations write capabilities', () => {
  it('iam.organizations.create posts to /organizations', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.organizations.create', {
      name: 'Acme Restaurants',
      currencyCode: 'EUR',
      defaultLocale: 'es',
      timezone: 'Europe/Madrid',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/organizations');
    expect(req.body).toMatchObject({ currencyCode: 'EUR' });
  });

  it('iam.organizations.update PATCHes /organizations/:id', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.organizations.update', {
      id: 'org-1',
      name: 'Renamed',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PATCH');
    expect(req.url).toBe('http://api.test/organizations/org-1');
    expect(req.body).toEqual({ name: 'Renamed' });
  });
});
