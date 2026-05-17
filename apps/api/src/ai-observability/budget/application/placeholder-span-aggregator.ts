import { Injectable, Logger } from '@nestjs/common';
import type {
  PeriodSpanAggregate,
  SpanAggregatorPort,
} from './ports/span-aggregator.port';

/**
 * Placeholder `SpanAggregatorPort` binding shipped by THIS slice. Returns
 * `{ totalCostEur: 0, … }` for every org so the scheduler can start ticking
 * before slice #20 attaches the real OTel-span source adapter.
 *
 * Per design.md ADR-AGGREGATE-INTERVAL: the scheduler is `enabled-by-env-
 * flag` and is OFF by default in dev — operators only flip the flag on
 * once a real aggregator is bound. The placeholder enforces a hard fail
 * (throws via `notImplemented()` in `aggregateForPeriod`) when the env
 * flag IS on but the real adapter is missing, so misconfiguration surfaces
 * immediately rather than silently emitting zero-spend rollups.
 *
 * Slice #20's merge will rebind `SPAN_AGGREGATOR_PORT` to the real adapter
 * (reads from the OTel exporter sink / dashboard query layer). Same pattern
 * as slice #5's `INVENTORY_COST_RESOLVER` placeholder.
 */
@Injectable()
export class PlaceholderSpanAggregator implements SpanAggregatorPort {
  private readonly logger = new Logger(PlaceholderSpanAggregator.name);

  async listActiveOrgs(_period: string): Promise<string[]> {
    // Defensive: returning [] means the scheduler tick is a no-op even when
    // NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED=true and no real adapter is
    // bound. Operators see one warn log line per tick, no rollup rows.
    this.logger.warn(
      'PlaceholderSpanAggregator.listActiveOrgs returned []; slice #20 ' +
        'must bind a real SPAN_AGGREGATOR_PORT adapter before tier alerts ' +
        'will fire.',
    );
    return [];
  }

  async aggregateForPeriod(
    organizationId: string,
    period: string,
  ): Promise<PeriodSpanAggregate> {
    throw new Error(
      `SPAN_AGGREGATOR_PORT unbound. Slice #20 (m3-ai-obs-ui) MUST provide ` +
        `the OTel-sourced aggregator before tier evaluation can run for ` +
        `organizationId=${organizationId} period=${period}.`,
    );
  }
}
