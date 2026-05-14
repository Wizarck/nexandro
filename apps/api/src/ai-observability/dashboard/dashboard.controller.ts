import {
  Controller,
  Get,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ZodSchema } from 'zod';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AiObsQueryService } from './ai-obs-query.service';
import {
  CostByTagResponse,
  FailuresResponse,
  OverviewResponse,
  costByTagQuerySchema,
  failuresQuerySchema,
  overviewQuerySchema,
} from './dto/ai-obs.dto';

/**
 * `GET /m3/ai-obs/*` — read-only Owner+Manager dashboard surface.
 *
 * Per ADR-BACKEND-READ-ONLY (slice #20 m3-ai-obs-ui, Wave 2.4), this
 * controller exposes 3 GET endpoints aggregating slice #19's
 * `ai_usage_rollup` + slice #21's `audit_log`. No mutating verbs; no
 * write paths.
 *
 * Per ADR-OWNER-RBAC, every endpoint is `@Roles('OWNER','MANAGER')`-gated;
 * the global RolesGuard returns 403 to Staff. The global
 * `OrganizationGuard` enforces `organizationId` matches the JWT tenant.
 * The meta-test in `dashboard.controller.spec.ts` introspects every `@Get`
 * to assert the role decorator is present (future-proofs against drive-by
 * additions).
 *
 * Per ADR-OBS-UI-READ-ONLY-NO-AUDIT, dashboard reads do not emit
 * `audit_log` rows.
 */
@ApiTags('ai-observability')
@Controller('m3/ai-obs')
export class DashboardController {
  constructor(private readonly query: AiObsQueryService) {}

  @Get('overview')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Aggregate dashboard payload — 6-core widgets + 4 chrome elements (FR45 + j8 mock).',
  })
  async getOverview(@Query() raw: unknown): Promise<OverviewResponse> {
    const parsed = parseOrThrow(overviewQuerySchema, raw, 'INVALID_OVERVIEW_QUERY');
    return this.query.getOverview(parsed.organizationId, parsed.period);
  }

  @Get('cost-by-tag')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Top-N cost-by-tag drill-down (widget #7, eligia-dashboard cross-pollination, NFR-OBS-10).',
  })
  async getCostByTag(@Query() raw: unknown): Promise<CostByTagResponse> {
    const parsed = parseOrThrow(costByTagQuerySchema, raw, 'INVALID_COST_BY_TAG_QUERY');
    return this.query.getCostByTag(parsed.organizationId, parsed.period);
  }

  @Get('failures')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Top-5 severity-coded failure event types from audit_log (FR45 widget #6).',
  })
  async getFailures(@Query() raw: unknown): Promise<FailuresResponse> {
    const parsed = parseOrThrow(failuresQuerySchema, raw, 'INVALID_FAILURES_QUERY');
    return this.query.getFailures(parsed.organizationId, parsed.range);
  }
}

function parseOrThrow<T>(schema: ZodSchema<T>, value: unknown, code: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new UnprocessableEntityException({
      code,
      details: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
}
