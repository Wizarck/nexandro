import {
  OpenTrattosRestClient,
  RestApiError,
} from './http-client.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenTrattosRestClient', () => {
  it('forwards X-Via-Agent + X-Agent-Name + X-Agent-Capability + Authorization headers', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'claude-desktop',
      authToken: 'tok-123',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await client.request({
      method: 'GET',
      capabilityName: 'recipes.read',
      path: '/recipes/abc',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.test/recipes/abc');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['X-Via-Agent']).toBe('true');
    expect(headers['X-Agent-Name']).toBe('claude-desktop');
    expect(headers['X-Agent-Capability']).toBe('recipes.read');
    expect(headers['Authorization']).toBe('Bearer tok-123');
    expect(init?.method).toBe('GET');
  });

  it('encodes query params and skips undefined values', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, []));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test/',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await client.request({
      capabilityName: 'recipes.list',
      path: '/recipes',
      query: { nameContains: 'pa sta', limit: 10, offset: undefined },
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.test/recipes?nameContains=pa+sta&limit=10');
  });

  it('returns parsed JSON body for 2xx responses', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, { id: 'r1', name: 'Tomato Sauce' }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    const result = await client.request<{ id: string; name: string }>({
      capabilityName: 'recipes.read',
      path: '/recipes/r1',
    });
    expect(result).toEqual({ id: 'r1', name: 'Tomato Sauce' });
  });

  it('surfaces non-2xx responses as RestApiError carrying status + body', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(404, { code: 'NOT_FOUND' }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await expect(
      client.request({
        capabilityName: 'recipes.read',
        path: '/recipes/missing',
      }),
    ).rejects.toMatchObject({
      name: 'RestApiError',
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
  });

  it('handles non-JSON error bodies gracefully (text fallback)', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(
        new Response('upstream timeout', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        }),
      );
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    let captured: RestApiError | undefined;
    try {
      await client.request({
        capabilityName: 'recipes.read',
        path: '/recipes/x',
      });
    } catch (err) {
      captured = err as RestApiError;
    }
    expect(captured).toBeInstanceOf(RestApiError);
    expect(captured?.status).toBe(502);
    expect(captured?.body).toBe('upstream timeout');
  });

  it('throws on construction when required config is missing', () => {
    expect(
      () =>
        new OpenTrattosRestClient({
          baseUrl: '',
          agentName: 'a',
        }),
    ).toThrow(/baseUrl is required/);
    expect(
      () =>
        new OpenTrattosRestClient({
          baseUrl: 'http://api',
          agentName: '',
        }),
    ).toThrow(/agentName is required/);
  });

  it('serialises POST body as JSON with Content-Type and forwards Idempotency-Key', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(201, { id: 'r-new' }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const result = await client.request<{ id: string }>({
      method: 'POST',
      capabilityName: 'recipes.create',
      path: '/recipes',
      body: { name: 'Pasta', description: 'd', wasteFactor: 0.05, lines: [] },
      idempotencyKey: 'idem-123',
    });

    expect(result).toEqual({ id: 'r-new' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.test/recipes');
    expect(init?.method).toBe('POST');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Idempotency-Key']).toBe('idem-123');
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Pasta',
      description: 'd',
      wasteFactor: 0.05,
      lines: [],
    });
  });

  it('PUT round-trip serialises body and uses the right method', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await client.request({
      method: 'PUT',
      capabilityName: 'recipes.update',
      path: '/recipes/abc',
      query: { organizationId: 'org-1' },
      body: { name: 'New name' },
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://api.test/recipes/abc?organizationId=org-1');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'New name' });
  });

  it('PATCH round-trip serialises body', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await client.request({
      method: 'PATCH',
      capabilityName: 'ingredients.update',
      path: '/ingredients/i1',
      body: { name: 'Updated' },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Updated' });
  });

  it('DELETE without body sets no Content-Type', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, { id: 'i1' }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await client.request({
      method: 'DELETE',
      capabilityName: 'ingredients.delete',
      path: '/ingredients/i1',
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('DELETE');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it('DELETE with a body forwards the body as JSON', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await client.request({
      method: 'DELETE',
      capabilityName: 'something.delete',
      path: '/x',
      body: { reason: 'cleanup' },
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual({ reason: 'cleanup' });
  });

  it('GET silently ignores body even if accidentally provided', async () => {
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResponse(200, []));
    const client = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await client.request({
      method: 'GET',
      capabilityName: 'recipes.list',
      path: '/recipes',
      // intentional: GET with body should be ignored
      body: { foo: 'bar' } as unknown,
    });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });
});
