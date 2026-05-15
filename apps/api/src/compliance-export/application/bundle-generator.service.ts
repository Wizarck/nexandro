import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import {
  EMAIL_DISPATCH_SERVICE,
  type EmailDispatchService,
} from '../../shared/email-dispatch/email-dispatch.service.interface';
import type {
  EmailAttachment,
  EmailDispatchResult,
} from '../../shared/email-dispatch/types';
import { ExportBundle } from '../domain/export-bundle.entity';
import { BUNDLE_STORAGE, type BundleStorage } from '../storage/bundle-storage';
import {
  CANONICAL_CHAPTER_ORDER,
  COMPLIANCE_EXPORT_AGGREGATE_TYPE,
  COMPLIANCE_EXPORT_EMAIL_TAG,
  type ExportBundleDispatchedPayload,
  type ExportBundleGeneratedPayload,
  type GenerateBundleInput,
  type RecipientReceipt,
  type ScopeKind,
  SYNC_GENERATION_MAX_DAYS,
} from '../types';
import type { ChapterSection, Locale } from '../types';
import { ChapterZeroAuditLogRenderer } from './chapter-renderers/chapter-0-audit-log.renderer';
import { ChapterAiObsRenderer } from './chapter-renderers/chapter-ai-obs.renderer';
import { ChapterHaccpRenderer } from './chapter-renderers/chapter-haccp.renderer';
import { ChapterLotRenderer } from './chapter-renderers/chapter-lot.renderer';
import { ChapterPhotoRenderer } from './chapter-renderers/chapter-photo.renderer';
import { ChapterProcurementRenderer } from './chapter-renderers/chapter-procurement.renderer';

export interface GenerateBundleOutcome {
  readonly bundleId: string;
  readonly status: 'ready' | 'generating' | 'failed';
  readonly receipts: ReadonlyArray<RecipientReceipt>;
}

export interface BundleProgressEvent {
  readonly step:
    | 'indexing'
    | 'composing_chapter_0'
    | 'rendering_chapter_haccp'
    | 'rendering_chapter_lot'
    | 'rendering_chapter_procurement'
    | 'rendering_chapter_photo'
    | 'rendering_chapter_ai_obs'
    | 'sealing_hash'
    | 'ready'
    | 'failed';
  readonly sha256?: string;
  readonly pageCount?: number;
  readonly byteSize?: number;
  readonly errorMessage?: string;
}

/**
 * Compose an APPCC export bundle: chapter 0 (raw audit_log) + N
 * scope-driven derivative chapters → PDF + CSV pair sealed by a single
 * SHA-256 over `pdf_bytes || csv_bytes`. Per j9.md +
 * ADR-SHA-CONCATENATED-PAYLOAD.
 *
 * For ranges ≤ 90 days the call is synchronous (resolves with
 * `status='ready'`). For longer ranges the call resolves early with
 * `status='generating'`; the in-process pipeline continues + updates the
 * row + emits envelopes when complete.
 */
@Injectable()
export class BundleGeneratorService {
  private readonly logger = new Logger(BundleGeneratorService.name);
  /** Bundle-id → EventEmitter for the SSE stream. */
  private readonly progressBus = new Map<string, EventEmitter>();

  constructor(
    @InjectRepository(ExportBundle)
    private readonly repo: Repository<ExportBundle>,
    private readonly events: EventEmitter2,
    private readonly chapter0: ChapterZeroAuditLogRenderer,
    private readonly chapterHaccp: ChapterHaccpRenderer,
    private readonly chapterLot: ChapterLotRenderer,
    private readonly chapterProcurement: ChapterProcurementRenderer,
    private readonly chapterPhoto: ChapterPhotoRenderer,
    private readonly chapterAiObs: ChapterAiObsRenderer,
    @Inject(BUNDLE_STORAGE) private readonly storage: BundleStorage,
    @Inject(EMAIL_DISPATCH_SERVICE)
    private readonly emailDispatch: EmailDispatchService,
  ) {}

  /**
   * Subscribe to SSE-style progress for a bundle. Returns an
   * EventEmitter the caller can listen on with `.on('progress', cb)`
   * and `.on('done', cb)`. Lifetime: removed when the bundle resolves
   * to `ready` or `failed`.
   */
  progressStream(bundleId: string): EventEmitter {
    let bus = this.progressBus.get(bundleId);
    if (!bus) {
      bus = new EventEmitter();
      bus.setMaxListeners(50);
      this.progressBus.set(bundleId, bus);
    }
    return bus;
  }

  /**
   * Run the pipeline. Synchronous ≤ 90 days, async > 90 days. Either way
   * the returned promise resolves once the row has its initial status
   * settled (either `ready`/`failed` for sync, or `generating` for async
   * with continuation in the background).
   */
  async generate(input: GenerateBundleInput): Promise<GenerateBundleOutcome> {
    this.validateInput(input);
    const bundleId = randomUUID();
    const isSync = this.shouldRunSync(input.rangeStart, input.rangeEnd);

    const row = await this.repo.save({
      id: bundleId,
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      locale: input.locale,
      scope: [...input.scope],
      status: 'pending',
      pdfStoragePath: null,
      csvStoragePath: null,
      sha256: null,
      pageCount: null,
      byteSize: null,
      errorMessage: null,
      generatedAt: null,
      archivedAt: null,
      deletedAt: null,
    } as ExportBundle);

    if (isSync) {
      try {
        const receipts = await this.runPipeline(row, input);
        return { bundleId, status: 'ready', receipts };
      } catch (err) {
        await this.markFailed(row.id, err);
        return { bundleId, status: 'failed', receipts: [] };
      }
    }
    // Async path — kick off the pipeline but don't await.
    this.runPipeline(row, input)
      .catch((err) => this.markFailed(row.id, err));
    return { bundleId, status: 'generating', receipts: [] };
  }

  /**
   * The full sealed pipeline. Public for testing — `generate()` is the
   * normal entry point.
   */
  async runPipeline(
    row: ExportBundle,
    input: GenerateBundleInput,
  ): Promise<RecipientReceipt[]> {
    await this.repo.update(row.id, { status: 'generating' });
    this.emit(row.id, { step: 'indexing' });

    const chapter0Section = await this.chapter0.render(
      input.organizationId,
      input.rangeStart,
      input.rangeEnd,
      input.locale,
    );
    this.emit(row.id, { step: 'composing_chapter_0' });

    const sections: Array<{ kind: 'chapter_0' | ScopeKind; section: ChapterSection }> = [
      { kind: 'chapter_0', section: chapter0Section },
    ];
    for (const kind of CANONICAL_CHAPTER_ORDER) {
      if (!input.scope.includes(kind)) continue;
      const section = await this.renderDerivative(
        kind,
        input.organizationId,
        input.rangeStart,
        input.rangeEnd,
        input.locale,
        input.locationIds,
      );
      sections.push({ kind, section });
      this.emit(row.id, { step: `rendering_chapter_${kind}` as BundleProgressEvent['step'] });
    }

    const { pdfBytes, csvBytes, pageCount, totalRows } = composeBundle(sections);
    const sha256 = sha256OverConcatenated(pdfBytes, csvBytes);
    this.emit(row.id, { step: 'sealing_hash', sha256 });

    const pdfPath = await this.storage.putBundle(
      input.organizationId,
      row.id,
      'pdf',
      pdfBytes,
    );
    const csvPath = await this.storage.putBundle(
      input.organizationId,
      row.id,
      'csv',
      csvBytes,
    );

    const byteSize = pdfBytes.length + csvBytes.length;
    const generatedAt = new Date();
    await this.repo.update(row.id, {
      status: 'ready',
      pdfStoragePath: pdfPath,
      csvStoragePath: csvPath,
      sha256,
      pageCount,
      byteSize,
      generatedAt,
    });

    const generatedPayload: ExportBundleGeneratedPayload = {
      bundle_sha256: sha256,
      pdf_storage_path: pdfPath,
      csv_storage_path: csvPath,
      locale: input.locale,
      scope: [...input.scope],
      range_start: input.rangeStart.toISOString(),
      range_end: input.rangeEnd.toISOString(),
      page_count: pageCount,
      byte_size: byteSize,
    };
    const generatedEnvelope: AuditEventEnvelope<null, ExportBundleGeneratedPayload> = {
      organizationId: input.organizationId,
      aggregateType: COMPLIANCE_EXPORT_AGGREGATE_TYPE,
      aggregateId: row.id,
      actorUserId: input.requestedByUserId,
      actorKind: input.actorKind,
      payloadBefore: null,
      payloadAfter: generatedPayload,
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.EXPORT_BUNDLE_GENERATED,
      generatedEnvelope,
      this.logger,
    );

    const receipts: RecipientReceipt[] = [];
    if (input.recipientEmails && input.recipientEmails.length > 0) {
      receipts.push(
        ...(await this.dispatchEmails(input, row.id, sha256, pdfBytes, csvBytes)),
      );
    }
    this.emit(row.id, {
      step: 'ready',
      sha256,
      pageCount,
      byteSize,
    });
    // Drop the progress bus so subscribers stop accumulating.
    this.progressBus.delete(row.id);
    this.logger.debug(
      `bundle.ready id=${row.id} rows=${totalRows} sha256=${sha256.slice(0, 8)}…`,
    );
    return receipts;
  }

  private async renderDerivative(
    kind: ScopeKind,
    organizationId: string,
    rangeStart: Date,
    rangeEnd: Date,
    locale: Locale,
    locationIds?: ReadonlyArray<string>,
  ): Promise<ChapterSection> {
    switch (kind) {
      case 'haccp':
        return this.chapterHaccp.render(organizationId, rangeStart, rangeEnd, locale, locationIds);
      case 'lot':
        return this.chapterLot.render(organizationId, rangeStart, rangeEnd, locale, locationIds);
      case 'procurement':
        return this.chapterProcurement.render(
          organizationId,
          rangeStart,
          rangeEnd,
          locale,
          locationIds,
        );
      case 'photo':
        return this.chapterPhoto.render(organizationId, rangeStart, rangeEnd, locale, locationIds);
      case 'ai_obs':
        return this.chapterAiObs.render(organizationId, rangeStart, rangeEnd, locale, locationIds);
    }
  }

  private async dispatchEmails(
    input: GenerateBundleInput,
    bundleId: string,
    sha256: string,
    pdfBytes: Buffer,
    csvBytes: Buffer,
  ): Promise<RecipientReceipt[]> {
    const attachments: EmailAttachment[] = [
      {
        filename: `appcc-export-${bundleId}.pdf`,
        contentType: 'application/pdf',
        contentBase64: pdfBytes.toString('base64'),
      },
      {
        filename: `appcc-export-${bundleId}.csv`,
        contentType: 'text/csv; charset=utf-8',
        contentBase64: csvBytes.toString('base64'),
      },
    ];
    const subject = `APPCC export bundle ${bundleId.slice(0, 8)} — ${input.locale}`;
    const bodyText = [
      `Adjunto bundle de exportación APPCC.`,
      ``,
      `Rango: ${input.rangeStart.toISOString()} → ${input.rangeEnd.toISOString()}`,
      `Locale: ${input.locale}`,
      `Scope: ${input.scope.join(', ') || '(solo capítulo 0)'}`,
      `SHA-256: ${sha256}`,
    ].join('\n');

    const receipts: RecipientReceipt[] = [];
    for (const recipient of input.recipientEmails ?? []) {
      const result = await this.emailDispatch.dispatch({
        to: [recipient],
        subject,
        bodyText,
        attachments,
        tag: COMPLIANCE_EXPORT_EMAIL_TAG,
        organizationId: input.organizationId,
      });
      const receipt = this.toReceipt(recipient, result);
      receipts.push(receipt);
      await this.emitDispatched(input, bundleId, sha256, receipt);
    }
    return receipts;
  }

  private toReceipt(recipient: string, result: EmailDispatchResult): RecipientReceipt {
    if (result.status === 'success') {
      return {
        address: recipient,
        status: 'delivered',
        providerMessageId: result.providerMessageId,
        errorCode: null,
        errorMessage: null,
        attempt: result.attempts,
        deliveredAt: result.deliveredAt.toISOString(),
      };
    }
    return {
      address: recipient,
      status: 'failed',
      providerMessageId: null,
      errorCode: result.error.code,
      errorMessage: result.error.message,
      attempt: result.error.attempts,
      deliveredAt: null,
    };
  }

  private async emitDispatched(
    input: GenerateBundleInput,
    bundleId: string,
    sha256: string,
    receipt: RecipientReceipt,
  ): Promise<void> {
    const payloadAfter: ExportBundleDispatchedPayload = {
      recipient: receipt.address,
      deliveryStatus: receipt.status,
      providerMessageId: receipt.providerMessageId,
      errorCode: receipt.errorCode,
      errorMessage: receipt.errorMessage,
      attempt: receipt.attempt,
      dispatchedAt: receipt.deliveredAt ?? new Date().toISOString(),
      bundle_sha256: sha256,
    };
    const envelope: AuditEventEnvelope<null, ExportBundleDispatchedPayload> = {
      organizationId: input.organizationId,
      aggregateType: COMPLIANCE_EXPORT_AGGREGATE_TYPE,
      aggregateId: bundleId,
      actorUserId: input.requestedByUserId,
      actorKind: input.actorKind,
      payloadBefore: null,
      payloadAfter,
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.EXPORT_BUNDLE_DISPATCHED,
      envelope,
      this.logger,
    );
  }

  private emit(bundleId: string, event: BundleProgressEvent): void {
    const bus = this.progressBus.get(bundleId);
    if (bus) bus.emit('progress', event);
  }

  private async markFailed(bundleId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`bundle.failed id=${bundleId} ${message}`);
    await this.repo.update(bundleId, { status: 'failed', errorMessage: message });
    this.emit(bundleId, { step: 'failed', errorMessage: message });
    this.progressBus.delete(bundleId);
  }

  private validateInput(input: GenerateBundleInput): void {
    if (!input.rangeStart || !input.rangeEnd) {
      throw new Error('rangeStart and rangeEnd are required');
    }
    if (input.rangeEnd.getTime() < input.rangeStart.getTime()) {
      throw new Error('rangeEnd must be on or after rangeStart');
    }
    for (const kind of input.scope) {
      if (!CANONICAL_CHAPTER_ORDER.includes(kind)) {
        throw new Error(`unknown scope kind: ${kind}`);
      }
    }
  }

  private shouldRunSync(rangeStart: Date, rangeEnd: Date): boolean {
    const ms = rangeEnd.getTime() - rangeStart.getTime();
    const days = ms / (24 * 60 * 60 * 1000);
    return days <= SYNC_GENERATION_MAX_DAYS;
  }
}

/**
 * Concatenate per-chapter PDF + CSV sections into the sealed bundle.
 * Order: chapter 0 first, then canonical order. Page count is the sum
 * of chapter row counts (rough proxy — a real PDF render computes
 * physical pages).
 */
function composeBundle(
  sections: ReadonlyArray<{ kind: string; section: ChapterSection }>,
): { pdfBytes: Buffer; csvBytes: Buffer; pageCount: number; totalRows: number } {
  const pdfChunks: Buffer[] = [];
  const csvChunks: string[] = [];
  // UTF-8 BOM so Excel ES locale opens the CSV cleanly (j9.md §Notes).
  csvChunks.push('﻿');
  let totalRows = 0;
  for (const { section } of sections) {
    pdfChunks.push(section.pdfSection);
    pdfChunks.push(Buffer.from('\n', 'utf8'));
    csvChunks.push(section.csvSection);
    csvChunks.push('\n');
    totalRows += section.rowCount;
  }
  const pdfBytes = Buffer.concat(pdfChunks);
  const csvBytes = Buffer.from(csvChunks.join(''), 'utf8');
  const pageCount = Math.max(1, Math.ceil(totalRows / 40));
  return { pdfBytes, csvBytes, pageCount, totalRows };
}

/** Single SHA-256 over `pdf_bytes || csv_bytes` per j9.md + ADR-SHA-CONCATENATED-PAYLOAD. */
function sha256OverConcatenated(pdfBytes: Buffer, csvBytes: Buffer): string {
  const hash = createHash('sha256');
  hash.update(pdfBytes);
  hash.update(csvBytes);
  return hash.digest('hex');
}
