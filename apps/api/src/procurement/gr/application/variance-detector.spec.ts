import { randomUUID } from 'node:crypto';
import { DEFAULT_VARIANCE_THRESHOLDS, VarianceThresholds } from '../types';
import { detectVariance } from './variance-detector';

describe('detectVariance', () => {
  const poLineId = randomUUID();
  const looseFloor: VarianceThresholds = {
    qty: 0.01,
    price: 0.01,
    absQty: 0,
    absPrice: 0,
  };

  describe('happy paths', () => {
    it('returns none when both qty and price are within threshold', () => {
      const result = detectVariance({
        qtyOrdered: 200,
        unitPriceOrdered: 2.0,
        qtyReceivedActual: 200.5, // 0.25%
        unitPriceActual: 2.005, // 0.25%
        poLineId,
      });
      expect(result.kind).toBe('none');
    });

    it('returns qty when only qty crosses threshold', () => {
      const result = detectVariance(
        {
          qtyOrdered: 200,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 204, // 2% > 1%
          unitPriceActual: 2.005, // 0.25%
          poLineId,
        },
        looseFloor,
      );
      expect(result.kind).toBe('qty');
      expect(result.qtyDeltaPct).toBeCloseTo(0.02, 6);
    });

    it('returns price when only price crosses threshold', () => {
      const result = detectVariance(
        {
          qtyOrdered: 200,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 200.5, // 0.25%
          unitPriceActual: 2.1, // 5%
          poLineId,
        },
        looseFloor,
      );
      expect(result.kind).toBe('price');
      expect(result.priceDeltaPct).toBeCloseTo(0.05, 6);
    });

    it('returns both when qty AND price cross thresholds', () => {
      const result = detectVariance(
        {
          qtyOrdered: 200,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 210, // 5%
          unitPriceActual: 2.1, // 5%
          poLineId,
        },
        looseFloor,
      );
      expect(result.kind).toBe('both');
    });
  });

  describe('boundary at 1.0%', () => {
    it('does NOT trigger at exactly 1% (strict >)', () => {
      // 200 → 202 is exactly 1.0%
      const result = detectVariance(
        {
          qtyOrdered: 200,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 202,
          unitPriceActual: 2.0,
          poLineId,
        },
        looseFloor,
      );
      expect(result.kind).toBe('none');
    });

    it('triggers just past 1% (IEEE 754 fencepost)', () => {
      // 200 → 202.001 is 1.0005%
      const result = detectVariance(
        {
          qtyOrdered: 200,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 202.001,
          unitPriceActual: 2.0,
          poLineId,
        },
        looseFloor,
      );
      expect(result.kind).toBe('qty');
    });
  });

  describe('absolute floor suppression', () => {
    it('suppresses qty variance when abs delta < absQty floor', () => {
      // 3 → 3.05: relative 1.67% > 1% but abs 0.05 < 1.0
      const result = detectVariance(
        {
          qtyOrdered: 3,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 3.05,
          unitPriceActual: 2.0,
          poLineId,
        },
        DEFAULT_VARIANCE_THRESHOLDS,
      );
      expect(result.kind).toBe('none');
    });

    it('suppresses price variance when abs delta < absPrice floor', () => {
      // 0.40 → 0.405: relative 1.25% > 1% but abs 0.005 < 0.10
      const result = detectVariance(
        {
          qtyOrdered: 200,
          unitPriceOrdered: 0.4,
          qtyReceivedActual: 200,
          unitPriceActual: 0.405,
          poLineId,
        },
        DEFAULT_VARIANCE_THRESHOLDS,
      );
      expect(result.kind).toBe('none');
    });

    it('still triggers when both abs floor AND relative pct are crossed', () => {
      // 200 → 220: relative 10% AND abs 20 > 1.0
      const result = detectVariance(
        {
          qtyOrdered: 200,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 220,
          unitPriceActual: 2.0,
          poLineId,
        },
        DEFAULT_VARIANCE_THRESHOLDS,
      );
      expect(result.kind).toBe('qty');
    });
  });

  describe('independent GR short-circuit', () => {
    it('returns none when poLineId is null (independent line)', () => {
      const result = detectVariance({
        qtyOrdered: 100,
        unitPriceOrdered: 2.0,
        qtyReceivedActual: 500, // huge delta
        unitPriceActual: 50.0,
        poLineId: null,
      });
      expect(result.kind).toBe('none');
    });

    it('returns none when qtyOrdered is null (no PO baseline)', () => {
      const result = detectVariance({
        qtyOrdered: null,
        unitPriceOrdered: 2.0,
        qtyReceivedActual: 500,
        unitPriceActual: 50.0,
        poLineId,
      });
      expect(result.kind).toBe('none');
    });

    it('returns none when unitPriceOrdered is null', () => {
      const result = detectVariance({
        qtyOrdered: 200,
        unitPriceOrdered: null,
        qtyReceivedActual: 200,
        unitPriceActual: 50.0,
        poLineId,
      });
      expect(result.kind).toBe('none');
    });
  });

  describe('custom thresholds', () => {
    it('does NOT trigger 3% qty when org override is 5%', () => {
      const result = detectVariance(
        {
          qtyOrdered: 100,
          unitPriceOrdered: 2.0,
          qtyReceivedActual: 103, // 3%
          unitPriceActual: 2.0,
          poLineId,
        },
        { qty: 0.05, price: 0.05, absQty: 0, absPrice: 0 },
      );
      expect(result.kind).toBe('none');
    });
  });

  describe('zero-ordered handling', () => {
    it('returns none when qtyOrdered is 0 (undefined relative delta)', () => {
      const result = detectVariance({
        qtyOrdered: 0,
        unitPriceOrdered: 2.0,
        qtyReceivedActual: 10,
        unitPriceActual: 2.0,
        poLineId,
      });
      expect(result.kind).toBe('none');
    });
  });
});
