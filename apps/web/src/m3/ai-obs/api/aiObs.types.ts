/**
 * Frontend-side type contracts mirroring the AI Observability dashboard
 * backend DTOs (slice #20 m3-ai-obs-ui). The backend Zod schemas live at
 * `apps/api/src/ai-observability/dashboard/dto/ai-obs.dto.ts`.
 *
 * Per ADR-BACKEND-READ-ONLY, no shared package is required for these
 * types — apps/api owns the contract; apps/web mirrors it. Should the
 * backend evolve, the contract test in `apps/api/test/int/ai-obs-
 * dashboard.int-spec.ts` keeps the two in sync.
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

export type Tier = 'info' | 'warn' | 'error' | 'fatal';
export type Severity = 'P1' | 'P2' | 'P3';
export type Criticality = 'critical' | 'medium' | 'low' | 'deprecated';

export interface SparklinePoint {
  index: number;
  value: number;
}

export interface BarRow {
  label: string;
  totalEur: number;
  sharePct: number;
}

export interface Anomaly {
  subject: string;
  multiplier: number;
  baseline: string;
  detail: string;
  detectedAt: string;
}

export interface SavingsOpportunity {
  capability: string;
  fromModel: string;
  toModel: string;
  expectedSavingsPct: number;
  expectedSavingsEur: number;
}

export interface BlastRadiusModel {
  model: string;
  criticality: Criticality;
  trafficPct: number;
  dependents: string[];
  fallback: string;
  deprecation: { effectiveAt: string; migrateTo: string } | null;
}

export interface OtlpExporter {
  endpoint: string;
  status: 'active' | 'degraded' | 'inactive';
}

export interface ErrorRateWidget {
  value: number;
  series: SparklinePoint[];
  peak: { index: number; value: number } | null;
}

export interface CostTotalWidget {
  value: number;
  monthlyBudgetEur: number | null;
  pctConsumed: number | null;
}

export interface BudgetStatusWidget {
  tier: Tier | null;
  pctConsumed: number | null;
  daysUntilEmpty: number | null;
  avg7dDaily: number;
}

export interface HeatmapWidget {
  cells: number[][];
  max: number;
}

export interface OverviewResponse {
  status: 'ok' | 'empty';
  period: Period;
  errorRate: ErrorRateWidget;
  costTotal: CostTotalWidget;
  budgetStatus: BudgetStatusWidget;
  costByCapability: BarRow[];
  costByModel: BarRow[];
  heatmap: HeatmapWidget;
  anomalies: Anomaly[];
  savingsOpportunities: SavingsOpportunity[];
  blastRadius: BlastRadiusModel[];
  otlpExporter: OtlpExporter;
}

export interface CostByTagResponse {
  status: 'ok' | 'empty';
  period: Period;
  tags: BarRow[];
}

export interface FailureRow {
  eventType: string;
  severity: Severity;
  count: number;
  lastOccurredAt: string;
  hint: string;
}

export interface FailuresResponse {
  status: 'ok' | 'empty';
  range: FailureRange;
  failures: FailureRow[];
}

export type WidgetId =
  | 'errorRate'
  | 'costTotal'
  | 'budgetStatus'
  | 'costByCapability'
  | 'costByModel'
  | 'costByTag'
  | 'usageHeatmap'
  | 'top5Failures';

export const ALL_WIDGET_IDS: WidgetId[] = [
  'errorRate',
  'costTotal',
  'budgetStatus',
  'costByCapability',
  'costByModel',
  'costByTag',
  'usageHeatmap',
  'top5Failures',
];

export interface WidgetConfigV1 {
  order: WidgetId[];
  hidden: WidgetId[];
  v: 1;
}
