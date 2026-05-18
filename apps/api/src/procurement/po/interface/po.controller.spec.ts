import { PurchaseOrder } from '../domain/purchase-order.entity';
import { PoController, type PoListQueryDto } from './po.controller';

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

  beforeEach(() => {
    findActiveOpsMock = jest.fn();
    const repo = { findActiveOps: findActiveOpsMock };
    controller = new PoController(repo as never);
  });

  it('returns empty list when repository has no active POs', async () => {
    findActiveOpsMock.mockResolvedValue([]);
    const result = await controller.list(makeQuery());
    expect(result).toEqual({ items: [], total: 0 });
    expect(findActiveOpsMock).toHaveBeenCalledWith(ORG, 50, 0);
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
});
