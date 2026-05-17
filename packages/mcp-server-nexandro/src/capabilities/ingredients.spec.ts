import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenTrattosRestClient } from '../http-client.js';
import { registerIngredientsCapabilities } from './ingredients.js';

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
      (name: string, config: CapturedTool['config'], cb: CapturedTool['cb']) => {
        tools.set(name, { cb, config });
        return { name };
      },
    ),
  } as unknown as McpServer;
  return { server, tools };
}

describe('registerIngredientsCapabilities', () => {
  it('registers ingredients.read + ingredients.search', () => {
    const { server, tools } = captureTools();
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: jest.fn() as unknown as typeof fetch,
    });
    registerIngredientsCapabilities(server, rest);
    expect([...tools.keys()].sort()).toEqual([
      'ingredients.read',
      'ingredients.search',
    ]);
    expect(tools.get('ingredients.search')!.config.inputSchema).toHaveProperty(
      'barcode',
    );
    expect(tools.get('ingredients.search')!.config.inputSchema).toHaveProperty(
      'query',
    );
  });

  it('ingredients.read proxies GET /ingredients/:id', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp({ id: 'i1', name: 'Tomato' }));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerIngredientsCapabilities(server, rest);

    await tools.get('ingredients.read')!.cb({ id: 'i1' });
    expect(fetchSpy.mock.calls[0][0]).toBe('http://api.test/ingredients/i1');
  });

  it('ingredients.search forwards barcode as ?barcode=', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp([]));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerIngredientsCapabilities(server, rest);

    await tools.get('ingredients.search')!.cb({
      barcode: '1234567890123',
    });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/ingredients?');
    expect(url).toContain('barcode=1234567890123');
  });

  it('ingredients.search forwards query as ?q=', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp([]));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerIngredientsCapabilities(server, rest);

    await tools.get('ingredients.search')!.cb({ query: 'tomato' });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('q=tomato');
  });
});
