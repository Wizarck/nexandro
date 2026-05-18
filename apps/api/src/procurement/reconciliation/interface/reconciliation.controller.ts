import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Roles } from '../../../shared/decorators/roles.decorator';

/**
 * GET /m3/procurement/reconciliation — placeholder read surface for the
 * j11 Reconciliación tab (Sprint 3 Block C).
 *
 * RBAC: Owner + Manager only.
 *
 * SHELL ONLY — there is NO reconciliation domain yet.
 *   FOLLOWUP — the reconciliation aggregate (discrepancy detection on
 *   GR-vs-PO confirm; rows of {type: cantidad|precio|producto|
 *   lote-no-conforme}; resolution actions Aceptar / Solicitar nota de
 *   crédito / Devolver; supplier-email template links; audit chip per
 *   resolution) has not been implemented in apps/api. The endpoint
 *   returns an empty list so the frontend can render its empty state
 *   ("Aún no hay reconciliaciones · próximamente") without 404-ing.
 *   Spec: docs/ux/j11.md §6.
 */
export class ReconciliationListQueryDto {
  @IsUUID()
  organizationId!: string;
}

export interface ReconciliationListItemResponseDto {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  discrepancyType: 'cantidad' | 'precio' | 'producto' | 'lote-no-conforme';
  diff: string;
  state: 'abierta' | 'aceptada' | 'nota-credito' | 'devuelta';
  createdAt: string;
}

export interface ReconciliationListResponseDto {
  items: ReconciliationListItemResponseDto[];
  total: number;
}

@ApiTags('procurement')
@Controller('m3/procurement/reconciliation')
export class ReconciliationController {
  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List open reconciliation rows for the j11 Procurement shell (placeholder — domain pending).',
  })
  async list(
    _query: ReconciliationListQueryDto,
  ): Promise<ReconciliationListResponseDto> {
    // FOLLOWUP: query the reconciliation aggregate once it exists. For
    // now the endpoint returns an empty list. The query DTO is validated
    // upstream so a missing organizationId still throws 400 — that lets
    // us ship the frontend shell with a real (non-404) endpoint.
    return { items: [], total: 0 };
  }
}
