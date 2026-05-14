## 1. Dependencies + package.json

- [ ] 1.1 Add to `apps/api/package.json` (exact versions, no `^` per ADR-VISION-OTEL-SEMCONV-PINNED):
  - `@opentelemetry/api`
  - `@opentelemetry/sdk-node`
  - `@opentelemetry/exporter-trace-otlp-http`
  - `@opentelemetry/semantic-conventions` (exact: `1.27.0`)
  - `@opentelemetry/instrumentation-http`
  - `@opentelemetry/instrumentation-nestjs-core`
- [ ] 1.2 Run `pnpm install` + commit lockfile change

## 2. AI Observability BC scaffold

- [ ] 2.1 Create directory `apps/api/src/ai-observability/`
- [ ] 2.2 Create downstream slice anchors as empty placeholders with `.gitkeep`:
  - `apps/api/src/ai-observability/rollup/.gitkeep` (slice #19)
  - `apps/api/src/ai-observability/dashboard/.gitkeep` (slice #20)
  - `apps/api/src/ai-observability/budget/.gitkeep` (slice #19)
- [ ] 2.3 `apps/api/src/ai-observability/ai-observability.module.ts` — NestJS module exporting `OtelService`, `SpanEnricherInterceptor`, `VisionLlmProvider` DI token, factory; imports `SharedVisionLlmModule`
- [ ] 2.4 `apps/api/src/ai-observability/pricing.ts` — typed shape for `AiPricingRegistry` (no actual price data; slice #19 seeds rows)

## 3. OtelService — gen_ai.* span helpers

- [ ] 3.1 `apps/api/src/ai-observability/otel-tracer.service.ts` — class `OtelService` with:
  - `getTracer(): Tracer` — returns the global OTel tracer for `service.name=opentrattos-api`
  - `startGenAiSpan(name, attrs, options)` — creates a span with `gen_ai.*` semconv attributes from the pinned schema; throws `UnknownSemconvAttributeError` if `attrs` contains keys not in the pinned set
  - `startSpan(name, options)` — generic span creation; takes optional `tag` for `opentrattos.tag` attribute
- [ ] 3.2 `otel-tracer.service.spec.ts`:
  - happy path: `startGenAiSpan('test', { model: 'claude-3.5-sonnet', inputTokens: 100, outputTokens: 50 })` emits a span with correctly-mapped attributes
  - boundary: unknown attribute key throws `UnknownSemconvAttributeError`

## 4. SpanEnricherInterceptor — opentrattos.tag attribute

- [ ] 4.1 `apps/api/src/ai-observability/span-enricher.interceptor.ts` — NestJS `@Injectable() @UseInterceptors` global interceptor:
  - intercepts every outgoing span at `onSpanEnd`
  - assigns `opentrattos.tag` from `RequestContext.tag` if set, else `untagged`
  - normalizes tag to lowercase kebab-case ASCII, max 64 chars (truncates + warn-logs)
  - emits `warn` log if tag was missing or required normalization
- [ ] 4.2 `span-enricher.interceptor.spec.ts`:
  - tagged span keeps `opentrattos.tag=<value>`
  - untagged span falls back to `opentrattos.tag='untagged'` + warn log
  - oversized tag (>64 chars) is truncated + warn log
  - capitalized/spaced tag normalized to kebab-case
- [ ] 4.3 Register `SpanEnricherInterceptor` as `APP_INTERCEPTOR` global provider in `AiObservabilityModule`

## 5. Pre-bootstrap OTel SDK init in main.ts

- [ ] 5.1 Modify `apps/api/src/main.ts` — add at the very top (BEFORE any other import):
  ```typescript
  // OTel SDK MUST initialize before any NestJS import.
  // See ADR-VISION-OTEL-PRE-BOOTSTRAP.
  import './otel-bootstrap';
  ```
- [ ] 5.2 Create `apps/api/src/otel-bootstrap.ts`:
  - reads env: `OPENTRATTOS_OTEL_DISABLED`, `OPENTRATTOS_OTEL_EXPORTER_ENDPOINT`, `OPENTRATTOS_OTEL_EXPORTER_HEADERS`, `OPENTRATTOS_OTEL_SERVICE_NAME`
  - constructs `NodeSDK` with `OTLPTraceExporter` (HTTP, not gRPC)
  - calls `sdk.start()` immediately at module-load (no awaitable)
  - registers a process `SIGTERM` / `SIGINT` handler for clean span flush
- [ ] 5.3 `otel-bootstrap.spec.ts`:
  - `OPENTRATTOS_OTEL_DISABLED=true` → exporter is no-op
  - `OPENTRATTOS_OTEL_DISABLED=false` + reachable endpoint → spans flow to exporter
  - custom headers parse from comma-separated env
- [ ] 5.4 INT test: cold boot under `OPENTRATTOS_OTEL_DISABLED=false` emits a `service.startup` span captured by a stub exporter (Jest-mocked OTLP endpoint)

## 6. ESLint custom rule — pre-bootstrap order enforcement

- [ ] 6.1 `packages/eslint-config/rules/otel-pre-bootstrap-order.ts` — custom rule asserting that `apps/api/src/main.ts` begins with `import './otel-bootstrap'` AS THE FIRST IMPORT
- [ ] 6.2 Register rule in `packages/eslint-config/index.js` under `opentrattos/otel-pre-bootstrap-order`
- [ ] 6.3 Test the rule: modify `main.ts` to reorder imports; assert lint fails

## 7. Vision-LLM provider DI surface (ADR-038)

- [ ] 7.1 `apps/api/src/shared/vision-llm/vision-llm-provider.interface.ts`:
  - export `VisionLlmProvider` DI token (`InjectionToken<VisionLlmProvider>`)
  - export interface `VisionLlmProvider` with `extract(input: VisionLlmInput): Promise<VisionLlmOutput | null>` signature
  - JSDoc references slice #17a as owner of the real implementation + null-on-outage contract
- [ ] 7.2 `apps/api/src/shared/vision-llm/errors.ts`:
  - `NotImplementedError` (used by all 3 adapter stubs in this slice)
  - `UnknownVisionLlmProviderError` (factory throws on unknown env value)
- [ ] 7.3 `apps/api/src/shared/vision-llm/gpt-oss-vision-rag-proxy.provider.ts`:
  - extends `tools/rag-proxy/` from Wave 1.8 (interface only; no implementation here)
  - `extract()` throws `NotImplementedError('Vision LLM extraction not yet wired; slice #17a delivers')`
- [ ] 7.4 `apps/api/src/shared/vision-llm/claude-vision.provider.ts`:
  - structured Anthropic SDK adapter stub
  - `extract()` throws `NotImplementedError(...)` same message
- [ ] 7.5 `apps/api/src/shared/vision-llm/gpt-four-v.provider.ts`:
  - structured OpenAI SDK adapter stub
  - `extract()` throws `NotImplementedError(...)` same message
- [ ] 7.6 `apps/api/src/shared/vision-llm/vision-llm.factory.ts`:
  - factory class with `onModuleInit()` reading `OPENTRATTOS_VISION_LLM_PROVIDER` (default: `gpt-oss-vision-rag-proxy`)
  - resolves to one of 3 adapter instances
  - throws `UnknownVisionLlmProviderError` on unknown env value
- [ ] 7.7 `apps/api/src/shared/vision-llm/shared-vision-llm.module.ts` — NestJS module exporting the factory + DI bindings

## 8. Smoke + unit tests for vision-llm

- [ ] 8.1 `vision-llm.factory.spec.ts`:
  - default selects `GptOssVisionRagProxyProvider`
  - `OPENTRATTOS_VISION_LLM_PROVIDER=claude-vision` selects `ClaudeVisionProvider`
  - `OPENTRATTOS_VISION_LLM_PROVIDER=gpt-four-v` selects `GptFourVProvider`
  - unknown value throws `UnknownVisionLlmProviderError` at bootstrap (factory init), NOT at first call
- [ ] 8.2 `vision-llm.providers.spec.ts`:
  - all 3 adapter `extract()` throw `NotImplementedError`
- [ ] 8.3 Architecture smoke: grep for `extract` calls in `apps/api/src/` outside `apps/api/src/photo-ingestion/`; assert no matches — confirms no production code path other than slice #17a's territory invokes the providers

## 9. Contracts package — typed Zod schemas

- [ ] 9.1 `packages/contracts/src/m3/ai-obs.ts`:
  - `OtelSpanAttributes` Zod schema matching the pinned `gen_ai.*` schema from `@opentelemetry/semantic-conventions@1.27.0`
  - `VisionLlmInput` Zod schema (`{ photoBytes?: Buffer, photoUrl?: string, tag: string, capability: string, modelHint?: string }`; either `photoBytes` or `photoUrl` required via `.refine`)
  - `VisionLlmOutput` Zod schema (`{ fields: { name: string, value: string | number | null, confidence: number }[] }`)
  - `OpenTrattOsTagAttribute` Zod schema (string max 64, kebab-case ASCII regex `/^[a-z][a-z0-9-]*[a-z0-9]$/`)
- [ ] 9.2 `packages/contracts/src/index.ts` re-exports from `m3/ai-obs.ts`
- [ ] 9.3 `ai-obs.spec.ts`:
  - `OpenTrattOsTagAttribute.safeParse('photo-ingest-batch')` returns success
  - `OpenTrattOsTagAttribute.safeParse('Photo Ingest BATCH!')` returns failure
  - `OpenTrattOsTagAttribute.safeParse(<65-char string>)` returns failure
  - `VisionLlmInput.safeParse({ photoUrl: '...', tag: 'x' })` returns success
  - `VisionLlmInput.safeParse({ tag: 'x' })` returns failure (neither photoBytes nor photoUrl)

## 10. Pinned-semconv CI test

- [ ] 10.1 `apps/api/test/otel-semconv.spec.ts`:
  - imports the pinned `@opentelemetry/semantic-conventions` exports
  - creates a sample span via `OtelService.startGenAiSpan(...)` with all fields
  - reads emitted attributes; asserts exact key set matches the pinned schema (no extra, no missing)
  - this test guards against silent semconv-version drift

## 11. AppModule wiring

- [ ] 11.1 `apps/api/src/app.module.ts` — import `AiObservabilityModule` + `SharedVisionLlmModule`; register `SpanEnricherInterceptor` as `APP_INTERCEPTOR` global provider
- [ ] 11.2 Smoke test: API boots cleanly with `OPENTRATTOS_OTEL_DISABLED=true` (default for dev) and serves the existing M2 endpoints

## 12. Documentation + handoff

- [ ] 12.1 `apps/api/src/ai-observability/README.md` — BC purpose, public surface, downstream slice anchors (#17a, #19, #20)
- [ ] 12.2 `apps/api/src/shared/vision-llm/README.md` — provider DI contract, factory selection, iron-rule null fallback (slice #17a owner)
- [ ] 12.3 `docs/architecture-decisions.md` — add ADR-VISION-OTEL-PRE-BOOTSTRAP, ADR-VISION-OTEL-SEMCONV-PINNED, ADR-VISION-TAG-ATTRIBUTE, ADR-VISION-PROVIDER-FACTORY, ADR-VISION-NO-CALLS-HERE, ADR-VISION-EXPORTER-CONFIG (extending architecture-m3.md decisions into canonical ADR doc)
- [ ] 12.4 Update `.env.example` with the 4 new `OPENTRATTOS_OTEL_*` env vars + 1 `OPENTRATTOS_VISION_LLM_PROVIDER` env var

## 13. CI + PR hygiene

- [ ] 13.1 `pnpm -w typecheck` passes
- [ ] 13.2 `pnpm -w lint` passes (including new `otel-pre-bootstrap-order` custom rule)
- [ ] 13.3 `pnpm -w test` passes (unit + INT including new `otel-semconv.spec.ts` + cold-boot startup-span INT test)
- [ ] 13.4 `openspec validate m3-vision-llm-provider-di-otel` returns 0
- [ ] 13.5 PR description cites the slice contract row, the 0 migration slots claimed (no schema in this slice), and the gotcha range claimed (150-159) per ai-playbook conventions
- [ ] 13.6 Gate D review: human reviewer confirms proposal.md + design.md + specs/ai-observability/spec.md + tasks.md are coherent before invoking `/opsx:apply`
