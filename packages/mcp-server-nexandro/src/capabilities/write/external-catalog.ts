import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * External catalog write capabilities — mirrors apps/api `ExternalCatalogController` 1:1.
 *
 *   external-catalog.sync → POST /external-catalog/sync
 *
 * The REST endpoint takes no body; the optional fields below allow agents
 * to forward future SyncRequestDto configuration without breaking the contract.
 */

const idempotencyKey = z.string().optional();

export const EXTERNAL_CATALOG_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'external-catalog.sync',
    title: 'Trigger an OFF catalog sync',
    description:
      'Manually trigger an OFF (Open Food Facts) sync. Owner only; runs a region-scoped incremental sync inline and returns 202 Accepted with per-region results. Proxies POST /external-catalog/sync.',
    schema: {
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/external-catalog/sync',
    restBodyExtractor: () => undefined,
  },
];
