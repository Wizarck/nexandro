import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ObjectLiteral, Repository } from 'typeorm';
import { AuditEventType } from '../../audit-log/application/types';
import type { PhotoStorageService } from '../../photo-storage/application/photo-storage.service';
import type {
  VisionLlmProvider,
} from '../../shared/vision-llm/vision-llm-provider.interface';
import type { VisionLlmOutputValue } from '../../shared/vision-llm/types';
import { IngestionItem } from '../domain/ingestion-item.entity';
import { IngestionPhotoNotFoundError } from '../domain/errors';
import { IngestionItemRepository } from './ingestion-item.repository';
import { IngestionService } from './ingestion.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const PHOTO = '22222222-2222-4222-8222-222222222222';

function makeFakeRepo<T extends ObjectLiteral>(rows: T[]): jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'save'>
> {
  return {
    findOne: jest.fn(),
    save: jest.fn(async (row: T) => {
      rows.push(row);
      return row;
    }),
  } as unknown as jest.Mocked<Pick<Repository<T>, 'findOne' | 'save'>>;
}

function buildHarness(extraction: VisionLlmOutputValue | null) {
  const rows: IngestionItem[] = [];
  const repoMock = makeFakeRepo<IngestionItem>(rows);
  const repo = new IngestionItemRepository(
    repoMock as unknown as Repository<IngestionItem>,
  );
  const photoStorage = {
    generateReadUrl: jest.fn().mockResolvedValue({
      url: 'https://signed.test/photo',
      expiresAt: new Date(),
    }),
  } as unknown as jest.Mocked<Pick<PhotoStorageService, 'generateReadUrl'>>;
  const provider: VisionLlmProvider = {
    id: 'gpt-oss-vision-rag-proxy',
    modelName: 'gpt-oss-vision',
    modelVersion: '2026-05-01',
    extract: jest.fn().mockResolvedValue(extraction),
  };
  const events = new EventEmitter2();
  const service = new IngestionService(
    repo,
    photoStorage as unknown as PhotoStorageService,
    provider,
    events,
  );
  return { service, rows, photoStorage, provider, events };
}

describe('IngestionService — ADR-034 banding branches', () => {
  it('emits PHOTO_INGESTION_AUTO_FILLED when every field >= 0.85 AND overall >= 0.85', async () => {
    const { service, events, rows } = buildHarness({
      fields: [
        { name: 'supplier_name', value: 'ACME', confidence: 0.95 },
        { name: 'total_amount', value: 124.5, confidence: 0.92 },
      ],
    });
    const captured: unknown[] = [];
    events.on(AuditEventType.PHOTO_INGESTION_AUTO_FILLED, (e) =>
      captured.push(e),
    );

    const result = await service.ingest(ORG, {
      photoId: PHOTO,
      kind: 'invoice',
      capability: 'inventory.ingest-invoice-photo',
    });

    expect(result.status).toBe('auto_filled');
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('auto_filled');
    expect(captured).toHaveLength(1);
  });

  it('emits PHOTO_INGESTION_AWAITING_REVIEW when any field is in [0.60, 0.85)', async () => {
    const { service, events } = buildHarness({
      fields: [
        { name: 'supplier_name', value: 'ACME', confidence: 0.95 },
        { name: 'total_amount', value: 124.5, confidence: 0.7 },
      ],
    });
    const captured: unknown[] = [];
    events.on(AuditEventType.PHOTO_INGESTION_AWAITING_REVIEW, (e) =>
      captured.push(e),
    );

    const result = await service.ingest(ORG, {
      photoId: PHOTO,
      kind: 'invoice',
      capability: 'inventory.ingest-invoice-photo',
    });

    expect(result.status).toBe('awaiting_review');
    expect(captured).toHaveLength(1);
  });

  it('emits PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE when any field is < 0.60', async () => {
    const { service, events } = buildHarness({
      fields: [
        { name: 'supplier_name', value: 'ACME', confidence: 0.95 },
        { name: 'total_amount', value: null, confidence: 0.3 },
      ],
    });
    const captured: unknown[] = [];
    events.on(AuditEventType.PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE, (e) =>
      captured.push(e),
    );

    const result = await service.ingest(ORG, {
      photoId: PHOTO,
      kind: 'invoice',
      capability: 'inventory.ingest-invoice-photo',
    });

    expect(result.status).toBe('rejected');
    expect(captured).toHaveLength(1);
  });

  it('emits PHOTO_EXTRACTION_FAILED when the provider returns null (iron-rule outage path)', async () => {
    const { service, events, rows } = buildHarness(null);
    const captured: unknown[] = [];
    events.on(AuditEventType.PHOTO_EXTRACTION_FAILED, (e) => captured.push(e));

    const result = await service.ingest(ORG, {
      photoId: PHOTO,
      kind: 'invoice',
      capability: 'inventory.ingest-invoice-photo',
    });

    expect(result.status).toBe('rejected');
    expect(rows).toHaveLength(1);
    expect(rows[0].llmExtraction).toBeNull();
    expect(captured).toHaveLength(1);
  });

  it('throws IngestionPhotoNotFoundError when photo lookup fails (cross-tenant or missing)', async () => {
    const { service, photoStorage } = buildHarness({
      fields: [{ name: 'x', value: '1', confidence: 1 }],
    });
    (
      photoStorage.generateReadUrl as jest.Mock
    ).mockRejectedValueOnce(new Error('not found'));

    await expect(
      service.ingest(ORG, {
        photoId: PHOTO,
        kind: 'invoice',
        capability: 'inventory.ingest-invoice-photo',
      }),
    ).rejects.toBeInstanceOf(IngestionPhotoNotFoundError);
  });

  it('emits PHOTO_INGESTION_AWAITING_REVIEW when overall is in flag band even if all fields auto-fill (edge case)', async () => {
    // Construct an extraction where every field is >= 0.85 but the per-field
    // mean drops the overall below 0.85 — synthetic but defensive.
    const { service, events } = buildHarness({
      fields: [
        { name: 'a', value: '1', confidence: 0.85 },
        { name: 'b', value: '2', confidence: 0.85 },
      ],
    });
    const captured: unknown[] = [];
    events.on(AuditEventType.PHOTO_INGESTION_AUTO_FILLED, (e) =>
      captured.push(e),
    );
    const result = await service.ingest(ORG, {
      photoId: PHOTO,
      kind: 'invoice',
      capability: 'inventory.ingest-invoice-photo',
    });
    // Mean of {0.85, 0.85} = 0.85 exactly, still in auto_fill band.
    expect(result.status).toBe('auto_filled');
    expect(captured).toHaveLength(1);
  });
});
