# retros/m2-ai-yield-suggestions.md

> **Slice**: `m2-ai-yield-suggestions` · **PR**: [#87](https://github.com/Wizarck/nexandro/pull/87) · **Merged**: 2026-05-05 · **Squash SHA**: `81019a8`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **M2 backlog closes** with this slice (Wave 1.7, single-thread). FR16-19 AI-Assisted Authoring with iron-rule citation contract — the M2 differentiator. First slice that ships a pluggable provider abstraction registered at the module layer (Claude Haiku / Hermes future swap). Fifth slice using the unified-table-as-cache+audit pattern (after #7 / #13 / #15 / #16).

## What we shipped

**Migration 0016 + AiSuggestion entity:**
- Single unified `ai_suggestions` table consolidating cache + audit (audit_log table doesn't exist yet — same pattern as #7 / #13 / #15 / #16 / #18)
- DB-level CHECKs: `kind ∈ ('yield','waste')`, `status ∈ ('pending','accepted','rejected')`, target XOR (yield ⇒ ingredientId XOR waste ⇒ recipeId), `snippet ≤ 500 chars`, `suggested_value ∈ [0,1]`
- 30d TTL via `expires_at = created_at + 30 days` set at insertion (lazy expiration on read)
- Two indexes: cache-lookup `(orgId, kind, target_*, contextHash, status, expires_at)` + audit-lookup partial `(orgId, actedByUserId, actedAt) WHERE actedByUserId IS NOT NULL`
- Entity with `create()` factory enforcing iron rule + helpers `isCacheable(now?)` + `effectiveValue()` (returns `acceptedValue ?? suggestedValue`)

**Provider abstraction + GptOssRagProvider:**
- `AiSuggestionProvider` interface: `suggestYield(input)` + `suggestWaste(input)` → `ProviderResult | null`. Pluggable via `AI_SUGGESTION_PROVIDER` DI token; future Claude Haiku / Hermes providers swap at config layer.
- `GptOssRagProvider` HTTP client wrapping internal RAG endpoint. Wire format consumed: `POST {baseUrl}/yield body { organizationId, ingredientId, contextHash }` returning `{ value, citationUrl, snippet }`. The hybrid corpus + web-search fallback per Gate D 2c is the RAG endpoint's responsibility — this client just enforces the contract.
- Failure modes (network errors / 4xx / 5xx / parse / timeout / aborted) all surface as `null` — the controller continues to serve a "no suggestion available" envelope. Provider NEVER crashes.
- Config from env: `NEXANDRO_AI_RAG_BASE_URL`, `NEXANDRO_AI_RAG_API_KEY`, `NEXANDRO_AI_RAG_TIMEOUT_MS` (default 5000), `NEXANDRO_AI_RAG_MODEL_NAME/_VERSION` overrides.

**Iron-rule guard (FR19):**
- `applyIronRule(result)` server-side check: rejects responses with empty/null `citationUrl` OR `snippet`, value out of `[0, 1]`, or NaN. Truncates snippet to 500 chars + ellipsis marker `…` (mirrors DB-level CHECK).
- 12 unit tests covering every branch.

**AiSuggestionsService:**
- `suggestYield` / `suggestWaste`: cache lookup → provider call → iron-rule guard → persist row. Cache lookup excludes rejected + expired rows (`status='pending' AND expires_at > now()`).
- `acceptSuggestion`: optional `valueOverride` (tweak) with range check; transactional UPDATE; throws `AiSuggestionAlreadyActedError` if already acted.
- `rejectSuggestion`: reason ≥10 chars (matches override convention from #7 / #13 / #15); transactional UPDATE.
- Defence-in-depth feature flag: throws `AiSuggestionsDisabledError` on every method when off (the controller also returns 404).

**Endpoints:**
- `POST /ai-suggestions/yield` body `{ organizationId, ingredientId, contextHash }` → wrapped envelope `{ suggestion: AiSuggestionResponseDto | null, reason?: 'no_citation_available' }`
- `POST /ai-suggestions/waste` body `{ organizationId, recipeId, contextHash }` → same shape
- `POST /ai-suggestions/:id/accept` body `{ organizationId, value? }` (value present = tweak)
- `POST /ai-suggestions/:id/reject` body `{ organizationId, reason }` (reason ≥10 chars)
- RBAC: Owner+Manager only (Staff blocked at 403 by global RolesGuard). Feature flag returns 404 on every endpoint when off.
- Error translations: 404 (NotFound + Disabled), 409 (AlreadyActed), 422 (RejectReason too short, TweakValue out of range).

**UI (`YieldEditor` + `WasteFactorEditor`):**
- Shared `AiSuggestionEditor` core (~400 LOC) parameterized by `kind: 'yield' | 'waste'`, `title`, `label`, `helpText`. `YieldEditor` and `WasteFactorEditor` are thin wrappers. Net code reuse: zero duplication of the citation popover + accept-tweak-reject state machine.
- Citation popover: URL link (target=_blank rel=noopener), captured snippet, model name. ARIA `aria-expanded` / `aria-controls` for accessibility.
- Accept flow: "Aceptar" (no tweak) emits `onAccept()`. Tweak input + "Aceptar tweak" emits `onAccept(value)` with clamping to `[0, 1]`.
- Reject flow: textarea with reason ≥10 chars validation; "Confirmar rechazo" / "Cancelar" buttons.
- Iron-rule UI state: when `noCitationAvailable=true` and no suggestion, surfaces "Manual entry only — no citation available" inline (FR19 chef-facing message).
- `aiEnabled=false` hides the AI affordances entirely (degrades to a plain number input).
- 27 vitest tests across both components covering all states + ARIA roles + reason validation. 11 Storybook stories.

**apps/web wiring:**
- 4 TanStack mutations (`useYieldSuggestion`, `useWasteSuggestion`, `useAcceptAiSuggestion`, `useRejectAiSuggestion`) hitting the 4 endpoints with typed envelope responses.
- `RecipeBuilderJ1Screen` wires both editors: yield surfaces when ingredient picked; waste surfaces when recipe + org both resolved.
- Bundle: 99.68 KB gzipped (+2 KB vs prior labels-only state).

**Tests: 803/803 verde** (612 backend + 156 ui-kit + 18 label-renderer + 17 mcp-server). Lint clean across all 4 workspaces.

## What worked

- **Pluggable provider via DI token + factory** kept the slice future-proof. The day Claude Haiku / Hermes lands, it's a new class implementing `AiSuggestionProvider` + a registration line in the module factory. No service refactor, no controller change, no DTO change. **Pattern confirmed: define the interface AT the module layer, not inside the service.**
- **Iron-rule guard as a pure function** outside the service (`applyIronRule` in `types.ts`) made it easy to unit-test without DB / NestJS context. 12 tests covering every branch (null inputs, empty/whitespace fields, NaN, out-of-range, snippet truncation) ran in <50ms total.
- **Provider stub in tests via `fetcher` constructor injection.** No `jest.mock('node-fetch')` plumbing; just pass a fake `fetch` in the constructor. Tested all 7 failure modes (200 happy / 200 null / 204 / non-2xx / network-error / malformed-JSON / timeout) without touching the real HTTP layer.
- **Single unified `ai_suggestions` table** instead of separate `ai_suggestion_cache` + `audit_log`. Pattern from #7 / #13 / #15 / #16 confirmed: until the audit_log slice ships, consolidate cache + audit into one table per BC. Reduces JOINs, simplifies cache invalidation (the same row's `status` flip IS the audit record).
- **Cache lookup as `findOne` with `MoreThan(now)` for expiresAt** worked first try. TypeORM's operators compose cleanly with the entity's column types.
- **Defence-in-depth feature flag** at controller (404) AND service (DisabledError) caught a class of bugs where someone might bypass the controller (e.g. via a future RPC layer or service-to-service call). Cheap to add; expensive to forget.
- **Shared `AiSuggestionEditor` core for both editors.** Two thin wrappers + one core. Saved ~300 LOC of duplication and ensured the citation popover / accept / reject behaviour stays identical between yield and waste. Per-component file convention preserved (each has its own `index.ts`, `.types.ts`, `.test.tsx`, `.stories.tsx`).
- **Reason ≥10 chars enforced server-side AND client-side** with the same constant `MIN_REJECT_REASON_LENGTH = 10`. Matches the override convention from #13 / #15 / #16. Future codegen pipeline will dedupe these constants; for now hand-mirrored in `YieldEditor.types.ts`.
- **Wrapped envelope `{ suggestion, reason? }` simplified the iron-rule UI**. The component just checks `props.noCitationAvailable` instead of parsing error codes — the controller does the unwrapping.
- **`onAccept(undefined)` vs `onAccept()` distinction caught by vitest.** Initial test asserted `toHaveBeenCalledWith(undefined)` but the component called `onAccept()` (zero args). vitest correctly surfaced this as a failure. Fixed by asserting `mock.calls[0]` deeply equals `[]`. **Pattern: zero-arg callbacks fail `toHaveBeenCalledWith(undefined)`; assert against `mock.calls[0]` instead.**
- **CI 7/7 required checks green on first push.** Lint + Build + Test + Integration + Storybook + Gitleaks + Build (web). No retries, no flakes. Pattern of running full local suite before push continues to pay off.

## What didn't (and the fixes)

- **Initial test linting failure** — unused `state` destructure in the expired-row test (`const { service, state, stub } = build(...)` — `state` never used in that test's assertions). Caught by `noUnusedVars`. Fixed by removing the unused destructure. Pre-flight `npm run lint` would have caught this; lesson: run lint before pushing the test commit.
- **`onAccept(undefined)` test assertion bug** — vitest distinguishes between `onAccept()` and `onAccept(undefined)` even though both produce `args[0] === undefined`. Fixed by asserting `mock.calls[0]` deeply equals `[]`. Cost: 5 minutes; lesson noted above.
- **First TS error from the unused `suggestion` arg in `RejectedBadge`** — extracted but not consumed. Fixed by destructuring only `kind`. Took 30 seconds; the strictness pays off long-term (catches dead props).
- **Initial `acceptedValue` confusion in tests**: the entity stores `acceptedValue: number | null`. When chef accepts WITHOUT tweak, the field stays `null` (the suggested value is the effective value). When chef tweaks, `acceptedValue` is the tweaked number. Took 1 iteration to get the test fixture shape right. Lesson: document the "null = no tweak" convention in the entity, which I did in the `effectiveValue()` JSDoc.

## Surprises

- **The provider abstraction's `null` failure-mode contract turned out to be the cleanest part of the slice.** Every failure (network, 5xx, parse, timeout, abort, unknown body shape) collapses to `null`. The service never has to think about provider errors specifically — it just sees "got a result" or "no result". Iron rule applies same way regardless of why. This is a strong pattern for any external service integration where partial failure shouldn't crash the request.
- **The "single unified table" pattern is now battle-tested across 5 BCs.** The same shape (entity row that's both cache AND audit) works for: allergen overrides (#7), ingredient overrides (#13), Org label fields (#16), recipe portions, AND now AI suggestions. The lazy expiration on read + status-based filtering + transactional state transitions give us correctness without an audit_log table. When audit_log ships in M3+, a one-time migration will project the existing rows into the proper schema.
- **The shared `AiSuggestionEditor` core handled both editors with zero behaviour divergence.** I expected at least one edge case where `WasteFactorEditor` would need different validation. None materialised. Both editors are functionally identical except for labels.
- **`useMutation` + state in parent + presentational component** turned out to be the right factoring. The component takes ~10 props; the parent wires them up with 4 mutations + 4 state setters. This kept the component reusable (could power a future inline editor in MenuItem-creation flow) without coupling it to TanStack Query specifics.
- **CodeRabbit was still in review when admin-merge fired.** Same pattern as last 2 slices: required checks gate merge, advisory checks (CR) gate confidence in retro. The retro can record any CR findings post-merge as follow-ups.
- **Single-thread for this slice was correct.** Subagents shine for orthogonal slices; AI suggestions touches: a new BC + a new schema + UI components + apps/web wiring. The verification gate (iron rule must hold across server + UI) needs end-to-end visibility. This is the same call as `m2-labels-rendering` (single-thread for cross-BC verification gates).

## What to keep

- **Provider abstraction via DI token + factory at module layer.** Stable interface; future providers drop in.
- **`null` as the universal failure mode for external service calls.** Network / 5xx / parse / timeout all collapse to a single semantic: "no result available". The caller doesn't need a discriminated union of error types.
- **Iron rule as a pure function**, not a class method. Unit-testable in isolation; reusable if a future provider adapter wants to apply it pre-emptively.
- **Single-table cache + audit pattern** (now 5 BCs). Until audit_log ships, this is the canonical answer.
- **Defence-in-depth feature flags**: controller returns 404 + service throws Disabled. Both gates needed.
- **Shared core component + thin wrappers** for components that differ only in labels. Saves duplication AND ensures behavioural parity.
- **Wrapped envelope with optional `reason` field** for endpoints that can legitimately return "no result". The reason is parseable; clients don't need to distinguish HTTP 200 with empty body vs explicit "no result".
- **Reason ≥10 chars on rejects** as a conventional constant across BCs. Hand-mirrored constant for now; codegen later.

## Pending technical debt (filed)

- **`m2-ai-yield-corpus`** — RAG corpus ingestion (CIAA + USDA + cookbook references) is operational, NOT code. Owns its own ADR + ops tooling. Required before flipping `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` in production.
- **`m2-ai-yield-web-fallback`** — alternative orchestration if Gate D 2c moves out of the RAG endpoint into the apps/api layer. Currently the RAG endpoint owns the corpus + web-search fallback; if that becomes operationally awkward, we'd ship an explicit `WebSearchProvider` chained behind the corpus provider.
- **`audit_log` table** — at least 5 events now reserved against it. Pressure increasing for a dedicated audit slice.
- **DTO codegen pipeline** — hand-mirrored `AiSuggestionShape` (and `LabelApiError`, etc.) in ui-kit duplicates apps/api types. 14+ type files now hand-mirrored across slices. Codegen would unblock several slices' duplication.
- **Anthropic key + Claude Haiku adapter** — filed for future when Master adopts paid Anthropic key. Adapter slot already wired; just need the implementation class.
- **`AcceptedValue` + tweak audit clarity** — when chef tweaks 0.85 → 0.7, the row stores `suggestedValue=0.85, acceptedValue=0.7, status=accepted`. UI surfaces both values via the "Aceptado: 70% (tweak — IA sugirió 85%)" badge. A future audit-log slice should preserve both values in the audit projection.
- **Cache key includes contextHash** — the chef has to compute this client-side. M3 may centralise contextHash computation in a hook (e.g. `useContextHash(recipe, lines)` that hashes the relevant inputs).
- **Per-org quota / rate-limit on AI calls** — not implemented in M2; defence against runaway costs. Filed for `m2-wrap-up` or M3.

## What to do next

- **`m2-wrap-up`** is the natural next slice: flip `NEXANDRO_LABELS_PROD_ENABLED=true` after labels legal review + flip `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` after corpus ingestion. Closes M2 in production.
- **`m2-ai-yield-corpus`** — operational slice (not code-heavy); ingest curated culinary references into the RAG vector store.
- **Update `project_m1_state.md` memory** — M2 backlog = 0; pivot to M2 wrap-up + M3 planning.
- **Decide M2.x vs M3 jump**: M2.x candidates are bilingual labels, AgentChatWidget UI, WhatsApp routing. M3 candidates are HACCP / inventory / batches. Master's call.
