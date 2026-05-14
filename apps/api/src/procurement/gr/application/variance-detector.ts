import {
  DEFAULT_VARIANCE_THRESHOLDS,
  VarianceKind,
  VarianceResult,
  VarianceThresholds,
} from '../types';

/**
 * Pure variance detection per ADR-GR-VARIANCE-THRESHOLDS.
 *
 * - Default thresholds: 1% qty + 1% price (relative).
 * - Absolute floor on small qty/price suppresses noisy events
 *   (e.g., 1→2 units is 100% relative but only 1 unit absolute).
 * - Independent-GR short-circuit: no PO line baseline → 'none'.
 */
export interface DetectVarianceInput {
  /** PO line qty_ordered. `null` => independent GR, return 'none'. */
  qtyOrdered: number | null;
  /** PO line unit_price_ordered. `null` => independent GR, return 'none'. */
  unitPriceOrdered: number | null;
  qtyReceivedActual: number;
  unitPriceActual: number;
  /** If the GR line has no po_line_id, force 'none' regardless of baselines. */
  poLineId: string | null;
}

/**
 * Returns the variance classification for a single GR line.
 *
 * Boundary semantics: strict `>` against threshold. So a delta of exactly
 * 1.0% with threshold 0.01 does NOT trigger; 1.0000001% does.
 */
export function detectVariance(
  input: DetectVarianceInput,
  thresholds: VarianceThresholds = DEFAULT_VARIANCE_THRESHOLDS,
): VarianceResult {
  // Independent-GR short-circuit
  if (input.poLineId === null) {
    return { kind: 'none' };
  }
  if (input.qtyOrdered === null || input.unitPriceOrdered === null) {
    return { kind: 'none' };
  }

  const qtyDeltaPct = computeRelativeDelta(
    input.qtyReceivedActual,
    input.qtyOrdered,
  );
  const priceDeltaPct = computeRelativeDelta(
    input.unitPriceActual,
    input.unitPriceOrdered,
  );

  const qtyAbs = Math.abs(input.qtyReceivedActual - input.qtyOrdered);
  const priceAbs = Math.abs(input.unitPriceActual - input.unitPriceOrdered);

  // Absolute-floor suppression: both relative AND absolute must be crossed.
  const qtyTriggered =
    qtyDeltaPct !== null &&
    qtyDeltaPct > thresholds.qty &&
    qtyAbs >= thresholds.absQty;
  const priceTriggered =
    priceDeltaPct !== null &&
    priceDeltaPct > thresholds.price &&
    priceAbs >= thresholds.absPrice;

  let kind: VarianceKind;
  if (qtyTriggered && priceTriggered) kind = 'both';
  else if (qtyTriggered) kind = 'qty';
  else if (priceTriggered) kind = 'price';
  else kind = 'none';

  const result: VarianceResult = { kind };
  if (qtyDeltaPct !== null) result.qtyDeltaPct = qtyDeltaPct;
  if (priceDeltaPct !== null) result.priceDeltaPct = priceDeltaPct;
  return result;
}

/**
 * Returns `|actual - ordered| / ordered`, or `null` if `ordered` is 0
 * (relative delta undefined; the absolute-floor check upstream catches
 * any meaningful drift).
 */
function computeRelativeDelta(actual: number, ordered: number): number | null {
  if (ordered === 0) return null;
  return Math.abs(actual - ordered) / ordered;
}
