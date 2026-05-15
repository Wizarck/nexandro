import type { ObjectLiteral, Repository } from 'typeorm';
import { IngestionItem } from '../domain/ingestion-item.entity';
import { HitlQueueQuery } from './hitl-queue.query';
import { IngestionItemRepository } from './ingestion-item.repository';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeFakeRepo<T extends ObjectLiteral>(rows: T[]): jest.Mocked<
  Pick<Repository<T>, 'find'>
> {
  return {
    find: jest.fn(async (opts: unknown) => {
      const where = (opts as { where: Record<string, unknown>; take?: number }).where;
      const take = (opts as { take?: number }).take ?? Number.MAX_SAFE_INTEGER;
      return rows
        .filter((r) => {
          const rec = r as Record<string, unknown>;
          for (const [k, v] of Object.entries(where)) {
            if (rec[k] !== v) return false;
          }
          return true;
        })
        .slice(0, take);
    }),
  } as unknown as jest.Mocked<Pick<Repository<T>, 'find'>>;
}

function buildItem(overrides: Partial<IngestionItem>): IngestionItem {
  const row = new IngestionItem();
  row.id = overrides.id ?? `item-${Math.random().toString(36).slice(2)}`;
  row.organizationId = overrides.organizationId ?? ORG;
  row.photoId = overrides.photoId ?? 'photo-1';
  row.kind = overrides.kind ?? 'invoice';
  row.status = overrides.status ?? 'awaiting_review';
  row.llmExtraction = null;
  row.operatorCorrection = null;
  row.overallConfidence = overrides.overallConfidence ?? 0.7;
  row.modelVersion = '2026-05-01';
  row.promptVersion = 'v1';
  row.signedAt = null;
  row.signedByUserId = null;
  row.deletedAt = null;
  row.createdAt = overrides.createdAt ?? new Date();
  row.updatedAt = overrides.updatedAt ?? new Date();
  return row;
}

describe('HitlQueueQuery', () => {
  it('returns rows in awaiting_review, gated by org', async () => {
    const rows: IngestionItem[] = [
      buildItem({ status: 'awaiting_review' }),
      buildItem({ status: 'awaiting_review', organizationId: 'other-org' }),
      buildItem({ status: 'auto_filled' }),
    ];
    const repoMock = makeFakeRepo<IngestionItem>(rows);
    const repo = new IngestionItemRepository(
      repoMock as unknown as Repository<IngestionItem>,
    );
    const query = new HitlQueueQuery(repo);

    const result = await query.listAwaitingReview(ORG);
    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe(ORG);
    expect(result[0].status).toBe('awaiting_review');
  });

  it('applies kind filter when supplied', async () => {
    const rows: IngestionItem[] = [
      buildItem({ status: 'awaiting_review', kind: 'invoice' }),
      buildItem({ status: 'awaiting_review', kind: 'product' }),
    ];
    const repoMock = makeFakeRepo<IngestionItem>(rows);
    const repo = new IngestionItemRepository(
      repoMock as unknown as Repository<IngestionItem>,
    );
    const query = new HitlQueueQuery(repo);

    const result = await query.listAwaitingReview(ORG, { kind: 'invoice' });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('invoice');
  });

  it('clamps limit at 200 (defensive)', async () => {
    const rows: IngestionItem[] = Array.from({ length: 250 }, () =>
      buildItem({ status: 'awaiting_review' }),
    );
    const repoMock = makeFakeRepo<IngestionItem>(rows);
    const repo = new IngestionItemRepository(
      repoMock as unknown as Repository<IngestionItem>,
    );
    const query = new HitlQueueQuery(repo);

    const result = await query.listAwaitingReview(ORG, { limit: 1000 });
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('uses default 50 when limit is undefined / 0 / NaN', async () => {
    const rows: IngestionItem[] = Array.from({ length: 100 }, () =>
      buildItem({ status: 'awaiting_review' }),
    );
    const repoMock = makeFakeRepo<IngestionItem>(rows);
    const repo = new IngestionItemRepository(
      repoMock as unknown as Repository<IngestionItem>,
    );
    const query = new HitlQueueQuery(repo);

    expect(await query.listAwaitingReview(ORG)).toHaveLength(50);
    expect(await query.listAwaitingReview(ORG, { limit: 0 })).toHaveLength(50);
    expect(
      await query.listAwaitingReview(ORG, { limit: Number.NaN }),
    ).toHaveLength(50);
  });
});
