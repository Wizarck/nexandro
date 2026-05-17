import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('labels write capabilities', () => {
  it('labels.print posts to /recipes/:id/print', async () => {
    const h = makeWriteHarness();
    await h.invoke('labels.print', {
      id: 'r-1',
      organizationId: 'org-1',
      copies: 3,
      locale: 'es',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/recipes/r-1/print');
    expect(req.body).toEqual({
      organizationId: 'org-1',
      copies: 3,
      locale: 'es',
    });
  });

  it('labels.setOrgLabelFields PUTs /organizations/:id/label-fields', async () => {
    const h = makeWriteHarness();
    await h.invoke('labels.setOrgLabelFields', {
      id: 'org-1',
      businessName: 'Restaurante Tagliatelle',
      pageSize: 'a4',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PUT');
    expect(req.url).toBe('http://api.test/organizations/org-1/label-fields');
    expect(req.body).toEqual({
      businessName: 'Restaurante Tagliatelle',
      pageSize: 'a4',
    });
  });
});
