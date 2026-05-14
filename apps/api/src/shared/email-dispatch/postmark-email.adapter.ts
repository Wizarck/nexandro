import { Injectable, Logger } from '@nestjs/common';
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

// Type-only import — does NOT trigger runtime require/import. Per
// ADR-EMAIL-PROVIDER-FACTORY, the Postmark SDK is lazy-imported via
// `await import('postmark')` inside `init()`; this `import type` only
// pulls types at compile time.
import type { ServerClient as PostmarkServerClientType } from 'postmark';

export interface PostmarkAdapterConfig {
  serverToken: string;
  from: string;
  /** Test-only client override; production lazy-imports `postmark`. */
  client?: PostmarkClientLike;
}

/**
 * Narrow client shape mirroring `postmark.ServerClient.sendEmail`. Test
 * doubles implement this without touching the real SDK.
 */
export interface PostmarkClientLike {
  sendEmail(message: {
    From: string;
    To: string;
    Cc?: string;
    Bcc?: string;
    Subject: string;
    TextBody?: string;
    HtmlBody?: string;
    Attachments?: Array<{
      Name: string;
      Content: string;
      ContentType: string;
    }>;
    Tag?: string;
    Metadata?: Record<string, string>;
  }): Promise<{ MessageID: string; ErrorCode?: number; Message?: string }>;
}

/**
 * Postmark adapter (alternative Enterprise) per ADR-039 +
 * ADR-EMAIL-PROVIDER-FACTORY.
 *
 * The `postmark` SDK is lazy-imported via dynamic `import('postmark')`
 * inside `init()`. When `OPENTRATTOS_EMAIL_PROVIDER=smtp`, this adapter
 * is never instantiated and the Postmark SDK never enters
 * `require.cache` — keeping the AGPL build slim.
 *
 * Error mapping mirrors SendGrid: 5xx + network → retryable;
 * 4xx + auth → permanent.
 */
@Injectable()
export class PostmarkEmailAdapter implements EmailDispatchService {
  private readonly logger = new Logger(PostmarkEmailAdapter.name);
  private readonly serverToken: string;
  private readonly from: string;
  private client: PostmarkClientLike | undefined;

  constructor(config: PostmarkAdapterConfig) {
    this.serverToken = config.serverToken;
    this.from = config.from;
    this.client = config.client;
  }

  static async fromEnv(
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<PostmarkEmailAdapter> {
    const serverToken = env.OPENTRATTOS_POSTMARK_SERVER_TOKEN ?? '';
    const from =
      env.OPENTRATTOS_EMAIL_FROM ?? 'notifications@opentrattos.local';
    const adapter = new PostmarkEmailAdapter({ serverToken, from });
    await adapter.init();
    return adapter;
  }

  /**
   * Lazy-load the `postmark` SDK. Called exactly once from the factory's
   * `onModuleInit` when `OPENTRATTOS_EMAIL_PROVIDER=postmark`. Idempotent.
   */
  async init(): Promise<void> {
    if (this.client) return;
    // Dynamic `import()` keeps the SDK out of `require.cache` until the
    // factory selects this adapter.
    const mod = (await import('postmark')) as {
      ServerClient: new (token: string) => PostmarkServerClientType;
    };
    const real = new mod.ServerClient(this.serverToken);
    // The real client returns a richer type; we expose only the narrow
    // shape via `PostmarkClientLike` to keep callers free of postmark
    // types.
    this.client = {
      sendEmail: async (msg) => {
        // The real SDK uses PascalCase fields too — pass through.
        const res = await (
          real as unknown as {
            sendEmail: (m: unknown) => Promise<{
              MessageID: string;
              ErrorCode?: number;
              Message?: string;
            }>;
          }
        ).sendEmail(msg);
        return res;
      },
    };
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.client) {
      try {
        await this.init();
      } catch (err) {
        this.logger.warn(
          `Postmark init failed: ${(err as Error).message}`,
        );
        return false;
      }
    }
    // Like SendGrid, Postmark has no cheap ping. Treat init success as ok.
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
    if (!this.client) {
      try {
        await this.init();
      } catch (err) {
        return {
          status: 'failure',
          error: {
            code: EmailDispatchErrorCode.UNKNOWN,
            message: `Postmark SDK lazy-load failed: ${(err as Error).message}`,
            attempts: 0,
          },
        };
      }
    }

    try {
      const { value, attempts } = await withRetry(() =>
        this.sendOnce(parsed.data),
      );
      return {
        status: 'success',
        providerMessageId: value,
        deliveredAt: new Date(),
        provider: EmailProvider.POSTMARK,
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
    if (!this.client) {
      throw new EmailAdapterError(
        EmailDispatchErrorCode.UNKNOWN,
        'Postmark client not initialised',
        { retryable: false },
      );
    }
    try {
      const res = await this.client.sendEmail({
        From: this.from,
        To: input.to.join(', '),
        Cc: input.cc?.join(', '),
        Bcc: input.bcc?.join(', '),
        Subject: input.subject,
        TextBody: input.bodyText,
        HtmlBody: input.bodyHtml,
        Attachments: input.attachments?.map((a) => ({
          Name: a.filename,
          Content: a.contentBase64,
          ContentType: a.contentType,
        })),
        Tag: input.tag,
        Metadata: { organizationId: input.organizationId },
      });
      if (res.ErrorCode && res.ErrorCode !== 0) {
        throw this.classifyErrorCode(res.ErrorCode, res.Message ?? 'Postmark error');
      }
      return res.MessageID;
    } catch (err) {
      if (err instanceof EmailAdapterError) throw err;
      throw this.classify(err);
    }
  }

  private classifyErrorCode(
    code: number,
    message: string,
  ): EmailAdapterError {
    // Postmark error codes <100 are validation/auth (e.g. 10 = bad
    // server token). Codes ≥ 300 are server errors per their docs.
    if (code >= 300) {
      return new EmailAdapterError(
        EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
        `Postmark error ${code}: ${message}`,
        { providerError: message, retryable: true },
      );
    }
    return new EmailAdapterError(
      EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
      `Postmark error ${code}: ${message}`,
      { providerError: message, retryable: false },
    );
  }

  private classify(err: unknown): EmailAdapterError {
    const anyErr = err as {
      code?: number | string;
      statusCode?: number;
      message?: string;
    };
    const message = anyErr.message ?? 'Postmark send failed';
    // Numeric Postmark API code (PascalCase ErrorCode) was already
    // handled in `classifyErrorCode`. Here we handle thrown HTTP errors.
    if (typeof anyErr.statusCode === 'number') {
      if (anyErr.statusCode >= 500) {
        return new EmailAdapterError(
          EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
          `Postmark 5xx ${anyErr.statusCode}: ${message}`,
          { providerError: message, retryable: true },
        );
      }
      if (anyErr.statusCode >= 400) {
        return new EmailAdapterError(
          EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
          `Postmark 4xx ${anyErr.statusCode}: ${message}`,
          { providerError: message, retryable: false },
        );
      }
    }
    // Network failure → retryable.
    return new EmailAdapterError(
      EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
      `Postmark network error: ${message}`,
      { providerError: message, retryable: true },
    );
  }
}
