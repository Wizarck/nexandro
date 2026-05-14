import {
  Controller,
  Get,
  NotFoundException,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { TraceService } from '../application/trace.service';
import {
  RecallAnchorNotFoundError,
  RecallInvalidAnchorKindError,
} from '../application/trace.errors';
import type { TraceNode } from '../types';
import {
  TraceForwardQueryDto,
  TraceReverseQueryDto,
} from './dto/trace.dto';

/**
 * Recall trace REST surface.
 *
 * RBAC: OWNER + MANAGER only (per ADR-RECALL-RBAC). STAFF rejected at
 * 403 by the global RolesGuard.
 *
 * The controller mirrors the audit-log-browse pattern: `organizationId`
 * is required as a query param and the global multi-tenant guard
 * upstream rejects mismatches against the JWT.
 *
 * Error translation:
 *   - RecallAnchorNotFoundError       → 404 NotFoundException
 *   - RecallInvalidAnchorKindError    → 422 UnprocessableEntityException
 */
@ApiTags('recall')
@Controller('m3/recall/trace')
export class TraceController {
  constructor(private readonly trace: TraceService) {}

  @Get('forward')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Walk the consumption graph FORWARD from a suspect lot — recipes, menu items, service windows.',
  })
  async forward(@Query() query: TraceForwardQueryDto): Promise<TraceNode> {
    try {
      return await this.trace.traceForward(query.organizationId, query.lotId);
    } catch (err) {
      if (err instanceof RecallAnchorNotFoundError) {
        throw new NotFoundException({
          code: err.code,
          message: err.message,
          anchorId: err.anchorId,
          anchorKind: err.anchorKind,
        });
      }
      throw err;
    }
  }

  @Get('reverse')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Walk the consumption graph REVERSE from an anchor — symptom / menu-item / recipe back to originating lots.',
  })
  async reverse(@Query() query: TraceReverseQueryDto): Promise<TraceNode> {
    try {
      return await this.trace.traceReverse(query.organizationId, {
        id: query.anchorId,
        kind: query.anchorKind,
      });
    } catch (err) {
      if (err instanceof RecallInvalidAnchorKindError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
          anchorKind: err.anchorKind,
        });
      }
      if (err instanceof RecallAnchorNotFoundError) {
        throw new NotFoundException({
          code: err.code,
          message: err.message,
          anchorId: err.anchorId,
          anchorKind: err.anchorKind,
        });
      }
      throw err;
    }
  }
}
