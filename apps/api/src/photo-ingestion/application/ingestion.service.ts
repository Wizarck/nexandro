import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { PhotoStorageService } from '../../photo-storage/application/photo-storage.service';
import {
  VISION_LLM_PROVIDER,
  type VisionLlmProvider,
} from '../../shared/vision-llm/vision-llm-provider.interface';
import type { VisionLlmOutputValue } from '../../shared/vision-llm/types';
import { IngestionItem } from '../domain/ingestion-item.entity';
import { IngestionPhotoNotFoundError } from '../domain/errors';
import type {
  IngestPhotoInput,
  IngestionItemStatus,
  IngestionResult,
  PhotoIngestionExtraction,
  PhotoIngestionField,
} from '../types';
import { classifyField } from './confidence-band.classifier';
import { IngestionItemRepository } from './ingestion-item.repository';

/**
 * Aggregate-type pinned on every `audit_log` envelope emitted by this BC.
 * Drives chronology projections via the existing `ix_audit_log_aggregate`
 * index.
 */
export const PHOTO_INGESTION_AGGREGATE_TYPE = 'photo_ingestion_item' as const;

/**
 * Vision-LLM extraction + confidence-band classification + HITL row
 * persistence. Per j12 §Decisions + ADR-034:
 *
 *  - Null extraction (provider outage) → `rejected` + emit
 *    `PHOTO_EXTRACTION_FAILED`.
 *  - All fields `>= 0.85` AND overall `>= 0.85` → `auto_filled` + emit
 *    `PHOTO_INGESTION_AUTO_FILLED`.
 *  - Any field in `[0.60, 0.85)` AND no reject-band fields → `awaiting_review`
 *    + emit `PHOTO_INGESTION_AWAITING_REVIEW`.
 *  - Any field `< 0.60` → `rejected` + emit
 *    `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE`.
 *
 * The actor on every audit envelope is `actorKind='system'` because the
 * vision-LLM provider — not the operator — produced the row. The sign step
 * (HitlSignService) re-anchors `actorKind='user'`.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly repo: IngestionItemRepository,
    private readonly photoStorage: PhotoStorageService,
    @Inject(VISION_LLM_PROVIDER)
    private readonly provider: VisionLlmProvider,
    private readonly events: EventEmitter2,
  ) {}

  async ingest(
    organizationId: string,
    input: IngestPhotoInput,
  ): Promise<IngestionResult> {
    // Resolve a signed read URL for the photo. Throws if the photo is
    // missing or cross-tenant — both translate to HTTP 404 at the
    // controller (existence-disclosure protection).
    let photoUrl: string;
    try {
      const signed = await this.photoStorage.generateReadUrl(
        organizationId,
        input.photoId,
      );
      photoUrl = signed.url;
    } catch {
      throw new IngestionPhotoNotFoundError(input.photoId);
    }

    const tag = this.tagForKind(input.kind);
    const extraction = await this.provider.extract({
      photoUrl,
      tag,
      capability: input.capability,
    });

    const itemId = randomUUID();
    const now = new Date();

    if (extraction === null) {
      // Iron-rule outage path: null extraction → rejected + extraction-failed
      // envelope. The row is still persisted so the operator can manually
      // enter the data from the j12 detail surface.
      return this.persistAndEmit({
        itemId,
        organizationId,
        photoId: input.photoId,
        kind: input.kind,
        status: 'rejected',
        llmExtraction: null,
        overallConfidence: 0,
        modelVersion: this.provider.modelVersion,
        promptVersion: this.modelPromptVersion(),
        eventType: AuditEventType.PHOTO_EXTRACTION_FAILED,
        emittedAt: now,
        capability: input.capability,
      });
    }

    const fields = this.toIngestionFields(extraction);
    const overallConfidence = this.computeOverallConfidence(fields);
    const llmExtraction: PhotoIngestionExtraction = {
      fields,
      overallConfidence,
      modelVersion: this.provider.modelVersion,
      promptVersion: this.modelPromptVersion(),
    };

    const status = this.classifyExtraction(llmExtraction);
    const eventType = this.eventTypeForStatus(status);

    return this.persistAndEmit({
      itemId,
      organizationId,
      photoId: input.photoId,
      kind: input.kind,
      status,
      llmExtraction,
      overallConfidence,
      modelVersion: this.provider.modelVersion,
      promptVersion: this.modelPromptVersion(),
      eventType,
      emittedAt: now,
      capability: input.capability,
    });
  }

  /**
   * Classify the full extraction against ADR-034 bands. Status precedence:
   *
   *  1. ANY reject-band field → `rejected`
   *  2. ANY flag-band field → `awaiting_review`
   *  3. OVERALL confidence < auto-fill threshold → `awaiting_review`
   *  4. else → `auto_filled`
   */
  private classifyExtraction(
    extraction: PhotoIngestionExtraction,
  ): IngestionItemStatus {
    let hasReject = false;
    let hasFlag = false;
    for (const field of extraction.fields) {
      const band = classifyField(field.confidence);
      if (band === 'reject') hasReject = true;
      else if (band === 'flag_for_review') hasFlag = true;
    }
    if (hasReject) return 'rejected';
    if (hasFlag) return 'awaiting_review';
    const overallBand = classifyField(extraction.overallConfidence);
    if (overallBand !== 'auto_fill') return 'awaiting_review';
    return 'auto_filled';
  }

  private eventTypeForStatus(status: IngestionItemStatus): string {
    switch (status) {
      case 'auto_filled':
        return AuditEventType.PHOTO_INGESTION_AUTO_FILLED;
      case 'awaiting_review':
        return AuditEventType.PHOTO_INGESTION_AWAITING_REVIEW;
      case 'rejected':
        return AuditEventType.PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE;
      default:
        return AuditEventType.PHOTO_INGESTION_AWAITING_REVIEW;
    }
  }

  private async persistAndEmit(args: {
    itemId: string;
    organizationId: string;
    photoId: string;
    kind: 'invoice' | 'product';
    status: IngestionItemStatus;
    llmExtraction: PhotoIngestionExtraction | null;
    overallConfidence: number;
    modelVersion: string;
    promptVersion: string;
    eventType: string;
    emittedAt: Date;
    capability: string;
  }): Promise<IngestionResult> {
    const row = new IngestionItem();
    row.id = args.itemId;
    row.organizationId = args.organizationId;
    row.photoId = args.photoId;
    row.kind = args.kind;
    row.status = args.status;
    row.llmExtraction = args.llmExtraction;
    row.operatorCorrection = null;
    row.overallConfidence = args.overallConfidence;
    row.modelVersion = args.modelVersion;
    row.promptVersion = args.promptVersion;
    row.signedAt = null;
    row.signedByUserId = null;
    row.deletedAt = null;
    const saved = await this.repo.save(row);

    const envelope: AuditEventEnvelope = {
      organizationId: saved.organizationId,
      aggregateType: PHOTO_INGESTION_AGGREGATE_TYPE,
      aggregateId: saved.id,
      actorUserId: null,
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: {
        photoId: saved.photoId,
        kind: saved.kind,
        status: saved.status,
        overallConfidence: saved.overallConfidence,
        modelVersion: saved.modelVersion,
        promptVersion: saved.promptVersion,
        capability: args.capability,
        llmExtraction: saved.llmExtraction,
        operatorCorrection: null,
      },
    };
    await safeAuditEmit(this.events, args.eventType, envelope, this.logger);

    return {
      itemId: saved.id,
      status: saved.status,
      overallConfidence: saved.overallConfidence,
    };
  }

  private toIngestionFields(
    extraction: VisionLlmOutputValue,
  ): PhotoIngestionField[] {
    return extraction.fields.map((f) => ({
      name: f.name,
      value: f.value,
      confidence: f.confidence,
    }));
  }

  private computeOverallConfidence(fields: PhotoIngestionField[]): number {
    if (fields.length === 0) return 0;
    let sum = 0;
    for (const f of fields) {
      sum += Number.isFinite(f.confidence) ? f.confidence : 0;
    }
    return sum / fields.length;
  }

  private tagForKind(kind: 'invoice' | 'product'): string {
    return kind === 'invoice'
      ? 'photo-ingest-invoice'
      : 'photo-ingest-product';
  }

  private modelPromptVersion(): string {
    // The vision-LLM provider does not expose a prompt-version channel
    // in slice #16; we pin a single canonical version per BC for now.
    // M3.x will plumb the per-call value through when prompt-tuning lands.
    return 'v1';
  }
}
