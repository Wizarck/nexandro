import { Injectable, Logger } from '@nestjs/common';
import {
  EmailDispatchErrorCode,
  EmailDispatchInput,
  EmailDispatchInputSchema,
  EmailDispatchResult,
  EmailProvider,
} from './types';
import * as nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

import { EmailDispatchService } from './email-dispatch.service.interface';
import { EmailAdapterError } from './errors';
import { withRetry } from './email-retry.policy';

export interface SmtpAdapterConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  poolSize: number;
  from: string;
  /** Test-only transport override; production reads env. */
  transport?: Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;
}

const DEFAULT_SMTP_POOL_SIZE = 5;
const DEFAULT_SMTP_PORT = 587;
const POOL_ACQUIRE_TIMEOUT_MS = 5000;

/**
 * SMTP adapter (default AGPL build) per ADR-039.
 *
 * Uses `nodemailer.createTransport` with `pool: true`. Pool size is
 * configurable via `OPENTRATTOS_SMTP_POOL_SIZE` (default 5). Maps
 * `nodemailer` errors onto `EmailAdapterError`:
 *
 *   - 5xx SMTP response code → retryable
 *   - `ECONNREFUSED` / `ETIMEDOUT` / `EAI_AGAIN` → retryable
 *   - 4xx SMTP response (e.g. 535 auth failure) → permanent, fail-fast
 *
 * No `nodemailer` types leak across the `EmailDispatchService`
 * boundary — `dispatch()` returns the canonical `EmailDispatchResult`.
 */
@Injectable()
export class SmtpEmailAdapter implements EmailDispatchService {
  private readonly logger = new Logger(SmtpEmailAdapter.name);
  private readonly transport: Transporter<
    SMTPTransport.SentMessageInfo,
    SMTPTransport.Options
  >;
  private readonly from: string;

  constructor(config: SmtpAdapterConfig) {
    this.from = config.from;
    // nodemailer.createTransport returns a union of overloads
    // (SMTPTransport vs SMTPPool depending on `pool: true`); cast
    // through unknown per TS escape-hatch idiom — the runtime shape
    // is `Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>`
    // for the pool case (verified by nodemailer source).
    this.transport =
      config.transport ??
      (nodemailer.createTransport({
        host: config.host,
        port: config.port,
        auth:
          config.user && config.pass
            ? { user: config.user, pass: config.pass }
            : undefined,
        pool: true,
        maxConnections: config.poolSize,
        connectionTimeout: POOL_ACQUIRE_TIMEOUT_MS,
        // RFC 5321 §4.5.3.2.7: 5-minute server-response timeout. We cap
        // at 30s to enforce the per-attempt SLO declared in
        // architecture-m3.md NFR-REL-2.
        socketTimeout: 30_000,
      }) as unknown as Transporter<
        SMTPTransport.SentMessageInfo,
        SMTPTransport.Options
      >);
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SmtpEmailAdapter {
    const host = env.OPENTRATTOS_SMTP_HOST ?? 'localhost';
    const port = Number(env.OPENTRATTOS_SMTP_PORT ?? DEFAULT_SMTP_PORT);
    const user = env.OPENTRATTOS_SMTP_USER;
    const pass = env.OPENTRATTOS_SMTP_PASS;
    const poolSize = Number(
      env.OPENTRATTOS_SMTP_POOL_SIZE ?? DEFAULT_SMTP_POOL_SIZE,
    );
    const from =
      env.OPENTRATTOS_EMAIL_FROM ?? 'notifications@opentrattos.local';
    return new SmtpEmailAdapter({
      host,
      port: Number.isFinite(port) ? port : DEFAULT_SMTP_PORT,
      user,
      pass,
      poolSize: Number.isFinite(poolSize) ? poolSize : DEFAULT_SMTP_POOL_SIZE,
      from,
    });
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transport.verify();
      return true;
    } catch (err) {
      this.logger.warn(
        `SMTP verifyConnection failed: ${(err as Error).message}`,
      );
      return false;
    }
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
        providerMessageId: value.messageId,
        deliveredAt: new Date(),
        provider: EmailProvider.SMTP,
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
          attempts: this.attemptsFromError(adapterErr),
          providerError: adapterErr.providerError,
        },
      };
    }
  }

  private async sendOnce(
    input: EmailDispatchInput,
  ): Promise<SMTPTransport.SentMessageInfo> {
    const mailOptions: SendMailOptions = {
      from: this.from,
      to: input.to.join(', '),
      cc: input.cc?.join(', '),
      bcc: input.bcc?.join(', '),
      subject: input.subject,
      text: input.bodyText,
      html: input.bodyHtml,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType,
      })),
      headers: {
        'X-OpenTrattOS-Tag': input.tag,
        'X-OpenTrattOS-Organization-Id': input.organizationId,
      },
    };
    try {
      return await this.transport.sendMail(mailOptions);
    } catch (err) {
      throw this.classify(err);
    }
  }

  private classify(err: unknown): EmailAdapterError {
    const anyErr = err as {
      code?: string;
      responseCode?: number;
      message?: string;
    };
    const message = anyErr.message ?? 'SMTP send failed';
    // nodemailer surfaces the SMTP server response code as `responseCode`
    // (numeric). SMTP convention is INVERTED vs HTTP:
    //   5xx = permanent failure (no retry) — e.g. 535 auth, 550 mailbox unavailable
    //   4xx = transient (retryable) — e.g. 421 service unavailable, 450 mailbox busy
    if (typeof anyErr.responseCode === 'number') {
      if (anyErr.responseCode >= 500 && anyErr.responseCode < 600) {
        return new EmailAdapterError(
          EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
          `SMTP 5xx ${anyErr.responseCode}: ${message}`,
          { providerError: message, retryable: false },
        );
      }
      if (anyErr.responseCode >= 400 && anyErr.responseCode < 500) {
        return new EmailAdapterError(
          EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
          `SMTP 4xx ${anyErr.responseCode}: ${message}`,
          { providerError: message, retryable: true },
        );
      }
    }
    // Node-level network errors → retryable.
    if (
      typeof anyErr.code === 'string' &&
      ['ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET'].includes(
        anyErr.code,
      )
    ) {
      return new EmailAdapterError(
        EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
        `SMTP network error ${anyErr.code}: ${message}`,
        { providerError: message, retryable: true },
      );
    }
    return new EmailAdapterError(
      EmailDispatchErrorCode.UNKNOWN,
      `SMTP unknown error: ${message}`,
      { providerError: message, retryable: false },
    );
  }

  /**
   * Best-effort attempt count from the bubbled error. The retry policy
   * doesn't currently thread the count through the throw — we record `3`
   * (max) for retryable errors that reached the final attempt and `1`
   * for non-retryable. Future revision: attach attempts to the error.
   */
  private attemptsFromError(err: EmailAdapterError): number {
    return err.retryable ? 3 : 1;
  }
}
