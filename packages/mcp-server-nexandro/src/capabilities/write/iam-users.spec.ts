import {
  makeWriteHarness,
  parseFetchCall,
} from './test-helpers.spec-utils.js';

describe('iam.users write capabilities', () => {
  it('iam.users.create posts to /users', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.users.create', {
      organizationId: 'org-1',
      name: 'Lourdes',
      email: 'lourdes@example.com',
      password: 'hunter22!',
      role: 'MANAGER',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/users');
    expect(req.body).toMatchObject({
      email: 'lourdes@example.com',
      role: 'MANAGER',
    });
  });

  it('iam.users.update PATCHes /users/:id', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.users.update', { id: 'u-1', role: 'STAFF' });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('PATCH');
    expect(req.url).toBe('http://api.test/users/u-1');
    expect(req.body).toEqual({ role: 'STAFF' });
  });

  it('iam.users.changePassword posts to the change-password sub-path', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.users.changePassword', {
      id: 'u-1',
      newPassword: 'fresh-secret',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/users/u-1/change-password');
    expect(req.body).toEqual({ newPassword: 'fresh-secret' });
  });

  it('iam.users.addLocation posts the locationIds set', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.users.addLocation', {
      id: 'u-1',
      locationIds: ['l-1', 'l-2'],
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://api.test/users/u-1/locations');
    expect(req.body).toEqual({ locationIds: ['l-1', 'l-2'] });
  });

  it('iam.users.removeLocation deletes /users/:id/locations/:locationId', async () => {
    const h = makeWriteHarness();
    await h.invoke('iam.users.removeLocation', {
      id: 'u-1',
      locationId: 'l-9',
    });
    const req = parseFetchCall(h.fetchSpy);
    expect(req.method).toBe('DELETE');
    expect(req.url).toBe('http://api.test/users/u-1/locations/l-9');
    expect(req.body).toBeUndefined();
  });
});
