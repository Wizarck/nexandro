import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { GoodsReceipt } from '../../gr/domain/goods-receipt.entity';
import { PurchaseOrder } from '../../po/domain/purchase-order.entity';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../../shared/guards/roles.guard';
import { ReconciliationService } from '../application/reconciliation.service';
import {
  IllegalReconciliationTransition,
  ReconciliationInvariantError,
  ReconciliationNotFoundError,
} from '../domain/errors';
import {
  DISCREPANCY_TYPES,
  DiscrepancyType,
  RECONCILIATION_STATES,
  Reconciliation,
  ReconciliationState,
} from '../domain/reconciliation.entity';

/**
 * Coerce a query-string value into a string[] for the multi-select filter
 * params. Express's qs parser already turns `?state[]=abierta&state[]=aceptada`
 * into `['abierta','aceptada']`, but a single `?state=abierta` arrives as a
 * scalar. Normalise both into an array (and drop empty strings) so the
 * downstream validator sees a uniform shape.
 */
function toStringArray(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = arr
    .map((v) => (typeof v === 'string' ? v : String(v)))
    .filter((s) => s.length > 0);
  return out.length === 0 ? undefined : out;
}

/**
 * Query DTO for GET /m3/procurement/reconciliation.
 *
 * Default surface (no `state` param) returns ALL states so the j11 tab
 * can render the "abierta" counter alongside the resolved history.
 * `state=abierta` is the explicit default the frontend sends for the
 * tab landing view.
 *
 * Sprint 4 W3-9: adds multi-value `state[]`, `discrepancyType[]`, and
 * `supplierIds[]` filters consumed by the reconciliation filter-chip
 * group. Singular `state` retained for backward compatibility — if both
 * arrive, the array form wins. Each list capped at 16 elements (UI
 * surfaces ≤4 states + ≤4 types + ≤16 suppliers per multi-select).
 */
const RECONCILIATION_FILTER_MAX = 16;

export class ReconciliationListQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsIn(RECONCILIATION_STATES as unknown as string[])
  state?: ReconciliationState;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @ArrayMaxSize(RECONCILIATION_FILTER_MAX)
  @IsIn(RECONCILIATION_STATES as unknown as string[], { each: true })
  states?: ReconciliationState[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @ArrayMaxSize(RECONCILIATION_FILTER_MAX)
  @IsIn(DISCREPANCY_TYPES as unknown as string[], { each: true })
  discrepancyTypes?: DiscrepancyType[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @ArrayMaxSize(RECONCILIATION_FILTER_MAX)
  @IsUUID('4', { each: true })
  supplierIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * Body for POST /m3/procurement/reconciliation/:id/resolve.
 *
 * `state` must be one of the 3 terminal states. `notes` is optional
 * but capped at 1000 chars (operators can be verbose on `nota-credito`
 * supplier-template lookups; service layer caps + DB column is `text`).
 *
 * `organizationId` lives in the body (not the URL) for parity with the
 * GET surface and the other procurement endpoints — the auth layer
 * does NOT yet stamp organizationId from JWT alone.
 */
const RESOLVABLE_STATES: ReadonlyArray<
  Exclude<ReconciliationState, 'abierta'>
> = ['aceptada', 'nota-credito', 'devuelta'];

export class ResolveReconciliationDto {
  @IsUUID()
  organizationId!: string;

  @IsIn(RESOLVABLE_STATES as unknown as string[])
  state!: Exclude<ReconciliationState, 'abierta'>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export interface ReconciliationListItemResponseDto {
  id: string;
  poId: string | null;
  poNumber: string | null;
  grId: string;
  supplierId: string;
  discrepancyType: (typeof DISCREPANCY_TYPES)[number];
  diff: Record<string, unknown>;
  state: ReconciliationState;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface ReconciliationListResponseDto {
  items: ReconciliationListItemResponseDto[];
  total: number;
}

/**
 * Sprint 4 W3-10 — counter chip payload for the j11 ProcurementScreen
 * tabs. One round-trip; each count is independent so a failure in one
 * source does not block the others (e.g. if PO repo throws, the
 * endpoint still returns the recon + gr counts).
 *
 *  - poActive    : PurchaseOrder.state IN ('sent','partially_received')
 *  - grPending   : GoodsReceipt.state = 'draft'
 *  - reconOpen   : Reconciliation.state = 'abierta'
 *
 * Bucket choices mirror the operator's "needs action" surface per
 * docs/ux/j11.md §4-6 — confirmed/closed/resolved rows are NOT counted.
 */
export interface ProcurementCountsResponseDto {
  poActive: number;
  grPending: number;
  reconOpen: number;
}

export class ProcurementCountsQueryDto {
  @IsUUID()
  organizationId!: string;
}

/**
 * REST surface for the j11 Reconciliación tab (docs/ux/j11.md §6).
 *
 * Replaces the placeholder controller shipped in PR #218 (Sprint 3
 * Block C). Two endpoints:
 *
 *  - GET  /m3/procurement/reconciliation?state=abierta&limit=50
 *    Owner + Manager. Lists reconciliations for the org with optional
 *    state filter (defaults to all states; the j11 default tab passes
 *    `state=abierta`).
 *
 *  - POST /m3/procurement/reconciliation/:id/resolve
 *    Owner only. Body: `{ organizationId, state, notes? }`. Moves the
 *    reconciliation to one of the 3 terminal states. Stamps
 *    `resolved_by_user_id` from the authenticated user.
 *
 * Multi-tenant invariant enforced at the repository layer; this
 * controller forwards `organizationId` from the DTO. The
 * `userId` for resolution attribution comes from the authenticated
 * `req.user.userId` (RolesGuard populates `req.user`).
 *
 * Domain errors → HTTP exceptions:
 *   - ReconciliationNotFoundError      → 404
 *   - IllegalReconciliationTransition  → 400
 *   - ReconciliationInvariantError     → 400
 */
@ApiTags('procurement')
@Controller('m3/procurement/reconciliation')
export class ReconciliationController {
  constructor(
    private readonly service: ReconciliationService,
    @InjectRepository(GoodsReceipt)
    private readonly grRepo: Repository<GoodsReceipt>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
  ) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List reconciliations for the j11 Procurement tab (filter by state).',
  })
  async list(
    @Query() query: ReconciliationListQueryDto,
  ): Promise<ReconciliationListResponseDto> {
    // Array `states` filter takes precedence over singular `state` (W3-9).
    // When the operator picks multi-state chips the frontend always uses
    // the array form; the singular surface is retained for the legacy
    // `?state=abierta` default-tab GET only.
    const stateFilter: ReconciliationState | ReconciliationState[] | undefined =
      query.states !== undefined && query.states.length > 0
        ? query.states
        : query.state;
    const rows = await this.service.list(query.organizationId, {
      state: stateFilter,
      discrepancyTypes: query.discrepancyTypes,
      supplierIds: query.supplierIds,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
    return {
      items: rows.map(toItemDto),
      total: rows.length,
    };
  }

  /**
   * Sprint 4 W3-10 — tab-counter aggregator. Three independent COUNT
   * queries run in parallel; the response collapses all three so the
   * j11 ProcurementScreen header only takes one HTTP round-trip.
   *
   * Lives on the reconciliation controller (not a new top-level
   * `procurement.counts` controller) because the reconciliation count
   * is the only one we already had infrastructure for; the PO + GR
   * counts are direct `Repository.count(...)` calls so we do NOT pull
   * GrModule or PoModule into ReconciliationModule. Entities are
   * registered in `ReconciliationModule`'s `TypeOrmModule.forFeature`
   * to side-step the circular-import risk (GrModule already imports
   * ReconciliationModule).
   */
  @Get('counts')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Tab counters for the j11 Procurement shell (PO active · GR pending · Recon open).',
  })
  async counts(
    @Query() query: ProcurementCountsQueryDto,
  ): Promise<ProcurementCountsResponseDto> {
    const [poActive, grPending, reconOpen] = await Promise.all([
      this.poRepo.count({
        where: [
          { organizationId: query.organizationId, state: 'sent' },
          {
            organizationId: query.organizationId,
            state: 'partially_received',
          },
        ],
      }),
      this.grRepo.count({
        where: { organizationId: query.organizationId, state: 'draft' },
      }),
      this.service.countOpen(query.organizationId),
    ]);
    return { poActive, grPending, reconOpen };
  }

  @Post(':id/resolve')
  @Roles('OWNER')
  @ApiOperation({
    summary:
      'Resolve an open reconciliation (Owner only). Terminal target = aceptada | nota-credito | devuelta.',
  })
  async resolve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ResolveReconciliationDto,
    @Req() req: Request,
  ): Promise<ReconciliationListItemResponseDto> {
    const user = requireUser(req);
    try {
      const updated = await this.service.resolve(
        id,
        body.organizationId,
        { state: body.state, notes: body.notes ?? null },
        user.userId,
      );
      return toItemDto(updated);
    } catch (err) {
      if (err instanceof ReconciliationNotFoundError) {
        throw new NotFoundException({ code: err.code, message: err.message });
      }
      if (
        err instanceof IllegalReconciliationTransition ||
        err instanceof ReconciliationInvariantError
      ) {
        throw new BadRequestException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }
}

function requireUser(req: Request): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  return user;
}

function toItemDto(row: Reconciliation): ReconciliationListItemResponseDto {
  return {
    id: row.id,
    poId: row.poId,
    poNumber: row.poNumber,
    grId: row.grId,
    supplierId: row.supplierId,
    discrepancyType: row.discrepancyType,
    diff: row.diff,
    state: row.state,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedByUserId: row.resolvedByUserId,
    resolutionNotes: row.resolutionNotes,
    createdAt: row.createdAt.toISOString(),
  };
}
