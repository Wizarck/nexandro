import type { CostBreakdownEntry } from '../../domain/cost-snapshot.entity';
import type { CostSnapshotStrategy } from '../../domain/cost-snapshot.entity';

/**
 * Cost-resolution input/output port owned by THIS slice.
 *
 * Slice #4 (`m3-inventory-cost-resolver-fifo-fefo`) implements this port via
 * NestJS DI; this slice declares the contract so the subscriber compiles
 * without a forward source-code dependency on #4.
 *
 * Phase-3 reconciliation: when slice #4 lands, its `apps/api/src/cost/domain/
 * types.ts` becomes the canonical CostResolution shape; the subscriber's
 * import switches to that path. Until then this local declaration is the
 * source-of-truth so this slice's typecheck is sibling-merge-order-agnostic
 * (per Wave 2.1 cross-slice typing-cascade lesson).
 */

/**
 * Per-lot contribution returned by the resolver. 1:1 with the JSONB
 * `breakdown` array element shape — the subscriber copies the array
 * straight into the snapshot row.
 */
export type CostResolutionBreakdownEntry = CostBreakdownEntry;

/**
 * Result of resolving "how much does this consumption cost?" against the
 * current (or historical) lot state.
 *
 * `strategy` reflects the resolution method chosen (FIFO default; FEFO when
 * expiry-proximity ranking wins; `manual` for operator-supplied overrides).
 * `remainingLots` is informational only — this slice does not persist it.
 */
export interface CostResolution {
  totalCost: number;
  breakdown: CostResolutionBreakdownEntry[];
  strategy: CostSnapshotStrategy;
  remainingLots: Array<{ lot_id: string; qty_remaining: number }>;
}

/**
 * Input to the resolver. `asOf` allows time-travel cost resolution (slice #4
 * supports it via `lots.received_at <= asOf` filter); the snapshot subscriber
 * always passes the consumption timestamp.
 */
export interface ResolveCostInput {
  organizationId: string;
  productId: string;
  qtyToConsume: number;
  asOf: Date;
}

/**
 * Cost-resolver port. Slice #4 binds an implementation; this slice consumes
 * via DI symbol {@link INVENTORY_COST_RESOLVER}.
 */
export interface InventoryCostResolverPort {
  resolve(input: ResolveCostInput): Promise<CostResolution>;
}

/**
 * DI token. Slice #4 binds the FIFO/FEFO implementation against this symbol;
 * this slice's module imports it with `useExisting` / `useFactory` once #4
 * is in the module graph. During Phase 3 the binding lives in
 * `inventory.module.ts` so the subscriber can be constructed unit-test-side
 * with a manual mock.
 */
export const INVENTORY_COST_RESOLVER = Symbol('INVENTORY_COST_RESOLVER');
