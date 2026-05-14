import { daysUntilEmpty, projectMonthEndSpend } from './burn-rate';

describe('burn-rate domain functions', () => {
  describe('projectMonthEndSpend', () => {
    it('linearly extrapolates from partial-month data', () => {
      expect(
        projectMonthEndSpend({ currentSpend: 60, daysIntoMonth: 15, daysInMonth: 31 }),
      ).toBeCloseTo(124);
    });

    it('returns zero when daysIntoMonth is zero (defensive)', () => {
      expect(
        projectMonthEndSpend({ currentSpend: 100, daysIntoMonth: 0, daysInMonth: 31 }),
      ).toBe(0);
    });

    it('returns zero when daysIntoMonth is negative (defensive)', () => {
      expect(
        projectMonthEndSpend({ currentSpend: 100, daysIntoMonth: -1, daysInMonth: 31 }),
      ).toBe(0);
    });

    it('returns zero when daysInMonth is zero (defensive)', () => {
      expect(
        projectMonthEndSpend({ currentSpend: 100, daysIntoMonth: 15, daysInMonth: 0 }),
      ).toBe(0);
    });

    it('handles zero-spend cleanly', () => {
      expect(
        projectMonthEndSpend({ currentSpend: 0, daysIntoMonth: 10, daysInMonth: 30 }),
      ).toBe(0);
    });

    it('day-1 projection multiplies currentSpend by daysInMonth', () => {
      expect(
        projectMonthEndSpend({ currentSpend: 5, daysIntoMonth: 1, daysInMonth: 30 }),
      ).toBe(150);
    });
  });

  describe('daysUntilEmpty', () => {
    it('returns floored days for typical case', () => {
      expect(daysUntilEmpty({ remainingBudget: 50, avgDailySpend: 7 })).toBe(7);
    });

    it('returns 0 when remaining budget is zero', () => {
      expect(daysUntilEmpty({ remainingBudget: 0, avgDailySpend: 5 })).toBe(0);
    });

    it('returns 0 when remaining budget is negative (already over-budget)', () => {
      expect(daysUntilEmpty({ remainingBudget: -10, avgDailySpend: 5 })).toBe(0);
    });

    it('returns null when avgDailySpend is zero (unlimited runway)', () => {
      expect(daysUntilEmpty({ remainingBudget: 100, avgDailySpend: 0 })).toBeNull();
    });

    it('returns null when avgDailySpend is negative (defensive)', () => {
      expect(daysUntilEmpty({ remainingBudget: 100, avgDailySpend: -1 })).toBeNull();
    });

    it('floors partial days (conservative — operator never over-estimates)', () => {
      // 50 / 7 = 7.142… → 7
      expect(daysUntilEmpty({ remainingBudget: 50, avgDailySpend: 7 })).toBe(7);
      // 49 / 7 = 7 exact
      expect(daysUntilEmpty({ remainingBudget: 49, avgDailySpend: 7 })).toBe(7);
      // 48 / 7 = 6.857… → 6
      expect(daysUntilEmpty({ remainingBudget: 48, avgDailySpend: 7 })).toBe(6);
    });
  });
});
