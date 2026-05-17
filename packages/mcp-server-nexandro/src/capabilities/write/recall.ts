import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Recall write capabilities — slice #13 m3-recall-86-flag-dispatch.
 *
 * Per ADR-MCP-RECALL-CAPABILITIES (slice #13 design.md): both
 * `recall.dispatch-86-flag` and `recall.generate-dossier` proxy to the
 * same REST endpoint (`POST /m3/recall/incidents/:id/dispatch`). The
 * sticky J6 CTA and Hermes WhatsApp / Telegram inbound surfaces converge
 * on one canonical dispatch path; the slight naming duplication is
 * intentional so MCP clients can call whichever semantic name matches
 * their phrasing (`"corta el servicio"` vs `"genera el dossier"`).
 *
 * Per-capability kill switches:
 *  - `NEXANDRO_AGENT_RECALL_DISPATCH_86_FLAG_ENABLED`
 *  - `NEXANDRO_AGENT_RECALL_GENERATE_DOSSIER_ENABLED`
 *
 * Slices #11 (search-incident, trace-forward, trace-reverse) and #12
 * append further entries to this list at merge time.
 */

const idempotencyKey = z.string().optional();

const dispatchSchema = {
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  recipientList: z.array(z.string().email()).min(1).max(50),
  lotIds: z.array(z.string().uuid()).optional(),
  locationIds: z.array(z.string().uuid()).optional(),
  subject: z.string().max(998).optional(),
  bodyText: z.string().max(8000).optional(),
  idempotencyKey,
} as const;

const DISPATCH_PATH_TEMPLATE = '/m3/recall/incidents/:id/dispatch';

const dispatchPathParams = (input: unknown): Record<string, string> => ({
  id: (input as { id: string }).id,
});

const dispatchBodyExtractor = (input: unknown): unknown => {
  const i = input as Record<string, unknown>;
  const { id: _id, idempotencyKey: _ik, ...body } = i;
  return body;
};

export const RECALL_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'recall.dispatch-86-flag',
    title: 'Dispatch 86-flag + dossier for a recall incident',
    description:
      "Stops service on affected lots/locations across all kitchen agent surfaces (WhatsApp/Telegram/Web) AND emails the pre-formatted dossier to the recipient list. Proxies POST /m3/recall/incidents/:id/dispatch. Mirrors the J6 sticky CTA.",
    schema: dispatchSchema,
    restMethod: 'POST',
    restPathTemplate: DISPATCH_PATH_TEMPLATE,
    restPathParams: dispatchPathParams,
    restBodyExtractor: dispatchBodyExtractor,
  },
  {
    name: 'recall.generate-dossier',
    title: 'Generate + dispatch the recall incident dossier',
    description:
      "Renders the pre-formatted incident dossier (PDF) and emails it to the recipient list. Operates on the same REST handler as recall.dispatch-86-flag — the dispatch endpoint atomically emits the 86-flag and the dossier email per ADR-MCP-RECALL-CAPABILITIES.",
    schema: dispatchSchema,
    restMethod: 'POST',
    restPathTemplate: DISPATCH_PATH_TEMPLATE,
    restPathParams: dispatchPathParams,
    restBodyExtractor: dispatchBodyExtractor,
  },
];
