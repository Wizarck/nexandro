import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenTrattosRestClient } from '../http-client.js';
import { registerRecipesCapabilities } from './recipes.js';

interface CapturedTool {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
  cb: (args: Record<string, unknown>) => Promise<unknown>;
}

function captureTools(): { server: McpServer; tools: Map<string, CapturedTool> } {
  const tools = new Map<string, CapturedTool>();
  const server = {
    registerTool: jest.fn(
      (
        name: string,
        config: CapturedTool['config'],
        cb: CapturedTool['cb'],
      ) => {
        tools.set(name, { name, config, cb });
        return { name };
      },
    ),
  } as unknown as McpServer;
  return { server, tools };
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('registerRecipesCapabilities', () => {
  it('registers recipes.read + recipes.list with the expected wire format', () => {
    const { server, tools } = captureTools();
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: jest.fn() as unknown as typeof fetch,
    });
    registerRecipesCapabilities(server, rest);

    expect([...tools.keys()].sort()).toEqual(['recipes.list', 'recipes.read']);

    const read = tools.get('recipes.read')!;
    expect(read.config.title).toBe('Read recipe by ID');
    expect(read.config.inputSchema).toHaveProperty('id');

    const list = tools.get('recipes.list')!;
    expect(list.config.inputSchema).toHaveProperty('nameContains');
    expect(list.config.inputSchema).toHaveProperty('limit');
    expect(list.config.inputSchema).toHaveProperty('offset');
  });

  it('recipes.read proxies GET /recipes/:id and returns the body as text content', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp({ id: 'r1', name: 'Tomato Sauce' }));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerRecipesCapabilities(server, rest);

    const result = (await tools.get('recipes.read')!.cb({ id: 'r1' })) as {
      content: { type: string; text: string }[];
    };
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('http://api.test/recipes/r1');
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({
      id: 'r1',
      name: 'Tomato Sauce',
    });
  });

  it('recipes.list forwards filter + pagination as query params', async () => {
    const { server, tools } = captureTools();
    const fetchSpy = jest
      .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
      .mockResolvedValue(jsonResp([]));
    const rest = new OpenTrattosRestClient({
      baseUrl: 'http://api.test',
      agentName: 'a',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    registerRecipesCapabilities(server, rest);

    await tools.get('recipes.list')!.cb({
      nameContains: 'sauce',
      limit: 25,
      offset: 0,
    });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toMatch(/^http:\/\/api\.test\/recipes\?/);
    expect(url).toContain('nameContains=sauce');
    expect(url).toContain('limit=25');
    expect(url).toContain('offset=0');
  });
});
