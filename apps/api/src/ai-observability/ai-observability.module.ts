import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SharedVisionLlmModule } from '../shared/vision-llm/shared-vision-llm.module';
import { BudgetModule } from './budget/budget.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OtelService } from './otel-tracer.service';
import { SpanEnricherInterceptor } from './span-enricher.interceptor';

/**
 * AI Observability bounded context (m3-vision-llm-provider-di-otel,
 * slice #16 of Wave 2.1; extended by slice #19 m3-ai-obs-budget-tier-
 * emitter with the budget sub-BC; extended by slice #20 m3-ai-obs-ui
 * with the read-only dashboard sub-BC).
 *
 * Exports:
 *  - `OtelService` — `gen_ai.*` span helpers.
 *  - `SpanEnricherInterceptor` — registered as a global APP_INTERCEPTOR
 *    so EVERY M2 + M3 AI capability emits an `nexandro.tag`-annotated
 *    span without per-controller wiring.
 *  - `SharedVisionLlmModule` (re-exported) — `VISION_LLM_PROVIDER` DI
 *    token + factory consumed by slice #17a (`m3-photo-ingest-backend`).
 *  - `BudgetModule` (re-exported) — `ai_usage_rollup` + 4-tier budget
 *    alerts + burn-rate calculator. Read surface
 *    (`AiUsageRollupRepository` + `BurnRateCalculator`) consumed by
 *    slice #20 (`m3-ai-obs-ui`).
 *  - `DashboardModule` (re-exported) — `/m3/ai-obs/*` read-only
 *    controller serving the j8 dashboard (slice #20).
 *
 * The actual OTel SDK lifecycle (NodeSDK.start()) runs PRE-BOOTSTRAP in
 * `apps/api/src/otel-bootstrap.ts` — see ADR-VISION-OTEL-PRE-BOOTSTRAP.
 */
@Module({
  imports: [SharedVisionLlmModule, BudgetModule, DashboardModule],
  providers: [
    OtelService,
    SpanEnricherInterceptor,
    { provide: APP_INTERCEPTOR, useClass: SpanEnricherInterceptor },
  ],
  exports: [OtelService, SharedVisionLlmModule, BudgetModule, DashboardModule],
})
export class AiObservabilityModule {}
