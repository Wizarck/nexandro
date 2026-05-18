import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GoodsReceiptLineRepository } from '../application/gr-line.repository';
import { GoodsReceiptRepository } from '../application/gr.repository';
import { GoodsReceipt } from '../domain/goods-receipt.entity';
import { GoodsReceiptLine } from '../domain/goods-receipt-line.entity';

/**
 * GET /m3/procurement/gr — j11 Goods Receipts read surface.
 *
 * RBAC: Owner + Manager only. Staff blocked at 403 by the global
 * `RolesGuard`. Multi-tenant invariant enforced at the repository layer.
 *
 * Sprint 4 Wave 3 W3-2 extends the Sprint 3 shell with:
 *   - `GET /m3/procurement/gr/:id` returning header + lines for the dock
 *     drawer (j11 §5).
 *   - `sourcePhotoIngestionId` surfaced on the list payload so the dock UI
 *     can decide whether to render the `Pre-cargado por Hermes …` eyebrow
 *     without an extra round-trip.
 *
 * STILL DEFERRED (j11 §4-5 followups):
 *   - `POST /m3/procurement/gr/:id/lines/:lineId/confirm` per-line
 *     confirmation. The existing `GrConfirmationService` operates on a
 *     full `CreateGrInput` (new draft → confirmed in one shot). Per-line
 *     confirmation on an existing draft needs new service methods + a
 *     draft-line state model; tracked as Sprint 4 W3-2 backend followup.
 *   - Bulk-confirm CTA `Confirmar todo lo que coincida (N)`.
 *   - Pagination, location filter, pendientes-only default.
 *   - `metadata.source = 'hermes-invoice-photo'` /
 *     `metadata.confidence_band` JSONB column — the entity carries only
 *     `sourcePhotoIngestionId` today; the richer Hermes metadata lands
 *     when the photo-ingestion-routing BC writes through the GR aggregate.
 *
 * Spec: docs/ux/j11.md §4-5.
 */
export class GrListQueryDto {
  @IsUUID()
  organizationId!: string;
}

export class GrDetailQueryDto {
  @IsUUID()
  organizationId!: string;
}

export class GrDetailParamsDto {
  @IsUUID()
  id!: string;
}

export interface GrListItemResponseDto {
  id: string;
  poId: string | null;
  supplierId: string;
  receivedAt: string;
  receivedAtLocationId: string;
  state: string;
  requiresReview: boolean;
  supplierInvoiceRef: string | null;
  sourcePhotoIngestionId: string | null;
  createdAt: string;
}

export interface GrListResponseDto {
  items: GrListItemResponseDto[];
  total: number;
}

export interface GrLineDetailResponseDto {
  id: string;
  grId: string;
  poLineId: string | null;
  productId: string;
  qtyReceivedActual: number;
  unitPriceActual: number;
  lotIdCreated: string | null;
  expiresAtOverride: string | null;
  createdAt: string;
}

export interface GrDetailResponseDto {
  id: string;
  organizationId: string;
  poId: string | null;
  supplierId: string;
  receivedAt: string;
  receivedAtLocationId: string;
  receivingUserId: string;
  supplierInvoiceRef: string | null;
  state: string;
  requiresReview: boolean;
  sourcePhotoIngestionId: string | null;
  createdAt: string;
  updatedAt: string;
  lines: GrLineDetailResponseDto[];
}

@ApiTags('procurement')
@Controller('m3/procurement/gr')
export class GrController {
  constructor(
    private readonly grRepo: GoodsReceiptRepository,
    private readonly grLineRepo: GoodsReceiptLineRepository,
  ) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List recent goods receipts for the j11 Procurement Recepciones tab.',
  })
  async list(@Query() query: GrListQueryDto): Promise<GrListResponseDto> {
    const rows = await this.grRepo.findRecent(query.organizationId, 50, 0);
    return {
      items: rows.map(toItemDto),
      total: rows.length,
    };
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Return one goods receipt with its lines for the j11 dock drawer (Sprint 4 W3-2).',
  })
  async detail(
    @Param() params: GrDetailParamsDto,
    @Query() query: GrDetailQueryDto,
  ): Promise<GrDetailResponseDto> {
    const header = await this.grRepo.findById(query.organizationId, params.id);
    if (header === null) {
      // Cross-tenant lookups land here too (repo gates on org_id), keeping
      // the surface a flat 404 to avoid leaking existence to other tenants.
      throw new NotFoundException(`Goods receipt ${params.id} not found`);
    }
    const lines = await this.grLineRepo.findByGr(header.id);
    return toDetailDto(header, lines);
  }
}

function toItemDto(gr: GoodsReceipt): GrListItemResponseDto {
  return {
    id: gr.id,
    poId: gr.poId,
    supplierId: gr.supplierId,
    receivedAt: gr.receivedAt.toISOString(),
    receivedAtLocationId: gr.receivedAtLocationId,
    state: gr.state,
    requiresReview: gr.requiresReview,
    supplierInvoiceRef: gr.supplierInvoiceRef,
    sourcePhotoIngestionId: gr.sourcePhotoIngestionId,
    createdAt: gr.createdAt.toISOString(),
  };
}

function toDetailDto(
  gr: GoodsReceipt,
  lines: GoodsReceiptLine[],
): GrDetailResponseDto {
  return {
    id: gr.id,
    organizationId: gr.organizationId,
    poId: gr.poId,
    supplierId: gr.supplierId,
    receivedAt: gr.receivedAt.toISOString(),
    receivedAtLocationId: gr.receivedAtLocationId,
    receivingUserId: gr.receivingUserId,
    supplierInvoiceRef: gr.supplierInvoiceRef,
    state: gr.state,
    requiresReview: gr.requiresReview,
    sourcePhotoIngestionId: gr.sourcePhotoIngestionId,
    createdAt: gr.createdAt.toISOString(),
    updatedAt: gr.updatedAt.toISOString(),
    lines: lines.map(toLineDto),
  };
}

function toLineDto(line: GoodsReceiptLine): GrLineDetailResponseDto {
  return {
    id: line.id,
    grId: line.grId,
    poLineId: line.poLineId,
    productId: line.productId,
    qtyReceivedActual: line.qtyReceivedActual,
    unitPriceActual: line.unitPriceActual,
    lotIdCreated: line.lotIdCreated,
    expiresAtOverride: line.expiresAtOverride
      ? line.expiresAtOverride.toISOString()
      : null,
    createdAt: line.createdAt.toISOString(),
  };
}
