import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditEventEnvelope } from '../../audit-log/application/types';

/**
 * Producer-side fallback wrapper around `EventEmitter2.emitAsync(...)` for
 * audit envelopes. Catches a regulatory rethrow from `AuditLogSubscriber`
 * (per the strict-mode contract shipped in
 * `m3.x-audit-log-subscriber-strict-mode`, PR #169) at the producer
 * boundary, logs it at ERROR level with full context, and SWALLOWS the
 * error so the producer's caller (typically a controller handler) does
 * NOT return a confusing 500 AFTER the business write has already
 * committed.
 *
 * Why not let the rejection propagate?
 * The strict-mode rethrow surfaces inside the `AuditLogSubscriber`
 * persists. Almost every M3 producer emits AFTER the business write has
 * committed (often outside the DB transaction). Allowing the rejection
 * to propagate to a user request means: the user sees a 500 even though
 * their write succeeded — confusing UX, support load, no recoverable
 * action. Logging at ERROR level surfaces the same failure to
 * observability (Datadog / Sentry alerts) without conflating it with
 * the user request outcome.
 *
 * Where does the strict-mode benefit then live?
 * In dedicated unit tests against `AuditLogSubscriber` (cf. the
 * `strict-mode error handling` describe block in
 * `audit-log.subscriber.spec.ts`, added in PR #169). Those tests mock
 * `AuditLogService.record` to reject and assert the subscriber
 * rethrows — that path does NOT go through `safeAuditEmit`, so the
 * regression detection stays intact.
 *
 * When NOT to use this helper:
 * - INSIDE a DB transaction where the rejection should roll the txn back.
 *   Use raw `await events.emitAsync(...)` so TypeORM aborts on rethrow.
 * - INSIDE a `@Cron`-decorated tick that already has an outer try/catch
 *   swallow — using this helper is harmless but adds noise.
 * - For `operational` / `ephemeral` envelopes — the subscriber already
 *   swallows under strict-mode (cf. PR #169 retention-class branching).
 *   Using this helper is harmless but adds noise.
 *
 * Per [[feedback_user_decides_gates]] the trade-off is intentional:
 * producer-side wraps trade test-layer rethrow visibility for
 * production UX. Tests that directly exercise the subscriber keep the
 * strict-mode benefit; tests that go through the producer rely on
 * other surfaces (mocking the events bus, asserting the log emission).
 */
export async function safeAuditEmit(
  events: Pick<EventEmitter2, 'emitAsync'>,
  eventType: string,
  envelope: AuditEventEnvelope,
  logger: Pick<Logger, 'error'>,
): Promise<void> {
  try {
    await events.emitAsync(eventType, envelope);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `audit-emit.failed: ${eventType} aggregate=${envelope.aggregateId} ` +
        `org=${envelope.organizationId} ${message}`,
    );
    // Intentionally do NOT rethrow — see header docblock.
  }
}
