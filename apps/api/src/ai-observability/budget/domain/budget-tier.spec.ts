import {
  TIER_SEVERITY_ORDER,
  TIER_THRESHOLDS,
  isAboveThreshold,
} from './budget-tier';

describe('budget-tier domain primitives', () => {
  describe('TIER_THRESHOLDS', () => {
    it('matches the architecture artifact ADR-030 verbatim', () => {
      expect(TIER_THRESHOLDS.info).toBe(0.5);
      expect(TIER_THRESHOLDS.warn).toBe(0.75);
      expect(TIER_THRESHOLDS.error).toBe(0.9);
      expect(TIER_THRESHOLDS.fatal).toBe(1.0);
    });
  });

  describe('TIER_SEVERITY_ORDER', () => {
    it('ascends from info to fatal', () => {
      expect(TIER_SEVERITY_ORDER).toEqual(['info', 'warn', 'error', 'fatal']);
    });
  });

  describe('isAboveThreshold', () => {
    it('returns false for currentSpend just below the info threshold', () => {
      expect(isAboveThreshold(49.999, 100, 'info')).toBe(false);
    });

    it('returns true for currentSpend exactly at the info threshold (50%)', () => {
      expect(isAboveThreshold(50, 100, 'info')).toBe(true);
    });

    it('returns true for currentSpend just above the warn threshold', () => {
      expect(isAboveThreshold(75.001, 100, 'warn')).toBe(true);
    });

    it('returns false for currentSpend below the error threshold', () => {
      expect(isAboveThreshold(89.999, 100, 'error')).toBe(false);
    });

    it('returns true for currentSpend exactly at the fatal threshold (100%)', () => {
      expect(isAboveThreshold(100, 100, 'fatal')).toBe(true);
    });

    it('returns true for over-budget currentSpend at fatal', () => {
      expect(isAboveThreshold(150, 100, 'fatal')).toBe(true);
    });

    it('returns false when budgetLimit is zero', () => {
      expect(isAboveThreshold(50, 0, 'info')).toBe(false);
    });

    it('returns false when budgetLimit is negative (defensive)', () => {
      expect(isAboveThreshold(50, -1, 'info')).toBe(false);
    });
  });
});
