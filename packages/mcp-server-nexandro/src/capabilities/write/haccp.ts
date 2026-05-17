import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * HACCP write capabilities — slice #9 m3-ccp-reading-aggregate (Wave 2.6).
 *
 * Per slice-9 design.md Decision A/B/C/D/E:
 *  - `haccp.record-ccp-reading` → POST /m3/haccp/readings (FR9, FR10, FR12, FR13).
 *  - `haccp.record-corrective-action` → POST /m3/haccp/corrective-actions (FR11).
 *  - `haccp.configure-fsms-standards` → POST /m3/haccp/fsms-standards (Owner-only).
 *
 * The agent surface (Hermes WhatsApp / Telegram / AgentChatWidget) calls these
 * for the staff + chef flows; the j10 tablet UI (slice #10) calls the same
 * REST endpoints directly via apps/web/src/api/haccp.ts.
 *
 * Per-capability kill switches (apps/api side):
 *  - `NEXANDRO_AGENT_HACCP_RECORD_CCP_READING_ENABLED`
 *  - `NEXANDRO_AGENT_HACCP_RECORD_CORRECTIVE_ACTION_ENABLED`
 *  - `NEXANDRO_AGENT_HACCP_CONFIGURE_FSMS_STANDARDS_ENABLED`
 */

const idempotencyKey = z.string().optional();

const adHocCorrectiveActionInputSchema = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

const recordReadingSchema = {
  organizationId: z.string().uuid(),
  ccpId: z.string().min(1).max(100),
  fsmsStandardId: z.string().uuid().optional(),
  readingValue: z.number().optional(),
  readingExtras: z.record(z.unknown()).optional(),
  readingUnit: z.string().max(20).optional(),
  correctiveActionId: z.string().uuid().optional(),
  correctiveActionInput: adHocCorrectiveActionInputSchema.optional(),
  idempotencyKey,
} as const;

const recordCorrectiveActionSchema = {
  organizationId: z.string().uuid(),
  fsmsStandardId: z.string().uuid(),
  ccpId: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  idempotencyKey,
} as const;

const ccpDefinitionSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  inputType: z.enum(['numeric', 'checkbox', 'multi-select', 'range']),
  unit: z.string().max(20).optional(),
  specMin: z.number().optional(),
  specMax: z.number().optional(),
  expectedOptions: z.array(z.string()).optional(),
  recommendedCorrectiveActionIds: z.array(z.string().uuid()).optional(),
});

const configureFsmsStandardsSchema = {
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(50),
  effectiveFrom: z.string().datetime(),
  effectiveUntil: z.string().datetime().optional(),
  ccpDefinitions: z.array(ccpDefinitionSchema).max(200),
  terminatesPrior: z.boolean().optional(),
  idempotencyKey,
} as const;

const stripIdempotencyKey = (input: unknown): unknown => {
  const i = (input ?? {}) as Record<string, unknown>;
  const { idempotencyKey: _ik, ...body } = i;
  return body;
};

export const HACCP_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'haccp.record-ccp-reading',
    title: 'Record a CCP reading against the active FSMS standard',
    description:
      'Records a HACCP critical-control-point reading. Validates against the FSMS standard active at submission time + pins the version. Out-of-spec readings MUST supply either a correctiveActionId (predefined) or correctiveActionInput (ad-hoc); the service rejects with HTTP 422 otherwise. Proxies POST /m3/haccp/readings.',
    schema: recordReadingSchema,
    restMethod: 'POST',
    restPathTemplate: '/m3/haccp/readings',
    restBodyExtractor: stripIdempotencyKey,
  },
  {
    name: 'haccp.record-corrective-action',
    title: 'Record a predefined corrective action for a CCP',
    description:
      'Creates a predefined corrective action that can later be referenced by haccp.record-ccp-reading. Ad-hoc corrective actions are created inline by record-ccp-reading when correctiveActionInput is supplied; this capability is for the Owner-config path. Proxies POST /m3/haccp/corrective-actions.',
    schema: recordCorrectiveActionSchema,
    restMethod: 'POST',
    restPathTemplate: '/m3/haccp/corrective-actions',
    restBodyExtractor: stripIdempotencyKey,
  },
  {
    name: 'haccp.configure-fsms-standards',
    title: 'Publish a new FSMS standard version',
    description:
      'Owner-only. Creates a new fsms_standards row carrying the CCP definitions for this version. When terminatesPrior=true, the most-recent active row with the same name has its effective_until set to the new row\'s effective_from, atomically. Proxies POST /m3/haccp/fsms-standards.',
    schema: configureFsmsStandardsSchema,
    restMethod: 'POST',
    restPathTemplate: '/m3/haccp/fsms-standards',
    restBodyExtractor: stripIdempotencyKey,
  },
];
