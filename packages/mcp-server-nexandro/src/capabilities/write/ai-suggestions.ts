import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * AI suggestion write capabilities — mirrors apps/api `AiSuggestionsController` 1:1.
 *
 *   ai-suggestions.yield   → POST /ai-suggestions/yield
 *   ai-suggestions.waste   → POST /ai-suggestions/waste
 *   ai-suggestions.accept  → POST /ai-suggestions/:id/accept
 *   ai-suggestions.reject  → POST /ai-suggestions/:id/reject
 */

const idempotencyKey = z.string().optional();

export const AI_SUGGESTIONS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'ai-suggestions.yield',
    title: 'Request an AI yield suggestion',
    description:
      'Request an AI suggestion for an Ingredient yield% (FR16). Returns `{suggestion: null, reason: "no_citation_available"}` when the provider cannot cite. Proxies POST /ai-suggestions/yield.',
    schema: {
      organizationId: z.string().uuid(),
      ingredientId: z.string().uuid(),
      contextHash: z.string().min(1).max(200),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ai-suggestions/yield',
  },
  {
    name: 'ai-suggestions.waste',
    title: 'Request an AI waste-factor suggestion',
    description:
      'Request an AI suggestion for a Recipe wasteFactor (FR17). Proxies POST /ai-suggestions/waste.',
    schema: {
      organizationId: z.string().uuid(),
      recipeId: z.string().uuid(),
      contextHash: z.string().min(1).max(200),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ai-suggestions/waste',
  },
  {
    name: 'ai-suggestions.accept',
    title: 'Accept (or accept-and-tweak) an AI suggestion',
    description:
      'Accept a previously-issued suggestion as-is (omit `value`) or with a tweaked number (set `value`). Proxies POST /ai-suggestions/:id/accept.',
    schema: {
      id: z.string().uuid(),
      organizationId: z.string().uuid(),
      value: z.number().min(0).max(1).optional(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ai-suggestions/:id/accept',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as { organizationId: string; value?: number };
      return i.value === undefined
        ? { organizationId: i.organizationId }
        : { organizationId: i.organizationId, value: i.value };
    },
  },
  {
    name: 'ai-suggestions.reject',
    title: 'Reject an AI suggestion with audited reason',
    description:
      'Reject a previously-issued suggestion with audit reason ≥10 chars (FR18). Proxies POST /ai-suggestions/:id/reject.',
    schema: {
      id: z.string().uuid(),
      organizationId: z.string().uuid(),
      reason: z.string().min(10).max(500),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/ai-suggestions/:id/reject',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as { organizationId: string; reason: string };
      return { organizationId: i.organizationId, reason: i.reason };
    },
  },
];
