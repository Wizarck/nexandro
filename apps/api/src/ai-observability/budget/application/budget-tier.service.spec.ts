import { BudgetTierService } from './budget-tier.service';

describe('BudgetTierService.evaluate', () => {
  let svc: BudgetTierService;

  beforeEach(() => {
    svc = new BudgetTierService();
  });

  it('returns empty list when no threshold crossed (49% spent)', () => {
    expect(
      svc.evaluate({ currentSpend: 49, budgetLimit: 100, alreadyCrossed: {} }),
    ).toEqual([]);
  });

  it('crosses info tier at exactly 50%', () => {
    expect(
      svc.evaluate({ currentSpend: 50, budgetLimit: 100, alreadyCrossed: {} }),
    ).toEqual(['info']);
  });

  it('crosses warn tier when info already crossed (75% spent)', () => {
    expect(
      svc.evaluate({
        currentSpend: 75,
        budgetLimit: 100,
        alreadyCrossed: { info: '2026-05-01T10:00:00Z' },
      }),
    ).toEqual(['warn']);
  });

  it('bulk-crosses info+warn+error from cold state at 95%', () => {
    expect(
      svc.evaluate({ currentSpend: 95, budgetLimit: 100, alreadyCrossed: {} }),
    ).toEqual(['info', 'warn', 'error']);
  });

  it('crosses fatal at 110% when info+warn+error already crossed', () => {
    expect(
      svc.evaluate({
        currentSpend: 110,
        budgetLimit: 100,
        alreadyCrossed: {
          info: '2026-05-01T10:00:00Z',
          warn: '2026-05-05T10:00:00Z',
          error: '2026-05-09T10:00:00Z',
        },
      }),
    ).toEqual(['fatal']);
  });

  it('returns empty when ALL tiers already crossed', () => {
    expect(
      svc.evaluate({
        currentSpend: 150,
        budgetLimit: 100,
        alreadyCrossed: {
          info: 'x',
          warn: 'x',
          error: 'x',
          fatal: 'x',
        },
      }),
    ).toEqual([]);
  });

  it('returns empty when budgetLimit is zero', () => {
    expect(
      svc.evaluate({ currentSpend: 50, budgetLimit: 0, alreadyCrossed: {} }),
    ).toEqual([]);
  });

  it('returns empty when budgetLimit is negative (defensive)', () => {
    expect(
      svc.evaluate({ currentSpend: 50, budgetLimit: -1, alreadyCrossed: {} }),
    ).toEqual([]);
  });

  it('returns empty when currentSpend is negative (defensive)', () => {
    expect(
      svc.evaluate({ currentSpend: -10, budgetLimit: 100, alreadyCrossed: {} }),
    ).toEqual([]);
  });

  it('does NOT include forecast tier (separate code path)', () => {
    const result = svc.evaluate({
      currentSpend: 200,
      budgetLimit: 100,
      alreadyCrossed: {},
    });
    expect(result).not.toContain('forecast');
    expect(result).toEqual(['info', 'warn', 'error', 'fatal']);
  });

  it('orders tiers by ascending severity', () => {
    const result = svc.evaluate({
      currentSpend: 95,
      budgetLimit: 100,
      alreadyCrossed: {},
    });
    expect(result).toEqual(['info', 'warn', 'error']);
  });
});
