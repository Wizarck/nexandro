import {
  AiObsQueryService,
  classifyTier,
  clamp01,
  computeBlastRadius,
  detectAnomalies,
  normaliseBarRows,
  pickSeriesPeak,
  staticSavingsOpportunities,
} from './ai-obs-query.service';
import type { BarRow } from './dto/ai-obs.dto';

describe('AiObsQueryService — pure helpers', () => {
  describe('clamp01', () => {
    it('clamps negatives to 0', () => {
      expect(clamp01(-1)).toBe(0);
    });
    it('clamps > 1 to 1', () => {
      expect(clamp01(1.5)).toBe(1);
    });
    it('passes values in [0,1] through', () => {
      expect(clamp01(0.4)).toBe(0.4);
    });
    it('treats NaN as 0', () => {
      expect(clamp01(Number.NaN)).toBe(0);
    });
  });

  describe('classifyTier', () => {
    it('< 0.75 → info', () => {
      expect(classifyTier(0.5)).toBe('info');
    });
    it('0.75–0.89 → warn', () => {
      expect(classifyTier(0.8)).toBe('warn');
    });
    it('0.90–0.99 → error', () => {
      expect(classifyTier(0.95)).toBe('error');
    });
    it('≥ 1 → fatal', () => {
      expect(classifyTier(1)).toBe('fatal');
      expect(classifyTier(1.1)).toBe('fatal');
    });
  });

  describe('pickSeriesPeak', () => {
    it('returns null for an empty series', () => {
      expect(pickSeriesPeak([])).toBeNull();
    });
    it('returns null when all values are zero', () => {
      expect(
        pickSeriesPeak([
          { index: 0, value: 0 },
          { index: 1, value: 0 },
        ]),
      ).toBeNull();
    });
    it('picks the highest-value point', () => {
      const peak = pickSeriesPeak([
        { index: 0, value: 0.1 },
        { index: 1, value: 0.4 },
        { index: 2, value: 0.2 },
      ]);
      expect(peak).toEqual({ index: 1, value: 0.4 });
    });
  });

  describe('normaliseBarRows', () => {
    it('returns [] when sum is 0', () => {
      expect(normaliseBarRows([{ label: 'a', totalEur: 0 }])).toEqual([]);
    });
    it('computes share fractions', () => {
      const out = normaliseBarRows([
        { label: 'a', totalEur: 75 },
        { label: 'b', totalEur: 25 },
      ]);
      expect(out).toEqual([
        { label: 'a', totalEur: 75, sharePct: 0.75 },
        { label: 'b', totalEur: 25, sharePct: 0.25 },
      ]);
    });
  });

  describe('detectAnomalies', () => {
    it('returns [] when no capabilities', () => {
      expect(detectAnomalies([], 10)).toEqual([]);
    });
    it('returns [] when avg7dDaily is 0', () => {
      expect(
        detectAnomalies(
          [{ label: 'cap', totalEur: 50, sharePct: 1 }],
          0,
        ),
      ).toEqual([]);
    });
    it('flags capability spending ≥ 2× expected baseline', () => {
      // expected = avg7dDaily * sharePct = 10 * 0.5 = 5; actual = 20 → mult = 4
      const out = detectAnomalies(
        [{ label: 'inventory.ingest-invoice-photo', totalEur: 20, sharePct: 0.5 }],
        10,
      );
      expect(out).toHaveLength(1);
      expect(out[0]!.subject).toBe('inventory.ingest-invoice-photo');
      expect(out[0]!.multiplier).toBeGreaterThanOrEqual(2);
    });
    it('returns at most one anomaly (highest multiplier)', () => {
      const bars: BarRow[] = [
        { label: 'a', totalEur: 20, sharePct: 0.5 }, // mult 4
        { label: 'b', totalEur: 30, sharePct: 0.5 }, // mult 6
      ];
      const out = detectAnomalies(bars, 10);
      expect(out).toHaveLength(1);
      expect(out[0]!.subject).toBe('b');
    });
  });

  describe('staticSavingsOpportunities', () => {
    it('returns [] when no matching capability present', () => {
      expect(
        staticSavingsOpportunities([
          { label: 'inventory.ingest-invoice-photo', totalEur: 50, sharePct: 1 },
        ]),
      ).toEqual([]);
    });
    it('surfaces haccp.record-ccp-reading → gpt-oss-72b suggestion when present', () => {
      const out = staticSavingsOpportunities([
        { label: 'haccp.record-ccp-reading', totalEur: 50, sharePct: 1 },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0]!.fromModel).toBe('gpt-4o-mini');
      expect(out[0]!.toModel).toBe('gpt-oss-72b');
      // 50 * 0.64 = 32, rounded to 2 decimals
      expect(out[0]!.expectedSavingsEur).toBeCloseTo(32, 2);
    });
  });

  describe('computeBlastRadius', () => {
    it('returns [] for empty input', () => {
      expect(computeBlastRadius([])).toEqual([]);
    });
    it('classifies ≥ 50 % share as critical', () => {
      const out = computeBlastRadius([
        { label: 'gpt-oss-vision-72b', totalEur: 60, sharePct: 0.6 },
      ]);
      expect(out[0]!.criticality).toBe('critical');
      expect(out[0]!.dependents).toContain('inventory.ingest-invoice-photo');
    });
    it('classifies ≥ 20 % and < 50 % share as medium', () => {
      const out = computeBlastRadius([
        { label: 'gpt-4o-mini', totalEur: 30, sharePct: 0.3 },
      ]);
      expect(out[0]!.criticality).toBe('medium');
    });
    it('classifies < 20 % share as low', () => {
      const out = computeBlastRadius([
        { label: 'claude-3-5-sonnet', totalEur: 10, sharePct: 0.1 },
      ]);
      expect(out[0]!.criticality).toBe('low');
    });
    it('classifies known-deprecated models regardless of share', () => {
      const out = computeBlastRadius([
        { label: 'gpt-oss-72b', totalEur: 80, sharePct: 0.8 },
      ]);
      expect(out[0]!.criticality).toBe('deprecated');
      expect(out[0]!.deprecation).not.toBeNull();
      expect(out[0]!.deprecation!.migrateTo).toBe('gpt-oss-72b-v2');
    });
  });

  describe('periodBounds', () => {
    const now = new Date('2026-05-14T12:00:00Z');
    it('24h spans the last 24 hours', () => {
      const b = AiObsQueryService.periodBounds('24h', now);
      expect(b.until.getTime() - b.since.getTime()).toBe(24 * 60 * 60 * 1000);
    });
    it('7d spans 7 days', () => {
      const b = AiObsQueryService.periodBounds('7d', now);
      expect(b.until.getTime() - b.since.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });
    it('this_month starts at the first of the current month UTC', () => {
      const b = AiObsQueryService.periodBounds('this_month', now);
      expect(b.since.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });
    it('last_month spans the previous calendar month', () => {
      const b = AiObsQueryService.periodBounds('last_month', now);
      expect(b.since.toISOString()).toBe('2026-04-01T00:00:00.000Z');
      expect(b.until.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });
  });

  describe('failureRangeBounds', () => {
    const now = new Date('2026-05-14T12:00:00Z');
    it('24h → 24h window', () => {
      const b = AiObsQueryService.failureRangeBounds('24h', now);
      expect(b.until.getTime() - b.since.getTime()).toBe(24 * 60 * 60 * 1000);
    });
    it('7d → 7d window', () => {
      const b = AiObsQueryService.failureRangeBounds('7d', now);
      expect(b.until.getTime() - b.since.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});

describe('AiObsQueryService — getOverview against mocks', () => {
  function mkService(
    rollupRows: Record<string, unknown[]>,
    auditRows: Array<{ eventType: string; count: number; lastOccurredAt: Date }> = [],
  ): AiObsQueryService {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SUM(calls_count)') && sql.includes('SUM(error_count)') && !sql.includes('day_of_week') && !sql.includes('FLOOR')) {
          return rollupRows.aggregate ?? [{ total_calls: '0', total_errors: '0', total_cost: '0' }];
        }
        if (sql.includes('GROUP BY capability')) {
          return rollupRows.byCapability ?? [];
        }
        if (sql.includes('GROUP BY model')) {
          return rollupRows.byModel ?? [];
        }
        if (sql.includes("payload->>'tag'")) {
          return rollupRows.byTag ?? [];
        }
        if (sql.includes('day_of_week')) {
          return rollupRows.heatmap ?? [];
        }
        if (sql.includes('ai_monthly_budget_eur')) {
          return rollupRows.orgBudget ?? [{ ai_monthly_budget_eur: null }];
        }
        if (sql.includes('SUM(total_cost_eur)') && !sql.includes('GROUP BY')) {
          return rollupRows.avg7d ?? [{ total_eur: '0' }];
        }
        if (sql.includes('FLOOR')) {
          return rollupRows.series ?? [];
        }
        return [];
      }),
    };
    const auditLogRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb: Record<string, unknown> = {};
        qb.select = jest.fn(() => qb);
        qb.addSelect = jest.fn(() => qb);
        qb.where = jest.fn(() => qb);
        qb.andWhere = jest.fn(() => qb);
        qb.groupBy = jest.fn(() => qb);
        qb.orderBy = jest.fn(() => qb);
        qb.limit = jest.fn(() => qb);
        qb.getRawMany = jest.fn(async () =>
          auditRows.map((r) => ({
            eventType: r.eventType,
            count: r.count,
            lastOccurredAt: r.lastOccurredAt,
          })),
        );
        return qb;
      }),
    };
    return new AiObsQueryService(dataSource as never, auditLogRepo as never);
  }

  it('returns status="empty" when rollup is empty', async () => {
    const svc = mkService({});
    const out = await svc.getOverview('11111111-1111-4111-8111-111111111111', '24h');
    expect(out.status).toBe('empty');
    expect(out.costByCapability).toEqual([]);
    expect(out.costByModel).toEqual([]);
    expect(out.heatmap.max).toBe(0);
  });

  it('returns status="ok" with populated payload when rollup has data', async () => {
    const svc = mkService({
      aggregate: [{ total_calls: '100', total_errors: '2', total_cost: '50' }],
      byCapability: [
        { capability: 'inventory.ingest-invoice-photo', total_eur: '30' },
        { capability: 'haccp.record-ccp-reading', total_eur: '20' },
      ],
      byModel: [{ model: 'gpt-oss-vision-72b', total_eur: '50' }],
      heatmap: [
        { day_of_week: 4, hour_of_day: 9, calls: '42' },
        { day_of_week: 4, hour_of_day: 10, calls: '38' },
      ],
      orgBudget: [{ ai_monthly_budget_eur: '120' }],
      avg7d: [{ total_eur: '14' }],
      series: [{ bucket: 0, rate: '0.02' }],
    });
    const out = await svc.getOverview('11111111-1111-4111-8111-111111111111', '7d');
    expect(out.status).toBe('ok');
    expect(out.errorRate.value).toBeCloseTo(0.02, 5);
    expect(out.costTotal.value).toBe(50);
    expect(out.costTotal.monthlyBudgetEur).toBe(120);
    expect(out.costTotal.pctConsumed).toBeCloseTo(50 / 120, 5);
    expect(out.budgetStatus.tier).toBe('info'); // 41% consumed
    expect(out.costByCapability[0]!.label).toBe('inventory.ingest-invoice-photo');
    expect(out.heatmap.cells[4]![9]).toBe(42);
    expect(out.heatmap.max).toBe(42);
  });

  it('returns failures with severity classification', async () => {
    const svc = mkService(
      {},
      [
        { eventType: 'VISION_LLM_CALL_FAILED', count: 14, lastOccurredAt: new Date('2026-05-14T10:00:00Z') },
        { eventType: 'PRICING_ROW_NOT_FOUND', count: 7, lastOccurredAt: new Date('2026-05-14T07:00:00Z') },
        { eventType: 'OTLP_EXPORTER_503', count: 3, lastOccurredAt: new Date('2026-05-14T01:00:00Z') },
      ],
    );
    const out = await svc.getFailures('11111111-1111-4111-8111-111111111111', '24h');
    expect(out.status).toBe('ok');
    expect(out.failures).toHaveLength(3);
    expect(out.failures[0]!.severity).toBe('P1');
    expect(out.failures[1]!.severity).toBe('P2');
    expect(out.failures[2]!.severity).toBe('P3');
  });

  it('returns cost-by-tag with (sin tag) aggregation for null tag', async () => {
    const svc = mkService({
      byTag: [
        { tag: 'recall-investigation', total_eur: '30' },
        { tag: null, total_eur: '10' },
      ],
    });
    const out = await svc.getCostByTag('11111111-1111-4111-8111-111111111111', 'this_month');
    expect(out.status).toBe('ok');
    expect(out.tags[0]!.label).toBe('recall-investigation');
    expect(out.tags[1]!.label).toBe('(sin tag)');
  });
});
