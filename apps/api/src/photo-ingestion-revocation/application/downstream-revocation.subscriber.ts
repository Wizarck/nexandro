import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLogService } from '../../audit-log/application/audit-log.service';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { DownstreamRevocationRepository } from './downstream-revocation.repository';

/**
 * Listens on `HITL_RETROACTIVE_CORRECTION` and flips
 * `requires_review = true` on every downstream `lots` / `goods_receipts`
 * row whose `source_photo_ingestion_id` matches the corrected ingestion
 * item.
 *
 * Per ADR-NEVER-AUTO-CASCADE-DOWNSTREAM (H1b design.md), the downstream
 * snapshot is NOT mutated — the operator must reconcile manually via the
 * future review-queue surface. This subscriber only flags.
 *
 * Per ADR-COLUMN-EXISTS-GRACEFUL-PROBE: deployments that have not yet
 * applied migration 0041 (which adds `requires_review` + the source
 * column) get a `DOWNSTREAM_REVOCATION_DEFERRED` envelope instead of a
 * mid-event throw. The probe checks Postgres error `42703`.
 *
 * The subscriber is wrapped in try/catch: a transient repository failure
 * logs + drops; the producer's own envelope (`HITL_RETROACTIVE_CORRECTION`)
 * has already been persisted by the audit-log subscriber so the chain of
 * custody is not lost.
 *
 * Per `m3.x-nested-emitasync-direct-call`: the three downstream audit
 * events (LOT_FLAGGED_FOR_REVIEW, GR_FLAGGED_FOR_REVIEW,
 * DOWNSTREAM_REVOCATION_DEFERRED) are persisted via direct
 * `AuditLogService.record(...)` calls rather than re-entering the bus
 * with `safeAuditEmit`. Rationale: this subscriber runs inside an
 * `@OnEvent(HITL_RETROACTIVE_CORRECTION)` handler — the Nest event
 * subscriber loader wraps listeners with `suppressErrors=true`, which
 * decouples nested `emitAsync` rejections from the outer awaiter and
 * produced the race documented in `feedback_nested_emitasync_race`. The
 * local try/catch around each `record()` preserves the swallow semantics
 * `safeAuditEmit` provided so a regulatory strict-mode rethrow inside
 * `record()` does NOT break the downstream-revocation handler.
 */
@Injectable()
export class DownstreamRevocationSubscriber {
  private readonly logger = new Logger(DownstreamRevocationSubscriber.name);

  constructor(
    private readonly repo: DownstreamRevocationRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  @OnEvent(AuditEventType.HITL_RETROACTIVE_CORRECTION)
  async onHitlRetroactiveCorrection(
    envelope: AuditEventEnvelope,
  ): Promise<void> {
    try {
      await this.process(envelope);
    } catch (err) {
      this.logger.error(
        `downstream-revocation.subscriber.error: aggregate=${envelope?.aggregateId ?? '<unknown>'} ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async process(envelope: AuditEventEnvelope): Promise<void> {
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      typeof envelope.organizationId !== 'string' ||
      typeof envelope.aggregateId !== 'string'
    ) {
      this.logger.warn(
        'downstream-revocation.subscriber.skipped: payload missing envelope shape',
      );
      return;
    }
    const organizationId = envelope.organizationId;
    const ingestionItemId = envelope.aggregateId;

    const lotsProbe = await this.repo.flagLotsBySourcePhotoIngestion(
      organizationId,
      ingestionItemId,
    );
    if (!lotsProbe.columnExists) {
      await this.emitDeferred(
        organizationId,
        ingestionItemId,
        'lots:column-missing',
      );
      return;
    }
    for (const lotId of lotsProbe.flaggedRowIds) {
      await this.emitLotFlagged(organizationId, ingestionItemId, lotId);
    }

    const grsProbe = await this.repo.flagGoodsReceiptsBySourcePhotoIngestion(
      organizationId,
      ingestionItemId,
    );
    if (!grsProbe.columnExists) {
      await this.emitDeferred(
        organizationId,
        ingestionItemId,
        'goods_receipts:column-missing',
      );
      return;
    }
    for (const grId of grsProbe.flaggedRowIds) {
      await this.emitGrFlagged(organizationId, ingestionItemId, grId);
    }
  }

  private async emitLotFlagged(
    organizationId: string,
    ingestionItemId: string,
    lotId: string,
  ): Promise<void> {
    const envelope: AuditEventEnvelope = {
      organizationId,
      aggregateType: 'lot',
      aggregateId: lotId,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: {
        sourcePhotoIngestionItemId: ingestionItemId,
        requiresReview: true,
      },
    };
    await this.recordSafely(AuditEventType.LOT_FLAGGED_FOR_REVIEW, envelope);
  }

  private async emitGrFlagged(
    organizationId: string,
    ingestionItemId: string,
    grId: string,
  ): Promise<void> {
    const envelope: AuditEventEnvelope = {
      organizationId,
      aggregateType: 'goods_receipt',
      aggregateId: grId,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: {
        sourcePhotoIngestionItemId: ingestionItemId,
        requiresReview: true,
      },
    };
    await this.recordSafely(AuditEventType.GR_FLAGGED_FOR_REVIEW, envelope);
  }

  private async emitDeferred(
    organizationId: string,
    ingestionItemId: string,
    reason: string,
  ): Promise<void> {
    const envelope: AuditEventEnvelope = {
      organizationId,
      aggregateType: 'photo_ingestion_item',
      aggregateId: ingestionItemId,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: {
        reason,
        migrationHint:
          'apply migration 0041_photo_ingest_retroactive_correction.ts to enable downstream-revocation flagging',
      },
    };
    await this.recordSafely(
      AuditEventType.DOWNSTREAM_REVOCATION_DEFERRED,
      envelope,
    );
  }

  /**
   * Direct `AuditLogService.record(...)` call wrapped in a local
   * try/catch that preserves the swallow semantics `safeAuditEmit`
   * provided: a regulatory strict-mode rethrow inside `record()` (cf.
   * `m3.x-audit-log-subscriber-strict-mode`, PR #169) is logged at ERROR
   * level and NOT propagated, so a single audit-write failure does not
   * abort the wider downstream-revocation flow. Logged with the same
   * shape as `safeAuditEmit` so observability tooling keyed off
   * `audit-record.failed:` continues to fire.
   */
  private async recordSafely(
    eventType: string,
    envelope: AuditEventEnvelope,
  ): Promise<void> {
    try {
      await this.auditLog.record(eventType, envelope);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `audit-record.failed: ${eventType} aggregate=${envelope.aggregateId} ` +
          `org=${envelope.organizationId} ${message}`,
      );
    }
  }
}
