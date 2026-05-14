import { computeLineVat, roundHalfEven } from './po-vat';

describe('roundHalfEven', () => {
  it('rounds halves toward even digits', () => {
    // 0.00005 (one digit beyond scale=4) → 0.0000 (tie, even)
    expect(roundHalfEven(0.00005)).toBe(0);
    // 0.00015 → 0.0002 (tie, round to even = 2)
    expect(roundHalfEven(0.00015)).toBeCloseTo(0.0002, 10);
    // 0.00025 → 0.0002 (tie, round to even = 2)
    expect(roundHalfEven(0.00025)).toBeCloseTo(0.0002, 10);
  });

  it('rounds away from zero for non-tie cases', () => {
    expect(roundHalfEven(1.00009)).toBeCloseTo(1.0001, 10);
    expect(roundHalfEven(1.00001)).toBeCloseTo(1.0, 10);
  });

  it('passes through values already at scale=4', () => {
    expect(roundHalfEven(42.5)).toBeCloseTo(42.5, 10);
    expect(roundHalfEven(0)).toBe(0);
  });

  it('handles non-finite values without throwing', () => {
    expect(roundHalfEven(NaN)).toBeNaN();
    expect(roundHalfEven(Infinity)).toBe(Infinity);
  });
});

describe('computeLineVat', () => {
  it('VAT-exclusive: spec REQ-PO-8 worked example (5 kg @ 8.50 @ 21%)', () => {
    const out = computeLineVat({
      quantityOrdered: 5,
      unitPrice: 8.5,
      vatRate: 0.21,
      vatInclusive: false,
    });
    expect(out.lineSubtotal).toBeCloseTo(42.5, 4);
    expect(out.lineVat).toBeCloseTo(8.925, 4);
    expect(out.lineTotal).toBeCloseTo(51.425, 4);
  });

  it('VAT-inclusive: spec REQ-PO-8 reverse-math worked example', () => {
    const out = computeLineVat({
      quantityOrdered: 5,
      unitPrice: 10.285,
      vatRate: 0.21,
      vatInclusive: true,
    });
    expect(out.lineTotal).toBeCloseTo(51.425, 4);
    expect(out.lineSubtotal).toBeCloseTo(42.5, 3); // ±0.0001 tolerance
    expect(out.lineVat).toBeCloseTo(8.925, 3);
  });

  it('VAT-exclusive: zero VAT rate → vat == 0, subtotal == total', () => {
    const out = computeLineVat({
      quantityOrdered: 3,
      unitPrice: 1.5,
      vatRate: 0,
      vatInclusive: false,
    });
    expect(out.lineSubtotal).toBeCloseTo(4.5, 4);
    expect(out.lineVat).toBe(0);
    expect(out.lineTotal).toBeCloseTo(4.5, 4);
  });

  it('VAT-exclusive: zero unit_price allowed (line_total = 0)', () => {
    const out = computeLineVat({
      quantityOrdered: 2,
      unitPrice: 0,
      vatRate: 0.21,
      vatInclusive: false,
    });
    expect(out.lineSubtotal).toBe(0);
    expect(out.lineVat).toBe(0);
    expect(out.lineTotal).toBe(0);
  });

  it('VAT-inclusive: zero VAT rate → subtotal == total', () => {
    const out = computeLineVat({
      quantityOrdered: 2,
      unitPrice: 5,
      vatRate: 0,
      vatInclusive: true,
    });
    expect(out.lineTotal).toBeCloseTo(10, 4);
    expect(out.lineSubtotal).toBeCloseTo(10, 4);
    expect(out.lineVat).toBe(0);
  });
});
