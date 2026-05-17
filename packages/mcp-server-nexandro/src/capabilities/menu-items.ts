import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OpenTrattosRestClient } from '../http-client.js';

/**
 * Read-only MenuItem capabilities exposed via MCP.
 *
 *   menu-items.read(id)       → GET /menu-items/:id
 *   menu-items.list(filter?)  → GET /menu-items
 */
export function registerMenuItemsCapabilities(
  server: McpServer,
  rest: OpenTrattosRestClient,
): void {
  server.registerTool(
    'menu-items.read',
    {
      title: 'Read menu item by ID',
      description:
        'Fetches a single MenuItem by UUID. Proxies GET /menu-items/:id on the nexandro REST API.',
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe(
            'MenuItem UUID (the `id` field returned by menu-items.list)',
          ),
      },
    },
    async ({ id }) => {
      const item = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'menu-items.read',
        path: `/menu-items/${encodeURIComponent(id)}`,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(item),
          },
        ],
      };
    },
  );

  server.registerTool(
    'menu-items.list',
    {
      title: 'List menu items',
      description:
        'Lists MenuItems for the calling tenant. Proxies GET /menu-items with optional pagination + name filter.',
      inputSchema: {
        nameContains: z
          .string()
          .optional()
          .describe('Optional substring filter on menu-item name.'),
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
      const items = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'menu-items.list',
        path: '/menu-items',
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
            text: JSON.stringify(items),
          },
        ],
      };
    },
  );
}
