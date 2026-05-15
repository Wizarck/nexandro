import type { ObjectLiteral, Repository } from 'typeorm';
import { IngestionItem } from '../domain/ingestion-item.entity';
import { IngestionItemRepository } from './ingestion-item.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';

function makeFakeRepo<T extends ObjectLiteral>(rows: T[]): jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'find' | 'save'>
> {
  return {
    findOne: jest.fn(async (opts: unknown) => {
      const where = (opts as { where: Record<string, unknown> }).where;
      return (rows.find((r) => {
        const rec = r as Record<string, unknown>;
        for (const [k, v] of Object.entries(where)) {
          if (rec[k] !== v) return false;
        }
        return true;
      }) ?? null) as T | null;
    }),
    find: jest.fn(async (opts: unknown) => {
      const where = (opts as { where: Record<string, unknown> }).where;
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
    save: jest.fn(async (row: T) => {
      rows.push(row);
      return row;
    }),
  } as unknown as jest.Mocked<Pick<Repository<T>, 'findOne' | 'find' | 'save'>>;
}

function buildItem(overrides: Partial<IngestionItem>): IngestionItem {
  const row = new IngestionItem();
  row.id = overrides.id ?? 'item-1';
  row.organizationId = overrides.organizationId ?? ORG;
  row.photoId = overrides.photoId ?? 'photo-1';
  row.kind = overrides.kind ?? 'invoice';
  row.status = overrides.status ?? 'awaiting_review';
  row.llmExtraction = null;
  row.operatorCorrection = null;
  row.overallConfidence = 0.7;
  row.modelVersion = 'v';
  row.promptVersion = 'p';
  row.signedAt = null;
  row.signedByUserId = null;
  row.deletedAt = null;
  row.createdAt = new Date();
  row.updatedAt = new Date();
  return row;
}

describe('IngestionItemRepository', () => {
  it('findById gates on organizationId (cross-tenant returns null)', async () => {
    const rows = [buildItem({ id: 'i1', organizationId: ORG })];
    const repoMock = makeFakeRepo<IngestionItem>(rows);
    const repo = new IngestionItemRepository(
      repoMock as unknown as Repository<IngestionItem>,
    );
    expect(await repo.findById(ORG, 'i1')).not.toBeNull();
    expect(await repo.findById(OTHER, 'i1')).toBeNull();
  });

  it('listByStatus filters by org + status + optional kind', async () => {
    const rows = [
      buildItem({ id: 'a', status: 'awaiting_review', kind: 'invoice' }),
      buildItem({ id: 'b', status: 'awaiting_review', kind: 'product' }),
      buildItem({ id: 'c', status: 'auto_filled', kind: 'invoice' }),
      buildItem({ id: 'd', status: 'awaiting_review', organizationId: OTHER }),
    ];
    const repoMock = makeFakeRepo<IngestionItem>(rows);
    const repo = new IngestionItemRepository(
      repoMock as unknown as Repository<IngestionItem>,
    );

    const all = await repo.listByStatus(ORG, 'awaiting_review', 50);
    expect(all.map((r) => r.id).sort()).toEqual(['a', 'b']);

    const invoices = await repo.listByStatus(ORG, 'awaiting_review', 50, 'invoice');
    expect(invoices.map((r) => r.id)).toEqual(['a']);
  });
});
