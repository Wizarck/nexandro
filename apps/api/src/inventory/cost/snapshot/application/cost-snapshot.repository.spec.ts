import { randomUUID } from 'node:crypto';
import { CostSnapshotRepository } from './cost-snapshot.repository';
import { CostSnapshot } from '../domain/cost-snapshot.entity';
import { CostSnapshotImmutableError } from '../domain/errors';
import type { SnapshotConsumptionInput } from '../types';

interface MockTypeormRepo {
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
}

const ORG = randomUUID();

function makeValidInput(overrides?: Partial<SnapshotConsumptionInput>): SnapshotConsumptionInput {
  const lotId = randomUUID();
  return {
    organization_id: ORG,
    stock_move_id: randomUUID(),
    lot_id: lotId,
    product_id: randomUUID(),
    strategy: 'fifo',
    qty_consumed: 2.5,
    total_cost: 6.8,
    breakdown: [
      { lot_id: lotId, qty: 1.5, unit_cost: 3.0, subtotal: 4.5 },
      { lot_id: randomUUID(), qty: 1.0, unit_cost: 2.3, subtotal: 2.3 },
    ],
    correlation_id: randomUUID(),
    ...overrides,
  };
}

describe('CostSnapshotRepository', () => {
  let repo: CostSnapshotRepository;
  let typeormRepo: MockTypeormRepo;

  beforeEach(() => {
    typeormRepo = {
      save: jest.fn().mockImplementation(async (entity: CostSnapshot) => entity),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    // Cast through unknown — typeorm Repository<T> has many methods we don't
    // exercise. The repository under test only calls save / findOne / find.
    repo = new CostSnapshotRepository(typeormRepo as unknown as never);
  });

  describe('append', () => {
    it('Zod-validates input before INSERT', async () => {
      const input = makeValidInput();
      await repo.append(input);
      expect(typeormRepo.save).toHaveBeenCalledTimes(1);
      const persisted = typeormRepo.save.mock.calls[0][0] as CostSnapshot;
      expect(persisted.organizationId).toBe(input.organization_id);
      expect(persisted.stockMoveId).toBe(input.stock_move_id);
      expect(persisted.totalCost).toBe(input.total_cost);
      expect(persisted.breakdown).toEqual(input.breakdown);
      expect(persisted.snapshotId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects missing strategy via Zod', async () => {
      const bad = { ...makeValidInput() } as unknown as Record<string, unknown>;
      delete bad.strategy;
      await expect(
        repo.append(bad as SnapshotConsumptionInput),
      ).rejects.toThrow();
      expect(typeormRepo.save).not.toHaveBeenCalled();
    });

    it('rejects invalid strategy enum', async () => {
      const bad = makeValidInput({ strategy: 'lifo' as never });
      await expect(repo.append(bad)).rejects.toThrow();
      expect(typeormRepo.save).not.toHaveBeenCalled();
    });

    it('rejects empty breakdown array', async () => {
      const bad = makeValidInput({ breakdown: [] });
      await expect(repo.append(bad)).rejects.toThrow();
      expect(typeormRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findByStockMoveId', () => {
    it('includes organizationId in WHERE clause', async () => {
      const stockMoveId = randomUUID();
      typeormRepo.findOne.mockResolvedValue(null);
      await repo.findByStockMoveId(ORG, stockMoveId);
      expect(typeormRepo.findOne).toHaveBeenCalledWith({
        where: { organizationId: ORG, stockMoveId },
        order: { createdAt: 'DESC' },
      });
    });

    it('returns null when no row exists', async () => {
      typeormRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByStockMoveId(ORG, randomUUID());
      expect(result).toBeNull();
    });
  });

  describe('findByProductSince', () => {
    it('includes organizationId + since lower bound', async () => {
      const productId = randomUUID();
      const since = new Date('2026-05-01T00:00:00Z');
      typeormRepo.find.mockResolvedValue([]);
      await repo.findByProductSince(ORG, productId, since);
      expect(typeormRepo.find).toHaveBeenCalledTimes(1);
      const call = typeormRepo.find.mock.calls[0][0];
      expect(call.where.organizationId).toBe(ORG);
      expect(call.where.productId).toBe(productId);
      expect(call.order).toEqual({ createdAt: 'DESC' });
      expect(call.take).toBe(50);
      expect(call.skip).toBe(0);
    });

    it('respects custom limit + offset', async () => {
      typeormRepo.find.mockResolvedValue([]);
      await repo.findByProductSince(ORG, randomUUID(), new Date(), 25, 100);
      const call = typeormRepo.find.mock.calls[0][0];
      expect(call.take).toBe(25);
      expect(call.skip).toBe(100);
    });
  });

  describe('append-only invariant', () => {
    it('update() throws CostSnapshotImmutableError', async () => {
      const snapshotId = randomUUID();
      await expect(repo.update(snapshotId, { totalCost: 99 })).rejects.toThrow(
        CostSnapshotImmutableError,
      );
    });

    it('delete() throws CostSnapshotImmutableError', async () => {
      const snapshotId = randomUUID();
      await expect(repo.delete(snapshotId)).rejects.toThrow(
        CostSnapshotImmutableError,
      );
    });

    it('error carries the snapshotId in the message', async () => {
      const snapshotId = randomUUID();
      await expect(repo.delete(snapshotId)).rejects.toThrow(snapshotId);
    });
  });
});
