import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CostSnapshot } from '../domain/cost-snapshot.entity';
import { CostSnapshotBreakdownInvariantError } from '../domain/errors';
import {
  COST_SNAPSHOT_RECORDED_EVENT,
  type SnapshotConsumptionInput,
} from '../types';
import { CostSnapshotRepository } from './cost-snapshot.repository';
import { CostSnapshotService } from './cost-snapshot.service';

interface MockRepo {
  findByStockMoveId: jest.Mock;
  append: jest.Mock;
}

const ORG = randomUUID();

function makeInput(overrides?: Partial<SnapshotConsumptionInput>): SnapshotConsumptionInput {
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

function makePersistedSnapshot(input: SnapshotConsumptionInput): CostSnapshot {
  const snap = new CostSnapshot();
  snap.snapshotId = randomUUID();
  snap.organizationId = input.organization_id;
  snap.stockMoveId = input.stock_move_id;
  snap.lotId = input.lot_id;
  snap.productId = input.product_id;
  snap.strategy = input.strategy;
  snap.qtyConsumed = input.qty_consumed;
  snap.totalCost = input.total_cost;
  snap.breakdown = input.breakdown;
  snap.correlationId = input.correlation_id;
  snap.createdAt = new Date('2026-05-14T08:00:00Z');
  return snap;
}

describe('CostSnapshotService', () => {
  let service: CostSnapshotService;
  let repo: MockRepo;
  let emitter: EventEmitter2;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    repo = {
      findByStockMoveId: jest.fn(),
      append: jest.fn(),
    };
    emitter = new EventEmitter2();
    emitSpy = jest.spyOn(emitter, 'emit');
    service = new CostSnapshotService(
      repo as unknown as CostSnapshotRepository,
      emitter,
    );
  });

  describe('happy path', () => {
    it('persists snapshot then emits COST_SNAPSHOT_RECORDED', async () => {
      const input = makeInput();
      const persisted = makePersistedSnapshot(input);
      repo.findByStockMoveId.mockResolvedValue(null);
      repo.append.mockResolvedValue(persisted);

      const result = await service.snapshotConsumption(input);

      expect(repo.append).toHaveBeenCalledWith(input);
      expect(result).toBe(persisted);

      // emit AFTER append (REQ-SS-1)
      const appendCallOrder = repo.append.mock.invocationCallOrder[0];
      const emitCallOrder = emitSpy.mock.invocationCallOrder[0];
      expect(emitCallOrder).toBeGreaterThan(appendCallOrder);

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const [channel, payload] = emitSpy.mock.calls[0];
      expect(channel).toBe(COST_SNAPSHOT_RECORDED_EVENT);
      expect(payload).toMatchObject({
        organizationId: input.organization_id,
        aggregateType: 'cost_snapshot',
        aggregateId: persisted.snapshotId,
        actorKind: 'system',
        actorUserId: null,
        payloadBefore: null,
        capabilityUsed: 'inventory.cost-resolve',
      });
      expect(payload.payloadAfter.total_cost).toBe(input.total_cost);
      expect(payload.payloadAfter.breakdown).toEqual(input.breakdown);
    });
  });

  describe('breakdown invariant', () => {
    it('throws when sum-of-subtotals deviates >€0.01 from total_cost', async () => {
      const input = makeInput({
        total_cost: 7.0,
        breakdown: [
          { lot_id: randomUUID(), qty: 1.5, unit_cost: 3.0, subtotal: 4.5 },
          { lot_id: randomUUID(), qty: 1.0, unit_cost: 2.3, subtotal: 2.3 },
        ],
      });
      await expect(service.snapshotConsumption(input)).rejects.toThrow(
        CostSnapshotBreakdownInvariantError,
      );
      expect(repo.append).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('accepts rounding within €0.01 tolerance', async () => {
      const input = makeInput({
        total_cost: 6.8001,
        breakdown: [
          { lot_id: randomUUID(), qty: 1.5, unit_cost: 3.0, subtotal: 4.5 },
          { lot_id: randomUUID(), qty: 1.0, unit_cost: 2.3, subtotal: 2.3 },
        ],
      });
      repo.findByStockMoveId.mockResolvedValue(null);
      repo.append.mockResolvedValue(makePersistedSnapshot(input));
      await expect(service.snapshotConsumption(input)).resolves.toBeDefined();
      expect(repo.append).toHaveBeenCalled();
    });

    it('throws with delta surfaced on the error', async () => {
      const input = makeInput({
        total_cost: 10.0,
        breakdown: [
          { lot_id: randomUUID(), qty: 1.5, unit_cost: 3.0, subtotal: 4.5 },
          { lot_id: randomUUID(), qty: 1.0, unit_cost: 2.3, subtotal: 2.3 },
        ],
      });
      try {
        await service.snapshotConsumption(input);
        fail('expected CostSnapshotBreakdownInvariantError');
      } catch (err) {
        expect(err).toBeInstanceOf(CostSnapshotBreakdownInvariantError);
        expect((err as CostSnapshotBreakdownInvariantError).delta).toBeCloseTo(
          3.2,
          2,
        );
      }
    });
  });

  describe('idempotency (REQ-SS-8)', () => {
    it('skips insert when non-manual snapshot already exists for stock_move_id', async () => {
      const input = makeInput({ strategy: 'fifo' });
      const existing = makePersistedSnapshot(input);
      existing.strategy = 'fifo';
      repo.findByStockMoveId.mockResolvedValue(existing);

      const result = await service.snapshotConsumption(input);

      expect(result).toBe(existing);
      expect(repo.append).not.toHaveBeenCalled();
      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('manual strategy bypasses idempotency check (correction path)', async () => {
      const input = makeInput({ strategy: 'manual' });
      const persisted = makePersistedSnapshot(input);
      repo.append.mockResolvedValue(persisted);

      await service.snapshotConsumption(input);

      expect(repo.findByStockMoveId).not.toHaveBeenCalled();
      expect(repo.append).toHaveBeenCalledWith(input);
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    it('proceeds with insert when existing snapshot is manual', async () => {
      const input = makeInput({ strategy: 'fifo' });
      const existingManual = makePersistedSnapshot(input);
      existingManual.strategy = 'manual';
      repo.findByStockMoveId.mockResolvedValue(existingManual);
      repo.append.mockResolvedValue(makePersistedSnapshot(input));

      await service.snapshotConsumption(input);

      expect(repo.append).toHaveBeenCalledWith(input);
    });
  });
});
