import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource, EntityManager } from 'typeorm';
import {
  IndependentGrMissingSupplierError,
  OverReceiptError,
  PoAggregateNotEnabledError,
} from '../domain/errors';
import { CreateGrInput, GrEventType } from '../types';
import { GrConfirmationService, PoStateMachineLike } from './gr-confirmation.service';
import type { GoodsReceiptRepository } from './gr.repository';
import type { GoodsReceiptLineRepository } from './gr-line.repository';
import type { LotRepository } from '../../../inventory/lot/application/lot.repository';

/**
 * Unit tests for GrConfirmationService — repositories + DataSource are
 * mocked so this suite runs without Postgres. INT tests in Phase 3 cover
 * the real transactional semantics against vps-postgres / testcontainer.
 */
describe('GrConfirmationService (unit)', () => {
  // Fixed valid UUIDs (version 4, variant 8/9/a/b in the 17th hex char).
  const orgId = '11111111-1111-4111-8111-111111111111';
  const supplierId = '22222222-2222-4222-9222-222222222222';
  const locationId = '33333333-3333-4333-a333-333333333333';
  const userId = '44444444-4444-4444-b444-444444444444';
  const productId = '55555555-5555-4555-8555-555555555555';

  let savedHeaders: unknown[];
  let savedLines: unknown[][];
  let savedLots: unknown[];
  let sumByPoLine: Map<string, number>;
  let mockManager: EntityManager;
  let mockDataSource: DataSource;
  let mockGrRepo: GoodsReceiptRepository;
  let mockGrLineRepo: GoodsReceiptLineRepository;
  let mockLotRepo: LotRepository;
  let emitter: EventEmitter2;
  let originalEnv: string | undefined;

  beforeEach(() => {
    savedHeaders = [];
    savedLines = [];
    savedLots = [];
    sumByPoLine = new Map();

    mockManager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => {
        if (Array.isArray(value)) {
          savedLots.push(...value);
          return value;
        }
        return value;
      }),
    } as unknown as EntityManager;

    mockDataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => unknown) =>
        cb(mockManager),
      ),
    } as unknown as DataSource;

    mockGrRepo = {
      save: jest.fn(async (gr: unknown) => {
        savedHeaders.push(gr);
        return gr;
      }),
      findById: jest.fn(),
      updateState: jest.fn(),
      findRecent: jest.fn(),
      findByPoId: jest.fn(),
      findBySupplierAndDateRange: jest.fn(),
    } as unknown as GoodsReceiptRepository;

    mockGrLineRepo = {
      saveMany: jest.fn(async (lines: unknown[]) => {
        savedLines.push(lines);
        return lines;
      }),
      sumQtyReceivedByPoLine: jest.fn(async (_org: string, poLineId: string) =>
        sumByPoLine.get(poLineId) ?? 0,
      ),
      findByGr: jest.fn(),
    } as unknown as GoodsReceiptLineRepository;

    mockLotRepo = {} as unknown as LotRepository;
    emitter = new EventEmitter2();
    originalEnv = process.env.M3_PO_AGGREGATE_ENABLED;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.M3_PO_AGGREGATE_ENABLED;
    else process.env.M3_PO_AGGREGATE_ENABLED = originalEnv;
  });

  function makeService(
    poStateMachine: PoStateMachineLike | null = null,
  ): GrConfirmationService {
    return new GrConfirmationService(
      mockDataSource,
      mockGrRepo,
      mockGrLineRepo,
      mockLotRepo,
      emitter,
      poStateMachine,
    );
  }

  function independentGrInput(lineCount = 3): CreateGrInput {
    return {
      organizationId: orgId,
      poId: null,
      supplierId,
      receivedAt: new Date('2026-05-14T10:00:00Z'),
      receivedAtLocationId: locationId,
      receivingUserId: userId,
      supplierInvoiceRef: 'INV-TEST-001',
      lines: Array.from({ length: lineCount }).map(() => ({
        productId,
        qtyReceivedActual: 5,
        unitPriceActual: 2.0,
        unit: 'kg' as const,
        poLineId: null,
        qtyOrdered: null,
        unitPriceOrdered: null,
      })),
    };
  }

  function poLinkedGrInput(): CreateGrInput {
    return {
      organizationId: orgId,
      poId: randomUUID(),
      supplierId,
      receivedAt: new Date('2026-05-14T10:00:00Z'),
      receivedAtLocationId: locationId,
      receivingUserId: userId,
      lines: [
        {
          productId,
          qtyReceivedActual: 100,
          unitPriceActual: 2.0,
          unit: 'kg' as const,
          poLineId: randomUUID(),
          qtyOrdered: 100,
          unitPriceOrdered: 2.0,
        },
      ],
    };
  }

  describe('happy paths', () => {
    it('confirms a 3-line independent GR creating 3 Lots', async () => {
      const svc = makeService();
      const result = await svc.confirm(independentGrInput(3));
      expect(result.state).toBe('confirmed');
      expect(result.lines).toHaveLength(3);
      expect(savedLots).toHaveLength(3);
      expect(savedHeaders).toHaveLength(1);
      expect((savedHeaders[0] as { state: string }).state).toBe('confirmed');
      expect(savedLines[0]).toHaveLength(3);
      // Each line carries the lot_id_created back from the Lot we built.
      for (const line of result.lines) {
        expect(line.lotIdCreated).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      }
    });

    it('emits GR_CONFIRMED on the bus', async () => {
      const spy = jest.fn();
      emitter.on(GrEventType.GR_CONFIRMED, spy);
      const svc = makeService();
      await svc.confirm(independentGrInput(2));
      expect(spy).toHaveBeenCalledTimes(1);
      const call = spy.mock.calls[0][0] as { lines: unknown[] };
      expect(call.lines).toHaveLength(2);
    });

    it('does NOT emit variance events for independent lines (no PO baseline)', async () => {
      const qtySpy = jest.fn();
      const priceSpy = jest.fn();
      emitter.on(GrEventType.GR_LINE_QTY_VARIANCE, qtySpy);
      emitter.on(GrEventType.GR_LINE_PRICE_VARIANCE, priceSpy);
      const svc = makeService();
      const input = independentGrInput(1);
      input.lines[0].qtyReceivedActual = 100; // wildly different from qty 5
      await svc.confirm(input);
      expect(qtySpy).not.toHaveBeenCalled();
      expect(priceSpy).not.toHaveBeenCalled();
    });
  });

  describe('feature flag', () => {
    it('rejects po_id-linked GR when M3_PO_AGGREGATE_ENABLED=false', async () => {
      delete process.env.M3_PO_AGGREGATE_ENABLED;
      const svc = makeService();
      await expect(svc.confirm(poLinkedGrInput())).rejects.toBeInstanceOf(
        PoAggregateNotEnabledError,
      );
      expect(savedHeaders).toHaveLength(0);
      expect(savedLots).toHaveLength(0);
    });

    it('rejects po_id-linked GR when flag is explicitly false', async () => {
      process.env.M3_PO_AGGREGATE_ENABLED = 'false';
      const svc = makeService();
      await expect(svc.confirm(poLinkedGrInput())).rejects.toBeInstanceOf(
        PoAggregateNotEnabledError,
      );
    });

    it('allows independent GR when flag is false', async () => {
      delete process.env.M3_PO_AGGREGATE_ENABLED;
      const svc = makeService();
      const result = await svc.confirm(independentGrInput(1));
      expect(result.state).toBe('confirmed');
    });

    it('allows po_id-linked GR when flag is true (with PoStateMachine stub)', async () => {
      process.env.M3_PO_AGGREGATE_ENABLED = 'true';
      const transition = jest.fn(async () => undefined);
      const stub: PoStateMachineLike = {
        transitionFromGrConfirmation: transition,
      };
      const svc = makeService(stub);
      const input = poLinkedGrInput();
      const result = await svc.confirm(input);
      expect(result.state).toBe('confirmed');
      expect(transition).toHaveBeenCalledTimes(1);
    });

    it('allows po_id-linked GR when flag is true and PoStateMachine is null (no-op fallback)', async () => {
      process.env.M3_PO_AGGREGATE_ENABLED = 'true';
      const svc = makeService(null);
      const input = poLinkedGrInput();
      const result = await svc.confirm(input);
      expect(result.state).toBe('confirmed');
    });
  });

  describe('shape coherence', () => {
    it('rejects po_id=null with at least one po_line_id set', async () => {
      const svc = makeService();
      const input = independentGrInput(2);
      input.lines[0].poLineId = randomUUID();
      await expect(svc.confirm(input)).rejects.toBeInstanceOf(
        IndependentGrMissingSupplierError,
      );
      expect(savedHeaders).toHaveLength(0);
    });

    it('rejects po_id set with at least one po_line_id=null', async () => {
      process.env.M3_PO_AGGREGATE_ENABLED = 'true';
      const svc = makeService();
      const input = poLinkedGrInput();
      input.lines.push({
        productId,
        qtyReceivedActual: 1,
        unitPriceActual: 1,
        unit: 'kg',
        poLineId: null,
        qtyOrdered: null,
        unitPriceOrdered: null,
      });
      await expect(svc.confirm(input)).rejects.toBeInstanceOf(
        IndependentGrMissingSupplierError,
      );
    });
  });

  describe('over-receipt tolerance', () => {
    it('accepts cumulative exactly at qty_ordered × (1 + tolerance) for bulk', async () => {
      process.env.M3_PO_AGGREGATE_ENABLED = 'true';
      const svc = makeService();
      const input = poLinkedGrInput();
      const poLineId = input.lines[0].poLineId as string;
      sumByPoLine.set(poLineId, 95);
      input.lines[0].qtyOrdered = 100;
      input.lines[0].qtyReceivedActual = 10; // 95 + 10 = 105 = 100 * 1.05
      await expect(svc.confirm(input)).resolves.toBeTruthy();
    });

    it('rejects cumulative > qty_ordered × (1 + tolerance) for bulk', async () => {
      process.env.M3_PO_AGGREGATE_ENABLED = 'true';
      const svc = makeService();
      const input = poLinkedGrInput();
      const poLineId = input.lines[0].poLineId as string;
      sumByPoLine.set(poLineId, 95);
      input.lines[0].qtyOrdered = 100;
      input.lines[0].qtyReceivedActual = 15; // 95 + 15 = 110 > 105
      await expect(svc.confirm(input)).rejects.toBeInstanceOf(OverReceiptError);
    });

    it('discrete-unit tolerance is zero', async () => {
      process.env.M3_PO_AGGREGATE_ENABLED = 'true';
      const svc = makeService();
      const input = poLinkedGrInput();
      input.lines[0].unit = 'un';
      input.lines[0].qtyOrdered = 10;
      input.lines[0].qtyReceivedActual = 11;
      await expect(svc.confirm(input)).rejects.toBeInstanceOf(OverReceiptError);
    });
  });

  describe('atomicity', () => {
    it('rolls back when Lot creation throws (mocked manager.save fails on 3rd)', async () => {
      let savedCount = 0;
      mockManager = {
        save: jest.fn(async (_entity: unknown, value: unknown) => {
          if (Array.isArray(value)) {
            // The service saves an array of Lots in one call; simulate
            // partial in-array failure by throwing if any element is the
            // 3rd item.
            if (value.length >= 3) {
              throw new Error('simulated DB fault on bulk Lot insert');
            }
            savedCount += value.length;
            return value;
          }
          return value;
        }),
      } as unknown as EntityManager;
      mockDataSource = {
        transaction: jest.fn(async (cb: (m: EntityManager) => unknown) => {
          try {
            return await cb(mockManager);
          } catch (err) {
            // simulate rollback discarding partial saves
            savedHeaders = [];
            savedLines = [];
            savedLots = [];
            throw err;
          }
        }),
      } as unknown as DataSource;

      const svc = makeService();
      await expect(svc.confirm(independentGrInput(5))).rejects.toThrow(
        /simulated DB fault/,
      );
      expect(savedCount).toBe(0); // bulk save never partially succeeded
      expect(savedHeaders).toHaveLength(0);
      expect(savedLines).toHaveLength(0);
    });
  });

  describe('input validation', () => {
    it('rejects empty lines array (Zod .min(1))', async () => {
      const svc = makeService();
      const input = independentGrInput(1);
      input.lines = [];
      await expect(svc.confirm(input)).rejects.toThrow(/lines/);
    });

    it('rejects negative qty', async () => {
      const svc = makeService();
      const input = independentGrInput(1);
      input.lines[0].qtyReceivedActual = -1;
      await expect(svc.confirm(input)).rejects.toThrow();
    });

    it('rejects malformed UUID', async () => {
      const svc = makeService();
      const input = independentGrInput(1);
      input.organizationId = 'not-a-uuid';
      await expect(svc.confirm(input)).rejects.toThrow();
    });
  });
});
