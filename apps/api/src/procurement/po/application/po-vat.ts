/**
 * VAT computation helpers per ADR-PO-VAT-MONEY-FIELDS.
 *
 * Money fields persisted as `numeric(18,4)`. JavaScript number is
 * sufficient (numeric(18,4) tops at ~10^14, well within Number.MAX_SAFE_INTEGER
 * once scaled by 10^4). Rounding is half-even (banker's rounding) at 4
 * decimal places to match M2 ADR-015.
 *
 * Two modes:
 *  - `vat_inclusive = false`: `unit_price` is net.
 *      line_subtotal = quantity_ordered * unit_price
 *      line_vat = line_subtotal * vat_rate
 *      line_total = line_subtotal + line_vat
 *  - `vat_inclusive = true`: `unit_price` is gross.
 *      line_total = quantity_ordered * unit_price
 *      line_subtotal = line_total / (1 + vat_rate)
 *      line_vat = line_total - line_subtotal
 */

const SCALE = 4;
const SCALE_MULTIPLIER = 10 ** SCALE;

/**
 * Half-even (banker's) rounding at the configured `SCALE`. Ties round to
 * the nearest even digit (so 0.5 rounds to 0, 1.5 rounds to 2).
 */
export function roundHalfEven(value: number): number {
  if (!Number.isFinite(value)) return value;
  const scaled = value * SCALE_MULTIPLIER;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  // Floating-point arithmetic can yield 0.4999999... or 0.5000000001
  // for what should be an exact half (e.g. 0.00015 * 10000 ≈ 1.4999...).
  // Treat anything within FLOAT_EPSILON of 0.5 as exactly halfway.
  const FLOAT_EPSILON = 1e-9;
  let rounded: number;
  if (Math.abs(diff - 0.5) < FLOAT_EPSILON) {
    // Exactly halfway — round to even.
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else if (diff > 0.5) {
    rounded = floor + 1;
  } else {
    rounded = floor;
  }
  return rounded / SCALE_MULTIPLIER;
}

export interface VatInputs {
  quantityOrdered: number;
  unitPrice: number;
  vatRate: number;
  vatInclusive: boolean;
}

export interface VatOutputs {
  lineSubtotal: number;
  lineVat: number;
  lineTotal: number;
}

export function computeLineVat(input: VatInputs): VatOutputs {
  if (input.vatInclusive) {
    const lineTotal = roundHalfEven(input.quantityOrdered * input.unitPrice);
    const lineSubtotal = roundHalfEven(lineTotal / (1 + input.vatRate));
    const lineVat = roundHalfEven(lineTotal - lineSubtotal);
    return { lineSubtotal, lineVat, lineTotal };
  }
  const lineSubtotal = roundHalfEven(input.quantityOrdered * input.unitPrice);
  const lineVat = roundHalfEven(lineSubtotal * input.vatRate);
  const lineTotal = roundHalfEven(lineSubtotal + lineVat);
  return { lineSubtotal, lineVat, lineTotal };
}
