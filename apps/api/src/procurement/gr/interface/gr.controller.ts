import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { GoodsReceiptRepository } from '../application/gr.repository';
import { GoodsReceipt } from '../domain/goods-receipt.entity';

/**
 * GET /m3/procurement/gr — minimum-viable read surface for the j11
 * Goods Receipts tab (Sprint 3 Block C).
 *
 * RBAC: Owner + Manager only. Staff blocked at 403 by the global
 * `RolesGuard`. Multi-tenant invariant enforced at the repository layer.
 *
 * SHELL ONLY — does NOT implement the full j11 GR surface:
 *   FOLLOWUP — pending/confirmed filter chip, line-by-line drawer with
 *   editable quantity / lot / expiry inputs, bulk-confirm CTA "Confirmar
 *   todo lo que coincida (N)", Hermes pre-fill eyebrow ("Pre-cargado por
 *   Hermes desde foto · HH:MM · revisar →"), GR_CONFIRMED audit chip,
 *   tablet-friendly large-tap rows for the receiving dock. Spec:
 *   docs/ux/j11.md §4-5.
 *
 * For now returns the 50 most-recent GRs. Pagination, location filter,
 * and pendientes-only default land in a follow-up slice.
 */
export class GrListQueryDto {
  @IsUUID()
  organizationId!: string;
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
  createdAt: string;
}

export interface GrListResponseDto {
  items: GrListItemResponseDto[];
  total: number;
}

@ApiTags('procurement')
@Controller('m3/procurement/gr')
export class GrController {
  constructor(private readonly grRepo: GoodsReceiptRepository) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List recent goods receipts for the j11 Procurement shell (read-only MVP).',
  })
  async list(@Query() query: GrListQueryDto): Promise<GrListResponseDto> {
    const rows = await this.grRepo.findRecent(query.organizationId, 50, 0);
    return {
      items: rows.map(toItemDto),
      total: rows.length,
    };
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
    createdAt: gr.createdAt.toISOString(),
  };
}
