import { randomUUID } from 'node:crypto';
import { StockMove } from './stock-move.entity';
import { InvalidMoveQuantitySignError, InvalidMoveTypeError } from './errors';

describe('StockMove.create', () => {
  const baseProps = () => ({
    organizationId: randomUUID(),
    locationId: randomUUID(),
    lotId: randomUUID(),
    actorUserId: randomUUID(),
  });

  it('constructs an inbound move with positive quantity', () => {
    const move = StockMove.create({
      ...baseProps(),
      moveType: 'inbound',
      quantity: 18,
    });
    expect(move.moveType).toBe('inbound');
    expect(move.quantity).toBe(18);
  });

  it('constructs an outbound move with negative quantity', () => {
    const move = StockMove.create({
      ...baseProps(),
      moveType: 'outbound',
      quantity: -3,
    });
    expect(move.moveType).toBe('outbound');
    expect(move.quantity).toBe(-3);
  });

  it('constructs a waste move with negative quantity', () => {
    const move = StockMove.create({
      ...baseProps(),
      moveType: 'waste',
      quantity: -0.5,
    });
    expect(move.moveType).toBe('waste');
  });

  it('constructs an adjustment move with either sign', () => {
    const positive = StockMove.create({
      ...baseProps(),
      moveType: 'adjustment',
      quantity: 2,
    });
    expect(positive.quantity).toBe(2);

    const negative = StockMove.create({
      ...baseProps(),
      moveType: 'adjustment',
      quantity: -2,
    });
    expect(negative.quantity).toBe(-2);
  });

  describe('quantity sign validation per move_type', () => {
    it('rejects inbound with zero quantity', () => {
      expect(() =>
        StockMove.create({ ...baseProps(), moveType: 'inbound', quantity: 0 }),
      ).toThrow(InvalidMoveQuantitySignError);
    });

    it('rejects inbound with negative quantity', () => {
      expect(() =>
        StockMove.create({ ...baseProps(), moveType: 'inbound', quantity: -1 }),
      ).toThrow(InvalidMoveQuantitySignError);
    });

    it('rejects outbound with positive quantity', () => {
      expect(() =>
        StockMove.create({ ...baseProps(), moveType: 'outbound', quantity: 1 }),
      ).toThrow(InvalidMoveQuantitySignError);
    });

    it('rejects waste with positive quantity', () => {
      expect(() =>
        StockMove.create({ ...baseProps(), moveType: 'waste', quantity: 1 }),
      ).toThrow(InvalidMoveQuantitySignError);
    });

    it('rejects adjustment with zero quantity', () => {
      expect(() =>
        StockMove.create({
          ...baseProps(),
          moveType: 'adjustment',
          quantity: 0,
        }),
      ).toThrow(InvalidMoveQuantitySignError);
    });

    it('rejects NaN quantity', () => {
      expect(() =>
        StockMove.create({
          ...baseProps(),
          moveType: 'inbound',
          quantity: NaN,
        }),
      ).toThrow(InvalidMoveQuantitySignError);
    });
  });

  it('rejects unknown move_type', () => {
    expect(() =>
      StockMove.create({
        ...baseProps(),
        moveType: 'transfer' as never,
        quantity: 1,
      }),
    ).toThrow(InvalidMoveTypeError);
  });

  it('rejects malformed lot_id', () => {
    expect(() =>
      StockMove.create({
        ...baseProps(),
        lotId: 'not-a-uuid',
        moveType: 'inbound',
        quantity: 1,
      }),
    ).toThrow(InvalidMoveTypeError); // UUID validator reuses InvalidMoveTypeError msg
  });

  it('accepts optional reason string', () => {
    const move = StockMove.create({
      ...baseProps(),
      moveType: 'adjustment',
      quantity: -1,
      reason: 'Manual recount after stock-take',
    });
    expect(move.reason).toBe('Manual recount after stock-take');
  });

  it('reason defaults to null when not provided', () => {
    const move = StockMove.create({
      ...baseProps(),
      moveType: 'inbound',
      quantity: 5,
    });
    expect(move.reason).toBeNull();
  });
});
