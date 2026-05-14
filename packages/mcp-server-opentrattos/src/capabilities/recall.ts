import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OpenTrattosRestClient } from '../http-client.js';

/**
 * Read-only Recall capabilities exposed via MCP.
 *
 *   recall.search-incident({ organizationId, query, types?, limit? })
 *     → GET /m3/recall/search?organizationId=…&q=…&types=…&limit=…
 *
 * Per ADR-RECALL-MCP-CAPABILITY (design.md, slice #11
 * m3-incident-search-multi-anchor): registered as a read-only capability
 * (no entry in WRITE_CAPABILITIES, no idempotency key, no kill-switch env
 * flag). Audit emission for the call is handled by the upstream
 * AgentAuditMiddleware on the REST hop (`AGENT_ACTION_EXECUTED`).
 *
 * Surface for agent clients: Hermes (WhatsApp / Telegram) + AgentChatWidget
 * embedded in apps/web from Wave 1.13. All three agents call the same MCP
 * capability and hit the same REST endpoint with the same auth context.
 */
export function registerRecallCapabilities(
  server: McpServer,
  rest: OpenTrattosRestClient,
): void {
  server.registerTool(
    'recall.search-incident',
    {
      title: 'Search candidate lots for a live recall incident',
      description:
        'Multi-anchor search across lot codes, supplier names, ingredient names, and audit-log aggregates. Returns up to 8 hits ranked by recency then symptom-match. Read-only.',
      inputSchema: {
        organizationId: z
          .string()
          .uuid()
          .describe(
            'Organization UUID — the search is multi-tenant gated at the repository layer.',
          ),
        query: z
          .string()
          .min(1)
          .max(200)
          .describe(
            'Free-text anchor (lot code, supplier name, ingredient name, received-date phrasing, or symptom keyword).',
          ),
        types: z
          .array(z.enum(['lot', 'supplier', 'ingredient', 'aggregate']))
          .optional()
          .describe(
            'Optional subset of anchor sources to query. Default: all four.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(8)
          .optional()
          .describe(
            'Hard cap on result count (default + max 8 per ADR-RECALL-SEARCH-CAP).',
          ),
      },
    },
    async ({ organizationId, query, types, limit }) => {
      const result = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'recall.search-incident',
        path: '/m3/recall/search',
        query: {
          organizationId,
          q: query,
          types: types?.join(','),
          limit,
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );
}
