import { Injectable } from '@nestjs/common';
import type { TierCrossedAt } from '../domain/ai-usage-rollup.entity';
import { projectMonthEndSpend, daysUntilEmpty } from '../domain/burn-rate';

/** Threshold per design.md ADR-BURN-RATE-CALCULATOR: projection > budget × 1.2. */
export const FORECAST_OVER_BUDGET_MULTIPLIER = 1.2;

export interface ShouldEmitForecastInput {
  currentSpend: number;
  budgetLimit: number;
  daysIntoMonth: number;
  daysInMonth: number;
  alreadyCrossed: TierCrossedAt;
}

export interface ShouldEmitForecastResult {
  emit: boolean;
  projectedEom: number | null;
}

/**
 * Thin service wrapping the pure `projectMonthEndSpend` / `daysUntilEmpty`
 * helpers from `domain/burn-rate.ts`. The forecast emission rule lives here
 * (NOT in the pure domain module) because the rule combines projection +
 * the per-period idempotency gate (`alreadyCrossed.forecast`).
 *
 * Per design.md ADR-BURN-RATE-CALCULATOR: emit a `forecast`-tier event
 * when `projectedEom > budgetLimit × 1.2` AND the forecast hasn't been
 * emitted this period.
 *
 * NULL budget skip is the upstream scheduler's concern (matches the regular
 * tier-evaluation skip path); this service still defends `budgetLimit <= 0`
 * to return `{ emit: false, projectedEom: null }`.
 */
@Injectable()
export class BurnRateCalculator {
  shouldEmitForecast(input: ShouldEmitForecastInput): ShouldEmitForecastResult {
    const { currentSpend, budgetLimit, daysIntoMonth, daysInMonth, alreadyCrossed } = input;

    if (budgetLimit <= 0) {
      return { emit: false, projectedEom: null };
    }
    if (alreadyCrossed.forecast !== undefined) {
      // Already emitted this period — skip.
      const projected = projectMonthEndSpend({ currentSpend, daysIntoMonth, daysInMonth });
      return { emit: false, projectedEom: projected };
    }

    const projected = projectMonthEndSpend({ currentSpend, daysIntoMonth, daysInMonth });
    const overBudget = projected > budgetLimit * FORECAST_OVER_BUDGET_MULTIPLIER;
    return { emit: overBudget, projectedEom: projected };
  }

  /** Re-exposes the pure helper for slice #20's dashboard. */
  daysUntilEmpty(remainingBudget: number, avgDailySpend: number): number | null {
    return daysUntilEmpty({ remainingBudget, avgDailySpend });
  }
}
