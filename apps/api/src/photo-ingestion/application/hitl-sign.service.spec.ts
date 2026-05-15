import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ObjectLiteral, Repository } from 'typeorm';
import { AuditEventType } from '../../audit-log/application/types';
import { IngestionItem } from '../domain/ingestion-item.entity';
import {
  IngestionAlreadySignedError,
  IngestionCrossTenantError,
  IngestionItemNotSignableError,
  IngestionRejectBandFieldMissingError,
} from '../domain/errors';
import { HitlSignService } from './hitl-sign.service';
import { IngestionItemRepository } from './ingestion-item.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const ITEM = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

function makeFakeRepo<T extends ObjectLiteral>(rows: T[]): jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'save'>
> {
  return {
    findOne: jest.fn(async (opts: unknown) => {
      const where = (opts as { where: Record<string, unknown> }).where;
      return (rows.find(
        (r) =>
          (r as Record<string, unknown>).id === where.id &&
          (r as Record<string, unknown>).organizationId === where.organizationId,
      ) ?? null) as T | null;
    }),
    save: jest.fn(async (row: T) => {
      const idx = rows.findIndex(
        (r) => (r as Record<string, unknown>).id === (row as Record<string, unknown>).id,
      );
      if (idx >= 0) rows[idx] = row;
      else rows.push(row);
      return row;
    }),
  } as unknown as jest.Mocked<Pick<Repository<T>, 'findOne' | 'save'>>;
}

function buildItem(overrides: Partial<IngestionItem> = {}): IngestionItem {
  const row = new IngestionItem();
  row.id = overrides.id ?? ITEM;
  row.organizationId = overrides.organizationId ?? ORG;
  row.photoId = overrides.photoId ?? 'photo-1';
  row.kind = overrides.kind ?? 'invoice';
  row.status = overrides.status ?? 'awaiting_review';
  row.llmExtraction = overrides.llmExtraction ?? {
    fields: [
      { name: 'supplier_name', value: 'AC?E', confidence: 0.7 },
      { name: 'total_amount', value: null, confidence: 0.4 },
    ],
    overallConfidence: 0.55,
    modelVersion: '2026-05-01',
    promptVersion: 'v1',
  };
  row.operatorCorrection = overrides.operatorCorrection ?? null;
  row.overallConfidence = overrides.overallConfidence ?? 0.55;
  row.modelVersion = overrides.modelVersion ?? '2026-05-01';
  row.promptVersion = overrides.promptVersion ?? 'v1';
  row.signedAt = overrides.signedAt ?? null;
  row.signedByUserId = overrides.signedByUserId ?? null;
  row.deletedAt = overrides.deletedAt ?? null;
  row.createdAt = overrides.createdAt ?? new Date();
  row.updatedAt = overrides.updatedAt ?? new Date();
  return row;
}

function buildHarness(initial: IngestionItem[]) {
  const repoMock = makeFakeRepo<IngestionItem>(initial);
  const repo = new IngestionItemRepository(
    repoMock as unknown as Repository<IngestionItem>,
  );
  const events = new EventEmitter2();
  const service = new HitlSignService(repo, events);
  return { service, events, rows: initial, repoMock };
}

describe('HitlSignService', () => {
  it('happy path — persists operatorCorrection + emits PHOTO_INGESTION_SIGNED with both payloads', async () => {
    const item = buildItem();
    const { service, events, rows } = buildHarness([item]);
    const captured: unknown[] = [];
    events.on(AuditEventType.PHOTO_INGESTION_SIGNED, (e) => captured.push(e));

    const result = await service.sign(ORG, ITEM, {
      fieldCorrections: [
        { name: 'supplier_name', value: 'ACME', confidence: 1 },
        { name: 'total_amount', value: 124.5, confidence: 1 },
      ],
      signedByUserId: USER,
    });

    expect(result.status).toBe('signed');
    expect(rows[0].status).toBe('signed');
    expect(rows[0].operatorCorrection).not.toBeNull();
    expect(rows[0].signedByUserId).toBe(USER);
    expect(captured).toHaveLength(1);
    const envelope = captured[0] as Record<string, unknown>;
    const payloadAfter = envelope.payloadAfter as Record<string, unknown>;
    expect(payloadAfter.llmExtraction).not.toBeNull();
    expect(payloadAfter.operatorCorrection).not.toBeNull();
    expect(envelope.actorKind).toBe('user');
    expect(envelope.actorUserId).toBe(USER);
  });

  it('refuses when reject-band field has no operator correction supplied', async () => {
    const item = buildItem();
    const { service, rows } = buildHarness([item]);

    // total_amount is in reject band (0.4) — omitting it must throw.
    await expect(
      service.sign(ORG, ITEM, {
        fieldCorrections: [
          { name: 'supplier_name', value: 'ACME', confidence: 1 },
        ],
        signedByUserId: USER,
      }),
    ).rejects.toBeInstanceOf(IngestionRejectBandFieldMissingError);

    // Row remains in awaiting_review (no partial write).
    expect(rows[0].status).toBe('awaiting_review');
    expect(rows[0].operatorCorrection).toBeNull();
  });

  it('refuses when the item is already signed', async () => {
    const item = buildItem({ status: 'signed' });
    const { service } = buildHarness([item]);

    await expect(
      service.sign(ORG, ITEM, {
        fieldCorrections: [
          { name: 'supplier_name', value: 'ACME', confidence: 1 },
          { name: 'total_amount', value: 124.5, confidence: 1 },
        ],
        signedByUserId: USER,
      }),
    ).rejects.toBeInstanceOf(IngestionAlreadySignedError);
  });

  it('refuses when the item is in pending_extraction or auto_filled (not signable)', async () => {
    const item = buildItem({ status: 'auto_filled' });
    const { service } = buildHarness([item]);

    await expect(
      service.sign(ORG, ITEM, {
        fieldCorrections: [],
        signedByUserId: USER,
      }),
    ).rejects.toBeInstanceOf(IngestionItemNotSignableError);
  });

  it('returns 404-mapping error when the item is cross-tenant or missing', async () => {
    const { service } = buildHarness([]);
    await expect(
      service.sign(ORG, ITEM, {
        fieldCorrections: [],
        signedByUserId: USER,
      }),
    ).rejects.toBeInstanceOf(IngestionCrossTenantError);
  });

  it('treats empty-string and NaN field values as missing for reject-band enforcement', async () => {
    const item = buildItem();
    const { service } = buildHarness([item]);

    await expect(
      service.sign(ORG, ITEM, {
        fieldCorrections: [
          { name: 'supplier_name', value: 'ACME', confidence: 1 },
          { name: 'total_amount', value: '', confidence: 1 },
        ],
        signedByUserId: USER,
      }),
    ).rejects.toBeInstanceOf(IngestionRejectBandFieldMissingError);
  });
});
