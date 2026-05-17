/**
 * Errors raised by the EmailDispatch BC. Per ADR-EMAIL-PROVIDER-FACTORY,
 * `UnknownEmailProviderError` MUST throw at module bootstrap (not first
 * call) so the API process fails-fast on misconfiguration.
 *
 * `EmailDispatchError` and `EmailValidationError` flow through the
 * Result-style `EmailDispatchResult` discriminated union — they are NEVER
 * thrown from `dispatch()`. Callers pattern-match on
 * `result.status === 'failure'`.
 */

import type { EmailDispatchErrorCode } from './types';

export class UnknownEmailProviderError extends Error {
  readonly providerEnvValue: string;
  constructor(providerEnvValue: string) {
    super(
      `Unknown NEXANDRO_EMAIL_PROVIDER=${providerEnvValue}; expected one of: smtp, sendgrid, postmark`,
    );
    this.name = 'UnknownEmailProviderError';
    this.providerEnvValue = providerEnvValue;
  }
}

/**
 * Domain-side error class used inside adapters BEFORE the Result envelope
 * is built. Adapters throw this on retryable + permanent failures; the
 * retry policy + dispatch service catch and translate into the
 * `EmailDispatchResult.failure` shape.
 */
export class EmailAdapterError extends Error {
  readonly code: EmailDispatchErrorCode;
  readonly providerError?: string;
  readonly retryable: boolean;
  constructor(
    code: EmailDispatchErrorCode,
    message: string,
    options: { providerError?: string; retryable: boolean },
  ) {
    super(message);
    this.name = 'EmailAdapterError';
    this.code = code;
    this.providerError = options.providerError;
    this.retryable = options.retryable;
  }
}

export class EmailValidationError extends Error {
  readonly issues: unknown;
  constructor(issues: unknown) {
    super('EmailDispatchInput failed Zod validation');
    this.name = 'EmailValidationError';
    this.issues = issues;
  }
}
