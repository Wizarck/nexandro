import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../../shared/guards/roles.guard';
import { PurchaseOrderRepository } from '../infrastructure/purchase-order.repository';
import { PurchaseOrderLineRepository } from '../infrastructure/purchase-order-line.repository';
import { PoFactory } from '../application/po.factory';
import { PurchaseOrder } from '../domain/purchase-order.entity';
import { PurchaseOrderLine } from '../domain/purchase-order-line.entity';
import {
  InvalidCurrencyCodeError,
  InvalidPoInputError,
  PoMustHaveAtLeastOneLineError,
  SupplierNotFoundError,
} from '../domain/errors';
import { MONEY_UNITS, type MoneyUnit, type PoState } from '../domain/types';

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
/**
 * Optional CSV multi-select param parser shared by supplierIds + state.
 * Per Sprint 4 W3-9 frontend filter chips, the client sends either
 * `?supplierIds=uuid` (single) or `?supplierIds=uuid,uuid` (multi).
 */
function parseCsv(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return undefined;
}

const PO_STATES_FOR_FILTER: ReadonlyArray<PoState> = [
  'draft',
  'sent',
  'partially_received',
  'received',
  'closed',
  'cancelled',
];

export class PoListQueryDto {
  @IsUUID()
  organizationId!: string;

  /**
   * Sprint 4 W3-9 — filter chips. CSV of supplier UUIDs. When set the
   * controller switches off the active-ops default and lists every PO
   * matching the supplier(s) + state filter.
   */
  @IsOptional()
  @Transform(({ value }) => parseCsv(value))
  @IsArray()
  @IsUUID('all', { each: true })
  supplierIds?: string[];

  /**
   * Sprint 4 W3-9 — filter chips. Single state (j11 §4 chip group spec).
   * The frontend chip group is single-select; the backend accepts a CSV
   * for forward compat with multi-select but the current UI only sends one.
   */
  @IsOptional()
  @Transform(({ value }) => parseCsv(value))
  @IsArray()
  @IsIn(PO_STATES_FOR_FILTER as unknown as string[], { each: true })
  state?: string[];

  /**
   * Sprint 4 W3-9 — optional location filter. PO entity does not own a
   * `locationId` column today (delivery location is captured at GR time);
   * accepted here for forward compat + so the frontend can round-trip
   * the chip URL. Currently a no-op at the repository layer.
   */
  @IsOptional()
  @Transform(({ value }) => parseCsv(value))
  @IsArray()
  @IsUUID('all', { each: true })
  locationIds?: string[];
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

export class PoDetailQueryDto {
  @IsUUID()
  organizationId!: string;
}

export interface PoLineResponseDto {
  id: string;
  lineNumber: number;
  ingredientId: string;
  quantityOrdered: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  vatInclusive: boolean;
  lineSubtotal: number;
  lineVat: number;
  lineTotal: number;
}

export interface PoDetailResponseDto extends PoListItemResponseDto {
  subtotal: number;
  vatTotal: number;
  notes: string | null;
  sentAt: string | null;
  closedAt: string | null;
  lines: PoLineResponseDto[];
}

/**
 * Body for POST /m3/procurement/po (Sprint 4 W3-11 — j11 Nueva OC modal).
 *
 * `expectedDeliveryDate` is ISO-8601 date-only (YYYY-MM-DD) per the j11
 * UX wizard step 2. `locationId` is optional UI-only metadata (PO entity
 * has no location column today) — when provided we serialise it into the
 * `notes` field as `Entrega en: {locationId}` so the audit log + drawer
 * surface it without a schema migration.
 */
export class CreatePoLineDto {
  @IsUUID()
  ingredientId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantityOrdered!: number;

  @IsString()
  @IsIn(MONEY_UNITS as unknown as string[])
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vatRate!: number;

  @IsBoolean()
  vatInclusive!: boolean;
}

export class CreatePoDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  supplierId!: string;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsOptional()
  @IsISO8601({ strict: false })
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /**
   * Optional UX-only metadata (j11 wizard step 2). Persisted into `notes`
   * as a structured prefix until the PO entity grows a `locationId` column.
   */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePoLineDto)
  lines!: CreatePoLineDto[];
}

@ApiTags('procurement')
@Controller('m3/procurement/po')
export class PoController {
  constructor(
    private readonly poRepo: PurchaseOrderRepository,
    private readonly lineRepo: PurchaseOrderLineRepository,
    private readonly poFactory: PoFactory,
  ) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List active purchase orders for the j11 Procurement shell (read-only MVP).',
  })
  async list(@Query() query: PoListQueryDto): Promise<PoListResponseDto> {
    const supplierFilter = query.supplierIds ?? [];
    const stateFilter = query.state ?? [];
    const hasFilter = supplierFilter.length > 0 || stateFilter.length > 0;

    // Sprint 4 W3-9 — when a filter chip is active we fall back to the
    // generic findByFilter() query (all states + optional supplier/state
    // narrowing). With no filter we keep the active-ops default so the
    // empty-state copy stays "Aún no hay órdenes de compra activas"
    // rather than dumping drafts + closed/cancelled noise.
    const rows = hasFilter
      ? await this.poRepo.findByFilter(query.organizationId, {
          supplierIds: supplierFilter.length > 0 ? supplierFilter : undefined,
          states:
            stateFilter.length > 0 ? (stateFilter as PoState[]) : undefined,
          limit: 50,
          offset: 0,
        })
      : await this.poRepo.findActiveOps(query.organizationId, 50, 0);
    return {
      items: rows.map(toItemDto),
      total: rows.length,
    };
  }

  /**
   * Create a new draft PurchaseOrder (Sprint 4 W3-11 — j11 Nueva OC modal).
   *
   * Owner-only at the API layer (j11 §4 + spec — "Nueva OC primary CTA
   * RBAC: OWNER"). Returns the full detail DTO so the frontend can pre-warm
   * the drawer query cache.
   *
   * `locationId` is UX-only metadata today: persisted as a `Entrega en:`
   * prefix in `notes` since the PO entity has no location column. The
   * `created_by_user_id` comes from the authenticated session, NOT the body.
   *
   * Domain errors → HTTP exceptions:
   *   - SupplierNotFoundError           → 404
   *   - PoMustHaveAtLeastOneLineError   → 400
   *   - InvalidCurrencyCodeError        → 400
   *   - InvalidPoInputError             → 400
   */
  @Post()
  @Roles('OWNER')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Create a draft purchase order (Owner only, j11 Nueva OC modal).',
  })
  async create(
    @Body() body: CreatePoDto,
    @Req() req: Request,
  ): Promise<PoDetailResponseDto> {
    const user = requireUser(req);

    // Persist locationId as a structured `notes` prefix until the PO
    // entity grows a dedicated column. Operators reading the drawer see
    // `Entrega en: <uuid>` + their own notes below.
    const composedNotes = composeNotesWithLocation(
      body.locationId ?? null,
      body.notes ?? null,
    );

    try {
      const { po, lines } = await this.poFactory.create({
        organizationId: body.organizationId,
        supplierId: body.supplierId,
        createdByUserId: user.userId,
        currency: body.currency,
        expectedDeliveryDate: body.expectedDeliveryDate
          ? new Date(body.expectedDeliveryDate)
          : null,
        notes: composedNotes,
        lines: body.lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantityOrdered: l.quantityOrdered,
          unit: l.unit as MoneyUnit,
          unitPrice: l.unitPrice,
          vatRate: l.vatRate,
          vatInclusive: l.vatInclusive,
        })),
      });
      return toDetailDto(po, lines);
    } catch (err) {
      if (err instanceof SupplierNotFoundError) {
        throw new NotFoundException({ code: err.code, message: err.message });
      }
      if (
        err instanceof PoMustHaveAtLeastOneLineError ||
        err instanceof InvalidCurrencyCodeError ||
        err instanceof InvalidPoInputError
      ) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }

  /**
   * Detail surface for the j11 PO drawer (Sprint 4 W3-1).
   *
   * Returns the PO header + all lines for the drawer's lines table.
   * Multi-tenant gate enforced at the repository layer (both findById and
   * findByPo take organizationId as the first parameter).
   *
   * FOLLOWUP: enrich with supplier display name + address + the audit-log
   * aggregate badge once the j11 audit chip lands. Today the drawer pulls
   * supplier id only; the operator UI can resolve the display name via the
   * suppliers list payload it already holds in cache.
   */
  @Get(':id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Get a single purchase order with its lines (j11 PO detail drawer).',
  })
  async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PoDetailQueryDto,
  ): Promise<PoDetailResponseDto> {
    const po = await this.poRepo.findById(query.organizationId, id);
    if (po === null) {
      throw new NotFoundException(
        `PurchaseOrder ${id} not found for organization ${query.organizationId}.`,
      );
    }
    const lines = await this.lineRepo.findByPo(query.organizationId, id);
    return toDetailDto(po, lines);
  }
}

function requireUser(req: Request): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  return user;
}

/**
 * Compose the `notes` column for a brand-new PO. When the j11 modal
 * wizard captured a location, prefix the operator's free-form notes with
 * `Entrega en: <uuid>` so the audit log + drawer surface it without a
 * dedicated `location_id` column. When neither is set, return null.
 */
export function composeNotesWithLocation(
  locationId: string | null,
  notes: string | null,
): string | null {
  const trimmed = notes?.trim() ?? '';
  if (locationId === null) {
    return trimmed.length > 0 ? trimmed : null;
  }
  const prefix = `Entrega en: ${locationId}`;
  return trimmed.length > 0 ? `${prefix}\n${trimmed}` : prefix;
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

function toLineDto(line: PurchaseOrderLine): PoLineResponseDto {
  return {
    id: line.id,
    lineNumber: line.lineNumber,
    ingredientId: line.ingredientId,
    quantityOrdered: line.quantityOrdered,
    unit: line.unit,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
    vatInclusive: line.vatInclusive,
    lineSubtotal: line.lineSubtotal,
    lineVat: line.lineVat,
    lineTotal: line.lineTotal,
  };
}

function toDetailDto(
  po: PurchaseOrder,
  lines: PurchaseOrderLine[],
): PoDetailResponseDto {
  return {
    ...toItemDto(po),
    subtotal: po.subtotal,
    vatTotal: po.vatTotal,
    notes: po.notes,
    sentAt: po.sentAt ? po.sentAt.toISOString() : null,
    closedAt: po.closedAt ? po.closedAt.toISOString() : null,
    lines: lines.map(toLineDto),
  };
}
