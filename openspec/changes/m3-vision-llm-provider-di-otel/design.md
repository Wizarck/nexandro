## Context

M2 shipped two AI capabilities (`recipe.yield-suggestion` Wave 1.7, `ai-corpus.search` Wave 1.8) without OpenTelemetry. Cost per call is computable per-row from `ai_suggestions` rows but there is no `gen_ai.*` span trail, no `opentrattos.tag` drill-down, no provider-agnostic vision-LLM surface. M3 introduces 4-6 new AI capabilities (invoice photo extraction, product photo, CCP voice, recall dossier generation, etc) and 1 new external requirement (EU AI Act Article 50 transparency disclosure per FR43). Every one of them needs to emit OTel spans with consistent attribute shape, every one needs a cost line in slice #19's `ai_usage_rollup`, and every one of them needs to be observable in slice #20's dashboard.

Architecture-m3.md ADR-030 specifies the BC structure exactly:
```
apps/api/src/ai-observability/
  ai-observability.module.ts
  otel-tracer.service.ts
  pricing.ts                     (seeder; consumed by slice #19's rollup)
  span-enricher.interceptor.ts
  rollup/{...}                   (slice #19)
  dashboard/{...}                (slice #20)
  budget/{...}                   (slice #19)
```

This slice ships `ai-observability.module.ts` + `otel-tracer.service.ts` + `pricing.ts` (empty registry typed shape) + `span-enricher.interceptor.ts`. The `rollup/`, `dashboard/`, `budget/` subdirs stay empty placeholders (committed `.gitkeep` placeholders so downstream slices have known anchors).

ADR-038 specifies the vision-LLM provider DI surface: factory + 3 adapters + iron-rule null fallback. Photo-ingest slices (#17a/b, #18) consume the `VisionLlmProvider` DI token from here.

## Goals / Non-Goals

**Goals:**

- Pre-bootstrap OTel SDK init (`NodeSDK.start()` BEFORE any NestJS imports in `main.ts`) — captures NestJS startup spans.
- `gen_ai.*` semantic-conventions pinned to a specific vSPEC version (set in `package.json` as `@opentelemetry/semantic-conventions` exact version, no `^` range). CI test asserts emitted span attributes match the pinned schema.
- Span enricher interceptor adds `opentrattos.tag` JSONB attribute to every span, drives slice #20 widget #7 (cost-by-tag drill-down).
- Vision-LLM provider DI: factory + 3 adapter stubs (real implementations land with slice #17a per dependency contract).
- Backend-agnostic OTLP exporter — works with Langfuse, Phoenix, Datadog, Honeycomb, OpenTelemetry Collector, etc. Per-org backend selection via env (no code change to switch).
- Iron-rule fallback to `null` on vision-LLM outage (Wave 1.8 precedent, NEVER partial extraction).

**Non-Goals:**

- Rollup table (`ai_usage_rollup`) + hourly cron. Reserved for `m3-ai-obs-budget-tier-emitter` (slice #19).
- Pricing seeder execution (the seeder file SHAPE lands here; the actual prices + seed run go into slice #19 to keep migration coupling clean).
- Dashboard endpoints (`/ai-observability/dashboard/...`). Reserved for `m3-ai-obs-ui` (slice #20).
- Budget enforcement, burn-rate calculator, tier alerting. Reserved for slice #19.
- Actual vision-LLM CALLS — adapters are stubs. Slice #17a wires the real Anthropic/OpenAI/RAG-proxy invocations.
- LangSmith / Langfuse / Phoenix client SDKs. Backend-agnostic OTLP only; consumers pick their backend.
- Multi-instance Redis cache for dashboard. Out of MVP scope per ADR-030 dashboard caching sub-decision (revisit at Enterprise multi-instance phase).

## Decisions

### ADR-VISION-OTEL-PRE-BOOTSTRAP — OTel SDK init runs BEFORE NestJS imports

`apps/api/src/main.ts` opens with a `NodeSDK.start()` call before any other import has resolved. Reason: NestJS instantiates the entire DI container at `app = await NestFactory.create()` and emits startup spans for module-init lifecycle hooks. If the SDK initializes inside an `@Module()` provider's `onModuleInit()`, the startup-span trace is lost. The pre-bootstrap pattern matches the canonical OTel Node.js SDK example (`opentelemetry-node` README §"Auto-instrumentation").

**Alternative considered**: NestJS lifecycle hook (`@OnApplicationBootstrap`). Rejected: misses bootstrap spans by definition.

**Trade-off**: tests must mock the SDK init at the top of test files (a `jest.mock('@opentelemetry/sdk-node', ...)` pattern). M2 Wave 1.7 prototype proved this is a single helper at `apps/api/test/setup/mock-otel.ts` — copy that helper.

### ADR-VISION-OTEL-SEMCONV-PINNED — `gen_ai.*` semantic conventions pinned

`package.json` includes `@opentelemetry/semantic-conventions: "1.27.0"` (exact, NO `^` range). The `gen_ai.*` attribute names emitted by `OtelService` are exact constants imported from that package (e.g. `ATTR_GEN_AI_REQUEST_MODEL`, `ATTR_GEN_AI_USAGE_INPUT_TOKENS`).

CI test (`otel-semconv.spec.ts`) creates a span via `OtelService`, reads its attributes, asserts that the attribute *keys* exactly match the pinned 1.27.0 schema. **Bumping the semconv version requires explicit migration** — change the package.json pin + update the CI test fixture + run on staging + observe dashboard widgets still render correctly.

**Why pin?** OTel semconv is in active evolution (`gen_ai.*` jumped from v1.24 to v1.27 with rename in 3 months). Spans emitted by version-A backend may not be parseable by version-B dashboard config. Stable contract requires stable attribute keys.

### ADR-VISION-TAG-ATTRIBUTE — `opentrattos.tag` attribute is the cost drill-down primary key

Every span emitted via `OtelService.startSpan(name, options)` MUST include an `opentrattos.tag` attribute. The interceptor `SpanEnricherInterceptor` enforces this — if a span is sealed without the tag, the interceptor logs a warning at `warn` level and assigns `opentrattos.tag = 'untagged'` so the span still flows but is visibly mis-tagged in the dashboard.

Tag values are caller-supplied free-form strings (max 64 chars, kebab-case ASCII). Examples: `recall-investigation`, `photo-ingest-batch`, `appcc-export-quarterly`. Slice #20's widget #7 groups spend by this attribute.

**Rejected alternative**: enum-typed `OpenTrattOsTag` union. Reason: every new capability would require a contracts package update + propagate to every consumer. Free-form string keeps schema-free flexibility; the warning log catches typos at dashboard-review time.

### ADR-VISION-PROVIDER-FACTORY — three adapters, env-selected at module init

`VisionLlmFactory` reads `OPENTRATTOS_VISION_LLM_PROVIDER` (default: `gpt-oss-vision-rag-proxy`) at `onModuleInit()` and resolves the appropriate adapter:

| Env value | Adapter | Bundled in |
|---|---|---|
| `gpt-oss-vision-rag-proxy` (default) | `GptOssVisionRagProxyProvider` extending `tools/rag-proxy/` | AGPL community build |
| `claude-vision` | `ClaudeVisionProvider` | Enterprise build (adapter ships here; SDK bundling is slice #17a) |
| `gpt-four-v` | `GptFourVProvider` | Enterprise build (same) |

Factory caches the selection — no per-request branching cost.

**Iron-rule fallback (Wave 1.8 precedent)**: every adapter's `extract(input)` method returns `Promise<VisionLlmOutput | null>`. On provider outage (network timeout, 5xx, rate-limit exhaustion after 3 retries), adapter returns `null`. **NEVER partial extraction.** Slice #17a HITL queue surfaces null-extraction items as "manual entry required" (FR29 lowest band).

### ADR-VISION-NO-CALLS-HERE — adapters are stubs

The three vision providers ship with stub `extract()` methods that throw `NotImplementedError('Vision LLM extraction not yet wired; slice #17a delivers')`. Reason: real vision calls require pricing data (slice #19), audit envelope shape finalization (slice #21), and the HITL queue (slice #17a). Wiring partial calls now risks data integrity downstream.

The DI surface + module wiring IS available so slice #17a can land its consumer-side code without re-wiring imports.

### ADR-VISION-EXPORTER-CONFIG — OTLP/HTTP default, headers via env

OTLP/HTTP exporter (not gRPC) is the default — works through corporate firewalls, no port-4317 negotiation. Env vars per ADR-030:

| Env | Default | Purpose |
|---|---|---|
| `OPENTRATTOS_OTEL_EXPORTER_ENDPOINT` | `http://localhost:4318/v1/traces` | OTLP/HTTP endpoint |
| `OPENTRATTOS_OTEL_EXPORTER_HEADERS` | (empty) | Comma-separated `key=value` pairs for tenant auth (e.g. `x-langfuse-key=...,x-otel-tenant=org-XYZ`) |
| `OPENTRATTOS_OTEL_SERVICE_NAME` | `opentrattos-api` | Span `service.name` resource attribute |
| `OPENTRATTOS_OTEL_DISABLED` | `false` | Set `true` to disable exporter entirely (spans still emit in-process but discarded) |

`OPENTRATTOS_OTEL_DISABLED=true` is the rollback path — disable telemetry without redeploying.

## Risks / Trade-offs

- **[Risk]** OTel SDK pre-bootstrap is order-sensitive — any reordering of imports in `main.ts` can break startup-span capture silently. **Mitigation**: ESLint custom rule + a comment at the top of `main.ts` warning against reordering + INT test that asserts presence of `service.startup` span on cold boot.
- **[Risk]** Semconv version pin will drift over time as backend dashboards evolve. **Mitigation**: tracked as `m3-ai-obs-semconv-bump` followup; expected cadence ~every 6 months.
- **[Risk]** `opentrattos.tag = 'untagged'` warnings could go unnoticed at dashboard-review time. **Mitigation**: slice #20 widget #7 surfaces `untagged` as a paprika-coloured row at the top of the cost-by-tag table — visually impossible to miss.
- **[Risk]** Three vision adapter stubs throw `NotImplementedError` — calling them before slice #17a lands breaks the request. **Mitigation**: factory is wired only inside `apps/api/src/photo-ingestion/` (slice #17a territory); no other code path can invoke the providers. Smoke test verifies no other module imports the vision-llm DI token.
- **[Trade-off]** OTLP/HTTP is slightly slower than gRPC at high span throughput. **Trade-off**: portability through corporate firewalls and easier Cloudflare-Worker-compatible exporters outweighs the latency cost at MVP scale (~1k spans/min/org).

## Migration Plan

1. **Stage 1 — Schema + module wiring** (this PR):
   - `AiObservabilityModule` registered in `AppModule`, OTel SDK init in `main.ts`.
   - All vision adapters throw `NotImplementedError`.
   - Environment defaults to OTel disabled (`OPENTRATTOS_OTEL_DISABLED=true` in `.env.development`) until staging is wired.
2. **Stage 2 — Staging telemetry validation**:
   - Set `OPENTRATTOS_OTEL_EXPORTER_ENDPOINT=https://otel-collector.staging.example/v1/traces` on staging.
   - Trigger an M2 Wave 1.7 yield suggestion; assert a span appears in the collector with `gen_ai.request.model`, `gen_ai.usage.input_tokens`, etc.
   - Run the `otel-semconv.spec.ts` CI test on the deployed instance.
3. **Stage 3 — Slice #17a integration**:
   - Slice #17a's PR adds real `extract()` implementations to the three adapters.
   - This slice's stub `NotImplementedError` paths get exercised by slice #17a's PR's tests, not by this PR's.
4. **Rollback strategy**:
   - `OPENTRATTOS_OTEL_DISABLED=true` disables exporter without redeploy.
   - Removing the BC entirely requires reverting `main.ts` + dropping `AiObservabilityModule` + removing `apps/api/src/ai-observability/` directory. No schema, no data.

## Open Questions

- **OTel SDK bundle size impact on cold-start time**: NodeSDK + auto-instrumentations adds ~3-4 MB to the bundle. **Proposed answer**: measure during staging deploy; if cold-start > 5s budget, switch to manual `@opentelemetry/api` + selective `@opentelemetry/instrumentation-http` (no auto-instrumentations).
- **`opentrattos.tag` validation strictness**: should the interceptor REJECT spans without a tag (raise error), or just warn-and-default-to-untagged? **Proposed answer**: warn-only in this slice; slice #20 dashboard surfaces `untagged` row prominently. Strict rejection deferred to a future ai-playbook-style hook.
- **Per-org OTLP endpoint override**: an Enterprise customer might want their org's telemetry to flow to their own Langfuse instance. The current env-based config is process-global. **Proposed answer**: process-global for MVP. Per-org override (`organizations.otel_endpoint`) deferred as `m3-ai-obs-per-org-exporter` followup; trigger when first Enterprise customer asks.
