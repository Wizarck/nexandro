## Why

M3 introduces vision-LLM workloads (photo-ingest HITL review) and dashboard observability for every AI capability that has shipped to date (`recipe.yield-suggestion` Wave 1.7, `ai-corpus.search` Wave 1.8, plus M3's incoming `inventory.ingest-invoice-photo`, `inventory.ingest-product-photo`, `haccp.record-ccp-reading` agent surfaces, `recall.generate-dossier`). None of these emit OpenTelemetry spans today; cost is unknowable per-org per-capability per-model. Without this telemetry, NFR-OBS-1 through NFR-OBS-10 cannot be satisfied and slices #19 (budget tier emitter) + #20 (j8 dashboard UI) have no data to display.

Architecture-m3.md ADR-030 sketches the AI Observability bounded context across 4 sub-slices: (1) BC scaffold + OTel SDK init, (2) rollup table + cron, (3) 6-widget dashboard UI, (4) budget tier + burn-rate alerts. Per the Gate C cut, sub-slice (1) lives here (this slice); sub-slice (2)+(4) fold into slice #19; sub-slice (3) is slice #20. This slice also closes ADR-038 (Vision-LLM provider DI extension) — the photo-ingest slices (#17a / #17b / #18) directly consume the vision-llm DI surface this slice introduces.

This slice ships **infrastructure only** — no rollup tables, no dashboard, no budget enforcement. Just the BC scaffold + OTel exporters + provider DI surface. It is **independent** (no `Depends on` in the slice contract) and can launch day-1 in parallel with the Track A operational spine.

## What Changes

- **`apps/api/src/ai-observability/`** new BC scaffold:
  - `ai-observability.module.ts` (NestJS module; exports `OtelService`, `SpanEnricherInterceptor`, `VisionLlmProviderRegistry`)
  - `otel-tracer.service.ts` (`OtelService` — thin wrapper over `@opentelemetry/api` `Tracer` + helpers for `gen_ai.*` semantic-conventions span creation)
  - `span-enricher.interceptor.ts` (NestJS interceptor that adds `opentrattos.tag` JSONB attribute to every emitted span — caller-supplied label, e.g. `"recall-investigation"`, `"photo-ingest-batch"`)
  - `pricing.ts` (model→cost seeder consumed by slice #19's rollup; introduced empty here as the typed registry shape)
- **`apps/api/src/main.ts` modified** — OTel SDK init runs **pre-bootstrap** (`NodeSDK.start()` before any NestJS imports per ADR-030). Reads env vars: `OPENTRATTOS_OTEL_EXPORTER_ENDPOINT` (default OTLP/HTTP `http://localhost:4318/v1/traces`), `OPENTRATTOS_OTEL_EXPORTER_HEADERS` (comma-separated `key=value` pairs for tenant auth), `OPENTRATTOS_OTEL_SERVICE_NAME` (default `opentrattos-api`).
- **`apps/api/src/shared/vision-llm/`** new vision provider DI surface per ADR-038:
  - `vision-llm-provider.interface.ts` — `VisionLlmProvider` DI token + interface
  - `gpt-oss-vision-rag-proxy.provider.ts` (default; extends `tools/rag-proxy/` from Wave 1.8)
  - `claude-vision.provider.ts` (Anthropic SDK adapter; stubs only — not bundled until slice #17a wires real calls)
  - `gpt-four-v.provider.ts` (OpenAI SDK adapter; stubs only — same)
  - `vision-llm.factory.ts` (factory selecting provider via `OPENTRATTOS_VISION_LLM_PROVIDER` env, defaulting to `gpt-oss-vision-rag-proxy`)
  - Iron-rule fallback to `null` on outage (Wave 1.8 pattern — outage = manual entry, never partial extraction)
- **`packages/contracts/src/m3/ai-obs.ts`** new module:
  - `OtelSpanAttributes` Zod schema for the `gen_ai.*` attribute set this project pins (model, prompt, completion, token counts, tier, capability)
  - `VisionLlmInput` + `VisionLlmOutput` Zod types (consumed by slice #17a HITL review backend)
  - `OpenTrattOsTagAttribute` schema (free-form caller-supplied label, max 64 chars, kebab-case ASCII)
- **CI test asserts spans match pinned OTel `gen_ai.*` semantic conventions vSPEC** (per ADR-030 — pinned spec version; bump requires explicit migration).
- **BREAKING**: none. M2 AI capabilities (Wave 1.7 yield, Wave 1.8 corpus search) will start emitting spans automatically via the global `SpanEnricherInterceptor`, but their externally-observable behaviour is unchanged.

## Capabilities

### New Capabilities

- `ai-observability`: bounded context scaffold + OTel SDK + tracer service + span enricher + vision-LLM provider DI. Foundation for slices #17a (photo-ingest backend), #17b (review UI), #18 (photo storage lifecycle), #19 (budget tier emitter), #20 (dashboard UI). Does NOT include rollup tables, cron jobs, dashboard endpoints, or budget enforcement — those are claimed by downstream slices.

### Modified Capabilities

- `m2-ai-yield-suggestions` (Wave 1.7): AI yield suggestion service gains automatic OTel span emission via the global interceptor. Behavioural envelope unchanged; only telemetry surface added.

## Impact

- **Prerequisites**: M2 wave 1.19 merged (audit_log canonical exists, RAG proxy from Wave 1.8 available). No M3 prerequisites — slice has no `Depends on` in the canonical slice doc.
- **Code**:
  - `apps/api/src/ai-observability/` (new BC: ~400 LOC across 4 files + tests)
  - `apps/api/src/shared/vision-llm/` (new DI surface: ~250 LOC across 5 files + tests)
  - `apps/api/src/main.ts` (~20 LOC modification — OTel SDK pre-bootstrap)
  - `packages/contracts/src/m3/ai-obs.ts` (~80 LOC Zod schemas)
  - Tests: ~30 new unit + INT tests (span emission, provider factory selection, fallback semantics, pinned semconv assertions)
- **Performance**:
  - OTel span emission is async + batched (BatchSpanProcessor default config: 512-span buffer, 5s scheduled delay). Negligible request-path overhead (<1ms p99 measured in M2 Wave 1.7 prototype).
  - Vision-LLM provider factory caches its selection at module-init time; no per-request branching cost.
- **Storage**: none in this slice. Telemetry exits via OTLP to whichever backend the org configures (Langfuse / Phoenix / Datadog / Honeycomb — backend-agnostic per ADR-030 design intent).
- **Audit**: every AI call eventually produces an `audit_log` row via the existing M2 `AuditLogSubscriber` (no change here). Span emission is **observability**, not audit — distinct concerns per ADR-030.
- **Rollback**: `OPENTRATTOS_OTEL_EXPORTER_ENDPOINT` unset disables exporter (spans still emit in-process but discarded). Vision-LLM factory always defaults to `gpt-oss-vision-rag-proxy` if env unset. Removing the BC requires reverting the OTel SDK pre-bootstrap line in `main.ts` and the `AiObservabilityModule` import — no schema, no data to migrate.
- **Out of scope** (claimed by other slices):
  - `ai_pricing` table + seeder execution → `m3-ai-obs-budget-tier-emitter` (slice #19)
  - `ai_usage_rollup` table + hourly cron → slice #19
  - 6-widget dashboard UI (j8) → `m3-ai-obs-ui` (slice #20)
  - Photo-ingest extraction API + queue → `m3-photo-ingest-backend` (slice #17a)
  - Photo storage lifecycle → `m3-photo-storage-lifecycle` (slice #18)
  - Budget tier alerts + burn-rate calculator → slice #19
- **Parallelism**: this slice has **no `Depends on`** (independent infra). It writes exclusively to `apps/api/src/ai-observability/` + `apps/api/src/shared/vision-llm/` + `apps/api/src/main.ts` + `packages/contracts/src/m3/ai-obs.ts`. Track A slices (operational spine) do NOT touch any of these paths. Track C slices (`m3-lot-expiry-alerts` #3, `m3-audit-log-hash-chain-hardening` #21, `m3-email-dispatch-di` #22) are also disjoint. This slice and slice #22 can run **fully in parallel from day one** without rebase conflicts.
