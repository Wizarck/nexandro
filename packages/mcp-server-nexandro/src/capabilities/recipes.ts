import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OpenTrattosRestClient } from '../http-client.js';

/**
 * Read-only Recipe capabilities exposed via MCP.
 *
 * Wire contract (m2-mcp-server, design.md goals):
 *   recipes.read(id)        → GET /recipes/:id
 *   recipes.list(filter?)   → GET /recipes
 *
 * Write capabilities (`recipes.create`, `recipes.update`) are deferred to
 * `m2-mcp-extras`. Do not add them here without amending the slice spec.
 */
export function registerRecipesCapabilities(
  server: McpServer,
  rest: OpenTrattosRestClient,
): void {
  server.registerTool(
    'recipes.read',
    {
      title: 'Read recipe by ID',
      description:
        'Fetches a single Recipe by UUID. Proxies GET /recipes/:id on the nexandro REST API.',
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe('Recipe UUID (the `id` field returned by recipes.list)'),
      },
    },
    async ({ id }) => {
      const recipe = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'recipes.read',
        path: `/recipes/${encodeURIComponent(id)}`,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(recipe),
          },
        ],
      };
    },
  );

  server.registerTool(
    'recipes.list',
    {
      title: 'List recipes',
      description:
        'Lists recipes for the calling tenant. Proxies GET /recipes with optional pagination + name filter.',
      inputSchema: {
        nameContains: z
          .string()
          .optional()
          .describe('Optional substring filter on recipe name.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Page size (default API behaviour applies when omitted).'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Page offset (default 0).'),
      },
    },
    async ({ nameContains, limit, offset }) => {
      const recipes = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'recipes.list',
        path: '/recipes',
        query: {
          nameContains,
          limit,
          offset,
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(recipes),
          },
        ],
      };
    },
  );
}
