import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenTrattosRestClient } from '../http-client.js';
import { registerMenuItemsCapabilities } from './menu-items.js';

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

describe('registerMenuItemsCapabilities', () => {
  it('registers menu-items.read + menu-items.list', () => {
    const { server, tools } = captureTools();
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: jest.fn() as unknown as typeof fetch,
    });
    registerMenuItemsCapabilities(server, rest);
    expect([...tools.keys()].sort()).toEqual([
      'menu-items.list',
      'menu-items.read',
    ]);
  });

  it('menu-items.read proxies GET /menu-items/:id', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp({ id: 'mi1', name: 'Carbonara' }));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerMenuItemsCapabilities(server, rest);

    await tools.get('menu-items.read')!.cb({ id: 'mi1' });
    expect(fetchSpy.mock.calls[0][0]).toBe('http://api.test/menu-items/mi1');
  });

  it('menu-items.list proxies GET /menu-items with filters', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp([]));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerMenuItemsCapabilities(server, rest);

    await tools.get('menu-items.list')!.cb({ nameContains: 'pizza', limit: 5 });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/menu-items?');
    expect(url).toContain('nameContains=pizza');
    expect(url).toContain('limit=5');
  });
});
