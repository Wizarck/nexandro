import { z } from 'zod';
import type { WriteCapability } from './types.js';

/**
 * Label write capabilities — mirrors apps/api `LabelsController` (print) +
 * `OrgLabelFieldsController` (Owner config) 1:1.
 *
 *   labels.print              → POST /recipes/:id/print
 *   labels.setOrgLabelFields  → PUT  /organizations/:id/label-fields
 */

const idempotencyKey = z.string().optional();

const supportedLocales = ['es', 'en', 'it'] as const;
const pageSizes = ['a4', 'thermal-4x6', 'thermal-50x80'] as const;

const postalAddress = z.object({
  street: z.string().min(1).max(200),
  city: z.string().min(1).max(120),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(1).max(80),
});

const contactInfo = z.object({
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
});

const printAdapterConfig = z.object({
  id: z.string().min(1),
  config: z.record(z.unknown()),
});

export const LABELS_WRITE_CAPABILITIES: WriteCapability[] = [
  {
    name: 'labels.print',
    title: 'Print a recipe label',
    description:
      'Dispatch the rendered EU 1169/2011 label to the configured print adapter. Proxies POST /recipes/:id/print.',
    schema: {
      id: z.string().uuid(),
      organizationId: z.string().uuid(),
      locale: z.enum(supportedLocales).optional(),
      copies: z.number().int().min(1).max(50).optional(),
      printerId: z.string().optional(),
      idempotencyKey,
    },
    restMethod: 'POST',
    restPathTemplate: '/recipes/:id/print',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
  {
    name: 'labels.setOrgLabelFields',
    title: "Set an organization's label-field configuration",
    description:
      "Replace the org's label-rendering field config (Owner only). Partial config is accepted; mandatory-field validation runs at label render time. Proxies PUT /organizations/:id/label-fields.",
    schema: {
      id: z.string().uuid(),
      businessName: z.string().max(200).optional(),
      contactInfo: contactInfo.optional(),
      postalAddress: postalAddress.optional(),
      brandMarkUrl: z.string().url().optional(),
      pageSize: z.enum(pageSizes).optional(),
      printAdapter: printAdapterConfig.optional(),
      idempotencyKey,
    },
    restMethod: 'PUT',
    restPathTemplate: '/organizations/:id/label-fields',
    restPathParams: (input) => ({ id: (input as { id: string }).id }),
    restBodyExtractor: (input) => {
      const i = input as Record<string, unknown>;
      const { id: _id, idempotencyKey: _ik, ...body } = i;
      return body;
    },
  },
];
