import 'reflect-metadata';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditEventType } from '../../audit-log/application/types';
import {
  IngestionCorrectionEmptyError,
  IngestionCrossTenantError,
  IngestionItemNotCorrectableError,
} from '../domain/errors';
import type { IngestionItem } from '../domain/ingestion-item.entity';
import type {
  PhotoIngestionExtraction,
  PhotoIngestionField,
} from '../types';
import type { IngestionItemRepository } from './ingestion-item.repository';
import { RetroactiveCorrectionService } from './retroactive-correction.service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '55555555-5555-4555-8555-555555555555';

function buildSvc() {
  const repo = {
    findById: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<Pick<IngestionItemRepository, 'findById' | 'save'>>;
  const events = new EventEmitter2();
  const emitSpy = jest.spyOn(events, 'emitAsync');
  const svc = new RetroactiveCorrectionService(
    repo as unknown as IngestionItemRepository,
    events,
  );
  return { svc, repo, events, emitSpy };
}

function llmExtraction(
  fields: PhotoIngestionField[] = [
    { name: 'gtin', value: '5901234123457', confidence: 0.98 },
    { name: 'qty', value: 12, confidence: 0.97 },
    { name: 'unit', value: 'kg', confidence: 0.99 },
  ],
): PhotoIngestionExtraction {
  return {
    fields,
    overallConfidence: 0.95,
    modelVersion: 'gpt-4o-vision',
    promptVersion: 'v1',
  };
}

function operatorCorrection(
  fields: PhotoIngestionField[] = [
    { name: 'gtin', value: '5901234123457', confidence: 1 },
    { name: 'qty', value: 12, confidence: 1 },
    { name: 'unit', value: 'kg', confidence: 1 },
  ],
): PhotoIngestionExtraction {
  return {
    fields,
    overallConfidence: 1,
    modelVersion: 'gpt-4o-vision',
    promptVersion: 'v1',
  };
}

function signedItem(overrides: Partial<IngestionItem> = {}): IngestionItem {
  return {
    id: ITEM_ID,
    organizationId: ORG_ID,
    status: 'signed',
    kind: 'product',
    photoId: 'photo-1',
    overallConfidence: 0.95,
    modelVersion: 'gpt-4o-vision',
    promptVersion: 'v1',
    llmExtraction: llmExtraction(),
    operatorCorrection: operatorCorrection(),
    signedAt: new Date('2026-05-15T00:00:00Z'),
    signedByUserId: USER_ID,
    correctionsHistory: [],
    createdAt: new Date('2026-05-15T00:00:00Z'),
    ...overrides,
  } as IngestionItem;
}

describe('RetroactiveCorrectionService.apply', () => {
  it('happy path: writes new operatorCorrection + appends history entry + emits HITL_RETROACTIVE_CORRECTION', async () => {
    const { svc, repo, emitSpy } = buildSvc();
    repo.findById.mockResolvedValue(signedItem());
    repo.save.mockImplementation(async (i) => i);

    const result = await svc.apply(ORG_ID, ITEM_ID, {
      fieldCorrections: [{ name: 'qty', value: 18, confidence: 1 }],
      correctedByUserId: USER_ID,
      reason: 'Manual recount',
    });

    expect(result).toEqual({
      itemId: ITEM_ID,
      status: 'signed',
      correctionsHistoryLength: 1,
      idempotent: false,
    });
    expect(repo.save).toHaveBeenCalledTimes(1);

    const saved = repo.save.mock.calls[0]![0] as IngestionItem;
    expect(saved.correctionsHistory).toHaveLength(1);
    expect(saved.correctionsHistory[0]!.correctedByUserId).toBe(USER_ID);
    expect(saved.correctionsHistory[0]!.reason).toBe('Manual recount');
    expect(saved.correctionsHistory[0]!.previousCorrection.fields[1]!.value).toBe(12);
    expect(saved.operatorCorrection!.fields.find((f) => f.name === 'qty')!.value).toBe(18);

    const env = emitSpy.mock.calls.find(
      ([ch]) => ch === AuditEventType.HITL_RETROACTIVE_CORRECTION,
    );
    expect(env).toBeDefined();
  });

  it('second edit: appends a 2nd history entry preserving the first', async () => {
    const { svc, repo } = buildSvc();
    const firstHistory = [
      {
        correctionId: 'aa-1',
        correctedAt: '2026-05-15T01:00:00Z',
        correctedByUserId: USER_ID,
        reason: 'first',
        previousCorrection: operatorCorrection(),
        contentHash: 'aaaaaa',
      },
    ];
    repo.findById.mockResolvedValue(
      signedItem({
        correctionsHistory: firstHistory,
        operatorCorrection: operatorCorrection([
          { name: 'gtin', value: '5901234123457', confidence: 1 },
          { name: 'qty', value: 18, confidence: 1 },
          { name: 'unit', value: 'kg', confidence: 1 },
        ]),
      }),
    );
    repo.save.mockImplementation(async (i) => i);

    const result = await svc.apply(ORG_ID, ITEM_ID, {
      fieldCorrections: [{ name: 'qty', value: 20, confidence: 1 }],
      correctedByUserId: USER_ID,
      reason: 'recount again',
    });

    expect(result.correctionsHistoryLength).toBe(2);
    const saved = repo.save.mock.calls[0]![0] as IngestionItem;
    expect(saved.correctionsHistory[0]!.correctionId).toBe('aa-1');
    expect(saved.correctionsHistory[1]!.previousCorrection.fields.find((f) => f.name === 'qty')!.value).toBe(18);
  });

  it('idempotent: same {fieldCorrections, correctedByUserId} hash as latest entry → no write, no envelope, idempotent=true', async () => {
    const { svc, repo, emitSpy } = buildSvc();
    // Run twice: first edit lands, second with identical input is idempotent.
    const item = signedItem();
    repo.findById.mockResolvedValue(item);
    repo.save.mockImplementation(async (i) => i);

    const first = await svc.apply(ORG_ID, ITEM_ID, {
      fieldCorrections: [{ name: 'qty', value: 18, confidence: 1 }],
      correctedByUserId: USER_ID,
    });
    expect(first.idempotent).toBe(false);
    const writtenHash = (repo.save.mock.calls[0]![0] as IngestionItem)
      .correctionsHistory[0]!.contentHash;
    expect(typeof writtenHash).toBe('string');

    // Re-load with persisted history for the 2nd call.
    repo.findById.mockResolvedValue(repo.save.mock.calls[0]![0] as IngestionItem);
    repo.save.mockClear();
    emitSpy.mockClear();

    const second = await svc.apply(ORG_ID, ITEM_ID, {
      fieldCorrections: [{ name: 'qty', value: 18, confidence: 1 }],
      correctedByUserId: USER_ID,
    });

    expect(second.idempotent).toBe(true);
    expect(second.correctionsHistoryLength).toBe(1);
    expect(repo.save).not.toHaveBeenCalled();
    expect(
      emitSpy.mock.calls.some(
        ([ch]) => ch === AuditEventType.HITL_RETROACTIVE_CORRECTION,
      ),
    ).toBe(false);
  });

  it('not-signed: row in awaiting_review throws IngestionItemNotCorrectableError', async () => {
    const { svc, repo } = buildSvc();
    repo.findById.mockResolvedValue(
      signedItem({ status: 'awaiting_review' }),
    );

    await expect(
      svc.apply(ORG_ID, ITEM_ID, {
        fieldCorrections: [{ name: 'qty', value: 18, confidence: 1 }],
        correctedByUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(IngestionItemNotCorrectableError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cross-tenant: findById returns null → throws IngestionCrossTenantError (404 by controller)', async () => {
    const { svc, repo } = buildSvc();
    repo.findById.mockResolvedValue(null);

    await expect(
      svc.apply(ORG_ID, ITEM_ID, {
        fieldCorrections: [{ name: 'qty', value: 18, confidence: 1 }],
        correctedByUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(IngestionCrossTenantError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('empty-field: reject-band field has empty correction → throws IngestionCorrectionEmptyError', async () => {
    const { svc, repo } = buildSvc();
    // Field "qty" originally in reject band (confidence < 0.60) — must be
    // present + non-empty in the correction.
    const rejectBandLlm = llmExtraction([
      { name: 'gtin', value: '5901234123457', confidence: 0.98 },
      { name: 'qty', value: null, confidence: 0.4 },
      { name: 'unit', value: 'kg', confidence: 0.99 },
    ]);
    repo.findById.mockResolvedValue(
      signedItem({ llmExtraction: rejectBandLlm }),
    );

    await expect(
      svc.apply(ORG_ID, ITEM_ID, {
        fieldCorrections: [{ name: 'gtin', value: '5901234123457', confidence: 1 }],
        correctedByUserId: USER_ID,
      }),
    ).rejects.toBeInstanceOf(IngestionCorrectionEmptyError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
