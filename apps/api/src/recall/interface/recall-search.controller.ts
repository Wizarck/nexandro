import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { IncidentSearchService } from '../application/incident-search.service';
import { IncidentSearchHit } from '../types';
import { RecallSearchQueryDto } from './dto/recall-search-query.dto';

/**
 * GET /m3/recall/search — multi-anchor incident search.
 *
 * RBAC: Owner + Manager only. Staff blocked at 403 by the global
 * `RolesGuard`. Multi-tenant invariant enforced at the service +
 * repository layer (every WHERE clause gates on `organization_id`).
 *
 * Per ADR-028 + ADR-031 + slice #11 m3-incident-search-multi-anchor:
 *  - returns up to 8 hits ranked by recency then symptom-match;
 *  - empty `q` short-circuits to `[]`;
 *  - `types` CSV restricts the anchor sources queried.
 */
@ApiTags('recall')
@Controller('m3/recall')
export class RecallSearchController {
  constructor(private readonly incidentSearch: IncidentSearchService) {}

  @Get('search')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Search candidate lots / suppliers / ingredients / aggregates for a live recall incident.',
  })
  async search(
    @Query() query: RecallSearchQueryDto,
  ): Promise<{ hits: IncidentSearchHit[] }> {
    const hits = await this.incidentSearch.search(
      query.organizationId,
      query.q,
      {
        types: query.types,
        limit: query.limit,
      },
    );
    return { hits };
  }
}
