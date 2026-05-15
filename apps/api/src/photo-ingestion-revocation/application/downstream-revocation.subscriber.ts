import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
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
 */
@Injectable()
export class DownstreamRevocationSubscriber {
  private readonly logger = new Logger(DownstreamRevocationSubscriber.name);

  constructor(
    private readonly repo: DownstreamRevocationRepository,
    private readonly events: EventEmitter2,
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
    await safeAuditEmit(
      this.events,
      AuditEventType.LOT_FLAGGED_FOR_REVIEW,
      envelope,
      this.logger,
    );
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
    await safeAuditEmit(
      this.events,
      AuditEventType.GR_FLAGGED_FOR_REVIEW,
      envelope,
      this.logger,
    );
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
    await safeAuditEmit(
      this.events,
      AuditEventType.DOWNSTREAM_REVOCATION_DEFERRED,
      envelope,
      this.logger,
    );
  }
}
