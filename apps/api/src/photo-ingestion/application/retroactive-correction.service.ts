import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import {
  IngestionCorrectionEmptyError,
  IngestionCrossTenantError,
  IngestionItemNotCorrectableError,
} from '../domain/errors';
import type {
  CorrectionsHistoryEntry,
  PhotoIngestionExtraction,
  PhotoIngestionField,
  RetroactiveCorrectionInput,
  RetroactiveCorrectionResult,
} from '../types';
import { classifyField } from './confidence-band.classifier';
import { IngestionItemRepository } from './ingestion-item.repository';
import { PHOTO_INGESTION_AGGREGATE_TYPE } from './ingestion.service';

/**
 * Retroactive correction service for already-signed HITL ingestion items.
 *
 * Per M3 hardening H1b design.md:
 *  - Only `signed` items can be retro-corrected; everything else stays in
 *    the standard HITL sign flow.
 *  - The prior `operatorCorrection` is preserved verbatim in the row's
 *    `correctionsHistory` JSONB column per ADR-APPEND-ONLY-CORRECTIONS-HISTORY.
 *  - Applying the same content twice is idempotent: the content hash of
 *    `{ fieldCorrections, correctedByUserId }` is matched against the
 *    latest history entry's hash, returning `{ idempotent: true }`
 *    without a write or envelope emission.
 *  - The `HITL_RETROACTIVE_CORRECTION` envelope carries
 *    `payloadBefore = previousCorrection` + `payloadAfter = newCorrection`
 *    so the regulatory chain of custody is complete.
 *  - Downstream Lot / GR aggregates are NEVER auto-mutated; the separate
 *    `DownstreamRevocationSubscriber` flags them `requires_review=true`.
 */
@Injectable()
export class RetroactiveCorrectionService {
  private readonly logger = new Logger(RetroactiveCorrectionService.name);

  constructor(
    private readonly repo: IngestionItemRepository,
    private readonly events: EventEmitter2,
  ) {}

  async apply(
    organizationId: string,
    itemId: string,
    input: RetroactiveCorrectionInput,
  ): Promise<RetroactiveCorrectionResult> {
    const row = await this.repo.findById(organizationId, itemId);
    if (row === null) {
      // No existence disclosure — cross-tenant lookups respond 404 with the
      // same shape as a genuine miss. Slice #17a precedent.
      throw new IngestionCrossTenantError(itemId);
    }
    if (row.status !== 'signed') {
      throw new IngestionItemNotCorrectableError(itemId, row.status);
    }

    const contentHash = this.computeContentHash(
      input.fieldCorrections,
      input.correctedByUserId,
    );
    const history: CorrectionsHistoryEntry[] = Array.isArray(
      row.correctionsHistory,
    )
      ? row.correctionsHistory
      : [];
    const latest = history.length > 0 ? history[history.length - 1] : null;
    if (latest !== null && latest.contentHash === contentHash) {
      // Idempotent retry: same operator, same payload. No write, no envelope.
      return {
        itemId: row.id,
        status: 'signed',
        correctionsHistoryLength: history.length,
        idempotent: true,
      };
    }

    // Iron-rule reject-band field invariant carries forward from slice
    // #17a sign: any field that was originally in the reject band MUST
    // still be present + non-empty in the retroactive correction. This
    // gate runs BEFORE history append so a refusal leaves the row
    // untouched.
    this.assertRejectBandFieldsNonEmpty(row.llmExtraction, input.fieldCorrections);

    const previousCorrection = row.operatorCorrection;
    if (previousCorrection === null) {
      // `status='signed'` guarantees a prior operator correction. Defensive
      // guard — if a future migration introduces a non-correction-bearing
      // signed state, refuse here rather than emit a malformed envelope.
      throw new IngestionItemNotCorrectableError(itemId, row.status);
    }

    const newCorrection = this.buildOperatorCorrection(
      previousCorrection,
      input.fieldCorrections,
    );

    const now = new Date();
    const correctionId = randomUUID();
    const reason = input.reason ?? null;
    const entry: CorrectionsHistoryEntry = {
      correctionId,
      correctedAt: now.toISOString(),
      correctedByUserId: input.correctedByUserId,
      reason,
      previousCorrection,
      contentHash,
    };
    const nextHistory = [...history, entry];

    row.correctionsHistory = nextHistory;
    row.operatorCorrection = newCorrection;
    const saved = await this.repo.save(row);

    const envelope: AuditEventEnvelope = {
      organizationId: saved.organizationId,
      aggregateType: PHOTO_INGESTION_AGGREGATE_TYPE,
      aggregateId: saved.id,
      actorUserId: input.correctedByUserId,
      actorKind: 'user',
      payloadBefore: {
        operatorCorrection: previousCorrection,
        correctionsHistoryLength: history.length,
      },
      payloadAfter: {
        operatorCorrection: newCorrection,
        correctionsHistoryLength: nextHistory.length,
        contentHash,
        correctionId,
        reason,
      },
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.HITL_RETROACTIVE_CORRECTION,
      envelope,
      this.logger,
    );

    return {
      itemId: saved.id,
      status: 'signed',
      correctionsHistoryLength: nextHistory.length,
      idempotent: false,
    };
  }

  /**
   * SHA-256 over a CANONICAL JSON serialisation of the inputs. Canonical
   * form ensures key-order / whitespace / case differences do not produce
   * false-positive divergence per ADR-IDEMPOTENT-VIA-CONTENT-HASH:
   *
   *  - Object keys sorted lexicographically.
   *  - String values lowercased (case-insensitive dedup).
   *  - Numeric values formatted via `toFixed(4)` (matches the precision of
   *    `numeric(18,4)` columns elsewhere in M3 — same precision contract).
   *  - `null` preserved verbatim; `undefined` collapsed to omitted key.
   *  - `correctedByUserId` included so the same field-payload from two
   *    different operators produces two distinct hashes.
   */
  private computeContentHash(
    corrections: PhotoIngestionField[],
    correctedByUserId: string,
  ): string {
    const canonical = {
      correctedByUserId: correctedByUserId.toLowerCase(),
      fieldCorrections: corrections
        .slice()
        .map((f) => this.canonicaliseField(f))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    const json = this.canonicalStringify(canonical);
    return createHash('sha256').update(json).digest('hex');
  }

  private canonicaliseField(f: PhotoIngestionField): {
    name: string;
    value: string | number | null;
    confidence: number | null;
  } {
    let value: string | number | null;
    if (f.value === null || f.value === undefined) {
      value = null;
    } else if (typeof f.value === 'string') {
      value = f.value.trim().toLowerCase();
    } else if (typeof f.value === 'number') {
      value = Number.isFinite(f.value) ? Number(f.value.toFixed(4)) : null;
    } else {
      value = null;
    }
    const confidence =
      typeof f.confidence === 'number' && Number.isFinite(f.confidence)
        ? Number(f.confidence.toFixed(4))
        : null;
    return { name: f.name, value, confidence };
  }

  /**
   * Stable JSON.stringify-like serialiser that sorts object keys at every
   * level so two semantically-equal payloads with different key orders
   * yield the same hash.
   */
  private canonicalStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) {
      return `[${value.map((v) => this.canonicalStringify(v)).join(',')}]`;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts = keys.map(
        (k) => `${JSON.stringify(k)}:${this.canonicalStringify(obj[k])}`,
      );
      return `{${parts.join(',')}}`;
    }
    return 'null';
  }

  private assertRejectBandFieldsNonEmpty(
    llmExtraction: PhotoIngestionExtraction | null,
    corrections: PhotoIngestionField[],
  ): void {
    if (llmExtraction === null) return;
    const correctionMap = new Map<string, PhotoIngestionField>();
    for (const c of corrections) {
      correctionMap.set(c.name, c);
    }
    for (const field of llmExtraction.fields) {
      if (classifyField(field.confidence) !== 'reject') continue;
      const corr = correctionMap.get(field.name);
      if (corr === undefined || this.isEmpty(corr.value)) {
        throw new IngestionCorrectionEmptyError(field.name);
      }
    }
  }

  /**
   * Mirrors `HitlSignService.buildOperatorCorrection` shape but the seed
   * fields are the PRIOR correction (not the original LLM extraction) —
   * the retro-correction supersedes the prior operator decision.
   */
  private buildOperatorCorrection(
    previousCorrection: PhotoIngestionExtraction,
    corrections: PhotoIngestionField[],
  ): PhotoIngestionExtraction {
    const correctionMap = new Map<string, PhotoIngestionField>();
    for (const c of corrections) {
      correctionMap.set(c.name, { ...c, confidence: 1.0 });
    }
    const mergedFields: PhotoIngestionField[] = [];
    const seen = new Set<string>();
    for (const f of previousCorrection.fields) {
      const corr = correctionMap.get(f.name);
      mergedFields.push(corr ?? { ...f });
      seen.add(f.name);
    }
    for (const c of corrections) {
      if (!seen.has(c.name)) {
        mergedFields.push({ ...c, confidence: 1.0 });
      }
    }
    return {
      fields: mergedFields,
      overallConfidence: 1.0,
      modelVersion: previousCorrection.modelVersion,
      promptVersion: previousCorrection.promptVersion,
    };
  }

  private isEmpty(value: string | number | null): boolean {
    if (value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (typeof value === 'number') return !Number.isFinite(value);
    return false;
  }
}
