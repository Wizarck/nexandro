import { Injectable } from '@nestjs/common';
import type { TierCrossedAt, TierName } from '../domain/ai-usage-rollup.entity';
import {
  TIER_SEVERITY_ORDER,
  isAboveThreshold,
} from '../domain/budget-tier';

export interface EvaluateInput {
  currentSpend: number;
  budgetLimit: number;
  alreadyCrossed: TierCrossedAt;
}

/**
 * Pure tier-crossing evaluator per design.md ADR-BUDGET-TIER-LEVELS.
 *
 * Returns the list of NEWLY-CROSSED tiers in ascending severity order
 * (info → warn → error → fatal). Tiers in `alreadyCrossed` are filtered
 * out — they have already been emitted in the current period.
 *
 * Defensive short-circuits:
 *  - `budgetLimit <= 0` → returns [] (NULL budget skip handled upstream by
 *    the scheduler; this guard is the second-line defence)
 *  - `currentSpend < 0` → returns [] (defensive; should never happen at
 *    aggregator output)
 *
 * Bulk-cross: a 40% → 95% spike in one tick returns
 * `['info', 'warn', 'error']` — three events fire in the same tick. The
 * scheduler emits them in severity order so slice #20's UI can collapse
 * by surfacing the highest tier in same-tick bulk runs.
 *
 * `forecast` tier is NOT evaluated here — it lives on `BurnRateCalculator
 * Service.shouldEmitForecast()` and emits via the same channel.
 */
@Injectable()
export class BudgetTierService {
  evaluate(input: EvaluateInput): Exclude<TierName, 'forecast'>[] {
    const { currentSpend, budgetLimit, alreadyCrossed } = input;

    if (budgetLimit <= 0) return [];
    if (currentSpend < 0) return [];

    const newlyCrossed: Exclude<TierName, 'forecast'>[] = [];
    for (const tier of TIER_SEVERITY_ORDER) {
      if (alreadyCrossed[tier] !== undefined) {
        // Already crossed this period — skip per ADR-NO-EMIT-DUPLICATE.
        continue;
      }
      if (isAboveThreshold(currentSpend, budgetLimit, tier)) {
        newlyCrossed.push(tier);
      }
    }
    return newlyCrossed;
  }
}
