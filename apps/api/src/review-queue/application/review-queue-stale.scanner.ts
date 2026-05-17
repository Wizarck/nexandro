import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { ReviewQueueRepository } from './review-queue.repository';
import {
  REVIEW_QUEUE_STALE_DEFAULT_THRESHOLD_DAYS,
  REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG,
  StaleAggregatesByOrg,
} from './types';

/**
 * Daily cron that surfaces `requires_review=true` aggregates whose
 * `flagged_at` is older than `REVIEW_QUEUE_STALE_THRESHOLD_DAYS`
 * (default 7) as one `REVIEW_QUEUE_STALE_AGGREGATES` envelope PER
 * ORGANIZATION.
 *
 * Per the Master pick on `m3.x-requires-review-clear-cron`, the scanner
 * does NOT auto-clear `requires_review` — the only clearer remains the
 * operator (via `POST /m3/review-queue/:type/:id/clear` or the j-screen).
 * The envelope is `operational` (notification surface for dashboards +
 * MCP agents), not regulatory chain-of-custody — the original
 * `LOT_FLAGGED_FOR_REVIEW` / `GR_FLAGGED_FOR_REVIEW` envelopes already
 * record the flag event under `regulatory` retention.
 *
 * Schedule: `@Cron(CronExpression.EVERY_DAY_AT_8AM)` (UTC by default;
 * matches operators' Spain morning routine).
 *
 * Env flag `NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED=true`
 * gates the tick — matches the disabled-by-default pattern from
 * `ExpiryScannerService` so the cron only runs where intended.
 *
 * Resilience: a per-org emit exception logs + continues to the next org.
 * A scan-query exception kills the tick (logs once) so the next 24-hour
 * tick re-evaluates from scratch.
 */
@Injectable()
export class ReviewQueueStaleScanner {
  private readonly logger = new Logger(ReviewQueueStaleScanner.name);

  constructor(
    private readonly repo: ReviewQueueRepository,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { name: 'review-queue-stale-notifier' })
  async runTick(): Promise<void> {
    if (
      process.env.NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED !== 'true'
    ) {
      return;
    }
    try {
      await this.scanAndEmit(this.resolveThresholdDays());
    } catch (err) {
      this.logger.error(
        `review-queue-stale-notifier tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Exposed for unit testing + manual one-shot triggers. Caller controls
   * `thresholdDays` directly so tests can avoid env-coupling. Returns the
   * envelopes emitted (per org) so callers can assert or log them.
   */
  async scanAndEmit(thresholdDays: number): Promise<StaleAggregatesByOrg[]> {
    const grouped =
      await this.repo.findStaleAggregatesGroupedByOrg(thresholdDays);
    for (const group of grouped) {
      try {
        await this.emitForOrg(group, thresholdDays);
      } catch (err) {
        this.logger.error(
          `review-queue-stale-notifier.emit-failed organizationId=${group.organizationId} ` +
            `count=${group.rows.length} ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return grouped;
  }

  private async emitForOrg(
    group: StaleAggregatesByOrg,
    thresholdDays: number,
  ): Promise<void> {
    const truncated = group.rows.length >= REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG;
    const envelope: AuditEventEnvelope = {
      organizationId: group.organizationId,
      aggregateType: 'organization',
      aggregateId: group.organizationId,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: {
        thresholdDays,
        staleCount: group.rows.length,
        truncated,
        rows: group.rows,
      },
    };
    await this.events.emitAsync(
      AuditEventType.REVIEW_QUEUE_STALE_AGGREGATES,
      envelope,
    );
    this.logger.log(
      `review-queue-stale-notifier.emitted organizationId=${group.organizationId} ` +
        `count=${group.rows.length} truncated=${truncated} thresholdDays=${thresholdDays}`,
    );
  }

  private resolveThresholdDays(): number {
    const raw = process.env.REVIEW_QUEUE_STALE_THRESHOLD_DAYS;
    if (raw === undefined || raw.trim() === '') {
      return REVIEW_QUEUE_STALE_DEFAULT_THRESHOLD_DAYS;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      this.logger.warn(
        `review-queue-stale-notifier: ignoring invalid REVIEW_QUEUE_STALE_THRESHOLD_DAYS=${raw}, ` +
          `using default ${REVIEW_QUEUE_STALE_DEFAULT_THRESHOLD_DAYS}`,
      );
      return REVIEW_QUEUE_STALE_DEFAULT_THRESHOLD_DAYS;
    }
    return parsed;
  }
}
