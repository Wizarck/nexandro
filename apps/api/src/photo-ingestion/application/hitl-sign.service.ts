import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import {
  IngestionAlreadySignedError,
  IngestionCrossTenantError,
  IngestionItemNotSignableError,
  IngestionRejectBandFieldMissingError,
} from '../domain/errors';
import type {
  PhotoIngestionExtraction,
  PhotoIngestionField,
  SignIngestionInput,
} from '../types';
import { classifyField } from './confidence-band.classifier';
import { IngestionItemRepository } from './ingestion-item.repository';
import { PHOTO_INGESTION_AGGREGATE_TYPE } from './ingestion.service';

/**
 * Sign service for HITL ingestion items. Per j12 §Decisions:
 *
 *  - Only `awaiting_review` or `rejected` rows are signable.
 *  - Every field whose LLM confidence was in the reject band (`< 0.60`)
 *    MUST be present + non-empty in `fieldCorrections`. The classifier
 *    refuses on the first missing reject-band field.
 *  - Operator-edited fields are trusted by definition; their stored
 *    `confidence` is pinned to `1.0` so future re-classifications treat
 *    them as auto-filled.
 *  - `PHOTO_INGESTION_SIGNED` envelope carries the FULL payload —
 *    llmExtraction + operatorCorrection co-stored — per FR32 forensic
 *    foundation.
 */
@Injectable()
export class HitlSignService {
  constructor(
    private readonly repo: IngestionItemRepository,
    private readonly events: EventEmitter2,
  ) {}

  async sign(
    organizationId: string,
    itemId: string,
    input: SignIngestionInput,
  ): Promise<{ itemId: string; status: 'signed' }> {
    const row = await this.repo.findById(organizationId, itemId);
    if (row === null) {
      throw new IngestionCrossTenantError(itemId);
    }
    if (row.status === 'signed') {
      throw new IngestionAlreadySignedError(itemId);
    }
    if (row.status !== 'awaiting_review' && row.status !== 'rejected') {
      throw new IngestionItemNotSignableError(itemId, row.status);
    }

    // Reject-band field enforcement: every field on the llmExtraction that
    // landed in the reject band MUST be present + non-empty in
    // `fieldCorrections`. Missing fields throw before any write.
    const corrections = new Map<string, PhotoIngestionField>();
    for (const c of input.fieldCorrections) {
      corrections.set(c.name, c);
    }
    if (row.llmExtraction !== null) {
      for (const field of row.llmExtraction.fields) {
        if (classifyField(field.confidence) !== 'reject') continue;
        const corr = corrections.get(field.name);
        if (corr === undefined || this.isEmpty(corr.value)) {
          throw new IngestionRejectBandFieldMissingError(field.name);
        }
      }
    }

    const operatorCorrection = this.buildOperatorCorrection(
      row.llmExtraction,
      input.fieldCorrections,
    );

    const now = new Date();
    row.operatorCorrection = operatorCorrection;
    row.status = 'signed';
    row.signedAt = now;
    row.signedByUserId = input.signedByUserId;
    const saved = await this.repo.save(row);

    const envelope: AuditEventEnvelope = {
      organizationId: saved.organizationId,
      aggregateType: PHOTO_INGESTION_AGGREGATE_TYPE,
      aggregateId: saved.id,
      actorUserId: input.signedByUserId,
      actorKind: 'user',
      payloadBefore: {
        status: 'awaiting_review',
        llmExtraction: row.llmExtraction,
      },
      payloadAfter: {
        photoId: saved.photoId,
        kind: saved.kind,
        status: saved.status,
        overallConfidence: saved.overallConfidence,
        modelVersion: saved.modelVersion,
        promptVersion: saved.promptVersion,
        signedAt: saved.signedAt,
        signedByUserId: saved.signedByUserId,
        llmExtraction: saved.llmExtraction,
        operatorCorrection: saved.operatorCorrection,
      },
    };
    await this.events.emitAsync(AuditEventType.PHOTO_INGESTION_SIGNED, envelope);

    return { itemId: saved.id, status: 'signed' };
  }

  private buildOperatorCorrection(
    llmExtraction: PhotoIngestionExtraction | null,
    corrections: PhotoIngestionField[],
  ): PhotoIngestionExtraction {
    const correctionMap = new Map<string, PhotoIngestionField>();
    for (const c of corrections) {
      // Operator-edited fields are trusted at confidence 1.0 by definition.
      correctionMap.set(c.name, { ...c, confidence: 1.0 });
    }
    const seed = llmExtraction?.fields ?? [];
    const mergedFields: PhotoIngestionField[] = [];
    const seen = new Set<string>();
    for (const f of seed) {
      const corr = correctionMap.get(f.name);
      mergedFields.push(corr ?? { ...f });
      seen.add(f.name);
    }
    // Operator-introduced fields that the LLM never produced — append.
    for (const c of corrections) {
      if (!seen.has(c.name)) {
        mergedFields.push({ ...c, confidence: 1.0 });
      }
    }
    return {
      fields: mergedFields,
      overallConfidence: 1.0,
      modelVersion: llmExtraction?.modelVersion ?? 'operator',
      promptVersion: llmExtraction?.promptVersion ?? 'operator',
    };
  }

  private isEmpty(value: string | number | null): boolean {
    if (value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (typeof value === 'number') return !Number.isFinite(value);
    return false;
  }
}
