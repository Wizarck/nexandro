import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LotRepository } from '../../lot/application/lot.repository';
import { StockMoveRepository } from '../../lot/application/stock-move.repository';
import { Lot } from '../../lot/domain/lot.entity';
import { StockMove } from '../../lot/domain/stock-move.entity';
import {
  DuplicateIdempotencyKeyError,
  InvalidConsumptionInputError,
  LotInsufficientQuantityError,
} from '../domain/errors';
import {
  LOT_CONSUMED_EVENT,
  LotConsumedEvent,
} from '../domain/events';
import { ConsumptionService } from './consumption.service';

/**
 * Unit tests — mock the repositories and the EventEmitter2 bus.
 * Integration tests against real Postgres are deferred to
 * `consumption.service.int-spec.ts` per the slice scope (heavy
 * testcontainer setup not in this batch).
 */
describe('ConsumptionService', () => {
  let svc: ConsumptionService;
  let lotRepo: jest.Mocked<Pick<LotRepository, 'findById' | 'findByLotCode' | 'findAvailableFifo' | 'save'>>;
  let stockMoveRepo: jest.Mocked<Pick<StockMoveRepository, 'append' | 'findByLot' | 'update' | 'delete'>>;
  let emitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const locationA = randomUUID();
  const recipeA = randomUUID();
  const menuItemA = randomUUID();

  const makeLot = (overrides: Partial<Lot> = {}): Lot => {
    const lot = Lot.create({
      organizationId: orgA,
      locationId: locationA,
      supplierId: randomUUID(),
      receivedAt: new Date('2026-05-10T08:00:00Z'),
      expiresAt: new Date('2026-06-10T08:00:00Z'),
      quantityReceived: 100,
      unit: 'kg',
    });
    Object.assign(lot, overrides);
    return lot;
  };

  beforeEach(() => {
    lotRepo = {
      findById: jest.fn(),
      findByLotCode: jest.fn(),
      findAvailableFifo: jest.fn(),
      save: jest.fn(),
    } as jest.Mocked<typeof lotRepo>;

    stockMoveRepo = {
      append: jest.fn(),
      findByLot: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<typeof stockMoveRepo>;

    emitter = { emit: jest.fn().mockReturnValue(true) } as jest.Mocked<
      typeof emitter
    >;

    svc = new ConsumptionService(
      lotRepo as unknown as LotRepository,
      stockMoveRepo as unknown as StockMoveRepository,
      emitter as unknown as EventEmitter2,
    );

    // append() echoes its arg back, simulating TypeORM `save()` behaviour;
    // also simulates @CreateDateColumn populating createdAt on insert.
    stockMoveRepo.append.mockImplementation(async (move: StockMove) => {
      (move as { createdAt: Date }).createdAt = new Date();
      return move;
    });
  });

  describe('happy path', () => {
    it('emits one LotConsumedEvent with positive qty_consumed in payload', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);

      const ev = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 30,
        recipeId: recipeA,
        idempotencyKey: randomUUID(),
      });

      // stock_moves row written exactly once with signed-negative qty
      expect(stockMoveRepo.append).toHaveBeenCalledTimes(1);
      const written = stockMoveRepo.append.mock.calls[0]![0]!;
      expect(written.moveType).toBe('outbound');
      expect(written.quantity).toBe(-30);
      expect(written.organizationId).toBe(orgA);
      expect(written.lotId).toBe(lot.id);

      // bus emit fired once with the canonical channel name
      expect(emitter.emit).toHaveBeenCalledTimes(1);
      const [channel, envelope] = emitter.emit.mock.calls[0]!;
      expect(channel).toBe(LOT_CONSUMED_EVENT);

      const env = envelope as LotConsumedEvent;
      expect(env.aggregateType).toBe('lot');
      expect(env.aggregateId).toBe(lot.id);
      expect(env.organizationId).toBe(orgA);
      expect(env.actorUserId).toBe(userA);
      expect(env.eventType).toBe(LOT_CONSUMED_EVENT);
      expect(env.payloadAfter.qty_consumed).toBe(30); // positive in payload
      expect(env.payloadAfter.organization_id).toBe(orgA); // top-level duplicate
      expect(env.payloadAfter.lot_id).toBe(lot.id);
      expect(env.payloadAfter.recipe_id).toBe(recipeA);
      expect(env.payloadAfter.menu_item_id).toBeNull();
      expect(env.payloadAfter.unit).toBe('kg');
      // Return value matches the emitted envelope
      expect(ev).toBe(env);
    });

    it('manual depletion (both drivers null, reason populated) succeeds', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);

      const ev = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 5,
        recipeId: null,
        menuItemId: null,
        reason: 'dropped pan',
        idempotencyKey: randomUUID(),
      });

      expect(ev.payloadAfter.recipe_id).toBeNull();
      expect(ev.payloadAfter.menu_item_id).toBeNull();
      expect(ev.payloadAfter.reason).toBe('dropped pan');
      expect(stockMoveRepo.append).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledTimes(1);
    });

    it('nexandro_tag propagates to the payload', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);

      const ev = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 2,
        menuItemId: menuItemA,
        nexandroTag: 'recall-investigation',
        idempotencyKey: randomUUID(),
      });

      expect(ev.payloadAfter.nexandro_tag).toBe('recall-investigation');
    });
  });

  describe('input validation', () => {
    it('qty_consumed = 0 → InvalidConsumptionInputError; no side effects', async () => {
      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: 0,
          recipeId: recipeA,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(InvalidConsumptionInputError);

      expect(lotRepo.findById).not.toHaveBeenCalled();
      expect(stockMoveRepo.append).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('qty_consumed negative → InvalidConsumptionInputError', async () => {
      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: -5,
          recipeId: recipeA,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(InvalidConsumptionInputError);
    });

    it('qty_consumed NaN → InvalidConsumptionInputError', async () => {
      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: Number.NaN,
          recipeId: recipeA,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(InvalidConsumptionInputError);
    });

    it('empty idempotencyKey → InvalidConsumptionInputError', async () => {
      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: 10,
          recipeId: recipeA,
          idempotencyKey: '',
        }),
      ).rejects.toBeInstanceOf(InvalidConsumptionInputError);
    });

    it('both recipeId + menuItemId populated → InvalidConsumptionInputError', async () => {
      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: 10,
          recipeId: recipeA,
          menuItemId: menuItemA,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(InvalidConsumptionInputError);

      expect(lotRepo.findById).not.toHaveBeenCalled();
      expect(stockMoveRepo.append).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('manual depletion without reason → InvalidConsumptionInputError', async () => {
      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: 10,
          recipeId: null,
          menuItemId: null,
          reason: null,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(InvalidConsumptionInputError);
    });

    it('manual depletion with whitespace-only reason → InvalidConsumptionInputError', async () => {
      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: 10,
          recipeId: null,
          menuItemId: null,
          reason: '   ',
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(InvalidConsumptionInputError);
    });
  });

  describe('multi-tenant gating', () => {
    it('lot not found in org → InvalidConsumptionInputError ("not found")', async () => {
      lotRepo.findById.mockResolvedValue(null);

      await expect(
        svc.recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: 10,
          recipeId: recipeA,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CONSUMPTION_INPUT' });

      expect(stockMoveRepo.append).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('cross-tenant lot lookup surfaces as not-found (no leakage)', async () => {
      // simulate: orgA asks for orgB's lot — repo returns null because of the
      // multi-tenant gate at LotRepository.findById, not because the lot
      // doesn't exist globally.
      lotRepo.findById.mockResolvedValue(null);

      const err = await svc
        .recordConsumption(orgA, userA, {
          lotId: randomUUID(),
          qtyConsumed: 10,
          recipeId: recipeA,
          idempotencyKey: randomUUID(),
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(InvalidConsumptionInputError);
      // Error message must NOT reveal whether the lot exists elsewhere.
      expect(err.message).toMatch(/not found/i);
    });
  });

  describe('quantity invariant', () => {
    it('qty > quantity_remaining → LotInsufficientQuantityError; no writes', async () => {
      const lot = makeLot();
      lot.quantityRemaining = 25;
      lotRepo.findById.mockResolvedValue(lot);

      const err = await svc
        .recordConsumption(orgA, userA, {
          lotId: lot.id,
          qtyConsumed: 30,
          recipeId: recipeA,
          idempotencyKey: randomUUID(),
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(LotInsufficientQuantityError);
      expect((err as LotInsufficientQuantityError).requested).toBe(30);
      expect((err as LotInsufficientQuantityError).available).toBe(25);

      expect(stockMoveRepo.append).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('qty exactly equal to quantity_remaining → succeeds', async () => {
      const lot = makeLot();
      lot.quantityRemaining = 30;
      lotRepo.findById.mockResolvedValue(lot);

      const ev = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 30,
        recipeId: recipeA,
        idempotencyKey: randomUUID(),
      });

      expect(ev.payloadAfter.qty_consumed).toBe(30);
    });
  });

  describe('idempotency', () => {
    it('same key replayed returns original envelope; no second write', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);
      const key = randomUUID();

      const first = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 10,
        recipeId: recipeA,
        idempotencyKey: key,
      });

      const second = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 999, // even with different qty, key wins
        recipeId: recipeA,
        idempotencyKey: key,
      });

      expect(second).toBe(first);
      expect(stockMoveRepo.append).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledTimes(1);
    });

    it('different keys produce distinct events + two writes', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);

      const ev1 = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 10,
        recipeId: recipeA,
        idempotencyKey: randomUUID(),
      });
      const ev2 = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 5,
        recipeId: recipeA,
        idempotencyKey: randomUUID(),
      });

      expect(ev1).not.toBe(ev2);
      expect(ev1.payloadAfter.stock_move_id).not.toBe(
        ev2.payloadAfter.stock_move_id,
      );
      expect(stockMoveRepo.append).toHaveBeenCalledTimes(2);
      expect(emitter.emit).toHaveBeenCalledTimes(2);
    });

    it('idempotency is org-scoped (same key under different orgs is independent)', async () => {
      const lotForA = makeLot();
      const lotForB = makeLot({ organizationId: orgB });
      lotRepo.findById.mockImplementation(async (org: string) =>
        org === orgA ? lotForA : lotForB,
      );

      const key = randomUUID();
      const ev1 = await svc.recordConsumption(orgA, userA, {
        lotId: lotForA.id,
        qtyConsumed: 10,
        recipeId: recipeA,
        idempotencyKey: key,
      });
      const ev2 = await svc.recordConsumption(orgB, userA, {
        lotId: lotForB.id,
        qtyConsumed: 10,
        recipeId: recipeA,
        idempotencyKey: key,
      });

      expect(ev1).not.toBe(ev2);
      expect(ev1.organizationId).toBe(orgA);
      expect(ev2.organizationId).toBe(orgB);
      expect(stockMoveRepo.append).toHaveBeenCalledTimes(2);
    });
  });

  describe('envelope shape invariants (REQ-CE-1, REQ-CE-3)', () => {
    it('payload organization_id always matches envelope organization_id', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);
      const ev = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 1,
        recipeId: recipeA,
        idempotencyKey: randomUUID(),
      });
      expect(ev.organizationId).toBe(ev.payloadAfter.organization_id);
    });

    it('payload consumed_at equals envelope createdAt ISO string', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);
      const ev = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 1,
        recipeId: recipeA,
        idempotencyKey: randomUUID(),
      });
      expect(ev.payloadAfter.consumed_at).toBe(ev.createdAt.toISOString());
    });

    it('aggregateType is always lot; aggregateId is always lot.id', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);
      const ev = await svc.recordConsumption(orgA, userA, {
        lotId: lot.id,
        qtyConsumed: 1,
        recipeId: recipeA,
        idempotencyKey: randomUUID(),
      });
      expect(ev.aggregateType).toBe('lot');
      expect(ev.aggregateId).toBe(lot.id);
    });
  });

  describe('forward-trace query', () => {
    it('returns empty when lot belongs to another org', async () => {
      lotRepo.findById.mockResolvedValue(null);
      const result = await svc.findConsumptionsByLot(
        orgA,
        randomUUID(),
        10,
        0,
      );
      expect(result).toEqual([]);
      expect(stockMoveRepo.findByLot).not.toHaveBeenCalled();
    });

    it('filters to outbound rows only', async () => {
      const lot = makeLot();
      lotRepo.findById.mockResolvedValue(lot);
      const outbound = StockMove.create({
        organizationId: orgA,
        locationId: locationA,
        lotId: lot.id,
        moveType: 'outbound',
        quantity: -5,
        actorUserId: userA,
      });
      const inbound = StockMove.create({
        organizationId: orgA,
        locationId: locationA,
        lotId: lot.id,
        moveType: 'inbound',
        quantity: 50,
        actorUserId: userA,
      });
      stockMoveRepo.findByLot.mockResolvedValue([outbound, inbound]);

      const result = await svc.findConsumptionsByLot(orgA, lot.id, 10, 0);
      expect(result).toHaveLength(1);
      expect(result[0]!.moveType).toBe('outbound');
    });
  });

  describe('exposed error class identities', () => {
    // Stable type identities for downstream HTTP layer / @Catch decorators.
    it('exports InvalidConsumptionInputError', () => {
      const e = new InvalidConsumptionInputError('test');
      expect(e.code).toBe('INVALID_CONSUMPTION_INPUT');
      expect(e.name).toBe('InvalidConsumptionInputError');
    });

    it('exports LotInsufficientQuantityError', () => {
      const e = new LotInsufficientQuantityError('lot-1', 30, 10);
      expect(e.code).toBe('LOT_INSUFFICIENT_QUANTITY');
      expect(e.lotId).toBe('lot-1');
    });

    it('exports DuplicateIdempotencyKeyError (declared for future strict-mode)', () => {
      const e = new DuplicateIdempotencyKeyError('key-1');
      expect(e.code).toBe('DUPLICATE_IDEMPOTENCY_KEY');
      expect(e.idempotencyKey).toBe('key-1');
    });
  });
});
