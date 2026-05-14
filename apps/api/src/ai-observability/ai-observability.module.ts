import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SharedVisionLlmModule } from '../shared/vision-llm/shared-vision-llm.module';
import { OtelService } from './otel-tracer.service';
import { SpanEnricherInterceptor } from './span-enricher.interceptor';

/**
 * AI Observability bounded context (m3-vision-llm-provider-di-otel,
 * slice #16 of Wave 2.1).
 *
 * Exports:
 *  - `OtelService` — `gen_ai.*` span helpers.
 *  - `SpanEnricherInterceptor` — registered as a global APP_INTERCEPTOR
 *    so EVERY M2 + M3 AI capability emits an `opentrattos.tag`-annotated
 *    span without per-controller wiring.
 *  - `SharedVisionLlmModule` (re-exported) — `VISION_LLM_PROVIDER` DI
 *    token + factory consumed by slice #17a (`m3-photo-ingest-backend`).
 *
 * The actual OTel SDK lifecycle (NodeSDK.start()) runs PRE-BOOTSTRAP in
 * `apps/api/src/otel-bootstrap.ts` — see ADR-VISION-OTEL-PRE-BOOTSTRAP.
 *
 * Downstream slice anchors live as empty placeholders under `rollup/`,
 * `dashboard/`, and `budget/` so slices #19 + #20 can add files without
 * rebase conflicts on this slice.
 */
@Module({
  imports: [SharedVisionLlmModule],
  providers: [
    OtelService,
    SpanEnricherInterceptor,
    { provide: APP_INTERCEPTOR, useClass: SpanEnricherInterceptor },
  ],
  exports: [OtelService, SharedVisionLlmModule],
})
export class AiObservabilityModule {}
