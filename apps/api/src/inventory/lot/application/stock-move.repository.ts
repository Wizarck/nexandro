import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockMove } from '../domain/stock-move.entity';
import { StockMoveImmutableError } from '../domain/errors';

/**
 * Append-only multi-tenant repository for {@link StockMove}.
 *
 * Per ADR-LOT-MULTITENANT-AT-REPO: every method takes `organizationId` first.
 * No UPDATE / DELETE methods exposed. Corrections happen via new
 * `adjustment` move rows (slice #2 wires the operator flow for those).
 *
 * `append()` is internal-only — slice #2's consumption-event subscriber and
 * slice #7's GR confirmation flow plug into this method directly.
 */
@Injectable()
export class StockMoveRepository {
  constructor(
    @InjectRepository(StockMove)
    private readonly typeormRepo: Repository<StockMove>,
  ) {}

  /**
   * Find stock-move rows for a given lot, newest-first. Used by recall
   * traversal (slice #11-12) for depletion-history audit.
   */
  async findByLot(
    organizationId: string,
    lotId: string,
    limit = 50,
    offset = 0,
  ): Promise<StockMove[]> {
    return this.typeormRepo.find({
      where: { organizationId, lotId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Internal persistence method. Reserved for slice #2 (consumption events)
   * and slice #7 (GR confirmation inbound moves).
   *
   * Idempotent on `id` — duplicate inserts via the same event handler will
   * throw the database unique-violation; caller decides whether to swallow
   * or surface (slice #2's `@OnEvent` subscriber uses an idempotency key
   * upstream so it never retries with same id).
   */
  async append(move: StockMove): Promise<StockMove> {
    return this.typeormRepo.save(move);
  }

  /**
   * The repository SHALL refuse UPDATE operations on existing rows
   * (append-only invariant per ADR-LOT-SCHEMA). This stub exists to
   * make the intent explicit + so the smoke test can assert it throws.
   */
  async update(stockMoveId: string, _fields: Partial<StockMove>): Promise<never> {
    throw new StockMoveImmutableError(stockMoveId);
  }

  /**
   * Same for DELETE: append-only invariant.
   */
  async delete(stockMoveId: string): Promise<never> {
    throw new StockMoveImmutableError(stockMoveId);
  }
}
