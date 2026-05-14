import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  INVENTORY_COST_RESOLVER,
  InventoryCostResolverPort,
} from './ports/cost-resolver.port';
import { CostSnapshotService } from './cost-snapshot.service';

/**
 * Channel name emitted by slice #2 (m3-lot-consumption-events) when an
 * outbound stock_move is appended as part of recipe execution. The subscriber
 * listens by this string; if slice #2 lands later, the subscriber stays
 * quiescent until #2 ships an emitter (which is the design intent — Phase 3
 * cross-slice merge order reconciles).
 */
export const LOT_CONSUMED_EVENT = 'inventory.lot-consumed' as const;

/**
 * INLINE LotConsumed payload shape — Phase-3 reconciliation note.
 *
 * Per the cross-slice typing-cascade guidance (Wave 2.1 lesson, codified in
 * the slice #5 brief): slice #2 owns the canonical LotConsumed payload. To
 * keep this slice's typecheck merge-order-agnostic, we redeclare the minimal
 * fields the subscriber needs INLINE. After Phase 3 merges, an import-only
 * rename swaps this for the canonical type without touching runtime
 * behavior.
 */
interface LotConsumedEventPayload {
  organization_id: string;
  stock_move_id: string;
  lot_id: string;
  product_id: string;
  qty_consumed: number;
  consumed_at: string | Date;
  correlation_id?: string | null;
}

/**
 * Bridges the slice #2 LOT_CONSUMED bus channel into the cost-snapshot
 * persistence pipeline.
 *
 * Flow per REQ-SS-1 + REQ-SS-6:
 *  1. Receive {@link LotConsumedEventPayload} from the bus.
 *  2. Determine `correlation_id` — propagate from envelope or generate a
 *     fresh UUID (defensive case, REQ-SS-6).
 *  3. Call the InventoryCostResolverPort (slice #4 implementation) to
 *     compute the {@link CostResolution} for `(org, product, qty, asOf)`.
 *  4. Call {@link CostSnapshotService.snapshotConsumption} to persist + emit.
 *  5. On resolver failure, re-throw so the upstream bus dispatcher logs the
 *     failure (REQ-SS-1 second scenario — no silent failure).
 *
 * The subscriber is constructed by NestJS DI; unit tests instantiate it
 * with a mock resolver + mock service per `cost-snapshot.subscriber.spec.ts`.
 */
@Injectable()
export class CostSnapshotSubscriber {
  private readonly logger = new Logger(CostSnapshotSubscriber.name);

  constructor(
    @Inject(INVENTORY_COST_RESOLVER)
    private readonly resolver: InventoryCostResolverPort,
    private readonly snapshotService: CostSnapshotService,
  ) {}

  @OnEvent(LOT_CONSUMED_EVENT)
  async handleLotConsumed(event: LotConsumedEventPayload): Promise<void> {
    // Defensive correlation_id (REQ-SS-6). When the upstream envelope
    // carries one (active OTel span on the consuming code path), propagate
    // unchanged; otherwise generate fresh + log at info for traceability
    // debugging.
    let correlationId: string;
    if (typeof event.correlation_id === 'string' && event.correlation_id.length > 0) {
      correlationId = event.correlation_id;
    } else {
      correlationId = randomUUID();
      this.logger.log(
        `LOT_CONSUMED envelope missing correlation_id; generated ${correlationId} ` +
          `for stock_move_id=${event.stock_move_id} (REQ-SS-6 defensive path).`,
      );
    }

    const consumedAt =
      event.consumed_at instanceof Date
        ? event.consumed_at
        : new Date(event.consumed_at);

    // Resolver call. On throw, re-raise — the upstream bus dispatcher logs
    // the failure (REQ-SS-1).
    const resolution = await this.resolver.resolve({
      organizationId: event.organization_id,
      productId: event.product_id,
      qtyToConsume: event.qty_consumed,
      asOf: consumedAt,
    });

    // Dominant lot = first breakdown entry. The breakdown is FIFO/FEFO
    // ordered; the dominant lot is the one we predicate on for recall-trace
    // queries.
    const dominantLot = resolution.breakdown[0];
    if (dominantLot === undefined) {
      // Defensive — REQ-SS-2 rejects empty breakdown downstream, but throwing
      // here gives a clearer error chain than waiting for Zod.
      throw new Error(
        `Resolver returned empty breakdown for stock_move_id=${event.stock_move_id}; ` +
          `consumption requires at least one contributing lot.`,
      );
    }

    await this.snapshotService.snapshotConsumption({
      organization_id: event.organization_id,
      stock_move_id: event.stock_move_id,
      lot_id: dominantLot.lot_id,
      product_id: event.product_id,
      strategy: resolution.strategy,
      qty_consumed: event.qty_consumed,
      total_cost: resolution.totalCost,
      breakdown: resolution.breakdown,
      correlation_id: correlationId,
    });
  }
}
