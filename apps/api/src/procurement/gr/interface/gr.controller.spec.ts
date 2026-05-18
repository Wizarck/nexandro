import { GoodsReceipt } from '../domain/goods-receipt.entity';
import { GrController, type GrListQueryDto } from './gr.controller';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeGr(overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
  const gr = new GoodsReceipt();
  gr.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  gr.organizationId = overrides.organizationId ?? ORG;
  gr.poId =
    'poId' in overrides
      ? (overrides.poId ?? null)
      : '00000000-0000-4000-8000-00000000aaaa';
  gr.supplierId =
    overrides.supplierId ?? '00000000-0000-4000-8000-000000000bbb';
  gr.receivedAt = overrides.receivedAt ?? new Date('2026-05-18T08:00:00Z');
  gr.receivedAtLocationId =
    overrides.receivedAtLocationId ?? '00000000-0000-4000-8000-00000000cccc';
  gr.receivingUserId =
    overrides.receivingUserId ?? '00000000-0000-4000-8000-00000000dddd';
  gr.supplierInvoiceRef = overrides.supplierInvoiceRef ?? null;
  gr.state = overrides.state ?? 'confirmed';
  gr.sourcePhotoIngestionId = overrides.sourcePhotoIngestionId ?? null;
  gr.requiresReview = overrides.requiresReview ?? false;
  gr.createdAt = overrides.createdAt ?? new Date('2026-05-18T08:00:00Z');
  gr.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T08:00:00Z');
  return gr;
}

function makeQuery(overrides: Partial<GrListQueryDto> = {}): GrListQueryDto {
  return { organizationId: ORG, ...overrides } as GrListQueryDto;
}

describe('GrController (Sprint 3 Block C — j11 shell)', () => {
  let controller: GrController;
  let findRecentMock: jest.Mock;

  beforeEach(() => {
    findRecentMock = jest.fn();
    const repo = { findRecent: findRecentMock };
    controller = new GrController(repo as never);
  });

  it('returns empty list when repository has no recent GRs', async () => {
    findRecentMock.mockResolvedValue([]);
    const result = await controller.list(makeQuery());
    expect(result).toEqual({ items: [], total: 0 });
    expect(findRecentMock).toHaveBeenCalledWith(ORG, 50, 0);
  });

  it('maps GR rows to DTO with ISO timestamps', async () => {
    findRecentMock.mockResolvedValue([makeGr()]);
    const result = await controller.list(makeQuery());
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      poId: '00000000-0000-4000-8000-00000000aaaa',
      state: 'confirmed',
      requiresReview: false,
      receivedAt: '2026-05-18T08:00:00.000Z',
      createdAt: '2026-05-18T08:00:00.000Z',
    });
  });

  it('passes through organizationId from query DTO (multi-tenant gate)', async () => {
    findRecentMock.mockResolvedValue([]);
    const otherOrg = '22222222-2222-4222-8222-222222222222';
    await controller.list(makeQuery({ organizationId: otherOrg }));
    expect(findRecentMock).toHaveBeenCalledWith(otherOrg, 50, 0);
  });

  it('exposes nullable poId / supplierInvoiceRef as nulls', async () => {
    findRecentMock.mockResolvedValue([
      makeGr({ poId: null, supplierInvoiceRef: null }),
    ]);
    const result = await controller.list(makeQuery());
    expect(result.items[0].poId).toBeNull();
    expect(result.items[0].supplierInvoiceRef).toBeNull();
  });
});
