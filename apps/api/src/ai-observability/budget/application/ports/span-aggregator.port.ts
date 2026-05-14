/**
 * Per-tick aggregate of AI spend telemetry, computed from OTel span data.
 * Returned by `SpanAggregatorPort.aggregateForPeriod()`.
 */
export interface PeriodSpanAggregate {
  organizationId: string;
  period: string; // YYYY-MM
  totalCostEur: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Trailing-7-day average daily spend (EUR), used by burn-rate calculator. */
  avgDailySpendEur: number;
}

/**
 * Port for span-source aggregation. Decouples `RollupSchedulerService` from
 * the concrete OTel span sink so the scheduler can be unit-tested with a
 * mock and a placeholder can land before slice #20 attaches the real source.
 *
 * Slice #20 (`m3-ai-obs-ui`) will bind a concrete adapter that reads from
 * the OTel exporter sink (collector-side aggregation pipeline). MVP
 * placeholder `PlaceholderSpanAggregator` throws `NotImplementedError` at
 * runtime — the same pattern as slice #5's `INVENTORY_COST_RESOLVER`.
 */
export interface SpanAggregatorPort {
  /**
   * List organizations with at least one observed span in `period`.
   * Enumerated per tick by the scheduler.
   */
  listActiveOrgs(period: string): Promise<string[]>;

  /**
   * Compute the period aggregate for one organization.
   */
  aggregateForPeriod(
    organizationId: string,
    period: string,
  ): Promise<PeriodSpanAggregate>;
}

export const SPAN_AGGREGATOR_PORT = Symbol('SPAN_AGGREGATOR_PORT');
