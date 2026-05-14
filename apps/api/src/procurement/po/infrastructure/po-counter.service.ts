import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { PoCounter } from '../domain/po-counter.entity';
import { PoNumberAllocationDeadlockError } from '../domain/errors';

/**
 * Per-org monotonic PO-number counter.
 *
 * Per ADR-PO-NUMBER-FORMAT: row-locked via `SELECT ... FOR UPDATE` for
 * monotonic allocation. The flow within a transaction:
 *   1. SELECT next_value FOR UPDATE on (org, year).
 *   2. If no row, INSERT with next_value=2 and return 1.
 *   3. Otherwise UPDATE next_value = next_value + 1 and return the old value.
 *
 * Postgres lock-timeout codes (`55P03` = lock_not_available, `40P01` =
 * deadlock_detected) re-throw as {@link PoNumberAllocationDeadlockError}
 * so callers can decide whether to retry.
 *
 * The service may be called inside an existing transaction (pass `manager`)
 * or it will open its own — `PoFactory` passes its transaction manager so
 * counter increment + PO insert commit atomically.
 */
@Injectable()
export class PoCounterService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Allocate the next counter value for (organizationId, year).
   *
   * @param organizationId - Tenant id.
   * @param year - Calendar year (e.g. 2026).
   * @param manager - Optional EntityManager from an outer transaction.
   *                  If omitted, this service opens its own transaction.
   * @returns the allocated numeric value (1-indexed within the year).
   */
  async allocateNext(
    organizationId: string,
    year: number,
    manager?: EntityManager,
  ): Promise<number> {
    if (manager !== undefined) {
      return this.allocateWithin(manager, organizationId, year);
    }
    return this.dataSource.transaction(async (txn) =>
      this.allocateWithin(txn, organizationId, year),
    );
  }

  private async allocateWithin(
    manager: EntityManager,
    organizationId: string,
    year: number,
  ): Promise<number> {
    try {
      const existing = await manager
        .createQueryBuilder(PoCounter, 'c')
        .setLock('pessimistic_write')
        .where('c.organization_id = :organizationId', { organizationId })
        .andWhere('c.year = :year', { year })
        .getOne();

      if (existing === null) {
        // Claim 1; persist next_value=2 for the next caller.
        await manager.insert(PoCounter, {
          organizationId,
          year,
          nextValue: 2,
        });
        return 1;
      }

      const allocated = existing.nextValue;
      await manager.update(
        PoCounter,
        { organizationId, year },
        { nextValue: allocated + 1 },
      );
      return allocated;
    } catch (err) {
      if (PoCounterService.isLockTimeoutError(err)) {
        throw new PoNumberAllocationDeadlockError(organizationId, year);
      }
      throw err;
    }
  }

  /**
   * Detect Postgres lock-timeout / deadlock SQLSTATE codes. Wrapped as a
   * static method so it can be unit-tested without spinning up a DB.
   */
  private static isLockTimeoutError(err: unknown): boolean {
    if (err instanceof QueryFailedError) {
      const driverErr = (err as unknown as { driverError?: { code?: string } })
        .driverError;
      const code = driverErr?.code;
      // 55P03 = lock_not_available, 40P01 = deadlock_detected
      return code === '55P03' || code === '40P01';
    }
    return false;
  }
}
