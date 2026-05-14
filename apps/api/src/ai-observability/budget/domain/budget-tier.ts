import type { TierName } from './ai-usage-rollup.entity';

/**
 * Threshold map per design.md ADR-BUDGET-TIER-LEVELS. Tier names + values
 * match `_bmad-output/planning-artifacts/architecture-m3.md` §ADR-030
 * sub-decision "Budget tier system" verbatim.
 *
 * `forecast` is NOT a threshold-based tier — it is emitted by
 * `BurnRateCalculator` when projected EoM > budget × 1.2 and is excluded
 * from the threshold map.
 */
export const TIER_THRESHOLDS: Readonly<Record<Exclude<TierName, 'forecast'>, number>> = {
  info: 0.5,
  warn: 0.75,
  error: 0.9,
  fatal: 1.0,
};

/**
 * Severity ordering — used by `BudgetTierService.evaluate()` to return
 * newly-crossed tiers in ascending severity. Slice #20's UI may collapse
 * same-tick bulk-cross runs by surfacing only the highest tier.
 */
export const TIER_SEVERITY_ORDER: readonly Exclude<TierName, 'forecast'>[] = [
  'info',
  'warn',
  'error',
  'fatal',
];

/**
 * Pure check: is `currentSpend` at-or-above the tier threshold of
 * `budgetLimit`?
 *
 * Boundary behaviour: `>=`, NOT `>`. 50% exactly trips `info`; 100% exactly
 * trips `fatal`. Matches the architecture's tier-band semantics ("≥ 50% =
 * info", etc).
 *
 * Defensive zero/negative budget: returns false. Callers (BudgetTierService)
 * should short-circuit on `budgetLimit <= 0` BEFORE calling this — but the
 * defensive path keeps this primitive safe to call from anywhere.
 */
export function isAboveThreshold(
  currentSpend: number,
  budgetLimit: number,
  tier: Exclude<TierName, 'forecast'>,
): boolean {
  if (budgetLimit <= 0) return false;
  const threshold = TIER_THRESHOLDS[tier];
  return currentSpend >= budgetLimit * threshold;
}
