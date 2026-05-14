import { Transform, Type } from 'class-transformer';
import {
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
import {
  ALL_INCIDENT_SEARCH_KINDS,
  INCIDENT_SEARCH_DEFAULT_LIMIT,
  INCIDENT_SEARCH_MAX_LIMIT,
  IncidentSearchKind,
} from '../../types';

/**
 * Query DTO for `GET /m3/recall/search`. `q` is the operator's free-text
 * anchor; `types` is an optional CSV restricting which anchor sources to
 * query; `limit` caps at 8 per ADR-RECALL-SEARCH-CAP.
 *
 * `organizationId` is required as a query param (matches the M2 audit-log
 * controller pattern); the multi-tenant gate lives at the service +
 * repository layer (every WHERE clause includes `organization_id`).
 */
export class RecallSearchQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MaxLength(200)
  q!: string;

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
  @IsIn(ALL_INCIDENT_SEARCH_KINDS, { each: true })
  types?: IncidentSearchKind[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INCIDENT_SEARCH_MAX_LIMIT)
  limit?: number = INCIDENT_SEARCH_DEFAULT_LIMIT;
}
