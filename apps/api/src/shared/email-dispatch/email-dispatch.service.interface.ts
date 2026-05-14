import type {
  EmailDispatchInput,
  EmailDispatchResult,
} from './types';

/**
 * Provider-agnostic email dispatch contract per ADR-039.
 *
 * Every adapter (`SmtpEmailAdapter`, `SendGridEmailAdapter`,
 * `PostmarkEmailAdapter`) implements this interface. Downstream consumers
 * (slices #13/#15/#19) inject the DI token below — they NEVER see
 * provider-specific types.
 *
 * `dispatch()` returns a Result-style discriminated union. It MUST NOT
 * throw on transport failure; final failures surface as
 * `{ status: 'failure', error: EmailDispatchError }` after the retry
 * policy exhausts.
 */
export interface EmailDispatchService {
  /**
   * Send a single email. Worst-case latency is ~21s when the retry
   * policy exhausts (1s + 4s + 16s exponential backoff). Callers MUST
   * invoke from `@OnEvent` subscribers or background jobs — never from
   * request handlers. Enforced by the static-analysis smoke test in
   * `apps/api/test/smoke/no-controller-imports-email-dispatch.spec.ts`.
   */
  dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult>;
  /**
   * Health probe used by `EmailDispatchModule.onApplicationBootstrap()`
   * to assert the configured provider is reachable. NEVER throws — returns
   * `false` on any failure so boot continues with degraded email.
   */
  verifyConnection(): Promise<boolean>;
}

/**
 * NestJS DI token for the resolved `EmailDispatchService` instance. The
 * factory (`EmailDispatchFactory.onModuleInit()`) reads
 * `OPENTRATTOS_EMAIL_PROVIDER` and picks one of the 3 adapters.
 */
export const EMAIL_DISPATCH_SERVICE = Symbol('EMAIL_DISPATCH_SERVICE');
