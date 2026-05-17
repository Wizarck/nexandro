import { z } from 'zod';

/**
 * Zod-validated DTOs for the AI Observability dashboard read endpoints.
 *
 * Per ADR-BACKEND-READ-ONLY (slice #20 m3-ai-obs-ui, Wave 2.4):
 *  - All input shapes are validated at the controller boundary via the
 *    schemas below. The controller calls `.safeParse()` and throws an
 *    `UnprocessableEntityException` on failure.
 *  - All response shapes are typed via `z.infer<typeof ...>` so the
 *    contract is the single source of truth.
 *
 * Per Wave 2.1+ hard rule: NO imports from `@nexandro/contracts` in
 * apps/api. The types stay inline here; the frontend gets its own
 * types in `apps/web/src/m3/ai-obs/api/aiObs.types.ts`.
 *
 * Per Wave 2.1+ hard rule: prefer `.min(1)` over `.nonempty()`.
 */

export const PERIODS = [
  '24h',
  '7d',
  '30d',
  'this_month',
  'last_month',
] as const;
export type Period = (typeof PERIODS)[number];

export const FAILURE_RANGES = ['24h', '7d'] as const;
export type FailureRange = (typeof FAILURE_RANGES)[number];

export const TIERS = ['info', 'warn', 'error', 'fatal'] as const;
export type Tier = (typeof TIERS)[number];

export const SEVERITIES = ['P1', 'P2', 'P3'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CRITICALITIES = ['critical', 'medium', 'low', 'deprecated'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

/**
 * Per ADR-BACKEND-READ-ONLY: severity classification for the failure
 * event types surfaced in Top5FailuresWidget. P1 blocks ingest, P2
 * degrades a feature, P3 is telemetry-only (no service impact).
 */
export const SEVERITY_BY_EVENT_TYPE: Readonly<Record<string, Severity>> = {
  VISION_LLM_CALL_FAILED: 'P1',
  PRICING_ROW_NOT_FOUND: 'P2',
  CONFIDENCE_BAND_AMBIGUOUS: 'P2',
  OTLP_EXPORTER_503: 'P3',
  RATE_LIMIT_HIT: 'P3',
};

export const SEVERITY_HINT_BY_EVENT_TYPE: Readonly<Record<string, string>> = {
  VISION_LLM_CALL_FAILED: 'Bloquea ingest — revisa provider y fallback',
  PRICING_ROW_NOT_FOUND: 'Degrada cost calc — seed la pricing row activa',
  CONFIDENCE_BAND_AMBIGUOUS: 'HITL queue extra — revisa la foto entrante',
  OTLP_EXPORTER_503: 'No bloquea — sólo telemetry; revisa endpoint OTLP',
  RATE_LIMIT_HIT: 'Backoff aplicado — sin pérdida',
};

/** Reverse lookup: failure event_types eligible for the Top5 query. */
export const FAILURE_EVENT_TYPES = Object.freeze(
  Object.keys(SEVERITY_BY_EVENT_TYPE),
);

// -------- Input schemas --------

export const overviewQuerySchema = z.object({
  organizationId: z.string().uuid({ message: 'organizationId must be a UUID' }),
  period: z.enum(PERIODS),
});
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

export const costByTagQuerySchema = z.object({
  organizationId: z.string().uuid({ message: 'organizationId must be a UUID' }),
  period: z.enum(PERIODS),
});
export type CostByTagQuery = z.infer<typeof costByTagQuerySchema>;

export const failuresQuerySchema = z.object({
  organizationId: z.string().uuid({ message: 'organizationId must be a UUID' }),
  range: z.enum(FAILURE_RANGES),
});
export type FailuresQuery = z.infer<typeof failuresQuerySchema>;

// -------- Response schemas (shape contracts) --------

export const sparklinePointSchema = z.object({
  /** Hour offset within the range (0..23 for 24h, etc). */
  index: z.number().int().min(0),
  /** Error rate at that bucket (0..1). */
  value: z.number().min(0).max(1),
});

export const errorRateWidgetSchema = z.object({
  /** Aggregate error rate over the period (0..1). */
  value: z.number().min(0).max(1),
  /** Sparkline series (≤ 24 points for 24h, 168 for 7d, etc — capped to 120 for render budget). */
  series: z.array(sparklinePointSchema).max(168),
  /** Peak in the series, or null if all zeros. */
  peak: z
    .object({
      index: z.number().int().min(0),
      value: z.number().min(0).max(1),
    })
    .nullable(),
});

export const costTotalWidgetSchema = z.object({
  /** Total spend in the period, EUR. */
  value: z.number().min(0),
  /** Org-level monthly budget, EUR. null when not configured. */
  monthlyBudgetEur: z.number().min(0).nullable(),
  /** Fraction of the budget consumed (0..1). null when budget null. */
  pctConsumed: z.number().min(0).nullable(),
});

export const budgetStatusWidgetSchema = z.object({
  /** Tier; null when monthly budget is not configured. */
  tier: z.enum(TIERS).nullable(),
  /** Fraction of the monthly budget consumed (0..1). null when budget null. */
  pctConsumed: z.number().min(0).nullable(),
  /** Days until empty at current 7-day burn rate. null when budget null. */
  daysUntilEmpty: z.number().int().min(0).nullable(),
  /** 7-day average daily spend in EUR. */
  avg7dDaily: z.number().min(0),
});

export const barRowSchema = z.object({
  /** Display label (capability name / model id / tag). */
  label: z.string().min(1),
  /** Absolute spend in EUR. */
  totalEur: z.number().min(0),
  /** Share of the total (0..1). */
  sharePct: z.number().min(0).max(1),
});

export const heatmapWidgetSchema = z.object({
  /** 7×24 matrix [dayOfWeek][hourOfDay] = call count. dayOfWeek 0=Lun..6=Dom. */
  cells: z.array(z.array(z.number().int().min(0)).length(24)).length(7),
  /** Max value across all 168 cells; used by the client for OKLCH bucketing. */
  max: z.number().int().min(0),
});

export const anomalySchema = z.object({
  /** Subject of the anomaly (capability name, model id, etc). */
  subject: z.string().min(1),
  /** Multiplier vs baseline (e.g. 3.2 = 3.2× over baseline). */
  multiplier: z.number().min(0),
  /** Human-readable baseline label (e.g. "7d avg"). */
  baseline: z.string().min(1),
  /** Explanatory line. */
  detail: z.string().min(1),
  /** When the anomaly was first detected. ISO-8601 string. */
  detectedAt: z.string().min(1),
});

export const savingsOpportunitySchema = z.object({
  /** Capability the opportunity applies to. */
  capability: z.string().min(1),
  /** Current model. */
  fromModel: z.string().min(1),
  /** Suggested replacement model. */
  toModel: z.string().min(1),
  /** Expected savings as a fraction (0..1). */
  expectedSavingsPct: z.number().min(0).max(1),
  /** Expected monthly savings in EUR. */
  expectedSavingsEur: z.number().min(0),
});

export const blastRadiusModelSchema = z.object({
  /** Model id. */
  model: z.string().min(1),
  /** Severity rating. */
  criticality: z.enum(CRITICALITIES),
  /** Share of total traffic (0..1). */
  trafficPct: z.number().min(0).max(1),
  /** Capabilities depending on this model. */
  dependents: z.array(z.string().min(1)),
  /** Fallback model + cost impact note. */
  fallback: z.string().min(1),
  /** Deprecation notice; null if none. */
  deprecation: z
    .object({
      effectiveAt: z.string().min(1),
      migrateTo: z.string().min(1),
    })
    .nullable(),
});

export const otlpExporterSchema = z.object({
  endpoint: z.string().min(1),
  status: z.enum(['active', 'degraded', 'inactive']),
});

export const overviewResponseSchema = z.object({
  status: z.enum(['ok', 'empty']),
  period: z.enum(PERIODS),
  errorRate: errorRateWidgetSchema,
  costTotal: costTotalWidgetSchema,
  budgetStatus: budgetStatusWidgetSchema,
  costByCapability: z.array(barRowSchema),
  costByModel: z.array(barRowSchema),
  heatmap: heatmapWidgetSchema,
  anomalies: z.array(anomalySchema),
  savingsOpportunities: z.array(savingsOpportunitySchema),
  blastRadius: z.array(blastRadiusModelSchema),
  otlpExporter: otlpExporterSchema,
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;

export const costByTagResponseSchema = z.object({
  status: z.enum(['ok', 'empty']),
  period: z.enum(PERIODS),
  tags: z.array(barRowSchema).max(10),
});
export type CostByTagResponse = z.infer<typeof costByTagResponseSchema>;

export const failureRowSchema = z.object({
  eventType: z.string().min(1),
  severity: z.enum(SEVERITIES),
  count: z.number().int().min(0),
  lastOccurredAt: z.string().min(1),
  hint: z.string().min(1),
});

export const failuresResponseSchema = z.object({
  status: z.enum(['ok', 'empty']),
  range: z.enum(FAILURE_RANGES),
  failures: z.array(failureRowSchema).max(5),
});
export type FailuresResponse = z.infer<typeof failuresResponseSchema>;

export type BarRow = z.infer<typeof barRowSchema>;
export type Anomaly = z.infer<typeof anomalySchema>;
export type SavingsOpportunity = z.infer<typeof savingsOpportunitySchema>;
export type BlastRadiusModel = z.infer<typeof blastRadiusModelSchema>;
export type FailureRow = z.infer<typeof failureRowSchema>;
