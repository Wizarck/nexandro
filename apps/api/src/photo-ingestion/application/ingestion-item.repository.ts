import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IngestionItem } from '../domain/ingestion-item.entity';
import type { IngestionItemKind, IngestionItemStatus } from '../types';

/**
 * Multi-tenant repository for {@link IngestionItem}.
 *
 * Per ADR-MULTI-TENANT-GATE: every per-org method takes `organizationId`
 * as the FIRST parameter and includes it in every query.
 */
@Injectable()
export class IngestionItemRepository {
  constructor(
    @InjectRepository(IngestionItem)
    private readonly typeormRepo: Repository<IngestionItem>,
  ) {}

  async findById(
    organizationId: string,
    itemId: string,
  ): Promise<IngestionItem | null> {
    return this.typeormRepo.findOne({
      where: { id: itemId, organizationId },
    });
  }

  async save(item: IngestionItem): Promise<IngestionItem> {
    return this.typeormRepo.save(item);
  }

  /**
   * List items with a specific status for the org, ordered by `created_at
   * DESC`. Drives the j12 HITL queue list.
   */
  async listByStatus(
    organizationId: string,
    status: IngestionItemStatus,
    limit: number,
    kind?: IngestionItemKind,
  ): Promise<IngestionItem[]> {
    const where: Record<string, unknown> = {
      organizationId,
      status,
    };
    if (kind !== undefined) where.kind = kind;
    return this.typeormRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
