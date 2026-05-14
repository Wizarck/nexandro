import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { SupplierRepository } from '../../../suppliers/infrastructure/supplier.repository';
import {
  InvalidCurrencyCodeError,
  InvalidPoInputError,
  PoMustHaveAtLeastOneLineError,
  SupplierNotFoundError,
} from '../domain/errors';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import { PurchaseOrderLine } from '../domain/purchase-order-line.entity';
import type { CreatePoInput } from '../domain/types';
import { PoFactory } from './po.factory';
import { PoNumberService } from './po-number.service';

/**
 * In-memory stand-in for the TypeORM transaction manager used by
 * `DataSource.transaction(cb)`. Records every save() call so tests can
 * inspect what would have been persisted.
 */
class FakeManager {
  public readonly saved: Array<{ entity: unknown; rows: unknown }> = [];
  async save<T>(entity: unknown, rows: T): Promise<T> {
    this.saved.push({ entity, rows });
    return rows;
  }
}

function buildFactory(opts: {
  supplierFound: boolean;
  allocateReturns?: string;
}): {
  factory: PoFactory;
  fakeManager: FakeManager;
  allocateSpy: jest.Mock;
} {
  const fakeManager = new FakeManager();
  const ds = {
    transaction: jest.fn(async (cb: (m: FakeManager) => Promise<unknown>) =>
      cb(fakeManager),
    ),
  } as unknown as DataSource;
  const allocateSpy = jest
    .fn()
    .mockResolvedValue(opts.allocateReturns ?? 'PO-2026-0001');
  const poNumberService = {
    allocate: allocateSpy,
  } as unknown as PoNumberService;
  const supplierRepo = {
    findOneBy: jest
      .fn()
      .mockResolvedValue(opts.supplierFound ? { id: 'supplier-x' } : null),
  } as unknown as SupplierRepository;
  return {
    factory: new PoFactory(ds, poNumberService, supplierRepo),
    fakeManager,
    allocateSpy,
  };
}

function baseInput(): CreatePoInput {
  return {
    organizationId: randomUUID(),
    supplierId: randomUUID(),
    createdByUserId: randomUUID(),
    currency: 'EUR',
    lines: [
      {
        ingredientId: randomUUID(),
        quantityOrdered: 5,
        unit: 'kg',
        unitPrice: 8.5,
        vatRate: 0.21,
        vatInclusive: false,
      },
    ],
  };
}

describe('PoFactory.create', () => {
  it('happy path: 2-line PO computes correct subtotal/VAT/total', async () => {
    const { factory, fakeManager } = buildFactory({ supplierFound: true });
    const input: CreatePoInput = {
      ...baseInput(),
      lines: [
        // Line 1: 5 kg @ 8.5 @ 21% exclusive → subtotal 42.5, vat 8.925, total 51.425
        {
          ingredientId: randomUUID(),
          quantityOrdered: 5,
          unit: 'kg',
          unitPrice: 8.5,
          vatRate: 0.21,
          vatInclusive: false,
        },
        // Line 2: 10 kg @ 2 @ 10% exclusive → subtotal 20, vat 2, total 22
        {
          ingredientId: randomUUID(),
          quantityOrdered: 10,
          unit: 'kg',
          unitPrice: 2,
          vatRate: 0.1,
          vatInclusive: false,
        },
      ],
    };

    const { po, lines } = await factory.create(input);

    expect(po.state).toBe('draft');
    expect(po.currency).toBe('EUR');
    expect(po.poNumber).toBe('PO-2026-0001');
    expect(po.subtotal).toBeCloseTo(62.5, 4);
    expect(po.vatTotal).toBeCloseTo(10.925, 4);
    expect(po.total).toBeCloseTo(73.425, 4);
    expect(lines.length).toBe(2);
    expect(lines[0].lineNumber).toBe(1);
    expect(lines[1].lineNumber).toBe(2);
    expect(lines[0].lineSubtotal).toBeCloseTo(42.5, 4);
    expect(lines[1].lineSubtotal).toBeCloseTo(20, 4);

    // Both PO + lines were "saved"
    const persistedEntities = fakeManager.saved.map((s) => s.entity);
    expect(persistedEntities).toContain(PurchaseOrder);
    expect(persistedEntities).toContain(PurchaseOrderLine);
  });

  it('rejects empty lines array with PoMustHaveAtLeastOneLineError', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    await expect(
      factory.create({ ...baseInput(), lines: [] }),
    ).rejects.toBeInstanceOf(PoMustHaveAtLeastOneLineError);
  });

  it('rejects 2-letter currency code with InvalidCurrencyCodeError', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    await expect(
      factory.create({ ...baseInput(), currency: 'EU' }),
    ).rejects.toBeInstanceOf(InvalidCurrencyCodeError);
  });

  it('rejects 4-letter currency code with InvalidCurrencyCodeError', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    await expect(
      factory.create({ ...baseInput(), currency: 'EURO' }),
    ).rejects.toBeInstanceOf(InvalidCurrencyCodeError);
  });

  it('rejects lowercase currency code with InvalidCurrencyCodeError', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    await expect(
      factory.create({ ...baseInput(), currency: 'eur' }),
    ).rejects.toBeInstanceOf(InvalidCurrencyCodeError);
  });

  it('rejects unknown supplier with SupplierNotFoundError', async () => {
    const { factory } = buildFactory({ supplierFound: false });
    await expect(factory.create(baseInput())).rejects.toBeInstanceOf(
      SupplierNotFoundError,
    );
  });

  it('rejects line with zero quantity', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    const input = baseInput();
    input.lines[0].quantityOrdered = 0;
    await expect(factory.create(input)).rejects.toBeInstanceOf(InvalidPoInputError);
  });

  it('rejects line with negative unit price', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    const input = baseInput();
    input.lines[0].unitPrice = -1;
    await expect(factory.create(input)).rejects.toBeInstanceOf(InvalidPoInputError);
  });

  it('accepts line with zero unit price', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    const input = baseInput();
    input.lines[0].unitPrice = 0;
    const { po } = await factory.create(input);
    expect(po.subtotal).toBe(0);
    expect(po.total).toBe(0);
  });

  it('rejects line with VAT rate above 1', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    const input = baseInput();
    input.lines[0].vatRate = 1.5;
    await expect(factory.create(input)).rejects.toBeInstanceOf(InvalidPoInputError);
  });

  it('rejects line with invalid unit', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    const input = baseInput();
    // Force an invalid unit through the contract to assert validator catches it.
    (input.lines[0] as { unit: string }).unit = 'dozen';
    await expect(factory.create(input)).rejects.toBeInstanceOf(InvalidPoInputError);
  });

  it('handles VAT-inclusive line correctly', async () => {
    const { factory } = buildFactory({ supplierFound: true });
    const input: CreatePoInput = {
      ...baseInput(),
      lines: [
        {
          ingredientId: randomUUID(),
          quantityOrdered: 5,
          unit: 'kg',
          unitPrice: 10.285,
          vatRate: 0.21,
          vatInclusive: true,
        },
      ],
    };
    const { po, lines } = await factory.create(input);
    expect(lines[0].lineTotal).toBeCloseTo(51.425, 4);
    expect(po.total).toBeCloseTo(51.425, 4);
  });
});
