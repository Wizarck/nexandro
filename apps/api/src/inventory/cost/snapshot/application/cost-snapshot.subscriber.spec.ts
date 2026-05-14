import { randomUUID } from 'node:crypto';
import { CostSnapshotService } from './cost-snapshot.service';
import {
  CostSnapshotSubscriber,
  LOT_CONSUMED_EVENT,
} from './cost-snapshot.subscriber';
import type {
  CostResolution,
  InventoryCostResolverPort,
} from './ports/cost-resolver.port';

interface MockResolver {
  resolve: jest.Mock<Promise<CostResolution>, [unknown]>;
}

interface MockService {
  snapshotConsumption: jest.Mock;
}

const ORG = randomUUID();

function makeLotConsumedEvent(overrides?: Record<string, unknown>) {
  return {
    organization_id: ORG,
    stock_move_id: randomUUID(),
    lot_id: randomUUID(),
    product_id: randomUUID(),
    qty_consumed: 2.5,
    consumed_at: new Date('2026-05-14T08:00:00Z').toISOString(),
    correlation_id: randomUUID(),
    ...overrides,
  };
}

function makeResolution(): CostResolution {
  const lotA = randomUUID();
  const lotB = randomUUID();
  return {
    strategy: 'fifo',
    totalCost: 6.8,
    breakdown: [
      { lot_id: lotA, qty: 1.5, unit_cost: 3.0, subtotal: 4.5 },
      { lot_id: lotB, qty: 1.0, unit_cost: 2.3, subtotal: 2.3 },
    ],
    remainingLots: [{ lot_id: lotA, qty_remaining: 0 }],
  };
}

describe('CostSnapshotSubscriber', () => {
  let resolver: MockResolver;
  let service: MockService;
  let subscriber: CostSnapshotSubscriber;

  beforeEach(() => {
    resolver = {
      resolve: jest.fn().mockResolvedValue(makeResolution()),
    };
    service = {
      snapshotConsumption: jest.fn().mockResolvedValue({}),
    };
    subscriber = new CostSnapshotSubscriber(
      resolver as unknown as InventoryCostResolverPort,
      service as unknown as CostSnapshotService,
    );
  });

  it('binds to the LOT_CONSUMED bus channel name owned by slice #2', () => {
    expect(LOT_CONSUMED_EVENT).toBe('inventory.lot-consumed');
  });

  it('calls resolver BEFORE service.snapshotConsumption', async () => {
    const event = makeLotConsumedEvent();
    await subscriber.handleLotConsumed(event);
    const resolveOrder = resolver.resolve.mock.invocationCallOrder[0];
    const snapshotOrder = service.snapshotConsumption.mock.invocationCallOrder[0];
    expect(resolveOrder).toBeLessThan(snapshotOrder);
  });

  it('passes (org, product, qty, asOf) to the resolver', async () => {
    const event = makeLotConsumedEvent();
    await subscriber.handleLotConsumed(event);
    expect(resolver.resolve).toHaveBeenCalledWith({
      organizationId: event.organization_id,
      productId: event.product_id,
      qtyToConsume: event.qty_consumed,
      asOf: new Date(event.consumed_at as string),
    });
  });

  describe('correlation_id propagation (REQ-SS-6)', () => {
    it('propagates correlation_id from envelope when present', async () => {
      const corrId = randomUUID();
      const event = makeLotConsumedEvent({ correlation_id: corrId });
      await subscriber.handleLotConsumed(event);
      const arg = service.snapshotConsumption.mock.calls[0][0];
      expect(arg.correlation_id).toBe(corrId);
    });

    it('generates fresh UUID when correlation_id is missing', async () => {
      const event = makeLotConsumedEvent({ correlation_id: undefined });
      await subscriber.handleLotConsumed(event);
      const arg = service.snapshotConsumption.mock.calls[0][0];
      expect(arg.correlation_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('generates fresh UUID when correlation_id is null', async () => {
      const event = makeLotConsumedEvent({ correlation_id: null });
      await subscriber.handleLotConsumed(event);
      const arg = service.snapshotConsumption.mock.calls[0][0];
      expect(typeof arg.correlation_id).toBe('string');
      expect(arg.correlation_id.length).toBe(36);
    });

    it('generates fresh UUID when correlation_id is empty string', async () => {
      const event = makeLotConsumedEvent({ correlation_id: '' });
      await subscriber.handleLotConsumed(event);
      const arg = service.snapshotConsumption.mock.calls[0][0];
      expect(arg.correlation_id.length).toBe(36);
    });
  });

  it('uses the dominant (first) breakdown lot as the row lot_id', async () => {
    const event = makeLotConsumedEvent();
    await subscriber.handleLotConsumed(event);
    const arg = service.snapshotConsumption.mock.calls[0][0];
    const expectedLotId = resolver.resolve.mock.results[0].value;
    // resolver.resolve returns a Promise — unwrap.
    const resolution = await (expectedLotId as Promise<CostResolution>);
    expect(arg.lot_id).toBe(resolution.breakdown[0].lot_id);
  });

  it('forwards resolved totalCost + breakdown + strategy to the service', async () => {
    const event = makeLotConsumedEvent();
    await subscriber.handleLotConsumed(event);
    const arg = service.snapshotConsumption.mock.calls[0][0];
    expect(arg.total_cost).toBe(6.8);
    expect(arg.strategy).toBe('fifo');
    expect(arg.breakdown).toHaveLength(2);
  });

  describe('failure paths (REQ-SS-1)', () => {
    it('re-throws resolver errors (no silent failure)', async () => {
      resolver.resolve.mockRejectedValueOnce(new Error('FIFO depleted'));
      const event = makeLotConsumedEvent();
      await expect(subscriber.handleLotConsumed(event)).rejects.toThrow(
        'FIFO depleted',
      );
      expect(service.snapshotConsumption).not.toHaveBeenCalled();
    });

    it('throws when resolver returns empty breakdown', async () => {
      resolver.resolve.mockResolvedValueOnce({
        strategy: 'fifo',
        totalCost: 0,
        breakdown: [],
        remainingLots: [],
      });
      const event = makeLotConsumedEvent();
      await expect(subscriber.handleLotConsumed(event)).rejects.toThrow(
        /empty breakdown/,
      );
      expect(service.snapshotConsumption).not.toHaveBeenCalled();
    });
  });

  it('accepts Date consumed_at as well as ISO string', async () => {
    const consumedAt = new Date('2026-05-14T10:00:00Z');
    const event = makeLotConsumedEvent({ consumed_at: consumedAt });
    await subscriber.handleLotConsumed(event);
    expect(resolver.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ asOf: consumedAt }),
    );
  });
});
