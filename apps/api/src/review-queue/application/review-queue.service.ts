import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { ReviewQueueRepository } from './review-queue.repository';
import type {
  ClearReviewResult,
  ListFlaggedOptions,
  ListFlaggedResult,
  ReviewQueueAggregateType,
} from './types';
import { REVIEW_QUEUE_AGGREGATE_TYPES } from './types';

/**
 * Review-queue service. Thin wrapper around the raw-SQL repository that
 * adds the audit-envelope emission on a successful clear. Per
 * ADR-AUDIT-WRITER, this BC never writes to `audit_log` directly — it
 * emits envelopes on the bus and the audit-log BC persists.
 *
 * Idempotency: a clear on a row already at `requires_review=false` (or
 * a non-existent / cross-tenant row) returns `{ alreadyClear: true }`
 * without emitting an envelope. The bus stays quiet on no-ops to avoid
 * stair-stepping the hash chain for operator double-clicks.
 */
@Injectable()
export class ReviewQueueService {
  private readonly logger = new Logger(ReviewQueueService.name);

  constructor(
    private readonly repo: ReviewQueueRepository,
    private readonly events: EventEmitter2,
  ) {}

  async listFlagged(
    organizationId: string,
    opts: ListFlaggedOptions = {},
  ): Promise<ListFlaggedResult> {
    return this.repo.listFlagged(organizationId, opts);
  }

  async clearReview(
    organizationId: string,
    aggregateType: ReviewQueueAggregateType,
    aggregateId: string,
    reviewedByUserId: string,
  ): Promise<ClearReviewResult> {
    if (!REVIEW_QUEUE_AGGREGATE_TYPES.includes(aggregateType)) {
      throw new BadRequestException({
        code: 'REVIEW_QUEUE_BAD_AGGREGATE_TYPE',
        message: `aggregateType must be one of: ${REVIEW_QUEUE_AGGREGATE_TYPES.join(', ')}`,
      });
    }

    const probe =
      aggregateType === 'lot'
        ? await this.repo.clearLotReview(organizationId, aggregateId)
        : await this.repo.clearGrReview(organizationId, aggregateId);

    if (probe.alreadyClear) {
      // No envelope on no-ops. Idempotent shape lets callers double-click
      // without polluting the audit chain.
      return {
        aggregateType,
        aggregateId,
        cleared: true,
        alreadyClear: true,
      };
    }

    const envelope: AuditEventEnvelope = {
      organizationId,
      aggregateType,
      aggregateId,
      actorUserId: reviewedByUserId,
      actorKind: 'user',
      payloadAfter: {
        reviewedByUserId,
        reviewedAt: new Date().toISOString(),
        sourcePhotoIngestionId: probe.sourcePhotoIngestionId,
      },
    };
    const eventType =
      aggregateType === 'lot'
        ? AuditEventType.LOT_REVIEW_CLEARED
        : AuditEventType.GR_REVIEW_CLEARED;
    await safeAuditEmit(this.events, eventType, envelope, this.logger);
    this.logger.debug(
      `review-queue.cleared aggregateType=${aggregateType} aggregateId=${aggregateId}`,
    );

    return {
      aggregateType,
      aggregateId,
      cleared: true,
      alreadyClear: false,
    };
  }
}
