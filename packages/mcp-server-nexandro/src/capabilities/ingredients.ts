import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NexandroRestClient } from '../http-client.js';

/**
 * Read-only Ingredient capabilities exposed via MCP.
 *
 *   ingredients.read(id)                       → GET /ingredients/:id
 *   ingredients.search({barcode? | query?})    → GET /ingredients?barcode=… or ?q=…
 *
 * The `search` capability accepts EITHER `barcode` (exact-match) OR `query`
 * (substring; landed via #6). Both are forwarded as query params; the API
 * decides which one wins when both are present (slice-internal coordination
 * with main-thread `m2-ingredients-extension`: `barcode` is treated as
 * optional pass-through).
 */
export function registerIngredientsCapabilities(
  server: McpServer,
  rest: NexandroRestClient,
): void {
  server.registerTool(
    'ingredients.read',
    {
      title: 'Read ingredient by ID',
      description:
        'Fetches a single Ingredient by UUID. Proxies GET /ingredients/:id on the nexandro REST API.',
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe(
            'Ingredient UUID (the `id` field returned by ingredients.search)',
          ),
      },
    },
    async ({ id }) => {
      const ingredient = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'ingredients.read',
        path: `/ingredients/${encodeURIComponent(id)}`,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(ingredient),
          },
        ],
      };
    },
  );

  server.registerTool(
    'ingredients.search',
    {
      title: 'Search ingredients',
      description:
        'Searches Ingredients by barcode (exact) or text query (substring). Proxies GET /ingredients with the relevant query param.',
      inputSchema: {
        barcode: z
          .string()
          .optional()
          .describe(
            'Optional EAN/UPC barcode for exact-match lookup against the supplier-items index.',
          ),
        query: z
          .string()
          .optional()
          .describe('Optional free-text substring filter on ingredient name.'),
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
    async ({ barcode, query, limit, offset }) => {
      const ingredients = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'ingredients.search',
        path: '/ingredients',
        query: {
          barcode,
          q: query,
          limit,
          offset,
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(ingredients),
          },
        ],
      };
    },
  );
}
