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
 *  - `NEXANDRO_AGENT_INVENTORY_INGEST_INVOICE_PHOTO_ENABLED`
 *  - `NEXANDRO_AGENT_INVENTORY_INGEST_PRODUCT_PHOTO_ENABLED`
 *  - `NEXANDRO_AGENT_INVENTORY_SIGN_PHOTO_INGESTION_ENABLED`
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

const retroactiveCorrectionSchema = {
  itemId: z.string().uuid(),
  organizationId: z.string().uuid(),
  fieldCorrections: z.array(fieldCorrectionSchema).max(200),
  reason: z.string().min(1).max(500).optional(),
  idempotencyKey,
} as const;

const clearReviewFlagSchema = {
  organizationId: z.string().uuid(),
  aggregateType: z.enum(['lot', 'goods_receipt']),
  aggregateId: z.string().uuid(),
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
  {
    name: 'inventory.retroactive-correct-photo-ingestion',
    title:
      'Apply a retroactive correction to a signed photo-ingestion item',
    description:
      'Appends a new operator correction to an already-signed HITL ingestion item. The prior operatorCorrection is preserved verbatim in corrections_history per the EU AI Act Article 13 forensic foundation. Reject-band fields from the original LLM extraction MUST be non-empty (same iron-rule as sign). MANAGER + OWNER only. Idempotent via SHA-256 content hash over {fieldCorrections, correctedByUserId} — duplicate retries are no-ops. Proxies POST /m3/photo-ingest/items/:itemId/retroactive-correction.',
    schema: retroactiveCorrectionSchema,
    restMethod: 'POST',
    restPathTemplate:
      '/m3/photo-ingest/items/:itemId/retroactive-correction',
    restPathParams: (input) => ({
      itemId: (input as { itemId: string }).itemId,
    }),
    restBodyExtractor: (input) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const { idempotencyKey: _ik, itemId: _id, ...body } = i;
      return body;
    },
  },
  {
    name: 'inventory.clear-review-flag',
    title:
      'Clear the requires_review flag on a Lot or GR draft after manual reconciliation',
    description:
      'Marks a previously-flagged Lot or GR row as reviewed (`requires_review = false`). Idempotent: clearing a row that is already false (or does not exist for the caller\'s tenant) returns the same shape with `alreadyClear: true` and emits NO audit envelope. Real clears emit LOT_REVIEW_CLEARED or GR_REVIEW_CLEARED (regulatory) per ADR-AUDIT-WRITER. MANAGER + OWNER only. Proxies POST /m3/review-queue/:aggregateType/:aggregateId/clear.',
    schema: clearReviewFlagSchema,
    restMethod: 'POST',
    restPathTemplate:
      '/m3/review-queue/:aggregateType/:aggregateId/clear',
    restPathParams: (input) => {
      const i = (input ?? {}) as {
        aggregateType: string;
        aggregateId: string;
      };
      return {
        aggregateType: i.aggregateType,
        aggregateId: i.aggregateId,
      };
    },
    restBodyExtractor: (input) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const {
        idempotencyKey: _ik,
        aggregateType: _at,
        aggregateId: _aid,
        ...body
      } = i;
      return body;
    },
  },
];
