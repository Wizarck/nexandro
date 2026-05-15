import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  REVIEW_QUEUE_AGGREGATE_TYPES,
  type ReviewQueueAggregateType,
} from '../../application/types';

/**
 * DTOs for the review-queue endpoints
 * (`m3.x-review-queue-backend`).
 */
export class ListReviewQueueQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsEnum(REVIEW_QUEUE_AGGREGATE_TYPES)
  aggregateType?: ReviewQueueAggregateType;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ClearReviewBodyDto {
  @IsUUID()
  organizationId!: string;
}
