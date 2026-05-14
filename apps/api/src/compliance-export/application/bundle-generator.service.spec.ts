import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ObjectLiteral, Repository } from 'typeorm';
import {
  AuditEventType,
  type AuditEventEnvelope,
} from '../../audit-log/application/types';
import type { EmailDispatchService } from '../../shared/email-dispatch/email-dispatch.service.interface';
import { ExportBundle } from '../domain/export-bundle.entity';
import type { BundleStorage } from '../storage/bundle-storage';
import type {
  ChapterSection,
  ExportBundleDispatchedPayload,
  ExportBundleGeneratedPayload,
  GenerateBundleInput,
} from '../types';
import { BundleGeneratorService } from './bundle-generator.service';
import { ChapterZeroAuditLogRenderer } from './chapter-renderers/chapter-0-audit-log.renderer';
import { ChapterAiObsRenderer } from './chapter-renderers/chapter-ai-obs.renderer';
import { ChapterHaccpRenderer } from './chapter-renderers/chapter-haccp.renderer';
import { ChapterLotRenderer } from './chapter-renderers/chapter-lot.renderer';
import { ChapterPhotoRenderer } from './chapter-renderers/chapter-photo.renderer';
import { ChapterProcurementRenderer } from './chapter-renderers/chapter-procurement.renderer';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const RANGE_START = new Date('2026-02-01T00:00:00Z');
const RANGE_END = new Date('2026-04-30T23:59:59Z');

interface BundleRow extends ObjectLiteral {
  id: string;
  organizationId: string;
  requestedByUserId: string;
  rangeStart: Date;
  rangeEnd: Date;
  locale: string;
  scope: string[];
  status: string;
  pdfStoragePath: string | null;
  csvStoragePath: string | null;
  sha256: string | null;
  pageCount: number | null;
  byteSize: number | null;
  errorMessage: string | null;
  generatedAt: Date | null;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

function makeFakeRepo<T extends ObjectLiteral>(): Repository<T> & {
  _rows: Map<string, T>;
} {
  const rows = new Map<string, T>();
  const repo = {
    save: jest.fn(async (entity: T) => {
      rows.set((entity as unknown as { id: string }).id, { ...entity });
      return entity;
    }),
    update: jest.fn(async (id: string, patch: Partial<T>) => {
      const current = rows.get(id);
      if (current) {
        rows.set(id, { ...current, ...patch } as T);
      }
      return { affected: current ? 1 : 0 };
    }),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
      rows.get(where.id) ?? null,
    ),
    _rows: rows,
  } as unknown as Repository<T> & { _rows: Map<string, T> };
  return repo;
}

function makeChapterSection(text: string): ChapterSection {
  return {
    pdfSection: Buffer.from(`PDF[${text}]`, 'utf8'),
    csvSection: `## ${text}\nrow1,row2\n`,
    rowCount: 1,
  };
}

function buildService(opts: {
  storage?: BundleStorage;
  emailDispatch?: jest.Mocked<EmailDispatchService>;
}) {
  const repo = makeFakeRepo<BundleRow>();
  const events = new EventEmitter2();
  const captured: Array<{ channel: string; envelope: AuditEventEnvelope }> = [];
  events.onAny((channel, payload) => {
    captured.push({ channel: String(channel), envelope: payload as AuditEventEnvelope });
  });

  const chapter0: jest.Mocked<Pick<ChapterZeroAuditLogRenderer, 'render'>> = {
    render: jest.fn().mockResolvedValue(makeChapterSection('chapter_0')),
  };
  const chapterHaccp: jest.Mocked<Pick<ChapterHaccpRenderer, 'render'>> = {
    render: jest.fn().mockResolvedValue(makeChapterSection('haccp')),
  };
  const chapterLot: jest.Mocked<Pick<ChapterLotRenderer, 'render'>> = {
    render: jest.fn().mockResolvedValue(makeChapterSection('lot')),
  };
  const chapterProcurement: jest.Mocked<Pick<ChapterProcurementRenderer, 'render'>> = {
    render: jest.fn().mockResolvedValue(makeChapterSection('procurement')),
  };
  const chapterPhoto: jest.Mocked<Pick<ChapterPhotoRenderer, 'render'>> = {
    render: jest.fn().mockResolvedValue(makeChapterSection('photo')),
  };
  const chapterAiObs: jest.Mocked<Pick<ChapterAiObsRenderer, 'render'>> = {
    render: jest.fn().mockResolvedValue(makeChapterSection('ai_obs')),
  };

  const storage: BundleStorage = opts.storage ?? {
    putBundle: jest.fn(async (org, id, kind) => `${org}/${id}/${kind}.bin`),
    readBundle: jest.fn(async () => Buffer.from('bytes')),
    signedReadUrl: jest.fn(async (p) => `https://test/download?path=${p}`),
  };
  const emailDispatch: jest.Mocked<EmailDispatchService> = opts.emailDispatch ?? ({
    dispatch: jest.fn().mockResolvedValue({
      status: 'success',
      providerMessageId: 'msg-1',
      deliveredAt: new Date('2026-05-01T12:00:00Z'),
      provider: 'smtp',
      attempts: 1,
    }),
    verifyConnection: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<EmailDispatchService>);

  const svc = new BundleGeneratorService(
    repo as unknown as Repository<ExportBundle>,
    events,
    chapter0 as unknown as ChapterZeroAuditLogRenderer,
    chapterHaccp as unknown as ChapterHaccpRenderer,
    chapterLot as unknown as ChapterLotRenderer,
    chapterProcurement as unknown as ChapterProcurementRenderer,
    chapterPhoto as unknown as ChapterPhotoRenderer,
    chapterAiObs as unknown as ChapterAiObsRenderer,
    storage,
    emailDispatch,
  );

  return {
    svc,
    repo,
    storage,
    events,
    captured,
    chapter0,
    chapterHaccp,
    chapterLot,
    chapterProcurement,
    chapterPhoto,
    chapterAiObs,
    emailDispatch,
  };
}

function baseInput(overrides: Partial<GenerateBundleInput> = {}): GenerateBundleInput {
  return {
    organizationId: ORG,
    requestedByUserId: USER,
    actorKind: 'user',
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    locale: 'es-ES',
    scope: ['haccp', 'lot'],
    ...overrides,
  };
}

describe('BundleGeneratorService.generate', () => {
  it('runs the pipeline synchronously for ranges ≤ 90 days and persists status=ready', async () => {
    const t = buildService({});
    const out = await t.svc.generate(baseInput());

    expect(out.status).toBe('ready');
    expect(out.bundleId).toBeDefined();
    const row = t.repo._rows.get(out.bundleId)!;
    expect(row.status).toBe('ready');
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.pdfStoragePath).toContain(`${ORG}/${out.bundleId}/pdf`);
    expect(row.csvStoragePath).toContain(`${ORG}/${out.bundleId}/csv`);
    expect(row.byteSize).toBeGreaterThan(0);
    expect(row.pageCount).toBeGreaterThanOrEqual(1);
    expect(row.generatedAt).toBeInstanceOf(Date);
  });

  it('returns status=generating for ranges > 90 days', async () => {
    const t = buildService({});
    const out = await t.svc.generate(
      baseInput({
        rangeStart: new Date('2026-01-01T00:00:00Z'),
        rangeEnd: new Date('2026-06-30T23:59:59Z'),
        scope: [],
      }),
    );
    expect(out.status).toBe('generating');
  });

  it('only invokes the renderers in input.scope (canonical order)', async () => {
    const t = buildService({});
    await t.svc.generate(baseInput({ scope: ['procurement', 'haccp'] }));
    expect(t.chapter0.render).toHaveBeenCalledTimes(1);
    expect(t.chapterHaccp.render).toHaveBeenCalledTimes(1);
    expect(t.chapterProcurement.render).toHaveBeenCalledTimes(1);
    expect(t.chapterLot.render).not.toHaveBeenCalled();
    expect(t.chapterPhoto.render).not.toHaveBeenCalled();
    expect(t.chapterAiObs.render).not.toHaveBeenCalled();
  });

  it('passes the locale through to every renderer', async () => {
    const t = buildService({});
    await t.svc.generate(baseInput({ locale: 'eu-ES', scope: ['lot'] }));
    expect(t.chapter0.render).toHaveBeenCalledWith(ORG, RANGE_START, RANGE_END, 'eu-ES');
    expect(t.chapterLot.render).toHaveBeenCalledWith(
      ORG,
      RANGE_START,
      RANGE_END,
      'eu-ES',
      undefined,
    );
  });

  it('computes a stable SHA-256 across two runs with the same inputs', async () => {
    const t = buildService({});
    const first = await t.svc.generate(baseInput());
    const second = await t.svc.generate(baseInput());
    const firstHash = t.repo._rows.get(first.bundleId)!.sha256;
    const secondHash = t.repo._rows.get(second.bundleId)!.sha256;
    expect(firstHash).toBe(secondHash);
  });

  it('emits an EXPORT_BUNDLE_GENERATED envelope with retention-aware payload', async () => {
    const t = buildService({});
    const out = await t.svc.generate(baseInput());
    const evt = t.captured.find(
      (e) => e.channel === AuditEventType.EXPORT_BUNDLE_GENERATED,
    );
    expect(evt).toBeDefined();
    expect(evt!.envelope.aggregateType).toBe('compliance_export');
    expect(evt!.envelope.aggregateId).toBe(out.bundleId);
    expect(evt!.envelope.actorUserId).toBe(USER);
    expect(evt!.envelope.actorKind).toBe('user');
    const payload = evt!.envelope.payloadAfter as ExportBundleGeneratedPayload;
    expect(payload.bundle_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.locale).toBe('es-ES');
    expect(payload.scope).toEqual(['haccp', 'lot']);
    expect(payload.range_start).toBe(RANGE_START.toISOString());
    expect(payload.range_end).toBe(RANGE_END.toISOString());
  });

  it('emits a per-recipient EXPORT_BUNDLE_DISPATCHED envelope when recipients are present', async () => {
    const t = buildService({});
    await t.svc.generate(
      baseInput({ recipientEmails: ['marta@inspector.es', 'insurer@example.com'] }),
    );
    const dispatched = t.captured.filter(
      (e) => e.channel === AuditEventType.EXPORT_BUNDLE_DISPATCHED,
    );
    expect(dispatched).toHaveLength(2);
    const addresses = dispatched.map(
      (e) => (e.envelope.payloadAfter as ExportBundleDispatchedPayload).recipient,
    );
    expect(addresses).toEqual(['marta@inspector.es', 'insurer@example.com']);
    expect(t.emailDispatch.dispatch).toHaveBeenCalledTimes(2);
  });

  it('captures a failed dispatch in the receipt without rolling back the bundle', async () => {
    const failing: jest.Mocked<EmailDispatchService> = {
      dispatch: jest.fn().mockResolvedValue({
        status: 'failure',
        error: {
          code: 'RETRYABLE_TRANSIENT',
          message: 'SMTP 421',
          attempts: 3,
        },
      }),
      verifyConnection: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<EmailDispatchService>;
    const t = buildService({ emailDispatch: failing });

    const out = await t.svc.generate(
      baseInput({ recipientEmails: ['unreachable@example.com'] }),
    );

    expect(out.status).toBe('ready');
    expect(out.receipts[0].status).toBe('failed');
    expect(out.receipts[0].errorCode).toBe('RETRYABLE_TRANSIENT');
    const row = t.repo._rows.get(out.bundleId)!;
    expect(row.status).toBe('ready'); // bundle remains usable
  });

  it('rejects invalid date ranges', async () => {
    const t = buildService({});
    await expect(
      t.svc.generate(
        baseInput({
          rangeStart: new Date('2026-04-30T00:00:00Z'),
          rangeEnd: new Date('2026-02-01T00:00:00Z'),
        }),
      ),
    ).rejects.toThrow(/rangeEnd/);
  });

  it('rejects unknown scope kinds', async () => {
    const t = buildService({});
    await expect(
      t.svc.generate(
        baseInput({ scope: ['nope' as unknown as 'haccp'] }),
      ),
    ).rejects.toThrow(/unknown scope kind/);
  });
});
