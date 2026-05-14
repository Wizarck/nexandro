import { Injectable } from '@nestjs/common';
import sgMail, { MailDataRequired } from '@sendgrid/mail';
import {
  EmailDispatchErrorCode,
  EmailDispatchInput,
  EmailDispatchInputSchema,
  EmailDispatchResult,
  EmailProvider,
} from './types';

import { EmailDispatchService } from './email-dispatch.service.interface';
import { EmailAdapterError } from './errors';
import { withRetry } from './email-retry.policy';

export interface SendGridAdapterConfig {
  apiKey: string;
  from: string;
  /** Test-only client override; production uses the static `@sendgrid/mail` singleton. */
  client?: SendGridClientLike;
}

/**
 * Minimal client shape so tests can substitute a fake without importing
 * the real SDK at runtime. The shape mirrors `sgMail.send`.
 */
export interface SendGridClientLike {
  setApiKey(key: string): void;
  send(msg: MailDataRequired | MailDataRequired[]): Promise<SendGridResponseLike>;
}

export interface SendGridResponseLike {
  statusCode: number;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * SendGrid adapter (Enterprise bundled) per ADR-039.
 *
 * Uses `@sendgrid/mail`. The SDK is statically imported (Enterprise bundle
 * acceptable per ADR-EMAIL-PROVIDER-FACTORY discussion). One HTTPS call
 * per `dispatch()` — no connection pool.
 *
 * Error mapping:
 *   - 5xx response → retryable
 *   - 4xx (401, 400, 422) → permanent
 *   - 429 → permanent (backoff is provider's responsibility, not ours)
 *   - network failure (no response) → retryable
 */
@Injectable()
export class SendGridEmailAdapter implements EmailDispatchService {
  private readonly client: SendGridClientLike;
  private readonly from: string;

  constructor(config: SendGridAdapterConfig) {
    this.from = config.from;
    this.client =
      config.client ??
      (sgMail as unknown as SendGridClientLike); // sgMail singleton conforms to the shape.
    this.client.setApiKey(config.apiKey);
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SendGridEmailAdapter {
    const apiKey = env.OPENTRATTOS_SENDGRID_API_KEY ?? '';
    const from =
      env.OPENTRATTOS_EMAIL_FROM ?? 'notifications@opentrattos.local';
    return new SendGridEmailAdapter({ apiKey, from });
  }

  async verifyConnection(): Promise<boolean> {
    // SendGrid has no cheap ping endpoint. We treat the SDK being
    // initialised with an API key as "configured" and rely on the first
    // `dispatch()` to surface auth failures via the failure alerter.
    return true;
  }

  async dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult> {
    const parsed = EmailDispatchInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        status: 'failure',
        error: {
          code: EmailDispatchErrorCode.INPUT_VALIDATION,
          message: 'EmailDispatchInput failed Zod validation',
          attempts: 0,
          providerError: JSON.stringify(parsed.error.issues),
        },
      };
    }

    try {
      const { value, attempts } = await withRetry(() =>
        this.sendOnce(parsed.data),
      );
      return {
        status: 'success',
        providerMessageId: value,
        deliveredAt: new Date(),
        provider: EmailProvider.SENDGRID,
        attempts,
      };
    } catch (err) {
      const adapterErr =
        err instanceof EmailAdapterError ? err : this.classify(err);
      return {
        status: 'failure',
        error: {
          code: adapterErr.code,
          message: adapterErr.message,
          attempts: adapterErr.retryable ? 3 : 1,
          providerError: adapterErr.providerError,
        },
      };
    }
  }

  private async sendOnce(input: EmailDispatchInput): Promise<string> {
    // SendGrid's `MailDataRequired` declares `text` / `html` / `content`
    // in a union — we use the `text` + `html` form (simpler, no tuple
    // arity gymnastics). At least one of the two is guaranteed by the
    // `EmailDispatchInputSchema.refine`.
    const msg = {
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      from: this.from,
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.contentBase64,
        type: a.contentType,
        disposition: 'attachment',
      })),
      customArgs: {
        'opentrattos-tag': input.tag,
        'opentrattos-organization-id': input.organizationId,
      },
    } as unknown as MailDataRequired;

    try {
      const raw: unknown = await this.client.send(msg);
      // The real `@sendgrid/mail` SDK returns a tuple
      // `[ClientResponse, {}]`. Our `SendGridClientLike` declares a
      // single-object return so test doubles stay simple. Normalise
      // here so both shapes work.
      const response: SendGridResponseLike = Array.isArray(raw)
        ? (raw[0] as SendGridResponseLike)
        : (raw as SendGridResponseLike);
      const header = response.headers?.['x-message-id'];
      if (typeof header === 'string') return header;
      if (Array.isArray(header) && typeof header[0] === 'string') {
        return header[0];
      }
      return `sendgrid:${Date.now()}`;
    } catch (err) {
      throw this.classify(err);
    }
  }

  private classify(err: unknown): EmailAdapterError {
    const anyErr = err as {
      code?: number;
      response?: { body?: unknown; statusCode?: number };
      message?: string;
    };
    const statusCode = anyErr.code ?? anyErr.response?.statusCode;
    const providerError = JSON.stringify(anyErr.response?.body ?? anyErr.message);
    const message = anyErr.message ?? 'SendGrid send failed';

    if (typeof statusCode === 'number') {
      if (statusCode >= 500 && statusCode < 600) {
        return new EmailAdapterError(
          EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
          `SendGrid 5xx ${statusCode}: ${message}`,
          { providerError, retryable: true },
        );
      }
      if (statusCode >= 400 && statusCode < 500) {
        return new EmailAdapterError(
          EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
          `SendGrid 4xx ${statusCode}: ${message}`,
          { providerError, retryable: false },
        );
      }
    }

    // Network failure (no HTTP response) → retryable.
    return new EmailAdapterError(
      EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
      `SendGrid network error: ${message}`,
      { providerError, retryable: true },
    );
  }
}
