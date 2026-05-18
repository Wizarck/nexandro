import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { PurchaseOrderRepository } from '../infrastructure/purchase-order.repository';
import { PurchaseOrder } from '../domain/purchase-order.entity';

/**
 * GET /m3/procurement/po — minimum-viable read surface for the j11
 * Procurement loop (Sprint 3 Block C).
 *
 * RBAC: Owner + Manager only. Staff blocked at 403 by the global
 * `RolesGuard`. Multi-tenant invariant enforced at the repository layer
 * (every WHERE clause gates on `organization_id`).
 *
 * SHELL ONLY — does NOT implement the full j11 surface:
 *   FOLLOWUP — pagination cursor, supplier/state filters, drawer detail
 *   payloads (lines + totals), Hermes pre-fill banner, bulk-action
 *   bodies, Owner approval gate above >€threshold, audit chip
 *   resolution. Spec: docs/ux/j11.md (canonical M3 MVP).
 *
 * For now returns the active-ops POs (sent/partially_received) — the
 * Procurement Manager's primary working surface per j11 §4. List is
 * capped at 50; pagination + filter chips will land in a follow-up
 * slice.
 */
export class PoListQueryDto {
  @IsUUID()
  organizationId!: string;
}

export interface PoListItemResponseDto {
  id: string;
  poNumber: string;
  supplierId: string;
  state: string;
  currency: string;
  total: number;
  expectedDeliveryDate: string | null;
  createdAt: string;
}

export interface PoListResponseDto {
  items: PoListItemResponseDto[];
  total: number;
}

@ApiTags('procurement')
@Controller('m3/procurement/po')
export class PoController {
  constructor(private readonly poRepo: PurchaseOrderRepository) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List active purchase orders for the j11 Procurement shell (read-only MVP).',
  })
  async list(@Query() query: PoListQueryDto): Promise<PoListResponseDto> {
    // FOLLOWUP: replace findActiveOps() with a dedicated "all states"
    // query once the j11 estado filter chip lands. The MVP intentionally
    // surfaces only the working set (sent + partially_received) so the
    // empty state on a fresh org reads "Aún no hay órdenes de compra
    // activas" rather than dumping drafts + closed/cancelled noise.
    const rows = await this.poRepo.findActiveOps(query.organizationId, 50, 0);
    return {
      items: rows.map(toItemDto),
      total: rows.length,
    };
  }
}

function toItemDto(po: PurchaseOrder): PoListItemResponseDto {
  return {
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    state: po.state,
    currency: po.currency,
    total: po.total,
    expectedDeliveryDate: po.expectedDeliveryDate
      ? po.expectedDeliveryDate.toISOString().slice(0, 10)
      : null,
    createdAt: po.createdAt.toISOString(),
  };
}
