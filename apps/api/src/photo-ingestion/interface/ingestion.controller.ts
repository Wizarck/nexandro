import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditEventEnvelope,
  AuditEventType,
} from '../../audit-log/application/types';
import { safeAuditEmit } from '../../shared/audit-emit/safe-audit-emit';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { HitlQueueQuery } from '../application/hitl-queue.query';
import { HitlSignService } from '../application/hitl-sign.service';
import { IngestionItemRepository } from '../application/ingestion-item.repository';
import {
  IngestionService,
  PHOTO_INGESTION_AGGREGATE_TYPE,
} from '../application/ingestion.service';
import { RetroactiveCorrectionService } from '../application/retroactive-correction.service';
import {
  IngestionAlreadySignedError,
  IngestionCorrectionEmptyError,
  IngestionCrossTenantError,
  IngestionItemNotCorrectableError,
  IngestionItemNotFoundError,
  IngestionItemNotSignableError,
  IngestionPhotoNotFoundError,
  IngestionRejectBandFieldMissingError,
} from '../domain/errors';
import type { IngestionItem } from '../domain/ingestion-item.entity';
import type {
  IngestionItemDetail,
  IngestionQueueRow,
  PhotoIngestionField,
} from '../types';
import {
  IngestPhotoDto,
  ListItemsQueryDto,
  ItemDetailQueryDto,
  ReclassifyItemDto,
  RetroactiveCorrectionDto,
  SignItemDto,
} from './dto/ingestion.dto';

/**
 * REST surface for the photo-ingestion BC under `/m3/photo-ingest`.
 *
 * RBAC: `OWNER` + `MANAGER` per j12.md persona. STAFF rejected at 403.
 * Multi-tenant: every endpoint asserts `dto.organizationId === req.user.organizationId`.
 */
@ApiTags('m3-photo-ingest')
@Controller('m3/photo-ingest')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(
    private readonly ingestion: IngestionService,
    private readonly signService: HitlSignService,
    private readonly queue: HitlQueueQuery,
    private readonly repo: IngestionItemRepository,
    private readonly retroactive: RetroactiveCorrectionService,
    private readonly events: EventEmitter2,
  ) {}

  @Post('items')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Trigger vision-LLM extraction + band classification for an uploaded photo (FR28).',
  })
  async ingest(@Body() dto: IngestPhotoDto, @Req() req: Request) {
    const user = requireUser(req);
    assertOrgMatch(user, dto.organizationId);
    try {
      const result = await this.ingestion.ingest(dto.organizationId, {
        photoId: dto.photoId,
        kind: dto.kind,
        capability: dto.capability ?? this.defaultCapability(dto.kind),
      });
      return result;
    } catch (err) {
      if (err instanceof IngestionPhotoNotFoundError) {
        throw new NotFoundException({
          code: 'INGESTION_PHOTO_NOT_FOUND',
          message: err.message,
        });
      }
      throw err;
    }
  }

  @Get('items')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List ingestion items for j12 HITL queue (default status=awaiting_review).',
  })
  async list(@Query() query: ListItemsQueryDto, @Req() req: Request) {
    const user = requireUser(req);
    assertOrgMatch(user, query.organizationId);
    const status = query.status ?? 'awaiting_review';
    const limit = query.limit;
    let rows: IngestionItem[];
    if (status === 'awaiting_review') {
      rows = await this.queue.listAwaitingReview(query.organizationId, {
        limit,
        kind: query.kind,
        actorScope: user.role === 'MANAGER' ? 'manager' : 'owner',
      });
    } else {
      rows = await this.repo.listByStatus(
        query.organizationId,
        status,
        limit ?? 50,
        query.kind,
      );
    }
    return { rows: rows.map((r) => this.toQueueRow(r)) };
  }

  @Get('items/:itemId')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Read a single ingestion item with full payload.' })
  async getItem(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Query() query: ItemDetailQueryDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    assertOrgMatch(user, query.organizationId);
    const row = await this.repo.findById(query.organizationId, itemId);
    if (row === null) {
      throw new NotFoundException({ code: 'INGESTION_ITEM_NOT_FOUND' });
    }
    return { item: this.toItemDetail(row) };
  }

  @Post('items/:itemId/sign')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sign a HITL ingestion item with operator corrections (FR29, FR30).',
  })
  async sign(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: SignItemDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    assertOrgMatch(user, dto.organizationId);
    try {
      const result = await this.signService.sign(dto.organizationId, itemId, {
        fieldCorrections: dto.fieldCorrections as PhotoIngestionField[],
        signedByUserId: user.userId,
      });
      return result;
    } catch (err) {
      if (err instanceof IngestionCrossTenantError) {
        throw new NotFoundException({ code: err.code, message: err.message });
      }
      if (err instanceof IngestionItemNotFoundError) {
        throw new NotFoundException({ code: err.code, message: err.message });
      }
      if (err instanceof IngestionAlreadySignedError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      if (err instanceof IngestionItemNotSignableError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      if (err instanceof IngestionRejectBandFieldMissingError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  }

  @Post('items/:itemId/reclassify')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Trigger a re-extraction + reclassification of an existing item (FR31).',
  })
  async reclassify(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: ReclassifyItemDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    assertOrgMatch(user, dto.organizationId);
    const row = await this.repo.findById(dto.organizationId, itemId);
    if (row === null) {
      throw new NotFoundException({ code: 'INGESTION_ITEM_NOT_FOUND' });
    }
    // v1 reclassify is a thin event-only path: the row is left untouched
    // and a PHOTO_INGESTION_RECLASSIFIED envelope is emitted so downstream
    // can re-trigger extraction. The actual re-run pipeline lands in a
    // followup slice; this surface is wired now so j12 has the contract.
    const envelope: AuditEventEnvelope = {
      organizationId: row.organizationId,
      aggregateType: PHOTO_INGESTION_AGGREGATE_TYPE,
      aggregateId: row.id,
      actorUserId: user.userId,
      actorKind: 'user',
      payloadBefore: { status: row.status },
      payloadAfter: {
        status: row.status,
        reason: dto.reason ?? null,
        triggeredByUserId: user.userId,
      },
    };
    await safeAuditEmit(
      this.events,
      AuditEventType.PHOTO_INGESTION_RECLASSIFIED,
      envelope,
      this.logger,
    );
    return { itemId: row.id, status: row.status, queued: true };
  }

  @Post('items/:itemId/retroactive-correction')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Apply a retroactive correction to a signed photo-ingestion item (M3 hardening H1b).',
  })
  async retroactiveCorrection(
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: RetroactiveCorrectionDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    assertOrgMatch(user, dto.organizationId);
    try {
      return await this.retroactive.apply(dto.organizationId, itemId, {
        fieldCorrections: dto.fieldCorrections as PhotoIngestionField[],
        correctedByUserId: user.userId,
        reason: dto.reason,
      });
    } catch (err) {
      if (err instanceof IngestionCrossTenantError) {
        throw new NotFoundException({ code: err.code });
      }
      if (err instanceof IngestionItemNotCorrectableError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      if (err instanceof IngestionCorrectionEmptyError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  }

  private defaultCapability(kind: 'invoice' | 'product'): string {
    return kind === 'invoice'
      ? 'inventory.ingest-invoice-photo'
      : 'inventory.ingest-product-photo';
  }

  private toQueueRow(r: IngestionItem): IngestionQueueRow {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      photoId: r.photoId,
      overallConfidence: r.overallConfidence,
      createdAt: r.createdAt.toISOString(),
      modelVersion: r.modelVersion,
      promptVersion: r.promptVersion,
    };
  }

  private toItemDetail(r: IngestionItem): IngestionItemDetail {
    return {
      ...this.toQueueRow(r),
      llmExtraction: r.llmExtraction ?? {
        fields: [],
        overallConfidence: 0,
        modelVersion: r.modelVersion,
        promptVersion: r.promptVersion,
      },
      operatorCorrection: r.operatorCorrection,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      signedByUserId: r.signedByUserId,
      correctionsHistory: r.correctionsHistory ?? [],
    };
  }
}

function requireUser(req: Request): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  return user;
}

function assertOrgMatch(
  user: AuthenticatedUserPayload,
  bodyOrgId: string,
): void {
  if (user.organizationId !== bodyOrgId) {
    throw new ForbiddenException({
      code: 'CROSS_ORG_FORBIDDEN',
      message: 'organizationId does not match authenticated org',
    });
  }
}
