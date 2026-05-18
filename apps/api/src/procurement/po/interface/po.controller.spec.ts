import { PurchaseOrder } from '../domain/purchase-order.entity';
import {
  PoController,
  composeNotesWithLocation,
  type PoListQueryDto,
  type CreatePoDto,
} from './po.controller';

const ORG = '11111111-1111-4111-8111-111111111111';

function makePo(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const po = new PurchaseOrder();
  po.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  po.organizationId = overrides.organizationId ?? ORG;
  po.supplierId = overrides.supplierId ?? '00000000-0000-4000-8000-000000000aaa';
  po.poNumber = overrides.poNumber ?? 'PO-2026-0001';
  po.state = overrides.state ?? 'sent';
  po.currency = overrides.currency ?? 'EUR';
  po.subtotal = overrides.subtotal ?? 100.0;
  po.vatTotal = overrides.vatTotal ?? 10.0;
  po.total = overrides.total ?? 110.0;
  po.expectedDeliveryDate =
    'expectedDeliveryDate' in overrides
      ? (overrides.expectedDeliveryDate ?? null)
      : new Date('2026-06-01');
  po.notes = overrides.notes ?? null;
  po.createdByUserId =
    overrides.createdByUserId ?? '00000000-0000-4000-8000-00000000cccc';
  po.sentAt = overrides.sentAt ?? null;
  po.closedAt = overrides.closedAt ?? null;
  po.createdAt = overrides.createdAt ?? new Date('2026-05-18T10:00:00Z');
  po.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T10:00:00Z');
  return po;
}

function makeQuery(overrides: Partial<PoListQueryDto> = {}): PoListQueryDto {
  return { organizationId: ORG, ...overrides } as PoListQueryDto;
}

describe('PoController (Sprint 3 Block C — j11 shell)', () => {
  let controller: PoController;
  let findActiveOpsMock: jest.Mock;
  let findByFilterMock: jest.Mock;
  let findByIdMock: jest.Mock;
  let findByPoMock: jest.Mock;
  let factoryCreateMock: jest.Mock;

  beforeEach(() => {
    findActiveOpsMock = jest.fn();
    findByFilterMock = jest.fn();
    findByIdMock = jest.fn();
    findByPoMock = jest.fn();
    factoryCreateMock = jest.fn();
    const poRepo = {
      findActiveOps: findActiveOpsMock,
      findByFilter: findByFilterMock,
      findById: findByIdMock,
    };
    const lineRepo = { findByPo: findByPoMock };
    const factory = { create: factoryCreateMock };
    controller = new PoController(
      poRepo as never,
      lineRepo as never,
      factory as never,
    );
  });

  it('returns empty list when repository has no active POs', async () => {
    findActiveOpsMock.mockResolvedValue([]);
    const result = await controller.list(makeQuery());
    expect(result).toEqual({ items: [], total: 0 });
    expect(findActiveOpsMock).toHaveBeenCalledWith(ORG, 50, 0);
  });

  it('uses findByFilter when supplierIds chip is active (Sprint 4 W3-9)', async () => {
    findByFilterMock.mockResolvedValue([]);
    await controller.list(
      makeQuery({ supplierIds: ['00000000-0000-4000-8000-00000000aaaa'] }),
    );
    expect(findByFilterMock).toHaveBeenCalledWith(ORG, {
      supplierIds: ['00000000-0000-4000-8000-00000000aaaa'],
      states: undefined,
      limit: 50,
      offset: 0,
    });
    expect(findActiveOpsMock).not.toHaveBeenCalled();
  });

  it('uses findByFilter when state chip is active (Sprint 4 W3-9)', async () => {
    findByFilterMock.mockResolvedValue([]);
    await controller.list(makeQuery({ state: ['draft', 'closed'] }));
    expect(findByFilterMock).toHaveBeenCalledWith(ORG, {
      supplierIds: undefined,
      states: ['draft', 'closed'],
      limit: 50,
      offset: 0,
    });
  });

  it('maps PO rows to DTO with ISO date strings', async () => {
    findActiveOpsMock.mockResolvedValue([makePo()]);
    const result = await controller.list(makeQuery());
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      poNumber: 'PO-2026-0001',
      state: 'sent',
      currency: 'EUR',
      total: 110,
      expectedDeliveryDate: '2026-06-01',
      createdAt: '2026-05-18T10:00:00.000Z',
    });
  });

  it('passes through organizationId from query DTO (multi-tenant gate)', async () => {
    findActiveOpsMock.mockResolvedValue([]);
    const otherOrg = '22222222-2222-4222-8222-222222222222';
    await controller.list(makeQuery({ organizationId: otherOrg }));
    expect(findActiveOpsMock).toHaveBeenCalledWith(otherOrg, 50, 0);
  });

  it('handles null expectedDeliveryDate without throwing', async () => {
    findActiveOpsMock.mockResolvedValue([makePo({ expectedDeliveryDate: null })]);
    const result = await controller.list(makeQuery());
    expect(result.items[0].expectedDeliveryDate).toBeNull();
  });

  describe('detail (Sprint 4 W3-1 — j11 drawer)', () => {
    const PO_ID = '00000000-0000-4000-8000-000000000001';

    it('throws NotFoundException when PO does not belong to org', async () => {
      findByIdMock.mockResolvedValue(null);
      await expect(
        controller.detail(PO_ID, { organizationId: ORG }),
      ).rejects.toThrow(/not found/);
      expect(findByIdMock).toHaveBeenCalledWith(ORG, PO_ID);
    });

    it('returns header + lines when PO exists', async () => {
      findByIdMock.mockResolvedValue(makePo());
      findByPoMock.mockResolvedValue([
        {
          id: 'line-1',
          lineNumber: 1,
          ingredientId: 'ing-1',
          quantityOrdered: 2,
          unit: 'kg',
          unitPrice: 50,
          vatRate: 0.1,
          vatInclusive: false,
          lineSubtotal: 100,
          lineVat: 10,
          lineTotal: 110,
        },
      ]);
      const result = await controller.detail(PO_ID, { organizationId: ORG });
      expect(result.poNumber).toBe('PO-2026-0001');
      expect(result.subtotal).toBe(100);
      expect(result.vatTotal).toBe(10);
      expect(result.total).toBe(110);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].ingredientId).toBe('ing-1');
      expect(findByPoMock).toHaveBeenCalledWith(ORG, PO_ID);
    });

    it('returns empty lines array when PO has no lines', async () => {
      findByIdMock.mockResolvedValue(makePo());
      findByPoMock.mockResolvedValue([]);
      const result = await controller.detail(PO_ID, { organizationId: ORG });
      expect(result.lines).toEqual([]);
    });
  });

  describe('create (Sprint 4 W3-11 — j11 Nueva OC modal)', () => {
    const USER = '00000000-0000-4000-8000-00000000cccc';

    function makeReq(): { user: { userId: string; organizationId: string; role: 'OWNER' } } {
      return { user: { userId: USER, organizationId: ORG, role: 'OWNER' } };
    }

    function makeBody(overrides: Partial<CreatePoDto> = {}): CreatePoDto {
      return {
        organizationId: ORG,
        supplierId: '00000000-0000-4000-8000-00000000aaaa',
        currency: 'EUR',
        expectedDeliveryDate: '2026-06-01',
        notes: 'urgente',
        lines: [
          {
            ingredientId: '00000000-0000-4000-8000-0000000000a1',
            quantityOrdered: 2,
            unit: 'kg',
            unitPrice: 50,
            vatRate: 0.1,
            vatInclusive: false,
          },
        ],
        ...overrides,
      } as CreatePoDto;
    }

    it('persists the factory result and returns the detail DTO', async () => {
      factoryCreateMock.mockResolvedValue({
        po: makePo({ poNumber: 'PO-2026-0042' }),
        lines: [],
      });
      const result = await controller.create(makeBody(), makeReq() as never);
      expect(factoryCreateMock).toHaveBeenCalledTimes(1);
      const arg = factoryCreateMock.mock.calls[0][0];
      expect(arg.organizationId).toBe(ORG);
      expect(arg.createdByUserId).toBe(USER);
      expect(arg.currency).toBe('EUR');
      expect(arg.lines).toHaveLength(1);
      expect(arg.expectedDeliveryDate).toBeInstanceOf(Date);
      expect(result.poNumber).toBe('PO-2026-0042');
    });

    it('throws 401 when request has no authenticated user', async () => {
      await expect(
        controller.create(makeBody(), {} as never),
      ).rejects.toThrow(/UNAUTHENTICATED|Unauthorized/);
      expect(factoryCreateMock).not.toHaveBeenCalled();
    });

    it('maps SupplierNotFoundError to 404', async () => {
      const { SupplierNotFoundError } = await import('../domain/errors');
      factoryCreateMock.mockRejectedValue(
        new SupplierNotFoundError('sup-x', ORG),
      );
      await expect(
        controller.create(makeBody(), makeReq() as never),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('maps PoMustHaveAtLeastOneLineError to 400', async () => {
      const { PoMustHaveAtLeastOneLineError } = await import('../domain/errors');
      factoryCreateMock.mockRejectedValue(new PoMustHaveAtLeastOneLineError());
      await expect(
        controller.create(makeBody({ lines: [] as never }), makeReq() as never),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('serialises locationId into notes prefix when provided', async () => {
      factoryCreateMock.mockResolvedValue({ po: makePo(), lines: [] });
      await controller.create(
        makeBody({
          locationId: '00000000-0000-4000-8000-00000000bbb1',
          notes: 'antes de las 10',
        }),
        makeReq() as never,
      );
      const arg = factoryCreateMock.mock.calls[0][0];
      expect(arg.notes).toBe(
        'Entrega en: 00000000-0000-4000-8000-00000000bbb1\nantes de las 10',
      );
    });
  });
});

describe('composeNotesWithLocation', () => {
  it('returns null when neither location nor notes set', () => {
    expect(composeNotesWithLocation(null, null)).toBeNull();
  });

  it('returns trimmed notes when only notes set', () => {
    expect(composeNotesWithLocation(null, '  hola  ')).toBe('hola');
  });

  it('returns just the prefix when only location set', () => {
    expect(composeNotesWithLocation('loc-1', null)).toBe('Entrega en: loc-1');
  });

  it('joins prefix + notes with newline', () => {
    expect(composeNotesWithLocation('loc-1', 'urgente')).toBe(
      'Entrega en: loc-1\nurgente',
    );
  });

  it('drops empty notes string (treats as null)', () => {
    expect(composeNotesWithLocation('loc-1', '   ')).toBe(
      'Entrega en: loc-1',
    );
  });
});
