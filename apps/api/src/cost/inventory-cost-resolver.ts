/**
 * InventoryCostResolver — the M2→M3 architectural seam (ADR-011 / design.md §D11).
 *
 * M2 implementation (`PreferredSupplierResolver`) walks `SupplierItem` for the
 * ingredient, picks `isPreferred=true`, returns `costPerBaseUnit` + currency
 * + a source ref. A per-line `sourceOverrideRef` overrides the preferred row.
 *
 * M3 will replace the implementation with a batch-aware resolver via NestJS
 * DI without touching call sites — that is the whole point of pinning the
 * interface in `cost/`, OUTSIDE both `ingredients/` and `suppliers/`.
 */

export type CostSourceKind = 'supplier-item' | 'batch';

export interface CostSource {
  kind: CostSourceKind;
  /** The id of the row that drove the cost (SupplierItem.id in M2, Batch.id in M3). */
  refId: string;
  /** Human-readable label for audit / "what changed?" UIs (e.g. "Distribuidora Levante — 5 kg Box"). */
  displayLabel: string;
}

export interface ResolvedCost {
  /** Cost per single base unit of the ingredient (€/g for WEIGHT, €/ml for VOLUME, €/pcs for UNIT). */
  costPerBaseUnit: number;
  /** ISO 4217 currency code; equals the ingredient's organization.currencyCode. */
  currency: string;
  source: CostSource;
}

export interface ResolveOptions {
  /**
   * Point-in-time lookup. M2 implementations may ignore it (no temporal cost
   * history at the resolver layer). M3 batch-aware resolvers honour it for
   * FIFO/LIFO accounting.
   */
  asOf?: Date;
  /**
   * Optional override id for the cost source — typically the SupplierItem.id
   * captured on `RecipeIngredient.sourceOverrideRef`. When set, resolvers
   * MUST consult the override first and fall back to the preferred row only
   * if the override is missing or no longer valid for this ingredient.
   */
  sourceOverrideRef?: string | null;
}

export interface InventoryCostResolver {
  /**
   * Returns the current cost for an ingredient.
   *
   * Backward-compatible signature: callers can pass a Date for `asOf` (legacy
   * shape) or a `ResolveOptions` object. New code should prefer the object
   * form so override + asOf can be expressed together.
   */
  resolveBaseCost(
    ingredientId: string,
    options?: ResolveOptions | Date,
  ): Promise<ResolvedCost>;
}

export class NoCostSourceError extends Error {
  readonly ingredientId: string;
  constructor(ingredientId: string, detail = '') {
    super(
      `No cost source available for ingredient ${ingredientId}${detail ? `: ${detail}` : ''}`,
    );
    this.name = 'NoCostSourceError';
    this.ingredientId = ingredientId;
  }
}

/**
 * Symbol used as the DI token for `InventoryCostResolver`. Bind the M2
 * implementation against this token in `CostModule` so M2 / M3 swaps stay
 * drop-in.
 */
export const INVENTORY_COST_RESOLVER = Symbol.for('nexandro.InventoryCostResolver');

/** Narrows the legacy Date / new options union into the canonical options shape. */
export function normaliseResolveOptions(
  options: ResolveOptions | Date | undefined,
): ResolveOptions {
  if (options === undefined) return {};
  if (options instanceof Date) return { asOf: options };
  return options;
}
