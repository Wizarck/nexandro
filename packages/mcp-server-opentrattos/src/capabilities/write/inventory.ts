import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Inventory photo-ingestion write capabilities — slice #17a
 * m3-photo-ingest-backend (Wave 2.8).
 *
 * Per ADR-034 + j12.md: the `inventory.ingest-*-photo` pair proxies
 * `POST /m3/photo-ingest/items`; `inventory.sign-photo-ingestion` proxies
 * `POST /m3/photo-ingest/items/:itemId/sign`. The Hermes WhatsApp /
 * Telegram surfaces + the AgentChatWidget converge on these capabilities;
 * the j12 review queue calls the REST endpoints directly via
 * apps/web/src/api/photo-ingest.ts (parallel slice #17b).
 *
 * Per-capability kill switches (apps/api side):
 *  - `OPENTRATTOS_AGENT_INVENTORY_INGEST_INVOICE_PHOTO_ENABLED`
 *  - `OPENTRATTOS_AGENT_INVENTORY_INGEST_PRODUCT_PHOTO_ENABLED`
 *  - `OPENTRATTOS_AGENT_INVENTORY_SIGN_PHOTO_INGESTION_ENABLED`
 */

const idempotencyKey = z.string().optional();

const boundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const fieldCorrectionSchema = z.object({
  name: z.string().min(1).max(200),
  value: z.union([z.string(), z.number(), z.null()]),
  confidence: z.number().min(0).max(1).optional(),
  boundingBox: boundingBoxSchema.optional(),
});

const ingestPhotoBaseSchema = {
  organizationId: z.string().uuid(),
  photoId: z.string().uuid(),
  capability: z.string().min(1).max(100).optional(),
  idempotencyKey,
} as const;

const signPhotoSchema = {
  itemId: z.string().uuid(),
  organizationId: z.string().uuid(),
  fieldCorrections: z.array(fieldCorrectionSchema).max(200),
  idempotencyKey,
} as const;

export const INVENTORY_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'inventory.ingest-invoice-photo',
    title: 'Ingest a supplier invoice photo via vision-LLM extraction',
    description:
      'Triggers vision-LLM extraction on the supplied photoId (kind="invoice"). Confidence-band classification per ADR-034: every field at >=0.85 auto-fills; any field in [0.60, 0.85) flags the item for HITL review; any field <0.60 rejects. Null extraction (provider outage) returns a rejected item with manual-entry required. Proxies POST /m3/photo-ingest/items.',
    schema: {
      ...ingestPhotoBaseSchema,
    },
    restMethod: 'POST',
    restPathTemplate: '/m3/photo-ingest/items',
    restBodyExtractor: (input) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const { idempotencyKey: _ik, ...body } = i;
      return { ...body, kind: 'invoice' };
    },
  },
  {
    name: 'inventory.ingest-product-photo',
    title: 'Ingest a product photo via vision-LLM extraction',
    description:
      'Triggers vision-LLM extraction on the supplied photoId (kind="product"). Same confidence-band classification rules as invoice ingest. Routes downstream to Lot creation (deferred to followup slice). Proxies POST /m3/photo-ingest/items.',
    schema: {
      ...ingestPhotoBaseSchema,
    },
    restMethod: 'POST',
    restPathTemplate: '/m3/photo-ingest/items',
    restBodyExtractor: (input) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const { idempotencyKey: _ik, ...body } = i;
      return { ...body, kind: 'product' };
    },
  },
  {
    name: 'inventory.sign-photo-ingestion',
    title: 'Sign a HITL photo-ingestion item with operator corrections',
    description:
      'Confirms a HITL ingestion item, persisting operator-edited fields alongside the original LLM extraction. Reject-band fields (<0.60 confidence in the original extraction) MUST be present + non-empty in fieldCorrections; the service rejects with HTTP 422 otherwise. Both llmExtraction and operatorCorrection are stored on the audit envelope per FR32 forensic foundation. Proxies POST /m3/photo-ingest/items/:itemId/sign.',
    schema: signPhotoSchema,
    restMethod: 'POST',
    restPathTemplate: '/m3/photo-ingest/items/:itemId/sign',
    restPathParams: (input) => ({
      itemId: (input as { itemId: string }).itemId,
    }),
    restBodyExtractor: (input) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const { idempotencyKey: _ik, itemId: _id, ...body } = i;
      return body;
    },
  },
];
