import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NexandroRestClient } from './http-client.js';
import { registerRecipesCapabilities } from './capabilities/recipes.js';
import { registerMenuItemsCapabilities } from './capabilities/menu-items.js';
import { registerIngredientsCapabilities } from './capabilities/ingredients.js';
import { registerRecallCapabilities } from './capabilities/recall.js';
import { registerReviewQueueCapabilities } from './capabilities/review-queue.js';
import {
  WRITE_CAPABILITIES,
  UNSUPPORTED_VIA_MCP,
  renderPath,
} from './capabilities/write/index.js';

/**
 * MCP server `nexandro` — m2-mcp-server (read-only first per Gate D).
 * Extended by `m2-mcp-write-capabilities` (Wave 1.13) with 43 write
 * capabilities across 12 namespaces, registered via the `WRITE_CAPABILITIES`
 * registry pattern (ADR-MCP-W-REGISTRY).
 *
 * `buildServer` is the test-friendly factory — it returns an `McpServer`
 * with every capability descriptor wired against a single
 * `NexandroRestClient`. The stdio bootstrap lives in `server.ts` so this
 * module can be `import`-ed by tests without triggering side effects.
 *
 * Configuration is environment-only — see the README for the env-var matrix.
 */
export interface ServerOptions {
  apiBaseUrl: string;
  agentName: string;
  authToken?: string;
}

export function buildServer(options: ServerOptions): {
  server: McpServer;
  rest: NexandroRestClient;
} {
  const rest = new NexandroRestClient({
    baseUrl: options.apiBaseUrl,
    agentName: options.agentName,
    authToken: options.authToken,
  });

  const server = new McpServer({
    name: 'nexandro',
    version: '0.1.0',
  });

  registerRecipesCapabilities(server, rest);
  registerMenuItemsCapabilities(server, rest);
  registerIngredientsCapabilities(server, rest);
  registerRecallCapabilities(server, rest);
  registerReviewQueueCapabilities(server, rest);

  // m2-mcp-write-capabilities (Wave 1.13) — registry-driven write tools.
  for (const cap of WRITE_CAPABILITIES) {
    server.registerTool(
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

  return { server, rest };
}

export function readOptionsFromEnv(): ServerOptions {
  return {
    apiBaseUrl:
      process.env['NEXANDRO_API_BASE_URL'] ?? 'http://localhost:3000',
    agentName:
      process.env['NEXANDRO_AGENT_NAME'] ?? 'nexandro-mcp-server',
    authToken: process.env['NEXANDRO_AGENT_AUTH_TOKEN'],
  };
}
