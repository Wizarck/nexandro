import { NotFoundException } from '@nestjs/common';
import { GoodsReceipt } from '../domain/goods-receipt.entity';
import { GoodsReceiptLine } from '../domain/goods-receipt-line.entity';
import {
  GrController,
  type GrDetailParamsDto,
  type GrDetailQueryDto,
  type GrListQueryDto,
} from './gr.controller';

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

function makeLine(overrides: Partial<GoodsReceiptLine> = {}): GoodsReceiptLine {
  const line = new GoodsReceiptLine();
  line.id = overrides.id ?? '00000000-0000-4000-8000-00000000ee01';
  line.grId = overrides.grId ?? '00000000-0000-4000-8000-000000000001';
  line.poLineId =
    'poLineId' in overrides
      ? (overrides.poLineId ?? null)
      : '00000000-0000-4000-8000-00000000ff01';
  line.productId =
    overrides.productId ?? '00000000-0000-4000-8000-00000000a001';
  line.qtyReceivedActual = overrides.qtyReceivedActual ?? 12;
  line.unitPriceActual = overrides.unitPriceActual ?? 4.5;
  line.lotIdCreated =
    overrides.lotIdCreated ?? '00000000-0000-4000-8000-00000000b001';
  line.expiresAtOverride = overrides.expiresAtOverride ?? null;
  line.createdAt = overrides.createdAt ?? new Date('2026-05-18T08:00:00Z');
  line.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T08:00:00Z');
  return line;
}

function makeQuery(overrides: Partial<GrListQueryDto> = {}): GrListQueryDto {
  return { organizationId: ORG, ...overrides } as GrListQueryDto;
}

function makeDetailQuery(
  overrides: Partial<GrDetailQueryDto> = {},
): GrDetailQueryDto {
  return { organizationId: ORG, ...overrides } as GrDetailQueryDto;
}

function makeDetailParams(
  overrides: Partial<GrDetailParamsDto> = {},
): GrDetailParamsDto {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000001',
  } as GrDetailParamsDto;
}

describe('GrController (Sprint 4 W3-2 — j11 dock drawer surface)', () => {
  let controller: GrController;
  let findRecentMock: jest.Mock;
  let findByIdMock: jest.Mock;
  let findByGrMock: jest.Mock;

  beforeEach(() => {
    findRecentMock = jest.fn();
    findByIdMock = jest.fn();
    findByGrMock = jest.fn();
    const headerRepo = {
      findRecent: findRecentMock,
      findById: findByIdMock,
    };
    const lineRepo = { findByGr: findByGrMock };
    controller = new GrController(headerRepo as never, lineRepo as never);
  });

  describe('list', () => {
    it('returns empty list when repository has no recent GRs', async () => {
      findRecentMock.mockResolvedValue([]);
      const result = await controller.list(makeQuery());
      expect(result).toEqual({ items: [], total: 0 });
      expect(findRecentMock).toHaveBeenCalledWith(ORG, 50, 0);
    });

    it('maps GR rows to DTO with ISO timestamps + Hermes provenance', async () => {
      findRecentMock.mockResolvedValue([
        makeGr({ sourcePhotoIngestionId: '00000000-0000-4000-8000-00000000c001' }),
      ]);
      const result = await controller.list(makeQuery());
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        id: '00000000-0000-4000-8000-000000000001',
        poId: '00000000-0000-4000-8000-00000000aaaa',
        state: 'confirmed',
        requiresReview: false,
        receivedAt: '2026-05-18T08:00:00.000Z',
        createdAt: '2026-05-18T08:00:00.000Z',
        sourcePhotoIngestionId: '00000000-0000-4000-8000-00000000c001',
      });
    });

    it('passes through organizationId from query DTO (multi-tenant gate)', async () => {
      findRecentMock.mockResolvedValue([]);
      const otherOrg = '22222222-2222-4222-8222-222222222222';
      await controller.list(makeQuery({ organizationId: otherOrg }));
      expect(findRecentMock).toHaveBeenCalledWith(otherOrg, 50, 0);
    });

    it('exposes nullable poId / supplierInvoiceRef / sourcePhotoIngestionId as nulls', async () => {
      findRecentMock.mockResolvedValue([
        makeGr({ poId: null, supplierInvoiceRef: null, sourcePhotoIngestionId: null }),
      ]);
      const result = await controller.list(makeQuery());
      expect(result.items[0].poId).toBeNull();
      expect(result.items[0].supplierInvoiceRef).toBeNull();
      expect(result.items[0].sourcePhotoIngestionId).toBeNull();
    });
  });

  describe('detail', () => {
    it('returns header + lines for a valid id (multi-tenant gated)', async () => {
      findByIdMock.mockResolvedValue(makeGr());
      findByGrMock.mockResolvedValue([
        makeLine(),
        makeLine({
          id: '00000000-0000-4000-8000-00000000ee02',
          poLineId: '00000000-0000-4000-8000-00000000ff02',
          qtyReceivedActual: 5,
          unitPriceActual: 1.25,
          expiresAtOverride: new Date('2026-06-10T00:00:00Z'),
        }),
      ]);

      const result = await controller.detail(makeDetailParams(), makeDetailQuery());

      expect(findByIdMock).toHaveBeenCalledWith(
        ORG,
        '00000000-0000-4000-8000-000000000001',
      );
      expect(findByGrMock).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
      );
      expect(result.id).toBe('00000000-0000-4000-8000-000000000001');
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toMatchObject({
        productId: '00000000-0000-4000-8000-00000000a001',
        qtyReceivedActual: 12,
        unitPriceActual: 4.5,
        expiresAtOverride: null,
      });
      expect(result.lines[1].expiresAtOverride).toBe('2026-06-10T00:00:00.000Z');
    });

    it('throws NotFoundException when the GR does not exist for the tenant', async () => {
      findByIdMock.mockResolvedValue(null);
      await expect(
        controller.detail(makeDetailParams(), makeDetailQuery()),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Detail must NOT call into the line repo when the header lookup
      // missed — otherwise we leak existence of lines whose parent we
      // refused to acknowledge.
      expect(findByGrMock).not.toHaveBeenCalled();
    });

    it('surfaces Hermes provenance on detail payload too', async () => {
      findByIdMock.mockResolvedValue(
        makeGr({ sourcePhotoIngestionId: '00000000-0000-4000-8000-00000000c001' }),
      );
      findByGrMock.mockResolvedValue([]);
      const result = await controller.detail(
        makeDetailParams(),
        makeDetailQuery(),
      );
      expect(result.sourcePhotoIngestionId).toBe(
        '00000000-0000-4000-8000-00000000c001',
      );
      expect(result.lines).toEqual([]);
    });
  });
});
