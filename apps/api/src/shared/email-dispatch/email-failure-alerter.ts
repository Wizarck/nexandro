import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailDispatchError,
  EmailDispatchInput,
} from './types';

/**
 * Surfaces final email-dispatch failures (3 retries exhausted) to the
 * Owner of the failing `organizationId` per ADR-EMAIL-FAILURE-ALERTER +
 * ADR-EMAIL-OWNER-DASHBOARD-FALLBACK.
 *
 * **Current state (slice 22 / Wave 2.1)**: the M2 `notifications`
 * bounded context does NOT exist in master yet. Until it lands (or until
 * an M3 BC fills that gap), this alerter logs at `error` level with the
 * canonical structured-log fields:
 *
 *   - `event = email_dispatch_failed`
 *   - `recipient`, `subject`, `organizationId`, `tag`
 *   - `errorCode`, `errorMessage`, `providerError`, `attempts`
 *
 * Ops monitors filter on `event=email_dispatch_failed` to surface the
 * banner contract until the M2 BC arrives. The structured-log surface
 * is forward-compatible — once `NotificationsService` exists, the
 * `alertOwner()` body grows a `notificationsService.send({...})` call
 * after the `logger.error(...)` line.
 *
 * Per ADR-EMAIL-FAILURE-ALERTER, the alerter NEVER re-throws. A double-
 * fault (e.g. notifications DB down + email send failed) is logged once
 * and swallowed; the dispatch caller already has the `failure` Result
 * envelope.
 */
@Injectable()
export class EmailFailureAlerter {
  private readonly logger = new Logger(EmailFailureAlerter.name);

  /**
   * Notify the Owner of `input.organizationId` that the email-dispatch
   * attempt failed permanently. Errors raised by the underlying alerter
   * channel are caught + logged at `error` level; no exception
   * propagates upward.
   */
  async alertOwner(
    input: EmailDispatchInput,
    error: EmailDispatchError,
  ): Promise<void> {
    try {
      // TODO(m3-notifications-bc): once the M2/M3 `notifications` BC
      // ships, look up the Owner via `UsersRepository.findOwnerByOrg(
      // input.organizationId)` and call
      // `notificationsService.send({ type: 'EMAIL_DISPATCH_FAILURE',
      // userId, payload: { recipient, subject, errorMessage,
      // providerError } })` ahead of the `logger.error` below. The log
      // line stays — it doubles as the ops-monitor signal even after
      // the dashboard banner ships.
      this.logger.error(
        JSON.stringify({
          event: 'email_dispatch_failed',
          recipient: input.to[0],
          recipientCount: input.to.length,
          subject: input.subject,
          organizationId: input.organizationId,
          tag: input.tag,
          errorCode: error.code,
          errorMessage: error.message,
          providerError: error.providerError,
          attempts: error.attempts,
          alerter_failed: false,
        }),
      );
    } catch (alerterErr) {
      // Defensive: structured logging is normally infallible, but if
      // the JSON serialiser blows up (e.g. circular ref injected into
      // `providerError`) we want a last-ditch signal without crashing
      // the dispatcher.
      this.logger.error(
        `email_dispatch_failed alerter_failed=true: ${(alerterErr as Error).message}`,
      );
    }
  }
}
