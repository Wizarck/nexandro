import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OpenTrattosRestClient } from '../../http-client.js';
import {
  WRITE_CAPABILITIES,
  UNSUPPORTED_VIA_MCP,
  renderPath,
} from './index.js';

export interface CapturedTool {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
  cb: (args: Record<string, unknown>) => Promise<unknown>;
}

export function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export interface WriteHarness {
  tools: Map<string, CapturedTool>;
  rest: OpenTrattosRestClient;
  fetchSpy: jest.Mock<
    Promise<Response>,
    [string | URL | Request, RequestInit | undefined]
  >;
  invoke: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Standalone harness for write-capability specs. Mirrors the read-side
 * `captureTools` pattern (`recipes.spec.ts`) — creates a fake McpServer that
 * captures `registerTool(name, config, cb)` invocations into a Map; spins
 * up a real `OpenTrattosRestClient` with an injected `fetchImpl` spy; and
 * registers every entry in `WRITE_CAPABILITIES` with the same handler shape
 * `buildServer()` uses. Tests then `harness.invoke('recipes.create', input)`
 * and inspect the resulting fetch call.
 */
export function makeWriteHarness(): WriteHarness {
  const tools = new Map<string, CapturedTool>();
  const fetchSpy = jest
    .fn<Promise<Response>, [string | URL | Request, RequestInit | undefined]>()
    .mockResolvedValue(jsonResp({ ok: true }));
  const rest = new OpenTrattosRestClient({
    baseUrl: 'http://api.test',
    agentName: 'test-agent',
    authToken: 'tok',
    fetchImpl: fetchSpy as unknown as typeof fetch,
  });

  const fakeServer = {
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

  for (const cap of WRITE_CAPABILITIES) {
    fakeServer.registerTool(
      cap.name,
      {
        title: cap.title ?? cap.name,
        description: cap.description,
        inputSchema: cap.schema,
      },
      async (input: unknown) => {
        if (UNSUPPORTED_VIA_MCP.has(cap.name)) {
          throw new Error(
            `${cap.name} via MCP not yet supported; use REST endpoint ${cap.restMethod} ${cap.restPathTemplate} with multipart/form-data`,
          );
        }
        const inputObj = (input ?? {}) as Record<string, unknown>;
        const idempotencyKey =
          cap.forwardIdempotencyKey === false
            ? undefined
            : (inputObj['idempotencyKey'] as string | undefined);
        const pathParams = cap.restPathParams
          ? cap.restPathParams(input)
          : {};
        const path = renderPath(cap.restPathTemplate, pathParams);
        const body = cap.restBodyExtractor
          ? cap.restBodyExtractor(input)
          : input;
        const query = cap.restQueryExtractor
          ? cap.restQueryExtractor(input)
          : undefined;
        const result = await rest.request<unknown>({
          method: cap.restMethod,
          capabilityName: cap.name,
          path,
          query,
          body,
          idempotencyKey,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      },
    );
  }

  const invoke = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    const tool = tools.get(name);
    if (!tool) throw new Error(`makeWriteHarness: unknown tool "${name}"`);
    return tool.cb(args);
  };

  return { tools, rest, fetchSpy, invoke };
}

export interface ParsedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export function parseFetchCall(
  fetchSpy: jest.Mock,
  index = 0,
): ParsedRequest {
  const call = fetchSpy.mock.calls[index] as
    | [string | URL | Request, RequestInit | undefined]
    | undefined;
  if (!call) {
    throw new Error(`parseFetchCall: no fetch call at index ${index}`);
  }
  const [urlInput, init] = call;
  const url = typeof urlInput === 'string' ? urlInput : String(urlInput);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const method = init?.method ?? 'GET';
  const body =
    init?.body === undefined || init.body === null
      ? undefined
      : JSON.parse(String(init.body));
  return { url, method, headers, body };
}
