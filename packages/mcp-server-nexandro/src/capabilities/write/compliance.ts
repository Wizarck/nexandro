import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Compliance-export write capabilities — slice #14
 * m3-appcc-export-bundle-service (Wave 2.7).
 *
 * Per ADR-MCP-COMPLIANCE-CAPABILITY (slice #14 design.md): one capability
 * proxies `POST /m3/compliance/exports`. The j9 trigger CTA, the
 * Hermes WhatsApp / Telegram paths, and the AgentChatWidget all converge
 * on this endpoint.
 *
 * Per-capability kill switch (apps/api side):
 *  - `NEXANDRO_AGENT_COMPLIANCE_GENERATE_EXPORT_ENABLED`
 */

const idempotencyKey = z.string().optional();

const localeSchema = z.enum(['es-ES', 'ca-ES', 'eu-ES', 'gl-ES']);
const scopeKindSchema = z.enum([
  'haccp',
  'lot',
  'procurement',
  'photo',
  'ai_obs',
]);

const generateExportSchema = {
  organizationId: z.string().uuid(),
  rangeStart: z.string().datetime(),
  rangeEnd: z.string().datetime(),
  locale: localeSchema,
  scope: z.array(scopeKindSchema).max(5),
  recipientEmails: z.array(z.string().email()).max(50).optional(),
  idempotencyKey,
} as const;

const stripIdempotencyKey = (input: unknown): unknown => {
  const i = (input ?? {}) as Record<string, unknown>;
  const { idempotencyKey: _ik, ...body } = i;
  return body;
};

export const COMPLIANCE_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'compliance.generate-export',
    title: 'Generate an APPCC compliance export bundle',
    description:
      'Triggers generation of an APPCC inspection bundle (PDF + CSV pair sealed by a single SHA-256 over the concatenated bytes). Chapter 0 = raw audit_log (FR25 trust principle); derivative chapters per the requested scope. Returns the bundle id; the client polls GET /m3/compliance/exports/:bundleId for status + download links. Per-recipient email dispatch is optional. Proxies POST /m3/compliance/exports.',
    schema: generateExportSchema,
    restMethod: 'POST',
    restPathTemplate: '/m3/compliance/exports',
    restBodyExtractor: stripIdempotencyKey,
  },
];
