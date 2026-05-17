## ADDED Requirements

### Requirement: AI Observability bounded context scaffolds OTel + vision-LLM surfaces

The system SHALL provide a new bounded context at `apps/api/src/ai-observability/` exporting an OpenTelemetry tracer service, a span-enricher interceptor, a vision-LLM provider DI surface, and a typed pricing registry. The BC SHALL NOT include rollup tables, dashboard endpoints, budget enforcement, or vision-LLM call implementations — those are claimed by downstream slices (#17a, #19, #20).

#### Scenario: Module imports satisfy downstream slice consumers
- **WHEN** slice #17a (`m3-photo-ingest-backend`) imports `VisionLlmProvider` from `@nexandro/api/ai-observability`
- **THEN** the import resolves; the DI token is bound to the factory; the consumer can `@Inject(VisionLlmProvider)` in its service

#### Scenario: Downstream slice anchors exist as empty placeholders
- **WHEN** the BC directory is inspected after this slice's merge
- **THEN** `apps/api/src/ai-observability/rollup/`, `dashboard/`, `budget/` exist as empty directories with `.gitkeep` files — downstream slices (#19, #20) can add files without rebase conflicts

### Requirement: OpenTelemetry SDK initializes pre-bootstrap to capture NestJS startup

The system SHALL initialize the OpenTelemetry Node.js SDK (`NodeSDK.start()`) at the top of `apps/api/src/main.ts` BEFORE any other import or NestJS bootstrap call. The init SHALL be guarded by `NEXANDRO_OTEL_DISABLED` env (default `false`); when disabled, the SDK initializes a no-op exporter so spans still emit in-process but are discarded.

#### Scenario: Startup span captured by exporter on cold boot
- **WHEN** the API process starts with `NEXANDRO_OTEL_DISABLED=false` and a reachable OTLP endpoint
- **THEN** the exporter receives a span with `name='service.startup'` and resource attributes `service.name=nexandro-api` within 5s of process start

#### Scenario: Disabled exporter still emits spans in-process
- **WHEN** the API process starts with `NEXANDRO_OTEL_DISABLED=true`
- **THEN** `OtelService.startSpan()` returns a valid span object that can be sealed without error; the no-op exporter discards the span; no network call is made to any OTLP endpoint

#### Scenario: Pre-bootstrap order is enforced by ESLint rule
- **WHEN** a developer accidentally moves `NodeSDK.start()` below the NestJS imports in `main.ts`
- **THEN** the project's ESLint custom rule `nexandro/otel-pre-bootstrap-order` raises an error and CI blocks merge

### Requirement: gen_ai.* semantic conventions are pinned to specific OTel SemConv version

The system SHALL import `gen_ai.*` attribute constants from `@opentelemetry/semantic-conventions` pinned to an exact version (no `^` range). A CI test SHALL assert that every emitted span's attribute keys exactly match the pinned schema. Bumping the version SHALL require updating the pin in `package.json`, the CI test fixture, and verifying staging dashboards still render correctly.

#### Scenario: CI test validates pinned attribute set on every PR
- **WHEN** the `otel-semconv.spec.ts` CI test runs
- **THEN** it creates a sample span via `OtelService.startGenAiSpan('test', ...)`, reads the span's emitted attributes, and asserts the set of attribute keys exactly matches the pinned schema (no extra keys, no missing keys)

#### Scenario: Span with vendor-specific attribute warns at runtime
- **WHEN** caller code adds an attribute key that doesn't appear in the pinned `gen_ai.*` schema (e.g. `gen_ai.unknown.field`)
- **THEN** the span enricher logs a `warn`-level message naming the offending key; the span still emits (caller may have legitimate vendor extension)

### Requirement: SpanEnricherInterceptor adds nexandro.tag attribute to every span

The system SHALL provide a NestJS interceptor `SpanEnricherInterceptor` registered globally that enriches every emitted span with an `nexandro.tag` attribute. The tag SHALL be a free-form caller-supplied string (max 64 chars, kebab-case ASCII). When a span seals without an explicit tag, the interceptor SHALL assign `nexandro.tag='untagged'` and log a `warn`-level message.

#### Scenario: Tag attribute appears on every span by default
- **WHEN** any code path emits a span via `OtelService.startSpan(name, options)` with `options.tag='photo-ingest-batch'`
- **THEN** the emitted span has attribute `nexandro.tag='photo-ingest-batch'`

#### Scenario: Untagged span falls back to "untagged" with warning
- **WHEN** a span emits without an `options.tag` value (developer forgot)
- **THEN** the span emits with `nexandro.tag='untagged'`; a `warn`-level log entry is emitted naming the span name + module location

#### Scenario: Tag value exceeding 64 chars is rejected
- **WHEN** caller code attempts to emit a span with `options.tag` longer than 64 chars
- **THEN** the interceptor truncates to 64 chars and logs a `warn`-level message; no exception is raised (span still emits)

#### Scenario: Tag value with invalid chars is normalized
- **WHEN** caller code passes `options.tag='Photo Ingest Batch'` (spaces, capitals)
- **THEN** the interceptor normalizes to `photo-ingest-batch` (lowercase + kebab-case); the normalized value is emitted

### Requirement: Vision-LLM provider DI surface supports three adapters via factory

The system SHALL provide a `VisionLlmProvider` DI token in `apps/api/src/shared/vision-llm/` and a factory that selects an adapter based on the `NEXANDRO_VISION_LLM_PROVIDER` env. Three adapter classes SHALL be registered: `GptOssVisionRagProxyProvider` (default), `ClaudeVisionProvider`, `GptFourVProvider`. Adapter implementations of `extract(input)` SHALL throw `NotImplementedError` in this slice — real implementations land with slice #17a.

#### Scenario: Default provider is gpt-oss-vision-rag-proxy
- **WHEN** the API process starts without `NEXANDRO_VISION_LLM_PROVIDER` env set
- **THEN** the factory resolves `VisionLlmProvider` to an instance of `GptOssVisionRagProxyProvider`

#### Scenario: Env-selected provider overrides default
- **WHEN** the API process starts with `NEXANDRO_VISION_LLM_PROVIDER=claude-vision`
- **THEN** the factory resolves `VisionLlmProvider` to an instance of `ClaudeVisionProvider`

#### Scenario: Unknown provider name throws clear error at boot
- **WHEN** the API process starts with `NEXANDRO_VISION_LLM_PROVIDER=acme-vision` (not a known adapter)
- **THEN** the factory throws `UnknownVisionLlmProviderError('acme-vision; expected one of: gpt-oss-vision-rag-proxy, claude-vision, gpt-four-v')` at bootstrap; the API does NOT start

#### Scenario: Provider.extract() throws NotImplementedError in this slice
- **WHEN** any caller invokes `visionLlmProvider.extract({...})` (any adapter)
- **THEN** the method throws `NotImplementedError('Vision LLM extraction not yet wired; slice #17a delivers')`; this is verified by smoke test asserting no production code path outside `apps/api/src/photo-ingestion/` invokes the method

### Requirement: Iron-rule fallback to null on vision-LLM outage

When slice #17a wires the real `extract()` implementations, the adapters SHALL return `null` on any provider outage (network timeout, 5xx HTTP, rate-limit exhaustion after 3 exponential-backoff retries). Partial extractions SHALL NOT be returned. This slice DEFINES the type signature `Promise<VisionLlmOutput | null>`; slice #17a enforces the null-on-outage contract at the adapter implementation layer.

#### Scenario: Adapter signature includes null in return type
- **WHEN** a TypeScript consumer imports `VisionLlmProvider` and inspects the `extract` method signature
- **THEN** the return type is `Promise<VisionLlmOutput | null>` — TypeScript forces the consumer to handle the null case

#### Scenario: Slice #17a contract handoff is documented
- **WHEN** a developer reads `apps/api/src/shared/vision-llm/vision-llm-provider.interface.ts`
- **THEN** the file's JSDoc explicitly references slice #17a as the owner of the real `extract()` implementation + the null-on-outage contract test

### Requirement: Contracts package exports M3 AI-observability typed schemas

The system SHALL export the following Zod schemas from `packages/contracts/src/m3/ai-obs.ts`:
- `OtelSpanAttributes` — pinned `gen_ai.*` attribute set
- `VisionLlmInput` — input shape for vision-LLM extraction (image bytes/URL + tag + caller metadata)
- `VisionLlmOutput` — output shape (structured fields + per-field confidence)
- `OpenTrattOsTagAttribute` — free-form tag string with max-64-char + kebab-case-ASCII validation

#### Scenario: Downstream slice imports resolve cleanly
- **WHEN** slice #17a imports `import { VisionLlmInput, VisionLlmOutput, OpenTrattOsTagAttribute } from '@nexandro/contracts/m3/ai-obs'`
- **THEN** the imports resolve; Zod schemas can be used to validate runtime data and infer TS types

#### Scenario: Tag attribute Zod schema validates inputs
- **WHEN** `OpenTrattOsTagAttribute.safeParse('photo-ingest-batch')` is called
- **THEN** the result is `{ success: true, data: 'photo-ingest-batch' }`

#### Scenario: Tag attribute Zod schema rejects invalid inputs
- **WHEN** `OpenTrattOsTagAttribute.safeParse('Photo Ingest BATCH!')` is called
- **THEN** the result is `{ success: false, error: ... }` with an error message naming the failed constraint (max-64-char or kebab-case-ASCII)

### Requirement: M2 AI capabilities automatically gain OTel span emission via global interceptor

The system SHALL register `SpanEnricherInterceptor` as a global interceptor in `AppModule`. M2 AI capabilities (`recipe.yield-suggestion` Wave 1.7, `ai-corpus.search` Wave 1.8) SHALL start emitting OTel spans automatically without any code change to their existing services. Their externally-observable behaviour SHALL be unchanged.

#### Scenario: Wave 1.7 yield suggestion emits a gen_ai.* span
- **WHEN** a Manager invokes `POST /ai-suggestions/yield` after this slice's merge
- **THEN** an OTel span is emitted with `name='ai-suggestions.yield'`, attributes including `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `nexandro.tag='ai-yield-suggestion'`

#### Scenario: Existing M2 behaviour is unchanged
- **WHEN** the M2 ai-suggestions test suite runs against the post-merge codebase
- **THEN** all M2 ai-suggestions tests pass without modification; no new test is required by this slice for M2 behaviour preservation

### Requirement: OTLP/HTTP exporter is backend-agnostic and configured via environment

The system SHALL use the OTLP/HTTP exporter (not gRPC) by default. Configuration SHALL be exclusively environment-based: `NEXANDRO_OTEL_EXPORTER_ENDPOINT` (URL), `NEXANDRO_OTEL_EXPORTER_HEADERS` (comma-separated `key=value` pairs for tenant auth), `NEXANDRO_OTEL_SERVICE_NAME` (resource attribute), `NEXANDRO_OTEL_DISABLED` (boolean disable flag). The system SHALL NOT bundle Langfuse, Phoenix, Datadog, or Honeycomb client SDKs — consumers point OTLP at their backend.

#### Scenario: Custom headers reach the exporter
- **WHEN** the API starts with `NEXANDRO_OTEL_EXPORTER_HEADERS='x-langfuse-key=lf-12345,x-tenant=acme'`
- **THEN** the OTLP exporter includes both headers on every outgoing OTLP HTTP request

#### Scenario: Unset endpoint defaults to localhost:4318
- **WHEN** the API starts without `NEXANDRO_OTEL_EXPORTER_ENDPOINT` set
- **THEN** the exporter targets `http://localhost:4318/v1/traces` (standard OTel Collector default port)
