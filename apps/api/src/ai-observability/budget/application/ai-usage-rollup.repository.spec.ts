import { AiUsageRollupRepository } from './ai-usage-rollup.repository';
import { AiUsageRollupQueryError } from '../domain/errors';

interface MockRepo {
  findOne: jest.Mock;
  query: jest.Mock;
}

const ORG_A = '11111111-1111-4000-8000-000000000001';
const ORG_B = '22222222-2222-4000-8000-000000000002';

describe('AiUsageRollupRepository', () => {
  let typeormRepo: MockRepo;
  let repo: AiUsageRollupRepository;

  beforeEach(() => {
    typeormRepo = {
      findOne: jest.fn(),
      query: jest.fn(),
    };
    repo = new AiUsageRollupRepository(typeormRepo as unknown as never);
  });

  describe('findByPeriod', () => {
    it('gates SELECT on organizationId + period (multi-tenant invariant)', async () => {
      typeormRepo.findOne.mockResolvedValue(null);
      await repo.findByPeriod(ORG_A, '2026-05');
      expect(typeormRepo.findOne).toHaveBeenCalledWith({
        where: { organizationId: ORG_A, periodYyyyMm: '2026-05' },
      });
    });

    it('wraps repository errors in AiUsageRollupQueryError', async () => {
      typeormRepo.findOne.mockRejectedValue(new Error('connection lost'));
      await expect(repo.findByPeriod(ORG_A, '2026-05')).rejects.toBeInstanceOf(
        AiUsageRollupQueryError,
      );
    });
  });

  describe('upsertAggregate', () => {
    it('issues INSERT ON CONFLICT DO UPDATE with multi-tenant org binding', async () => {
      typeormRepo.query.mockResolvedValue([]);
      await repo.upsertAggregate(ORG_A, '2026-05', {
        totalCostEur: 50,
        totalCalls: 100,
        totalInputTokens: 5_000,
        totalOutputTokens: 1_000,
      });
      expect(typeormRepo.query).toHaveBeenCalledTimes(1);
      const [sql, params] = typeormRepo.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO ai_usage_rollup');
      expect(sql).toContain('ON CONFLICT (organization_id, period_yyyy_mm)');
      expect(sql).toContain('DO UPDATE');
      expect(params).toEqual([ORG_A, '2026-05', 50, 100, 5_000, 1_000]);
    });

    it('writes only the requested orgId (cross-tenant safe)', async () => {
      typeormRepo.query.mockResolvedValue([]);
      await repo.upsertAggregate(ORG_B, '2026-05', {
        totalCostEur: 10,
        totalCalls: 1,
        totalInputTokens: 100,
        totalOutputTokens: 20,
      });
      const [, params] = typeormRepo.query.mock.calls[0];
      expect(params[0]).toBe(ORG_B);
      expect(params[0]).not.toBe(ORG_A);
    });

    it('wraps DB failure in AiUsageRollupQueryError', async () => {
      typeormRepo.query.mockRejectedValue(new Error('lock timeout'));
      await expect(
        repo.upsertAggregate(ORG_A, '2026-05', {
          totalCostEur: 0,
          totalCalls: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
        }),
      ).rejects.toBeInstanceOf(AiUsageRollupQueryError);
    });
  });

  describe('markTierCrossed', () => {
    it('updates tier_crossed_at jsonb atomically with jsonb_set', async () => {
      typeormRepo.query.mockResolvedValue([]);
      const crossedAt = new Date('2026-05-14T10:00:00.000Z');
      await repo.markTierCrossed(ORG_A, '2026-05', 'info', crossedAt);
      const [sql, params] = typeormRepo.query.mock.calls[0];
      expect(sql).toContain('UPDATE ai_usage_rollup');
      expect(sql).toContain('jsonb_set(');
      expect(sql).toContain('WHERE organization_id = $1 AND period_yyyy_mm = $2');
      expect(params).toEqual([ORG_A, '2026-05', 'info', '2026-05-14T10:00:00.000Z']);
    });
  });

  describe('findActiveOrgsInPeriod', () => {
    it('returns distinct organization_ids for the period', async () => {
      typeormRepo.query.mockResolvedValue([
        { organization_id: ORG_A },
        { organization_id: ORG_B },
      ]);
      const result = await repo.findActiveOrgsInPeriod('2026-05');
      expect(result).toEqual([ORG_A, ORG_B]);
      const [sql, params] = typeormRepo.query.mock.calls[0];
      expect(sql).toContain('SELECT DISTINCT organization_id');
      expect(params).toEqual(['2026-05']);
    });
  });
});
