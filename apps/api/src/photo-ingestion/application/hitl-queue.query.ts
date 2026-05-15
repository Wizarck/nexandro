import { Injectable } from '@nestjs/common';
import { IngestionItem } from '../domain/ingestion-item.entity';
import type { HitlQueueOptions } from '../types';
import { IngestionItemRepository } from './ingestion-item.repository';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Read surface for the j12 HITL queue list.
 *
 * Per j12 §RBAC + design.md:
 *  - Owner sees all org rows of the requested status.
 *  - Manager sees the same org-scoped projection in v1 (the row has no
 *    `location_id` column yet; full hierarchical scope is M4+).
 */
@Injectable()
export class HitlQueueQuery {
  constructor(private readonly repo: IngestionItemRepository) {}

  /**
   * List rows in `awaiting_review`. The status filter is hard-coded because
   * the j12 queue is the canonical use-case; callers wanting other statuses
   * use the controller's `GET /items?status=…` endpoint.
   */
  async listAwaitingReview(
    organizationId: string,
    opts: HitlQueueOptions = {},
  ): Promise<IngestionItem[]> {
    const limit = this.clampLimit(opts.limit);
    return this.repo.listByStatus(
      organizationId,
      'awaiting_review',
      limit,
      opts.kind,
    );
  }

  private clampLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
      return DEFAULT_LIMIT;
    }
    return Math.min(Math.floor(limit), MAX_LIMIT);
  }
}
