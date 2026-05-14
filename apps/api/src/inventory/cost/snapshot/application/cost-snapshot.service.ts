import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CostSnapshot } from '../domain/cost-snapshot.entity';
import { CostSnapshotBreakdownInvariantError } from '../domain/errors';
import {
  COST_SNAPSHOT_RECORDED_EVENT,
  CostSnapshotRecordedPayload,
  SnapshotConsumptionInput,
} from '../types';
import { CostSnapshotRepository } from './cost-snapshot.repository';

/**
 * Tolerance for the sum-of-subtotals invariant. Per REQ-SS-7 the breakdown
 * sum SHALL match `total_cost` within €0.01. Floating-point error in
 * numeric(18,4) is bounded at ~1e-4 per operation; 0.01 leaves headroom
 * for accumulated rounding across multi-lot splits.
 */
const BREAKDOWN_INVARIANT_TOLERANCE_EUR = 0.01;

/**
 * Service-layer entry-point for persisting cost snapshots.
 *
 * Public surface: {@link snapshotConsumption} — invoked by the subscriber
 * (`cost-snapshot.subscriber.ts`) on every `LOT_CONSUMED` event from
 * slice #2.
 *
 * Responsibilities:
 *  1. Breakdown sum-of-subtotals invariant (REQ-SS-7) — throws
 *     {@link CostSnapshotBreakdownInvariantError} on mismatch above tolerance.
 *  2. Idempotency check (REQ-SS-8) — for non-manual strategies, refuses to
 *     write a duplicate snapshot for the same `stock_move_id`; returns the
 *     existing row and logs at warn. Manual corrections bypass this check
 *     (they are legitimately additional rows for the same stock_move_id).
 *  3. INSERT via {@link CostSnapshotRepository.append}.
 *  4. Emit `COST_SNAPSHOT_RECORDED` on the bus AFTER the INSERT commits
 *     (REQ-SS-1). Slice #21 wires `AuditLogSubscriber.KNOWN_EVENTS` to
 *     produce an `audit_log` row on each emit; until then the emit is a
 *     no-op for audit but downstream listeners (e.g. slice #20 dashboard)
 *     can subscribe directly.
 *
 * Per ADR-SNAPSHOT-NO-EMIT-HERE: this slice does NOT update the audit-log
 * subscriber's KNOWN_EVENTS map. A smoke INT test asserts no `audit_log`
 * row is written end-to-end.
 */
@Injectable()
export class CostSnapshotService {
  private readonly logger = new Logger(CostSnapshotService.name);

  constructor(
    private readonly repository: CostSnapshotRepository,
    private readonly eventBus: EventEmitter2,
  ) {}

  /**
   * Persist a cost snapshot for a consumption event. See class-level
   * docstring for the full responsibility list.
   *
   * Throws {@link CostSnapshotBreakdownInvariantError} when the breakdown
   * sum does not match `total_cost` within €0.01 tolerance.
   */
  async snapshotConsumption(input: SnapshotConsumptionInput): Promise<CostSnapshot> {
    // Invariant: breakdown sum-of-subtotals ≈ total_cost (±€0.01).
    this.assertBreakdownInvariant(input);

    // Idempotency: skip if a non-manual snapshot already exists for this
    // stock_move_id. Manual corrections legitimately produce additional
    // rows for the same stock_move_id (REQ-SS-8).
    if (input.strategy !== 'manual') {
      const existing = await this.repository.findByStockMoveId(
        input.organization_id,
        input.stock_move_id,
      );
      if (existing !== null && existing.strategy !== 'manual') {
        this.logger.warn(
          `Duplicate LOT_CONSUMED for stock_move_id=${input.stock_move_id}; ` +
            `existing snapshot=${existing.snapshotId} strategy=${existing.strategy}; ` +
            `skipping double-insert per REQ-SS-8.`,
        );
        return existing;
      }
    }

    const snapshot = await this.repository.append(input);

    // Bus emit AFTER commit (REQ-SS-1). Per ADR-SNAPSHOT-NO-EMIT-HERE the
    // AuditLogSubscriber doesn't yet listen on this channel; slice #21
    // wires it. Downstream listeners (e.g. slice #20 dashboard) MAY
    // subscribe via EventEmitter2 directly even before slice #21 lands.
    const payload: CostSnapshotRecordedPayload = {
      organizationId: snapshot.organizationId,
      aggregateType: 'cost_snapshot',
      aggregateId: snapshot.snapshotId,
      actorUserId: null, // system-driven by LOT_CONSUMED subscriber
      actorKind: 'system',
      payloadBefore: null,
      payloadAfter: {
        snapshot_id: snapshot.snapshotId,
        organization_id: snapshot.organizationId,
        stock_move_id: snapshot.stockMoveId,
        lot_id: snapshot.lotId,
        product_id: snapshot.productId,
        strategy: snapshot.strategy,
        qty_consumed: snapshot.qtyConsumed,
        total_cost: snapshot.totalCost,
        breakdown: snapshot.breakdown,
        correlation_id: snapshot.correlationId,
        created_at: snapshot.createdAt.toISOString(),
      },
      capabilityUsed: 'inventory.cost-resolve',
    };

    this.eventBus.emit(COST_SNAPSHOT_RECORDED_EVENT, payload);

    return snapshot;
  }

  private assertBreakdownInvariant(input: SnapshotConsumptionInput): void {
    const subtotalSum = input.breakdown.reduce(
      (acc, entry) => acc + entry.subtotal,
      0,
    );
    const delta = Math.abs(input.total_cost - subtotalSum);
    if (delta > BREAKDOWN_INVARIANT_TOLERANCE_EUR) {
      throw new CostSnapshotBreakdownInvariantError(
        input.total_cost,
        subtotalSum,
      );
    }
  }
}
