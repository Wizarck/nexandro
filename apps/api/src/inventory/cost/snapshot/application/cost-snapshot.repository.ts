import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { CostSnapshot } from '../domain/cost-snapshot.entity';
import { CostSnapshotImmutableError } from '../domain/errors';
import {
  SnapshotConsumptionInput,
  SnapshotConsumptionInputSchema,
} from '../types';

/**
 * Append-only multi-tenant repository for {@link CostSnapshot}.
 *
 * Per ADR-SNAPSHOT-IMMUTABLE + REQ-SS-3: every public method takes
 * `organizationId` as the FIRST parameter. There is NO update / delete
 * surface; corrections happen via a NEW row with `strategy='manual'`
 * referencing the same `stock_move_id`. Attempted update / delete throws
 * {@link CostSnapshotImmutableError}.
 *
 * Per REQ-SS-2 the Zod schema validates `append()` inputs BEFORE INSERT.
 *
 * Index usage:
 *  - `findByStockMoveId` → `idx_cost_snapshots_org_move_created`
 *  - `findByProductSince` → `idx_cost_snapshots_org_product_created` (partial)
 *
 * Append-only invariant is also documented as DB operational policy (no
 * triggers; the table is plain). The repository contract is the canonical
 * gate; raw-SQL UPDATE/DELETE bypassing this class is a one-off ops
 * procedure (logged in `docs/runbooks/`).
 */
@Injectable()
export class CostSnapshotRepository {
  constructor(
    @InjectRepository(CostSnapshot)
    private readonly typeormRepo: Repository<CostSnapshot>,
  ) {}

  /**
   * Append a new cost_snapshots row. Validates input via Zod prior to INSERT
   * (REQ-SS-2). Returns the persisted entity.
   *
   * The caller (CostSnapshotService) is responsible for the breakdown
   * sum-of-subtotals invariant (REQ-SS-7) and the idempotency check
   * (REQ-SS-8); the repository is intentionally thin.
   */
  async append(input: SnapshotConsumptionInput): Promise<CostSnapshot> {
    // Zod boundary validation — rejects malformed enum, empty breakdown,
    // missing fields, etc. Throws ZodError when input is malformed.
    SnapshotConsumptionInputSchema.parse(input);

    const entity = new CostSnapshot();
    entity.snapshotId = randomUUID();
    entity.organizationId = input.organization_id;
    entity.stockMoveId = input.stock_move_id;
    entity.lotId = input.lot_id;
    entity.productId = input.product_id;
    entity.strategy = input.strategy;
    entity.qtyConsumed = input.qty_consumed;
    entity.totalCost = input.total_cost;
    entity.breakdown = input.breakdown;
    entity.correlationId = input.correlation_id;
    // `createdAt` is populated by Postgres DEFAULT now() and re-hydrated by
    // TypeORM via @CreateDateColumn on save() RETURNING.

    return this.typeormRepo.save(entity);
  }

  /**
   * Find the most-recent snapshot for a given stock_move_id, gated on
   * organizationId. Returns null when no snapshot exists (or the snapshot
   * belongs to a different tenant — multi-tenant invariant per REQ-SS-5).
   *
   * Uses `idx_cost_snapshots_org_move_created` (org + move + created DESC).
   * When manual corrections exist, this returns the newest one — callers
   * needing the FIFO original must request the full list ordered ASC.
   */
  async findByStockMoveId(
    organizationId: string,
    stockMoveId: string,
  ): Promise<CostSnapshot | null> {
    return this.typeormRepo.findOne({
      where: { organizationId, stockMoveId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find snapshots for a given product within a time window, gated on
   * organizationId. Uses `idx_cost_snapshots_org_product_created` (partial,
   * total_cost > 0).
   *
   * Pagination via limit/offset; default page size matches slice #1 lot
   * repository convention (50 / 0).
   */
  async findByProductSince(
    organizationId: string,
    productId: string,
    since: Date,
    limit = 50,
    offset = 0,
  ): Promise<CostSnapshot[]> {
    return this.typeormRepo.find({
      where: {
        organizationId,
        productId,
        createdAt: MoreThanOrEqual(since),
      },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * The repository SHALL refuse UPDATE operations on existing rows
   * (append-only invariant per ADR-SNAPSHOT-IMMUTABLE). This stub exists to
   * make the intent explicit + so the unit test can assert it throws.
   */
  async update(snapshotId: string, _fields: Partial<CostSnapshot>): Promise<never> {
    throw new CostSnapshotImmutableError(snapshotId);
  }

  /**
   * Same for DELETE: append-only invariant.
   */
  async delete(snapshotId: string): Promise<never> {
    throw new CostSnapshotImmutableError(snapshotId);
  }
}
