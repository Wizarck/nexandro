import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  EmailDispatchInput,
  EmailDispatchResult,
} from './types';

import { EmailDispatchService } from './email-dispatch.service.interface';
import { UnknownEmailProviderError } from './errors';
import { PostmarkEmailAdapter } from './postmark-email.adapter';
import { SendGridEmailAdapter } from './sendgrid-email.adapter';
import { SmtpEmailAdapter } from './smtp-email.adapter';

const ALLOWED_PROVIDERS = ['smtp', 'sendgrid', 'postmark'] as const;
type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];

/**
 * Provider factory + proxy per ADR-EMAIL-PROVIDER-FACTORY.
 *
 * Acts as both the NestJS factory (resolves at `onModuleInit()`) AND the
 * exposed `EmailDispatchService` instance. Implementing the interface
 * directly avoids the lifecycle race that otherwise bites:
 * `useFactory` providers run at DI graph build time, BEFORE
 * `onModuleInit` hooks fire — so a separate factory-token approach
 * cannot return the resolved adapter at the right moment.
 *
 * `onModuleInit()` reads `OPENTRATTOS_EMAIL_PROVIDER` (default `smtp`)
 * and constructs the chosen adapter. Postmark is lazy-loaded — the
 * `postmark` SDK enters `require.cache` ONLY when this value resolves
 * to `postmark`. Unknown env values throw `UnknownEmailProviderError`
 * at bootstrap so the API process fails-fast.
 */
@Injectable()
export class EmailDispatchFactory
  implements EmailDispatchService, OnModuleInit
{
  private readonly logger = new Logger(EmailDispatchFactory.name);
  private resolvedService: EmailDispatchService | undefined;

  async onModuleInit(): Promise<void> {
    this.resolvedService = await this.resolve(process.env);
    this.logger.log(
      `EmailDispatchService resolved to ${this.resolvedService.constructor.name}`,
    );
  }

  /** Proxy `dispatch` to the resolved adapter. */
  async dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult> {
    return this.getService().dispatch(input);
  }

  /** Proxy `verifyConnection` to the resolved adapter. */
  async verifyConnection(): Promise<boolean> {
    return this.getService().verifyConnection();
  }

  getService(): EmailDispatchService {
    if (!this.resolvedService) {
      throw new Error(
        'EmailDispatchFactory.onModuleInit() has not run yet — getService called too early',
      );
    }
    return this.resolvedService;
  }

  /**
   * Pure resolution logic — exposed for testing without spinning NestJS
   * lifecycle hooks.
   */
  async resolve(env: NodeJS.ProcessEnv): Promise<EmailDispatchService> {
    const raw = (env.OPENTRATTOS_EMAIL_PROVIDER ?? 'smtp').trim().toLowerCase();
    if (!isAllowedProvider(raw)) {
      throw new UnknownEmailProviderError(raw);
    }
    switch (raw) {
      case 'smtp':
        return SmtpEmailAdapter.fromEnv(env);
      case 'sendgrid':
        return SendGridEmailAdapter.fromEnv(env);
      case 'postmark':
        return PostmarkEmailAdapter.fromEnv(env);
    }
  }
}

function isAllowedProvider(value: string): value is AllowedProvider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(value);
}
