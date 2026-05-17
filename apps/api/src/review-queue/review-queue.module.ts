import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ReviewQueueRepository } from './application/review-queue.repository';
import { ReviewQueueService } from './application/review-queue.service';
import { ReviewQueueStaleScanner } from './application/review-queue-stale.scanner';
import { ReviewQueueController } from './interface/review-queue.controller';

/**
 * Review-queue BC (`m3.x-review-queue-backend`).
 *
 * Exposes an operator-facing read + clear API for downstream Lot + GR
 * rows flagged `requires_review=true` by the
 * `DownstreamRevocationSubscriber` (slice #157). Pure raw-SQL repo
 * over the two tables; no entity coupling to the inventory + procurement
 * BCs.
 *
 * Per ADR-CROSS-BC-SUBSCRIBER-LOCATION, this BC NEVER writes to
 * `audit_log` directly. Clear actions emit `LOT_REVIEW_CLEARED` /
 * `GR_REVIEW_CLEARED` envelopes on the bus; the audit-log BC persists
 * them via the single `AuditLogSubscriber`.
 *
 * `ReviewQueueStaleScanner` (`m3.x-requires-review-clear-cron`) is a
 * daily cron that emits `REVIEW_QUEUE_STALE_AGGREGATES` (operational)
 * for organisations with overdue flagged rows — surfaces stale items
 * to dashboards + MCP agents WITHOUT touching `requires_review`. The
 * scanner is disabled by default and activates via
 * `NEXANDRO_REVIEW_QUEUE_STALE_NOTIFIER_ENABLED=true`.
 */
@Module({
  imports: [AuditLogModule],
  controllers: [ReviewQueueController],
  providers: [
    ReviewQueueRepository,
    ReviewQueueService,
    ReviewQueueStaleScanner,
  ],
  exports: [ReviewQueueService],
})
export class ReviewQueueModule {}
