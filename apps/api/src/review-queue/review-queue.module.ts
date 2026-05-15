import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ReviewQueueRepository } from './application/review-queue.repository';
import { ReviewQueueService } from './application/review-queue.service';
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
 */
@Module({
  imports: [AuditLogModule],
  controllers: [ReviewQueueController],
  providers: [ReviewQueueRepository, ReviewQueueService],
  exports: [ReviewQueueService],
})
export class ReviewQueueModule {}
