import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
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
 * Sprint 4 Wave 3 W3-9 layers `GET /m3/procurement/gr` query params for
 * the dock filter chips: `locationIds` (CSV UUIDs · multi),
 * `state` (UI vocabulary mapped to the canonical `GoodsReceiptState`),
 * `pendingOnly=true` (fast-path equivalent of `state=pendiente`). The
 * dock workflow defaults the UI to `pendingOnly=true` on first paint
 * so this is also the most-hit query shape.
 *
 * STILL DEFERRED (j11 §4-5 followups):
 *   - `POST /m3/procurement/gr/:id/lines/:lineId/confirm` per-line
 *     confirmation. The existing `GrConfirmationService` operates on a
 *     full `CreateGrInput` (new draft → confirmed in one shot). Per-line
 *     confirmation on an existing draft needs new service methods + a
 *     draft-line state model; tracked as Sprint 4 W3-2 backend followup.
 *   - `POST /m3/procurement/gr/bulk-confirm` for the j11 CTA
 *     `Confirmar todo lo que coincida (N)`. Needs the per-line
 *     confirmation seam to operate inside its single transaction;
 *     tracked alongside W3-2.
 *   - Pagination — list is still capped at 50 most-recent rows.
 *   - `metadata.source = 'hermes-invoice-photo'` /
 *     `metadata.confidence_band` JSONB column — the entity carries only
 *     `sourcePhotoIngestionId` today; the richer Hermes metadata lands
 *     when the photo-ingestion-routing BC writes through the GR aggregate.
 *
 * Spec: docs/ux/j11.md §4-5.
 */
/**
 * UI-facing GR estado chips per j11 §5. Mapped to the canonical
 * `GoodsReceiptState` enum (`draft | confirmed | cancelled`):
 *   - `pendiente`  → draft
 *   - `confirmada` → confirmed
 *   - `parcial`    → NO domain mapping today (reserved); returns
 *                    the empty list rather than 400'ing so the dock UI
 *                    can paint the empty state without a special-case.
 *   - `rechazada`  → cancelled
 *
 * The UI-state vocabulary is owned by docs/ux/j11.md and intentionally
 * decoupled from the domain enum so the operator-facing copy can
 * evolve without a column rename.
 */
export const GR_UI_STATES = [
  'pendiente',
  'confirmada',
  'parcial',
  'rechazada',
] as const;
export type GrUiState = (typeof GR_UI_STATES)[number];

export class GrListQueryDto {
  @IsUUID()
  organizationId!: string;

  /**
   * Sprint 4 W3-9 — multi-select location filter. Wire format is
   * comma-separated UUIDs (`locationIds=uuid1,uuid2`); the transformer
   * normalises to a trimmed `string[]`. The repository validates each
   * value as a UUID via the class-validator below to keep injection-
   * safe even on raw `IN (…)` plumbing.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return value as unknown;
  })
  @IsArray()
  @IsUUID('all', { each: true })
  locationIds?: string[];

  /**
   * Sprint 4 W3-9 — UI-state filter. `parcial` is a no-op today (no
   * domain mapping exists yet) but is accepted so the UI chip stays
   * wired without a 400 cycle when the operator clicks it.
   */
  @IsOptional()
  @IsIn(GR_UI_STATES)
  state?: GrUiState;

  /**
   * Sprint 4 W3-9 — fast-path equivalent of `state=pendiente`. The dock
   * tab defaults to this on first paint so the operator lands on the
   * working set without a second round-trip. When BOTH `state` and
   * `pendingOnly` are set, `pendingOnly` wins (matches the UI
   * supersede rule documented in GrTab.tsx).
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  pendingOnly?: boolean;
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
    // Sprint 4 W3-9 — resolve the UI-vocabulary filter into the domain
    // state. `pendingOnly` is the dock fast-path so it wins over an
    // explicit `state` query when both arrive (matches the UI's
    // supersede rule documented in GrTab.tsx).
    const domainState = query.pendingOnly
      ? 'draft'
      : query.state
        ? mapUiStateToDomain(query.state)
        : undefined;

    // Unmapped UI state (today only `parcial`) returns the empty list
    // without a 400 — the UI chip stays wired while the partial-receipt
    // domain state lands.
    if (query.state && domainState === null) {
      return { items: [], total: 0 };
    }

    const rows = await this.grRepo.findRecentFiltered(
      query.organizationId,
      50,
      0,
      {
        locationIds: query.locationIds,
        state: domainState ?? undefined,
      },
    );
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

/**
 * UI-vocabulary → domain state mapper. Returns `null` for known UI
 * states with no domain mapping (today: `parcial`); the caller short-
 * circuits to an empty list so the dock chip stays clickable while
 * the partial-receipt domain state is added.
 */
export function mapUiStateToDomain(
  ui: GrUiState,
): 'draft' | 'confirmed' | 'cancelled' | null {
  switch (ui) {
    case 'pendiente':
      return 'draft';
    case 'confirmada':
      return 'confirmed';
    case 'rechazada':
      return 'cancelled';
    case 'parcial':
      return null;
  }
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
