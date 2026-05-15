import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Lot } from '../../lot/domain/lot.entity';
import { LotRepository } from '../../lot/application/lot.repository';
import { AlertBand } from '../domain/expiry-alerts-fired.entity';
import {
  buildLotExpiryNearEvent,
  LotExpiryNearPayload,
  LOT_EXPIRY_NEAR_CHANNEL,
} from '../domain/events';
import { safeAuditEmit } from '../../../shared/audit-emit/safe-audit-emit';
import { ExpiryDedupWindowConflictError } from '../domain/errors';
import { ExpiryAlertsFiredRepository } from './expiry-alerts-fired.repository';

/**
 * Per-band scan window in hours. T-72h scans lots that expire in
 * (0, 72]h; T-24h scans lots that expire in (0, 24]h. Hard-coded per
 * MVP scope (per-supplier configurability is a deferred follow-up).
 */
const BAND_WINDOWS: Record<AlertBand, number> = {
  't-72h': 72,
  't-24h': 24,
};

/** Order matters: t-72h fires BEFORE t-24h for the same lot (REQ-EX-2). */
const BAND_ORDER: readonly AlertBand[] = ['t-72h', 't-24h'];

/** Dedup lookback window — narrower than 24h so re-labeled lots
 *  become eligible for re-alerting the next operational day (REQ-EX-3). */
const DEDUP_WITHIN_HOURS = 23;

/** Cron-driven scanner that emits `LotExpiryNearEvent` per band per lot.
 *
 * Per ADR-EXPIRY-SCHEDULE-CADENCE: 5-minute tick balances alert
 * freshness vs scan cost. Per ADR-EXPIRY-NO-EMIT-HERE: emits via
 * `EventEmitter2` on `audit.event`; the `@OnEvent` audit-log
 * subscriber registration is deferred to slice #21.
 *
 * Tenancy invariant (REQ-EX-4): the scanner enumerates organizations
 * via `Lot.organizationId` returned by `LotRepository.findByExpiryWindow`;
 * since slice #1's repo gates on org at the WHERE clause, this slice
 * iterates per-org via the orgs surfacing in the scan result set.
 *
 * Scheduler resilience (REQ-EX-7): per-lot exceptions log + skip; the
 * next 5-minute tick re-evaluates. Whole-tick exceptions are caught
 * and logged so the `@Cron` worker does not die.
 *
 * Env flag `OPENTRATTOS_EXPIRY_SCANNER_ENABLED=false` short-circuits
 * the tick (REQ-EX-7 scenario 3).
 */
@Injectable()
export class ExpiryScannerService {
  private readonly logger = new Logger(ExpiryScannerService.name);

  constructor(
    private readonly lots: LotRepository,
    private readonly fired: ExpiryAlertsFiredRepository,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * 5-minute cron tick. Per `@nestjs/schedule`'s default behaviour the
   * decorator catches uncaught exceptions inside the handler; we
   * additionally wrap to log structured fields.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'expiry-scanner' })
  async runTick(): Promise<void> {
    if (process.env.OPENTRATTOS_EXPIRY_SCANNER_ENABLED !== 'true') {
      return;
    }
    try {
      for (const band of BAND_ORDER) {
        await this.scanBand(band);
      }
    } catch (err) {
      this.logger.error(
        `Expiry scanner tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Scan a single band window. Pulls candidate lots, applies dedup
   * filter, records-then-emits per surviving lot. Per-lot exceptions
   * are logged and the loop continues with the next lot (REQ-EX-7).
   */
  async scanBand(band: AlertBand): Promise<void> {
    const withinHours = BAND_WINDOWS[band];
    // Multi-org scan: the per-org enumeration is implicit — the scan
    // query already joins on `organization_id` via Lot. Aggregate the
    // set of distinct orgs from the query result.
    const orgs = await this.discoverActiveOrgs(withinHours);
    for (const organizationId of orgs) {
      let candidates: Lot[];
      try {
        candidates = await this.lots.findByExpiryWindow(
          organizationId,
          withinHours,
        );
      } catch (err) {
        this.logger.error(
          `Scan query failed for org=${organizationId} band=${band}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
        continue;
      }
      for (const lot of candidates) {
        try {
          await this.processLot(lot, band);
        } catch (err) {
          this.logger.error(
            `Per-lot emission failed org=${lot.organizationId} ` +
              `lot=${lot.id} band=${band}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
          // continue with next lot — REQ-EX-7 scenario 1
        }
      }
    }
  }

  /**
   * Per-lot pipeline:
   *  1. dedup check — skip if a fired-log row exists within 23h
   *  2. `recordFired` (commits the dedup row) BEFORE emit so a
   *     post-insert DB failure does not leave an orphan emission
   *     (REQ-EX-7 scenario 2)
   *  3. `emitAsync` on `audit.event` — synchronous emission with
   *     awaited subscribers so test-mode read-after-write sees the
   *     event before assertions (`[[feedback_event_subscriber_int_specs]]`)
   *
   * Race-loser branches (concurrent replica won the dedup INSERT)
   * are caught and logged at debug level; no event emitted.
   */
  private async processLot(lot: Lot, band: AlertBand): Promise<void> {
    if (lot.expiresAt === null) return; // defensive: query already excludes
    const recent = await this.fired.findRecentFor(
      lot.organizationId,
      lot.id,
      band,
      DEDUP_WITHIN_HOURS,
    );
    if (recent !== null) return;

    const firedAt = new Date();
    try {
      await this.fired.recordFired({
        organizationId: lot.organizationId,
        lotId: lot.id,
        alertBand: band,
        expiresAtSnapshot: lot.expiresAt,
        firedAt,
      });
    } catch (err) {
      if (err instanceof ExpiryDedupWindowConflictError) {
        return; // race lost; another replica won this (lot, band)
      }
      throw err;
    }

    const payload: LotExpiryNearPayload = {
      lot_id: lot.id,
      organization_id: lot.organizationId,
      location_id: lot.locationId,
      supplier_id: lot.supplierId,
      expires_at: lot.expiresAt.toISOString(),
      expires_at_snapshot_taken_at: firedAt.toISOString(),
      alert_band: band,
      hours_until_expiry: this.hoursUntil(lot.expiresAt, firedAt),
      quantity_remaining: lot.quantityRemaining,
      unit: lot.unit,
      ingredient_id: null, // slice #4 wires the join; nullable today
    };
    const envelope = buildLotExpiryNearEvent({
      organizationId: lot.organizationId,
      lotId: lot.id,
      payload,
    });
    await safeAuditEmit(
      this.events,
      LOT_EXPIRY_NEAR_CHANNEL,
      envelope,
      this.logger,
    );
  }

  /**
   * Discover the set of organizations with at least one in-band lot
   * by running a single tenant-agnostic projection. The result is the
   * distinct set of `organization_id` returned by the scan window;
   * each org is then queried independently to respect the tenancy
   * gate at the repo level.
   *
   * Implementation note: we delegate to `LotRepository.findByExpiryWindow`
   * with a sentinel `'__discover__'` org-id which the repo intentionally
   * does not satisfy. Instead, we use a lightweight raw query via the
   * TypeORM repository for the discovery step. This keeps the per-org
   * scan signature exactly as REQ-EX-4 requires.
   */
  private async discoverActiveOrgs(withinHours: number): Promise<string[]> {
    // Reuse the repo's underlying entity manager via a method
    // exposed on slice #1's repo. We use the typeorm query builder
    // through a public accessor; if none exists, fall back to a no-op
    // scan (the per-org loop becomes empty). For the unit test path
    // this method is overridden via mocks.
    const result = await this.lots.findDistinctOrgsWithExpiryIn(withinHours);
    return result;
  }

  private hoursUntil(expiresAt: Date, now: Date): number {
    const diffMs = expiresAt.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (3600 * 1000));
    if (hours < 0) return 0;
    if (hours > 72) return 72;
    return hours;
  }
}
