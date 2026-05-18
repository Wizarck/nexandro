import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NexandroRestClient } from '../http-client.js';

/**
 * Read-only review-queue capability exposed via MCP
 * (`m3.x-review-queue-backend`).
 *
 *   review-queue.list-flagged-aggregates({ organizationId, aggregateType?, limit? })
 *     → GET /m3/review-queue?organizationId=…&aggregateType=…&limit=…
 *
 * Per ADR-MCP-W-REGISTRY (Wave 1.13 / slice #21 fan-out): registered
 * as a read-only capability — NO entry in `WRITE_CAPABILITIES`, NO
 * idempotency key, NO kill-switch env flag. Audit emission for the
 * call is handled by the upstream `AgentAuditMiddleware` on the REST
 * hop (`AGENT_ACTION_EXECUTED`).
 *
 * Surface for agent clients: Hermes (WhatsApp / Telegram) +
 * AgentChatWidget embedded in apps/web. All three call the same MCP
 * capability and hit the same REST endpoint with the same auth
 * context.
 *
 * The companion write capability `inventory.clear-review-flag` lives
 * in `write/inventory.ts` per the existing inventory-namespace
 * grouping (the clear acts on a Lot or GR, which both belong to the
 * inventory domain conceptually).
 */
export function registerReviewQueueCapabilities(
  server: McpServer,
  rest: NexandroRestClient,
): void {
  server.registerTool(
    'review-queue.list-flagged-aggregates',
    {
      title:
        'List Lot + GR aggregates flagged for manual operator review',
      description:
        "Returns Lot and Goods-Receipt rows whose `requires_review=true` for the caller's tenant. Newest-first by the most-recent flagging audit envelope; capped at 200 per response (truncation surfaced via `truncated: true`). Read-only.",
      inputSchema: {
        organizationId: z
          .string()
          .uuid()
          .describe(
            'Organization UUID — multi-tenant gated at the controller.',
          ),
        aggregateType: z
          .enum(['lot', 'goods_receipt'])
          .optional()
          .describe(
            'Optional filter — `lot` returns only Lot rows; `goods_receipt` only GR-draft rows; omitted returns both.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Hard cap (default 50, max 200).'),
      },
    },
    async ({ organizationId, aggregateType, limit }) => {
      const result = await rest.request<unknown>({
        method: 'GET',
        capabilityName: 'review-queue.list-flagged-aggregates',
        path: '/m3/review-queue',
        query: {
          organizationId,
          aggregateType,
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
