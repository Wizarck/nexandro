// ============================================================
// M3 EmailDispatch contracts (slice m3-email-dispatch-di, Wave 2.1)
// ============================================================
//
// Provider-agnostic input + result + error + event-envelope shapes used by
// `EmailDispatchService` (apps/api/src/shared/email-dispatch/) and its
// downstream consumers (slices #13 recall dossier dispatch, #15 APPCC
// export delivery, #19 budget tier alerts).
//
// Zod schemas are the source of truth; TS types are inferred. The schemas
// MUST NOT leak provider-specific types (no SendGrid response, no
// nodemailer SentMessageInfo, no Postmark MessageSendingResponse).

import { z } from 'zod';

// ---------------------------------------------------------------
// EmailAttachment — base64-encoded payload, mapped 1:1 onto every
// adapter's native attachment shape inside the adapter layer.
// ---------------------------------------------------------------

export const EmailAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  /** Base64-encoded attachment payload. Adapters decode + re-encode per provider. */
  contentBase64: z.string().min(1),
});

export type EmailAttachment = z.infer<typeof EmailAttachmentSchema>;

// ---------------------------------------------------------------
// EmailDispatchInput — single canonical input shape for `dispatch()`.
//
// Validation rules (enforced via `.refine`):
//   - `to` MUST be non-empty
//   - at least one of `bodyHtml` / `bodyText` MUST be set
// ---------------------------------------------------------------

const EmailAddressSchema = z.string().min(3).max(320);

export const EmailDispatchInputSchema = z
  .object({
    to: z.array(EmailAddressSchema).min(1, 'to must be a non-empty array'),
    cc: z.array(EmailAddressSchema).optional(),
    bcc: z.array(EmailAddressSchema).optional(),
    subject: z.string().min(1).max(998), // RFC 5322 §2.1.1 line-length limit
    bodyHtml: z.string().optional(),
    bodyText: z.string().optional(),
    attachments: z.array(EmailAttachmentSchema).optional(),
    /**
     * OpenTrattOS-canonical tag attribute used for audit + ops filtering
     * (e.g. `m3.recall.dossier_dispatch`, `m3.appcc.export_delivery`,
     * `m3.ai.budget_tier_alert`). Free-form `string` here; downstream
     * consumers MAY narrow via their own enums.
     */
    tag: z.string().min(1).max(127),
    /** Tenant identifier — required for the failure-alerter Owner lookup. */
    organizationId: z.string().min(1).max(64),
  })
  .refine((data) => Boolean(data.bodyHtml) || Boolean(data.bodyText), {
    message: 'at least one of bodyHtml / bodyText must be provided',
    path: ['bodyHtml'],
  });

export type EmailDispatchInput = z.infer<typeof EmailDispatchInputSchema>;

// ---------------------------------------------------------------
// EmailDispatchError — typed failure shape returned in the
// `EmailDispatchResult` discriminated union. NEVER throw — the
// dispatch contract uses Result-style returns so callers can pattern
// match.
// ---------------------------------------------------------------

export const EmailDispatchErrorCode = {
  /** 5xx response, network timeout, connection-refused. Retry candidate. */
  RETRYABLE_TRANSIENT: 'RETRYABLE_TRANSIENT',
  /** 4xx response (401, 400, 422, 429), sender rejected. Fail-fast. */
  PERMANENT_AUTH_OR_VALIDATION: 'PERMANENT_AUTH_OR_VALIDATION',
  /** Input failed Zod validation BEFORE provider call. */
  INPUT_VALIDATION: 'INPUT_VALIDATION',
  /** Unrecognised — provider returned an error we couldn't classify. */
  UNKNOWN: 'UNKNOWN',
} as const;

export type EmailDispatchErrorCode =
  (typeof EmailDispatchErrorCode)[keyof typeof EmailDispatchErrorCode];

export const EmailDispatchErrorSchema = z.object({
  code: z.nativeEnum(EmailDispatchErrorCode),
  message: z.string(),
  attempts: z.number().int().min(0),
  /**
   * Optional raw provider error message for ops debugging. MUST NOT contain
   * secrets (adapters strip auth tokens before serialising).
   */
  providerError: z.string().optional(),
});

export type EmailDispatchError = z.infer<typeof EmailDispatchErrorSchema>;

// ---------------------------------------------------------------
// EmailDispatchResult — discriminated union { success | failure }.
// ---------------------------------------------------------------

export const EmailProvider = {
  SMTP: 'smtp',
  SENDGRID: 'sendgrid',
  POSTMARK: 'postmark',
} as const;

export type EmailProvider = (typeof EmailProvider)[keyof typeof EmailProvider];

export const EmailDispatchSuccessSchema = z.object({
  status: z.literal('success'),
  providerMessageId: z.string().min(1),
  deliveredAt: z.coerce.date(),
  provider: z.nativeEnum(EmailProvider),
  attempts: z.number().int().min(1),
});

export type EmailDispatchSuccess = z.infer<typeof EmailDispatchSuccessSchema>;

export const EmailDispatchFailureSchema = z.object({
  status: z.literal('failure'),
  error: EmailDispatchErrorSchema,
});

export type EmailDispatchFailure = z.infer<typeof EmailDispatchFailureSchema>;

export const EmailDispatchResultSchema = z.discriminatedUnion('status', [
  EmailDispatchSuccessSchema,
  EmailDispatchFailureSchema,
]);

export type EmailDispatchResult = z.infer<typeof EmailDispatchResultSchema>;

// ---------------------------------------------------------------
// EmailDispatchedEvent — typed envelope emitted by consumer slices
// (#13/#15/#19) after a successful `dispatch()`. Subscriber
// registration is OWNED BY slice #21 per ADR-EMAIL-AUDIT-EVENT-
// REGISTERED-NOT-EMITTED — this slice only declares the shape.
// ---------------------------------------------------------------

export const EMAIL_DISPATCHED_EVENT_TYPE = 'EMAIL_DISPATCHED' as const;
export const EMAIL_DISPATCH_AGGREGATE_TYPE = 'email_dispatch' as const;

export const EmailDispatchedEventPayloadSchema = z.object({
  to: z.array(EmailAddressSchema).min(1, ),
  cc: z.array(EmailAddressSchema).optional(),
  subject: z.string(),
  provider: z.nativeEnum(EmailProvider),
  providerMessageId: z.string(),
  deliveredAt: z.coerce.date(),
  attempts: z.number().int().min(1),
  tag: z.string(),
});

export type EmailDispatchedEventPayload = z.infer<
  typeof EmailDispatchedEventPayloadSchema
>;

export const EmailDispatchedEventSchema = z.object({
  organizationId: z.string(),
  aggregateType: z.literal(EMAIL_DISPATCH_AGGREGATE_TYPE),
  aggregateId: z.string(), // = providerMessageId
  eventType: z.literal(EMAIL_DISPATCHED_EVENT_TYPE),
  actorUserId: z.string().nullable(),
  actorKind: z.enum(['user', 'system', 'agent']),
  payloadAfter: EmailDispatchedEventPayloadSchema,
});

export type EmailDispatchedEvent = z.infer<typeof EmailDispatchedEventSchema>;
