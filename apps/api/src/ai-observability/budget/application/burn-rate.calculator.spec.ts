import { BurnRateCalculator } from './burn-rate.calculator';

describe('BurnRateCalculator', () => {
  let svc: BurnRateCalculator;

  beforeEach(() => {
    svc = new BurnRateCalculator();
  });

  describe('shouldEmitForecast', () => {
    it('emits when projection exceeds budget × 1.2', () => {
      // 70 EUR after 10 days → projects to 217 EUR for 31 days. 217 > 100 × 1.2 = 120 → emit
      const result = svc.shouldEmitForecast({
        currentSpend: 70,
        budgetLimit: 100,
        daysIntoMonth: 10,
        daysInMonth: 31,
        alreadyCrossed: {},
      });
      expect(result.emit).toBe(true);
      expect(result.projectedEom).toBeCloseTo(217);
    });

    it('does NOT emit when projection at-or-below 1.2× budget', () => {
      // 60 EUR after 15 days → projects to 124 EUR. 124 > 100 × 1.2 = 120 → emit
      // 50 EUR after 15 days → projects to ~103.33. 103.33 < 120 → no emit
      const result = svc.shouldEmitForecast({
        currentSpend: 50,
        budgetLimit: 100,
        daysIntoMonth: 15,
        daysInMonth: 31,
        alreadyCrossed: {},
      });
      expect(result.emit).toBe(false);
    });

    it('does NOT emit when forecast already crossed this period', () => {
      const result = svc.shouldEmitForecast({
        currentSpend: 200,
        budgetLimit: 100,
        daysIntoMonth: 5,
        daysInMonth: 31,
        alreadyCrossed: { forecast: '2026-05-04T10:00:00Z' },
      });
      expect(result.emit).toBe(false);
    });

    it('returns no-emit when budgetLimit is zero', () => {
      const result = svc.shouldEmitForecast({
        currentSpend: 100,
        budgetLimit: 0,
        daysIntoMonth: 15,
        daysInMonth: 31,
        alreadyCrossed: {},
      });
      expect(result.emit).toBe(false);
      expect(result.projectedEom).toBeNull();
    });

    it('handles first-of-month with daysIntoMonth=1', () => {
      // 5 EUR on day 1 → projects to 5 × 30 = 150 EUR. 150 > 100 × 1.2 = 120 → emit
      const result = svc.shouldEmitForecast({
        currentSpend: 5,
        budgetLimit: 100,
        daysIntoMonth: 1,
        daysInMonth: 30,
        alreadyCrossed: {},
      });
      expect(result.emit).toBe(true);
      expect(result.projectedEom).toBe(150);
    });
  });

  describe('daysUntilEmpty', () => {
    it('delegates to the pure domain function (floored days)', () => {
      expect(svc.daysUntilEmpty(50, 7)).toBe(7);
    });

    it('returns null for zero burn-rate', () => {
      expect(svc.daysUntilEmpty(100, 0)).toBeNull();
    });

    it('returns 0 for non-positive remaining budget', () => {
      expect(svc.daysUntilEmpty(0, 7)).toBe(0);
    });
  });
});
