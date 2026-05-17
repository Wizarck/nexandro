import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenTrattosRestClient } from '../http-client.js';
import { registerRecallCapabilities } from './recall.js';

const ORG = '11111111-1111-4111-8111-111111111111';

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface CapturedTool {
  cb: (args: Record<string, unknown>) => Promise<unknown>;
  config: { inputSchema?: Record<string, unknown> };
}

function captureTools(): {
  server: McpServer;
  tools: Map<string, CapturedTool>;
} {
  const tools = new Map<string, CapturedTool>();
  const server = {
    registerTool: jest.fn(
      (
        name: string,
        config: CapturedTool['config'],
        cb: CapturedTool['cb'],
      ) => {
        tools.set(name, { cb, config });
        return { name };
      },
    ),
  } as unknown as McpServer;
  return { server, tools };
}

describe('registerRecallCapabilities', () => {
  it('registers exactly one capability `recall.search-incident`', () => {
    const { server, tools } = captureTools();
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: jest.fn() as unknown as typeof fetch,
    });
    registerRecallCapabilities(server, rest);
    expect([...tools.keys()]).toEqual(['recall.search-incident']);
  });

  it('declares organizationId + query + types + limit in the input schema', () => {
    const { server, tools } = captureTools();
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: jest.fn() as unknown as typeof fetch,
    });
    registerRecallCapabilities(server, rest);
    const schema = tools.get('recall.search-incident')!.config.inputSchema;
    expect(schema).toHaveProperty('organizationId');
    expect(schema).toHaveProperty('query');
    expect(schema).toHaveProperty('types');
    expect(schema).toHaveProperty('limit');
  });

  it('forwards query + organizationId + types CSV to GET /m3/recall/search', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp({ hits: [] }));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerRecallCapabilities(server, rest);

    await tools.get('recall.search-incident')!.cb({
      organizationId: ORG,
      query: 'tomate',
      types: ['lot', 'supplier'],
      limit: 8,
    });

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/m3/recall/search?');
    expect(url).toContain(`organizationId=${encodeURIComponent(ORG)}`);
    expect(url).toContain('q=tomate');
    expect(url).toContain('types=lot%2Csupplier');
    expect(url).toContain('limit=8');
  });

  it('forwards X-Agent-Capability: recall.search-incident header', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp({ hits: [] }));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerRecallCapabilities(server, rest);

    await tools.get('recall.search-incident')!.cb({
      organizationId: ORG,
      query: 'pescado',
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Agent-Capability']).toBe('recall.search-incident');
  });
});
