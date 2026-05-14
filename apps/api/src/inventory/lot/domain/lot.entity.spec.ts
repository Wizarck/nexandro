import { randomUUID } from 'node:crypto';
import { Lot } from './lot.entity';
import {
  InvalidLotExpiryError,
  InvalidLotQuantityError,
  InvalidUnitError,
} from './errors';

describe('Lot.create', () => {
  const baseProps = () => ({
    organizationId: randomUUID(),
    locationId: randomUUID(),
    supplierId: randomUUID(),
    receivedAt: new Date('2026-05-14T08:00:00Z'),
    expiresAt: new Date('2026-06-14T08:00:00Z'),
    quantityReceived: 18,
    unit: 'kg' as const,
  });

  it('constructs a valid Lot with defaults', () => {
    const lot = Lot.create(baseProps());
    expect(lot.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(lot.quantityReceived).toBe(18);
    expect(lot.quantityRemaining).toBe(18);
    expect(lot.metadata).toEqual({});
    expect(lot.unit).toBe('kg');
  });

  it('quantity_remaining starts equal to quantity_received', () => {
    const lot = Lot.create({ ...baseProps(), quantityReceived: 25.5 });
    expect(lot.quantityRemaining).toBe(25.5);
  });

  it('preserves supplier_id null for legacy backfill paths', () => {
    const lot = Lot.create({ ...baseProps(), supplierId: null });
    expect(lot.supplierId).toBeNull();
  });

  it('accepts expires_at null for shelf-stable items', () => {
    const lot = Lot.create({ ...baseProps(), expiresAt: null });
    expect(lot.expiresAt).toBeNull();
  });

  it('stores custom metadata', () => {
    const lot = Lot.create({
      ...baseProps(),
      metadata: { invoiceRef: 'INV-2026-3398', vehiclePlate: '4567-ABC' },
    });
    expect(lot.metadata).toEqual({
      invoiceRef: 'INV-2026-3398',
      vehiclePlate: '4567-ABC',
    });
  });

  describe('validation boundaries', () => {
    it('rejects quantity_received = 0', () => {
      expect(() =>
        Lot.create({ ...baseProps(), quantityReceived: 0 }),
      ).toThrow(InvalidLotQuantityError);
    });

    it('rejects quantity_received < 0', () => {
      expect(() =>
        Lot.create({ ...baseProps(), quantityReceived: -1 }),
      ).toThrow(InvalidLotQuantityError);
    });

    it('rejects quantity_received NaN', () => {
      expect(() =>
        Lot.create({ ...baseProps(), quantityReceived: NaN }),
      ).toThrow(InvalidLotQuantityError);
    });

    it('rejects unknown unit', () => {
      expect(() =>
        Lot.create({ ...baseProps(), unit: 'dozen' as never }),
      ).toThrow(InvalidUnitError);
    });

    it('rejects expires_at <= received_at', () => {
      const sameDate = new Date('2026-05-14T08:00:00Z');
      expect(() =>
        Lot.create({
          ...baseProps(),
          receivedAt: sameDate,
          expiresAt: sameDate,
        }),
      ).toThrow(InvalidLotExpiryError);

      expect(() =>
        Lot.create({
          ...baseProps(),
          receivedAt: new Date('2026-05-14T08:00:00Z'),
          expiresAt: new Date('2026-05-13T08:00:00Z'),
        }),
      ).toThrow(InvalidLotExpiryError);
    });

    it('rejects malformed organizationId', () => {
      expect(() =>
        Lot.create({ ...baseProps(), organizationId: 'not-a-uuid' }),
      ).toThrow(InvalidLotQuantityError); // UUID validator reuses InvalidLotQuantityError msg
    });

    it('rejects malformed locationId', () => {
      expect(() =>
        Lot.create({ ...baseProps(), locationId: 'not-a-uuid' }),
      ).toThrow(InvalidLotQuantityError);
    });

    it('accepts all allowed units', () => {
      const units: Array<'kg' | 'g' | 'L' | 'ml' | 'un'> = [
        'kg',
        'g',
        'L',
        'ml',
        'un',
      ];
      for (const u of units) {
        const lot = Lot.create({ ...baseProps(), unit: u });
        expect(lot.unit).toBe(u);
      }
    });
  });
});
