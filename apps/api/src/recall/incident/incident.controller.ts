import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { RecallDispatchService } from '../dispatch/recall-dispatch.service';
import { DossierService, DossierRenderError } from '../dossier/dossier.service';
import {
  AddendumValidationError,
  IncidentService,
} from './incident.service';
import {
  AttachAddendumDto,
  DispatchIncidentDto,
  IncidentQueryDto,
  OpenIncidentDto,
  RedispatchIncidentDto,
} from './dto/incident.dto';

/**
 * REST surface for the recall BC.
 *
 * RBAC: `OWNER` + `MANAGER` per j6.md persona + AC-RECALL-4. The global
 * `RolesGuard` enforces. STAFF rejected at 403.
 *
 * Multi-tenant: every endpoint requires `organizationId` in the body /
 * query AND asserts it matches `req.user.organizationId` to prevent
 * cross-org access.
 */
@ApiTags('m3-recall')
@Controller('m3/recall/incidents')
export class IncidentController {
  constructor(
    private readonly incidents: IncidentService,
    private readonly dispatch: RecallDispatchService,
    private readonly dossierService: DossierService,
  ) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a new recall incident' })
  async open(@Body() dto: OpenIncidentDto, @Req() req: Request) {
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    const incident = await this.incidents.openIncident({
      organizationId: dto.organizationId,
      openedByUserId: user.userId,
      lotIds: dto.lotIds,
      locationIds: dto.locationIds,
      recipientList: dto.recipientList,
      reason: dto.reason,
    });
    return {
      incidentId: incident.id,
      incidentCode: incident.incidentCode,
      legalDeadline: incident.legalDeadline,
      status: incident.status,
    };
  }

  @Post(':id/dispatch')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '86-flag dispatch + dossier generation (J6 CTA)' })
  async dispatchIncident(
    @Param('id', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: DispatchIncidentDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    if (dto.recipientList.length === 0) {
      throw new BadRequestException({
        code: 'RECALL_RECIPIENTS_NOT_CONFIGURED',
        message: 'recipientList must contain at least one address',
      });
    }
    const projection = await this.loadProjectionOrThrow(
      dto.organizationId,
      incidentId,
    );
    await this.dispatch.dispatch86Flag({
      organizationId: dto.organizationId,
      incidentId,
      actorUserId: user.userId,
      actorKind: 'user',
      lotIds: dto.lotIds ?? projection.incident.lotIds,
      locationIds: dto.locationIds ?? projection.incident.locationIds,
    });
    const outcome = await this.dispatch.dispatchDossier({
      organizationId: dto.organizationId,
      incidentId,
      actorUserId: user.userId,
      actorKind: 'user',
      dossierInput: {
        organizationId: dto.organizationId,
        incidentId,
        incidentCode: projection.incident.incidentCode,
        openedAt: projection.incident.openedAt,
        legalDeadline: projection.incident.legalDeadline,
        openedByUserName: null,
        lotProvenance: null,
        consumptionChain: null,
      },
      recipientList: dto.recipientList,
      subject: dto.subject,
      bodyText: dto.bodyText,
    });
    return {
      dispatchedAt: new Date().toISOString(),
      incidentStatus: 'dispatched',
      recipientReceipts: outcome.receipts,
      dossierError: outcome.dossierError,
    };
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Get the J7 incident projection' })
  async getIncident(
    @Param('id', new ParseUUIDPipe()) incidentId: string,
    @Query() query: IncidentQueryDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, query.organizationId);
    return this.loadProjectionOrThrow(query.organizationId, incidentId);
  }

  @Get(':id/dossier.pdf')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Stream the regenerated dossier PDF' })
  async downloadDossier(
    @Param('id', new ParseUUIDPipe()) incidentId: string,
    @Query() query: IncidentQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const user = requireUser(req);
    this.assertOrgMatch(user, query.organizationId);
    const projection = await this.loadProjectionOrThrow(
      query.organizationId,
      incidentId,
    );
    try {
      const dossier = await this.dossierService.generate({
        organizationId: query.organizationId,
        incidentId,
        incidentCode: projection.incident.incidentCode,
        openedAt: projection.incident.openedAt,
        legalDeadline: projection.incident.legalDeadline,
        openedByUserName: null,
        lotProvenance: null,
        consumptionChain: null,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="dossier-${projection.incident.incidentCode}.pdf"`,
      );
      return new StreamableFile(Readable.from([dossier.pdfBytes]));
    } catch (err) {
      if (err instanceof DossierRenderError) {
        throw new ServiceUnavailableException({
          code: 'DOSSIER_PDF_RENDER_FAILED',
          fallbackUrl: `/m3/recall/incidents/${incidentId}`,
        });
      }
      throw err;
    }
  }

  @Post(':id/redispatch')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-send the dossier to a subset of recipients' })
  async redispatchIncident(
    @Param('id', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: RedispatchIncidentDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    const projection = await this.loadProjectionOrThrow(
      dto.organizationId,
      incidentId,
    );
    const original =
      projection.recipientReceipts[0]?.deliveredAt ?? projection.incident.openedAt;
    const outcome = await this.dispatch.redispatchDossier({
      organizationId: dto.organizationId,
      incidentId,
      actorUserId: user.userId,
      actorKind: 'user',
      dossierInput: {
        organizationId: dto.organizationId,
        incidentId,
        incidentCode: projection.incident.incidentCode,
        openedAt: projection.incident.openedAt,
        legalDeadline: projection.incident.legalDeadline,
        openedByUserName: null,
        lotProvenance: null,
        consumptionChain: null,
      },
      recipientList: dto.recipientList,
      originalDispatchedAt: original,
    });
    return {
      dispatchedAt: new Date().toISOString(),
      recipientReceipts: outcome.receipts,
      dossierError: outcome.dossierError,
    };
  }

  @Post(':id/addenda')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Attach an immutable addendum' })
  async attachAddendum(
    @Param('id', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: AttachAddendumDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    try {
      const result = await this.incidents.attachAddendum({
        organizationId: dto.organizationId,
        incidentId,
        attachedByUserId: user.userId,
        text: dto.text,
        attachments: dto.attachments,
      });
      return result;
    } catch (err) {
      if (err instanceof AddendumValidationError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  }

  private async loadProjectionOrThrow(
    organizationId: string,
    incidentId: string,
  ) {
    try {
      return await this.incidents.getIncident(organizationId, incidentId);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      if (err instanceof HttpException) throw err;
      throw err;
    }
  }

  private assertOrgMatch(
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
}

function requireUser(req: Request): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  return user;
}
