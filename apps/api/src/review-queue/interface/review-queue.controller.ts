import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { ReviewQueueService } from '../application/review-queue.service';
import {
  REVIEW_QUEUE_AGGREGATE_TYPES,
  type ReviewQueueAggregateType,
} from '../application/types';
import {
  ClearReviewBodyDto,
  ListReviewQueueQueryDto,
} from './dto/review-queue.dto';

/**
 * REST surface for the review-queue BC under `/m3/review-queue`
 * (`m3.x-review-queue-backend`).
 *
 * RBAC: `OWNER` + `MANAGER` only. STAFF rejected at 403 by the global
 * roles guard. Multi-tenant: every endpoint asserts the body / query
 * `organizationId` matches the authenticated user's org.
 */
@ApiTags('m3-review-queue')
@Controller('m3/review-queue')
export class ReviewQueueController {
  constructor(private readonly service: ReviewQueueService) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'List Lot + GR rows currently flagged `requires_review=true` for the tenant.',
  })
  async list(
    @Query() query: ListReviewQueueQueryDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    assertOrgMatch(user, query.organizationId);
    return this.service.listFlagged(query.organizationId, {
      aggregateType: query.aggregateType,
      limit: query.limit,
    });
  }

  @Post(':aggregateType/:aggregateId/clear')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Clear `requires_review=true` on a Lot or GR row after manual reconciliation. Idempotent.',
  })
  async clear(
    @Param('aggregateType') aggregateType: string,
    @Param('aggregateId', new ParseUUIDPipe()) aggregateId: string,
    @Body() body: ClearReviewBodyDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    assertOrgMatch(user, body.organizationId);
    if (!isReviewQueueAggregateType(aggregateType)) {
      throw new BadRequestException({
        code: 'REVIEW_QUEUE_BAD_AGGREGATE_TYPE',
        message: `aggregateType must be one of: ${REVIEW_QUEUE_AGGREGATE_TYPES.join(', ')}`,
      });
    }
    return this.service.clearReview(
      body.organizationId,
      aggregateType,
      aggregateId,
      user.userId,
    );
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

function isReviewQueueAggregateType(
  v: string,
): v is ReviewQueueAggregateType {
  return REVIEW_QUEUE_AGGREGATE_TYPES.includes(v as ReviewQueueAggregateType);
}
