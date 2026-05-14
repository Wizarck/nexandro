/**
 * Typed errors for the AI budget BC. Per Wave 2.1+2.2 lessons: each
 * pipeline surfaces a named subclass so the call site can pattern-match
 * without `instanceof Error` brittleness.
 */

export class AiUsageRollupQueryError extends Error {
  readonly organizationId: string;
  readonly period: string;
  readonly cause?: Error;

  constructor(
    message: string,
    organizationId: string,
    period: string,
    cause?: Error,
  ) {
    super(message);
    this.name = 'AiUsageRollupQueryError';
    this.organizationId = organizationId;
    this.period = period;
    this.cause = cause;
  }
}

export class BudgetEvaluationError extends Error {
  readonly organizationId: string;
  readonly cause?: Error;

  constructor(message: string, organizationId: string, cause?: Error) {
    super(message);
    this.name = 'BudgetEvaluationError';
    this.organizationId = organizationId;
    this.cause = cause;
  }
}

/**
 * Raised when the rollup upsert fails AND the LRU cache has no prior entry
 * for the (org, period) key — tier evaluation cannot proceed for this tick.
 * Logged + skipped (the next tick may recover); does NOT propagate to the
 * cron framework.
 */
export class LruCacheUnavailableError extends Error {
  readonly organizationId: string;
  readonly period: string;

  constructor(organizationId: string, period: string) {
    super(
      `LRU cache cold + rollup upsert failed for organizationId=${organizationId} period=${period}; tier evaluation skipped this tick`,
    );
    this.name = 'LruCacheUnavailableError';
    this.organizationId = organizationId;
    this.period = period;
  }
}
