import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AlertBand,
  ExpiryAlertsFired,
} from '../domain/expiry-alerts-fired.entity';
import {
  ExpiryAlertsFiredImmutableError,
  ExpiryDedupWindowConflictError,
} from '../domain/errors';

export interface RecordFiredInput {
  organizationId: string;
  lotId: string;
  alertBand: AlertBand;
  expiresAtSnapshot: Date;
  firedAt?: Date;
}

/**
 * Append-only repository for {@link ExpiryAlertsFired}.
 *
 * Public surface:
 *  - `recordFired(input)` — INSERT only. Catches unique-constraint
 *    races (concurrent replicas competing for the same `(org, lot,
 *    band)` second-grain key) and re-raises as
 *    `ExpiryDedupWindowConflictError` so the scanner can log + skip.
 *  - `findRecentFor(org, lot, band, withinHours)` — dedup lookup using
 *    `idx_expiry_alerts_fired_dedup`.
 *
 * Mutation paths (update / delete / save) throw
 * `ExpiryAlertsFiredImmutableError` — the log is append-only at the
 * application layer (REQ-EX-3 dedup invariant + audit-trail integrity).
 *
 * Per REQ-EX-4 (multi-tenant isolation): every method takes
 * `organizationId` as the FIRST parameter. TypeScript signatures keep
 * the invariant enforceable at compile time.
 */
@Injectable()
export class ExpiryAlertsFiredRepository {
  private readonly logger = new Logger(ExpiryAlertsFiredRepository.name);

  constructor(
    @InjectRepository(ExpiryAlertsFired)
    private readonly typeormRepo: Repository<ExpiryAlertsFired>,
  ) {}

  /**
   * Insert a fired-log row. Returns the persisted entity. If a duplicate
   * insert races (concurrent replica won the PK) the unique-constraint
   * exception is caught and re-raised as
   * {@link ExpiryDedupWindowConflictError}.
   */
  async recordFired(input: RecordFiredInput): Promise<ExpiryAlertsFired> {
    const row = ExpiryAlertsFired.create({
      organizationId: input.organizationId,
      lotId: input.lotId,
      alertBand: input.alertBand,
      expiresAtSnapshot: input.expiresAtSnapshot,
      firedAt: input.firedAt,
    });
    try {
      return await this.typeormRepo.insert(row).then(() => row);
    } catch (err) {
      // Postgres unique_violation = SQLSTATE 23505. TypeORM surfaces
      // `driverError.code === '23505'`; structurally tolerate variations.
      const errAny = err as { code?: string; driverError?: { code?: string } };
      const sqlState = errAny.driverError?.code ?? errAny.code;
      if (sqlState === '23505') {
        this.logger.debug(
          `Dedup PK race lost for org=${input.organizationId} ` +
            `lot=${input.lotId} band=${input.alertBand}`,
        );
        throw new ExpiryDedupWindowConflictError(input.lotId, input.alertBand);
      }
      throw err;
    }
  }

  /**
   * Return the most-recent fired-log row for the given
   * `(organizationId, lotId, alertBand)` tuple within the last
   * `withinHours` hours, or `null` if none. Uses
   * `idx_expiry_alerts_fired_dedup` (index-only scan for the hot path).
   */
  async findRecentFor(
    organizationId: string,
    lotId: string,
    alertBand: AlertBand,
    withinHours = 23,
  ): Promise<ExpiryAlertsFired | null> {
    const cutoff = new Date(Date.now() - withinHours * 3600 * 1000);
    return this.typeormRepo
      .createQueryBuilder('fired')
      .where('fired.organization_id = :organizationId', { organizationId })
      .andWhere('fired.lot_id = :lotId', { lotId })
      .andWhere('fired.alert_band = :alertBand', { alertBand })
      .andWhere('fired.fired_at > :cutoff', { cutoff })
      .orderBy('fired.fired_at', 'DESC')
      .limit(1)
      .getOne();
  }

  /** Append-only invariant guard — explicit mutation paths refuse. */
  async update(..._args: unknown[]): Promise<never> {
    throw new ExpiryAlertsFiredImmutableError('update');
  }

  /** Append-only invariant guard. */
  async delete(..._args: unknown[]): Promise<never> {
    throw new ExpiryAlertsFiredImmutableError('delete');
  }

  /** Append-only invariant guard. Use `recordFired` instead. */
  async save(..._args: unknown[]): Promise<never> {
    throw new ExpiryAlertsFiredImmutableError('save');
  }
}
