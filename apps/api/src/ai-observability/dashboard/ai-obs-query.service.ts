import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import {
  Anomaly,
  BarRow,
  BlastRadiusModel,
  CostByTagResponse,
  FailureRange,
  FailureRow,
  FAILURE_EVENT_TYPES,
  FailuresResponse,
  OverviewResponse,
  Period,
  SavingsOpportunity,
  SEVERITY_BY_EVENT_TYPE,
  SEVERITY_HINT_BY_EVENT_TYPE,
  Tier,
} from './dto/ai-obs.dto';

/**
 * Read-only query service over slice #19's `ai_usage_rollup` table +
 * slice #21's `audit_log` table. Per ADR-BACKEND-READ-ONLY (slice #20
 * m3-ai-obs-ui, Wave 2.4), this service NEVER writes — it only aggregates.
 *
 * Per ADR-DATA-DEPENDENCY-DEFERRED-TO-19, we query `ai_usage_rollup` via
 * `DataSource.query` rather than `@InjectRepository(AiUsageRollup)` so
 * the slice compiles regardless of whether slice #19 has merged. The
 * row shape is duplicated here as a private interface; if slice #19
 * changes columns, the integration test `apps/api/test/int/ai-obs-
 * dashboard.int-spec.ts` catches the drift.
 *
 * Per ADR-OWNER-RBAC, RBAC is enforced at the controller boundary via
 * `@Roles('OWNER','MANAGER')`. This service receives an already-
 * authorised `organizationId` and trusts it.
 */
@Injectable()
export class AiObsQueryService {
  private readonly logger = new Logger(AiObsQueryService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  /** Public for #5.x service spec. Maps a `Period` to (since, until) bounds. */
  static periodBounds(period: Period, now: Date = new Date()): { since: Date; until: Date } {
    const until = new Date(now);
    let since: Date;
    if (period === '24h') {
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === 'this_month') {
      since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    } else {
      // last_month: first-of-prev-month..first-of-this-month
      since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const lastMonthEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      return { since, until: lastMonthEnd };
    }
    return { since, until };
  }

  /** Public for spec. Maps a `FailureRange` to (since, until). */
  static failureRangeBounds(
    range: FailureRange,
    now: Date = new Date(),
  ): { since: Date; until: Date } {
    const until = new Date(now);
    const ms = range === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    return { since: new Date(now.getTime() - ms), until };
  }

  /**
   * 6-core widget payload + 4 chrome elements. One round-trip per widget
   * group: rollup aggregate, cost-by-capability/model, heatmap, plus the
   * organisation row for the monthly budget. Empty rollup → status='empty'.
   */
  async getOverview(orgId: string, period: Period): Promise<OverviewResponse> {
    const { since, until } = AiObsQueryService.periodBounds(period);

    const aggregate = await this.queryRollupAggregate(orgId, since, until);
    if (aggregate.totalCalls === 0) {
      return this.emptyOverview(period);
    }

    const [byCapability, byModel, heatmap, monthlyBudgetEur, avg7d] =
      await Promise.all([
        this.queryRollupByCapability(orgId, since, until),
        this.queryRollupByModel(orgId, since, until),
        this.queryRollupHeatmap(orgId, since, until),
        this.queryOrgMonthlyBudgetEur(orgId),
        this.queryAvg7dDaily(orgId),
      ]);

    const errorRate = aggregate.totalCalls > 0
      ? aggregate.totalErrors / aggregate.totalCalls
      : 0;

    const series = await this.queryErrorRateSeries(orgId, period, since, until);
    const peak = pickSeriesPeak(series);

    const pctConsumed = monthlyBudgetEur != null && monthlyBudgetEur > 0
      ? Math.min(1, aggregate.totalCostEur / monthlyBudgetEur)
      : null;

    const tier: Tier | null = pctConsumed == null
      ? null
      : classifyTier(pctConsumed);

    const daysUntilEmpty = monthlyBudgetEur != null && avg7d > 0
      ? Math.max(0, Math.floor((monthlyBudgetEur - aggregate.totalCostEur) / avg7d))
      : monthlyBudgetEur != null
        ? null
        : null;

    const anomalies = detectAnomalies(byCapability, avg7d);
    const savingsOpportunities = staticSavingsOpportunities(byCapability);
    const blastRadius = computeBlastRadius(byModel);

    return {
      status: 'ok',
      period,
      errorRate: {
        value: errorRate,
        series,
        peak,
      },
      costTotal: {
        value: aggregate.totalCostEur,
        monthlyBudgetEur,
        pctConsumed,
      },
      budgetStatus: {
        tier,
        pctConsumed,
        daysUntilEmpty,
        avg7dDaily: avg7d,
      },
      costByCapability: byCapability,
      costByModel: byModel,
      heatmap,
      anomalies,
      savingsOpportunities,
      blastRadius,
      otlpExporter: {
        endpoint: process.env.NEXANDRO_OTEL_EXPORTER_ENDPOINT ?? 'http://localhost:4318',
        status: 'active',
      },
    };
  }

  async getCostByTag(orgId: string, period: Period): Promise<CostByTagResponse> {
    const { since, until } = AiObsQueryService.periodBounds(period);
    const tags = await this.queryRollupByTag(orgId, since, until);
    return {
      status: tags.length > 0 ? 'ok' : 'empty',
      period,
      tags,
    };
  }

  async getFailures(orgId: string, range: FailureRange): Promise<FailuresResponse> {
    const { since, until } = AiObsQueryService.failureRangeBounds(range);
    const failures = await this.queryFailuresFromAuditLog(orgId, since, until);
    return {
      status: failures.length > 0 ? 'ok' : 'empty',
      range,
      failures,
    };
  }

  // -------- Private query helpers --------

  /**
   * Aggregate over the rollup. Returns zeros if the table doesn't exist
   * yet (slice #19 not merged) or has no rows for the org/range.
   */
  private async queryRollupAggregate(
    orgId: string,
    since: Date,
    until: Date,
  ): Promise<{ totalCalls: number; totalErrors: number; totalCostEur: number }> {
    try {
      const rows = await this.dataSource.query<
        Array<{ total_calls: string | null; total_errors: string | null; total_cost: string | null }>
      >(
        `SELECT
           COALESCE(SUM(calls_count), 0)::text AS total_calls,
           COALESCE(SUM(error_count), 0)::text AS total_errors,
           COALESCE(SUM(total_cost_eur), 0)::text AS total_cost
         FROM ai_usage_rollup
         WHERE organization_id = $1 AND computed_at >= $2 AND computed_at < $3`,
        [orgId, since, until],
      );
      const row = rows[0];
      return {
        totalCalls: row ? Number(row.total_calls ?? 0) : 0,
        totalErrors: row ? Number(row.total_errors ?? 0) : 0,
        totalCostEur: row ? Number(row.total_cost ?? 0) : 0,
      };
    } catch (err) {
      this.logger.warn(
        `ai_usage_rollup not available (slice #19 not merged?): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { totalCalls: 0, totalErrors: 0, totalCostEur: 0 };
    }
  }

  private async queryRollupByCapability(
    orgId: string,
    since: Date,
    until: Date,
  ): Promise<BarRow[]> {
    try {
      const rows = await this.dataSource.query<
        Array<{ capability: string; total_eur: string }>
      >(
        `SELECT capability, COALESCE(SUM(total_cost_eur), 0)::text AS total_eur
         FROM ai_usage_rollup
         WHERE organization_id = $1 AND computed_at >= $2 AND computed_at < $3
         GROUP BY capability
         ORDER BY SUM(total_cost_eur) DESC NULLS LAST
         LIMIT 10`,
        [orgId, since, until],
      );
      return normaliseBarRows(
        rows.map((r) => ({ label: r.capability, totalEur: Number(r.total_eur) })),
      );
    } catch {
      return [];
    }
  }

  private async queryRollupByModel(
    orgId: string,
    since: Date,
    until: Date,
  ): Promise<BarRow[]> {
    try {
      const rows = await this.dataSource.query<
        Array<{ model: string; total_eur: string }>
      >(
        `SELECT model, COALESCE(SUM(total_cost_eur), 0)::text AS total_eur
         FROM ai_usage_rollup
         WHERE organization_id = $1 AND computed_at >= $2 AND computed_at < $3
         GROUP BY model
         ORDER BY SUM(total_cost_eur) DESC NULLS LAST
         LIMIT 10`,
        [orgId, since, until],
      );
      return normaliseBarRows(
        rows.map((r) => ({ label: r.model, totalEur: Number(r.total_eur) })),
      );
    } catch {
      return [];
    }
  }

  private async queryRollupByTag(
    orgId: string,
    since: Date,
    until: Date,
  ): Promise<BarRow[]> {
    try {
      // Slice #19 stores nexandro.tag in payload->>'tag' (jsonb attr).
      // null tag aggregates under '(sin tag)'.
      const rows = await this.dataSource.query<
        Array<{ tag: string | null; total_eur: string }>
      >(
        `SELECT (payload->>'tag') AS tag,
                COALESCE(SUM(total_cost_eur), 0)::text AS total_eur
         FROM ai_usage_rollup
         WHERE organization_id = $1 AND computed_at >= $2 AND computed_at < $3
         GROUP BY (payload->>'tag')
         ORDER BY SUM(total_cost_eur) DESC NULLS LAST
         LIMIT 10`,
        [orgId, since, until],
      );
      return normaliseBarRows(
        rows.map((r) => ({
          label: r.tag == null || r.tag === '' ? '(sin tag)' : r.tag,
          totalEur: Number(r.total_eur),
        })),
      );
    } catch {
      return [];
    }
  }

  private async queryRollupHeatmap(
    orgId: string,
    since: Date,
    until: Date,
  ): Promise<OverviewResponse['heatmap']> {
    // Build a 7×24 zero matrix; fill from rows. Returns 0-max heatmap
    // when slice #19 not merged.
    const cells: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0),
    );
    try {
      const rows = await this.dataSource.query<
        Array<{ day_of_week: number; hour_of_day: number; calls: string }>
      >(
        `SELECT day_of_week, hour_of_day, COALESCE(SUM(calls_count), 0)::text AS calls
         FROM ai_usage_rollup
         WHERE organization_id = $1 AND computed_at >= $2 AND computed_at < $3
         GROUP BY day_of_week, hour_of_day`,
        [orgId, since, until],
      );
      let max = 0;
      for (const r of rows) {
        const d = Number(r.day_of_week);
        const h = Number(r.hour_of_day);
        if (d < 0 || d > 6 || h < 0 || h > 23) continue;
        const v = Number(r.calls);
        cells[d]![h] = v;
        if (v > max) max = v;
      }
      return { cells, max };
    } catch {
      return { cells, max: 0 };
    }
  }

  private async queryOrgMonthlyBudgetEur(orgId: string): Promise<number | null> {
    try {
      // Slice #19 migration 0035 adds `ai_monthly_budget_eur`; pre-#19 the
      // column is absent and the query throws → we surface null.
      const rows = await this.dataSource.query<
        Array<{ ai_monthly_budget_eur: string | null }>
      >(
        `SELECT ai_monthly_budget_eur FROM organizations WHERE id = $1`,
        [orgId],
      );
      const v = rows[0]?.ai_monthly_budget_eur;
      return v == null ? null : Number(v);
    } catch {
      return null;
    }
  }

  private async queryAvg7dDaily(orgId: string): Promise<number> {
    try {
      const { since, until } = AiObsQueryService.periodBounds('7d');
      const rows = await this.dataSource.query<Array<{ total_eur: string | null }>>(
        `SELECT COALESCE(SUM(total_cost_eur), 0)::text AS total_eur
         FROM ai_usage_rollup
         WHERE organization_id = $1 AND computed_at >= $2 AND computed_at < $3`,
        [orgId, since, until],
      );
      const total = Number(rows[0]?.total_eur ?? 0);
      return total / 7;
    } catch {
      return 0;
    }
  }

  /**
   * Sparkline: hourly bucketed error rate for 24h, daily for everything
   * else. Capped at 120 points per the response schema's render budget.
   */
  private async queryErrorRateSeries(
    orgId: string,
    period: Period,
    since: Date,
    until: Date,
  ): Promise<OverviewResponse['errorRate']['series']> {
    try {
      const buckets = period === '24h' ? 24 : period === '7d' ? 28 : 30;
      const rows = await this.dataSource.query<
        Array<{ bucket: number; rate: string | null }>
      >(
        `WITH bucketed AS (
           SELECT
             FLOOR(EXTRACT(EPOCH FROM (computed_at - $2::timestamptz)) / GREATEST(1, EXTRACT(EPOCH FROM ($3::timestamptz - $2::timestamptz)) / $4))::int AS bucket,
             SUM(calls_count) AS c,
             SUM(error_count) AS e
           FROM ai_usage_rollup
           WHERE organization_id = $1 AND computed_at >= $2 AND computed_at < $3
           GROUP BY bucket
         )
         SELECT bucket, (CASE WHEN c > 0 THEN (e::numeric / c) ELSE 0 END)::text AS rate
         FROM bucketed
         WHERE bucket >= 0 AND bucket < $4
         ORDER BY bucket ASC`,
        [orgId, since, until, buckets],
      );
      return rows.map((r) => ({
        index: Number(r.bucket),
        value: clamp01(Number(r.rate ?? 0)),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Top-5 failure event types from audit_log. Uses ix_audit_log_event_type
   * (Wave 1.x index) for performance.
   */
  private async queryFailuresFromAuditLog(
    orgId: string,
    since: Date,
    until: Date,
  ): Promise<FailureRow[]> {
    if (FAILURE_EVENT_TYPES.length === 0) return [];
    const rows = await this.auditLogRepo
      .createQueryBuilder('al')
      .select('al.event_type', 'eventType')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect('MAX(al.created_at)', 'lastOccurredAt')
      .where('al.organization_id = :orgId', { orgId })
      .andWhere('al.event_type IN (:...types)', { types: FAILURE_EVENT_TYPES })
      .andWhere('al.created_at >= :since', { since })
      .andWhere('al.created_at < :until', { until })
      .groupBy('al.event_type')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany<{ eventType: string; count: number | string; lastOccurredAt: Date | string }>();

    return rows.map((r) => {
      const eventType = String(r.eventType);
      const severity = SEVERITY_BY_EVENT_TYPE[eventType] ?? 'P3';
      const hint = SEVERITY_HINT_BY_EVENT_TYPE[eventType] ?? 'Sin recomendación';
      const lastDate =
        r.lastOccurredAt instanceof Date
          ? r.lastOccurredAt
          : new Date(String(r.lastOccurredAt));
      return {
        eventType,
        severity,
        count: Number(r.count),
        lastOccurredAt: lastDate.toISOString(),
        hint,
      } satisfies FailureRow;
    });
  }

  private emptyOverview(period: Period): OverviewResponse {
    const emptyHeatmap: OverviewResponse['heatmap'] = {
      cells: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
      max: 0,
    };
    return {
      status: 'empty',
      period,
      errorRate: { value: 0, series: [], peak: null },
      costTotal: { value: 0, monthlyBudgetEur: null, pctConsumed: null },
      budgetStatus: {
        tier: null,
        pctConsumed: null,
        daysUntilEmpty: null,
        avg7dDaily: 0,
      },
      costByCapability: [],
      costByModel: [],
      heatmap: emptyHeatmap,
      anomalies: [],
      savingsOpportunities: [],
      blastRadius: [],
      otlpExporter: {
        endpoint: process.env.NEXANDRO_OTEL_EXPORTER_ENDPOINT ?? 'http://localhost:4318',
        status: 'active',
      },
    };
  }
}

// -------- pure helpers --------

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Tier classification per ADR-030 budget tier sub-decision (NFR-OBS-10). */
export function classifyTier(pctConsumed: number): Tier {
  if (pctConsumed >= 1) return 'fatal';
  if (pctConsumed >= 0.9) return 'error';
  if (pctConsumed >= 0.75) return 'warn';
  return 'info';
}

export function pickSeriesPeak(
  series: Array<{ index: number; value: number }>,
): { index: number; value: number } | null {
  if (series.length === 0) return null;
  let peak: { index: number; value: number } | null = null;
  for (const p of series) {
    if (peak == null || p.value > peak.value) peak = p;
  }
  if (peak == null || peak.value <= 0) return null;
  return peak;
}

/**
 * Compute the totals + per-row share. Rows arrive sorted desc by spend;
 * we just compute the share against the sum.
 */
export function normaliseBarRows(
  raw: Array<{ label: string; totalEur: number }>,
): BarRow[] {
  const total = raw.reduce((sum, r) => sum + r.totalEur, 0);
  if (total <= 0) return [];
  return raw.map((r) => ({
    label: r.label,
    totalEur: r.totalEur,
    sharePct: r.totalEur / total,
  }));
}

/**
 * z-score-lite anomaly detection: a capability spending ≥ 2× its
 * trailing-7d-avg-daily share is flagged. We surface at most one anomaly
 * (highest multiplier) in the response payload.
 */
export function detectAnomalies(
  byCapability: BarRow[],
  avg7dDaily: number,
): Anomaly[] {
  if (byCapability.length === 0 || avg7dDaily <= 0) return [];
  const anomalies: Anomaly[] = [];
  for (const cap of byCapability) {
    // Naive baseline: avg7dDaily * (cap.sharePct) is the "expected" daily
    // spend for this capability today. If today's window already burned
    // ≥ 2× that, we flag.
    const expected = avg7dDaily * cap.sharePct;
    const multiplier = expected > 0 ? cap.totalEur / expected : 0;
    if (multiplier >= 2) {
      anomalies.push({
        subject: cap.label,
        multiplier: Math.round(multiplier * 10) / 10,
        baseline: '7d avg',
        detail: `Revisa eventos recientes de ${cap.label} — coste sobre baseline.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }
  // Return at most one — the most extreme.
  anomalies.sort((a, b) => b.multiplier - a.multiplier);
  return anomalies.slice(0, 1);
}

/**
 * Static lookup of known cost-savings opportunities, mapped against the
 * capabilities present in the current spend. Future M3.x will make this
 * dynamic; the MVP ships the seeded recommendations from the j8 mock.
 */
const STATIC_SAVINGS: ReadonlyArray<{
  capability: string;
  fromModel: string;
  toModel: string;
  expectedSavingsPct: number;
}> = [
  {
    capability: 'haccp.record-ccp-reading',
    fromModel: 'gpt-4o-mini',
    toModel: 'gpt-oss-72b',
    expectedSavingsPct: 0.64,
  },
];

export function staticSavingsOpportunities(
  byCapability: BarRow[],
): SavingsOpportunity[] {
  const present = new Set(byCapability.map((r) => r.label));
  const byCap = new Map(byCapability.map((r) => [r.label, r.totalEur]));
  return STATIC_SAVINGS.filter((s) => present.has(s.capability)).map((s) => ({
    capability: s.capability,
    fromModel: s.fromModel,
    toModel: s.toModel,
    expectedSavingsPct: s.expectedSavingsPct,
    expectedSavingsEur:
      Math.round((byCap.get(s.capability) ?? 0) * s.expectedSavingsPct * 100) / 100,
  }));
}

/**
 * Blast radius: for each model with > 0 spend, classify by traffic share,
 * list dependent capabilities (from the known capability→model mapping),
 * and attach a fallback note + deprecation if applicable.
 */
const MODEL_FALLBACKS: Readonly<Record<string, string>> = {
  'gpt-oss-vision-72b': 'gpt-4o-mini (+47 % coste)',
  'gpt-4o-mini': 'gpt-oss-72b (same accuracy, -64 % coste)',
  'claude-3-5-sonnet': 'gpt-4o-mini (same accuracy)',
  'gpt-oss-72b': 'gpt-oss-72b-v2 (migración recomendada)',
};

const MODEL_DEPENDENTS: Readonly<Record<string, string[]>> = {
  'gpt-oss-vision-72b': [
    'inventory.ingest-invoice-photo',
    'inventory.ingest-product-photo',
  ],
  'gpt-4o-mini': ['recall.generate-dossier', 'haccp.record-ccp-reading'],
  'claude-3-5-sonnet': ['recall.search-incident'],
  'gpt-oss-72b': ['(legacy embeddings batch)'],
};

const MODEL_DEPRECATION: Readonly<Record<string, { effectiveAt: string; migrateTo: string }>> = {
  'gpt-oss-72b': {
    effectiveAt: '2026-07-01',
    migrateTo: 'gpt-oss-72b-v2',
  },
};

export function computeBlastRadius(byModel: BarRow[]): BlastRadiusModel[] {
  if (byModel.length === 0) return [];
  return byModel.map((m) => {
    let criticality: BlastRadiusModel['criticality'];
    if (MODEL_DEPRECATION[m.label]) {
      criticality = 'deprecated';
    } else if (m.sharePct >= 0.5) {
      criticality = 'critical';
    } else if (m.sharePct >= 0.2) {
      criticality = 'medium';
    } else {
      criticality = 'low';
    }
    return {
      model: m.label,
      criticality,
      trafficPct: m.sharePct,
      dependents: MODEL_DEPENDENTS[m.label] ?? [],
      fallback: MODEL_FALLBACKS[m.label] ?? 'Sin fallback documentado',
      deprecation: MODEL_DEPRECATION[m.label] ?? null,
    } satisfies BlastRadiusModel;
  });
}
