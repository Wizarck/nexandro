/**
 * Pure burn-rate functions per design.md ADR-BURN-RATE-CALCULATOR. No DB,
 * no DI, no clock — callers pass derived inputs. Testability + reuse across
 * the scheduler (forecast emission) and slice #20 dashboard (`BudgetStatus
 * Widget` "days until empty" display) is the design constraint.
 */

export interface ProjectMonthEndSpendInput {
  /** Spend accumulated so far this month, in EUR. */
  currentSpend: number;
  /** Days elapsed in the current month (1 on day 1, NOT 0). */
  daysIntoMonth: number;
  /** Total days in the current month (28..31). */
  daysInMonth: number;
}

/**
 * Project month-end spend from partial-month data. Pure arithmetic — no
 * clock, no DB. Defensive against `daysIntoMonth <= 0` (returns 0) so
 * callers can pass values derived from `new Date()` without pre-checks.
 *
 * Method: linear extrapolation `(currentSpend / daysIntoMonth) × daysInMonth`.
 * Per ADR-BURN-RATE-CALCULATOR we deliberately do NOT exponential-smooth or
 * adjust for weekend dips — the trailing-window smoothing happens in the
 * `avgDailySpend` aggregation upstream of `daysUntilEmpty`. The `× 1.2`
 * forecast threshold filters early-month false positives.
 */
export function projectMonthEndSpend(input: ProjectMonthEndSpendInput): number {
  const { currentSpend, daysIntoMonth, daysInMonth } = input;
  if (daysIntoMonth <= 0) return 0;
  if (daysInMonth <= 0) return 0;
  return (currentSpend / daysIntoMonth) * daysInMonth;
}

export interface DaysUntilEmptyInput {
  /** Budget remaining after current spend (= budgetLimit - currentSpend). */
  remainingBudget: number;
  /**
   * Trailing-7-day average daily spend, in EUR. Computed upstream by the
   * scheduler from daily-aggregate OTel span data.
   */
  avgDailySpend: number;
}

/**
 * "Days until the budget runs out" projection.
 *
 *  - Returns 0 when remaining budget is already non-positive (over budget).
 *  - Returns null when `avgDailySpend <= 0` — unlimited runway, semantically
 *    distinct from "0 days left".
 *  - Otherwise `Math.floor(remainingBudget / avgDailySpend)` — conservative
 *    (round-down so operators don't get a false sense of runway).
 */
export function daysUntilEmpty(input: DaysUntilEmptyInput): number | null {
  const { remainingBudget, avgDailySpend } = input;
  if (remainingBudget <= 0) return 0;
  if (avgDailySpend <= 0) return null;
  return Math.floor(remainingBudget / avgDailySpend);
}
