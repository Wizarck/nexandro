## 1. Migration + AiSuggestion entity

- [ ] 1.1 Migration `0016_ai_suggestions.ts` — single table consolidating cache + audit:
  - `id uuid PK`, `organization_id uuid NOT NULL`
  - `kind text NOT NULL CHECK (kind IN ('yield','waste'))`
  - `target_ingredient_id uuid NULL`, `target_recipe_id uuid NULL` (exactly one populated per `kind`)
  - `context_hash text NOT NULL`
  - `suggested_value numeric(8,4) NOT NULL`
  - `citation_url text NOT NULL`, `snippet text NOT NULL` (≤500 chars)
  - `model_name text NOT NULL`, `model_version text NOT NULL`
  - `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected'))`
  - `accepted_value numeric(8,4) NULL`, `rejected_reason text NULL`
  - `acted_by_user_id uuid NULL`, `acted_at timestamptz NULL`
  - `created_at timestamptz NOT NULL DEFAULT now()`, `expires_at timestamptz NOT NULL`
  - Index `(organization_id, kind, target_ingredient_id, target_recipe_id, context_hash, status, expires_at)` for cache lookup
- [ ] 1.2 `AiSuggestion` TypeORM entity at `apps/api/src/ai-suggestions/domain/ai-suggestion.entity.ts`

## 2. Provider abstraction + GptOssRagProvider (Gate D 1a)

- [ ] 2.1 `apps/api/src/ai-suggestions/types.ts` — `AiSuggestionProvider` interface with `suggestYield(input)` + `suggestWaste(input)` returning `{ value, citationUrl, snippet, modelName, modelVersion } | null`
- [ ] 2.2 `GptOssRagProvider` HTTP client wrapping internal RAG endpoint. Config from env:
  - `NEXANDRO_AI_RAG_BASE_URL` (required when feature flag on)
  - `NEXANDRO_AI_RAG_API_KEY` (optional Bearer)
  - `NEXANDRO_AI_RAG_TIMEOUT_MS` (default 5000)
- [ ] 2.3 Iron-rule guard (FR19): server-side check rejects responses with empty/null `citationUrl` AND empty/null `snippet`. Hybrid corpus + web-search fallback per Gate D 2c is the RAG endpoint's responsibility — apps/api enforces the contract, not the orchestration
- [ ] 2.4 Snippet truncation: ≤500 chars + ellipsis marker `…` if cut
- [ ] 2.5 Network errors / non-2xx / parse errors → return `null` (no suggestion offered) — never crash the controller

## 3. AiSuggestionsService

- [ ] 3.1 `suggestYield(orgId, ingredientId, contextHash)` — cache lookup → provider call → iron-rule check → persist row → return DTO
- [ ] 3.2 `suggestWaste(orgId, recipeId, contextHash)` — same flow
- [ ] 3.3 `acceptSuggestion(orgId, userId, suggestionId, valueOverride?)` — UPDATE row SET status='accepted', accepted_value=?, acted_by_user_id=?, acted_at=now()
- [ ] 3.4 `rejectSuggestion(orgId, userId, suggestionId, reason)` — reason ≥10 chars; UPDATE row SET status='rejected', rejected_reason=?, acted_by_user_id=?, acted_at=now()
- [ ] 3.5 Cache lookup excludes rejected rows + expired rows (only `status='pending' AND expires_at > now()`)
- [ ] 3.6 30d TTL via `expires_at = created_at + INTERVAL '30 days'`

## 4. Endpoints + DTOs

- [ ] 4.1 `POST /ai-suggestions/yield` — body `{organizationId, ingredientId, contextHash}` → `AiSuggestionResponseDto | { suggestion: null, reason }`
- [ ] 4.2 `POST /ai-suggestions/waste` — body `{organizationId, recipeId, contextHash}` → same shape
- [ ] 4.3 `POST /ai-suggestions/:id/accept` — body `{organizationId, value?}` (value present = tweak)
- [ ] 4.4 `POST /ai-suggestions/:id/reject` — body `{organizationId, reason}` (reason ≥10 chars)
- [ ] 4.5 RBAC: Owner+Manager for all endpoints; Staff blocked
- [ ] 4.6 Feature-flag guard: `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=false` → 404 on every endpoint
- [ ] 4.7 Validation: contextHash required + non-empty; reason ≥10 chars on reject; value within `[0, 1]` on tweak

## 5. UI: YieldEditor + WasteFactorEditor

- [ ] 5.1 `packages/ui-kit/src/components/YieldEditor/{tsx, types, stories, test, index}` — number input (0–100%) + "Sugerir IA" button; citation popover (URL + snippet); accept / accept-then-tweak / reject affordances; reason field validated ≥10 chars on reject
- [ ] 5.2 `packages/ui-kit/src/components/WasteFactorEditor/` — same pattern for recipe-level waste %
- [ ] 5.3 No-citation state: editor renders "manual entry only — no citation available" inline (per FR19)
- [ ] 5.4 Loading state during AI call (spinner inline next to button)
- [ ] 5.5 Both components hide AI affordances when `aiEnabled` prop = false
- [ ] 5.6 Storybook: with-suggestion, no-citation, loading, accepted, accepted-with-tweak, rejected, manual-only
- [ ] 5.7 ARIA: button + popover patterns; reason field labelled; status updates `aria-live=polite`

## 6. apps/web hooks + RecipeBuilderJ1Screen

- [ ] 6.1 `useYieldSuggestion()` — TanStack mutation hitting `POST /ai-suggestions/yield`
- [ ] 6.2 `useWasteSuggestion()` — mutation
- [ ] 6.3 `useAcceptAiSuggestion()` + `useRejectAiSuggestion()` — mutations
- [ ] 6.4 Wire YieldEditor + WasteFactorEditor into the J1 screen alongside existing IngredientPicker / Recipe builder

## 7. Tests

- [ ] 7.1 Unit: iron-rule guard rejects responses with empty/null citationUrl OR empty/null snippet
- [ ] 7.2 Unit: snippet truncation at 500 chars with ellipsis
- [ ] 7.3 Unit: GptOssRagProvider mocked-fetch happy path + 5xx error → null + timeout → null
- [ ] 7.4 Service: cache hit returns same row without provider call
- [ ] 7.5 Service: rejected row not returned from cache; next call hits provider again
- [ ] 7.6 Service: expired row not returned from cache
- [ ] 7.7 Service: accept persists `accepted_value` + audit fields
- [ ] 7.8 Service: reject with reason <10 chars throws `RejectReasonError` → 422
- [ ] 7.9 Controller: feature flag off → 404 on every endpoint
- [ ] 7.10 Controller: Staff role blocked → 403
- [ ] 7.11 ui-kit: YieldEditor + WasteFactorEditor render all states + ARIA + reason validation
- [ ] 7.12 apps/web: hooks call correct endpoints + body shape

## 8. Verification

- [ ] 8.1 Run `openspec validate m2-ai-yield-suggestions` — must pass
- [ ] 8.2 `npm test --workspace=apps/api` green; ≥15 new tests across provider + service + controller
- [ ] 8.3 `npm test --workspace=packages/ui-kit` green; ≥10 new YieldEditor + WasteFactorEditor tests
- [ ] 8.4 Lint clean across all 5 workspaces
- [ ] 8.5 apps/web build clean
- [ ] 8.6 Manual smoke (deferred to post-deploy): `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` + RAG endpoint live → chef sees citation + accepts + audit row + UI shows accepted state

## 9. CI + landing

- [ ] 9.1 Implementation pushed (Gate D approved in chat: 1a / 2c / 3 / 4a / 5 / 6 N/A)
- [ ] 9.2 All CI checks green; admin-merge once required checks pass
- [ ] 9.3 Archive `openspec/changes/m2-ai-yield-suggestions/` → `openspec/specs/m2-ai-yield-suggestions/`
- [ ] 9.4 Write `retros/m2-ai-yield-suggestions.md`
- [ ] 9.5 Update auto-memory `project_m1_state.md` — **M2 backlog closes; mark M2 complete; pivot to M2 wrap-up + M3 planning**
- [ ] 9.6 File follow-up slices:
  - `m2-ai-yield-corpus` — ingest CIAA + USDA + cookbook references into the RAG vector store (operational; outside the slice's wire format)
  - `m2-ai-yield-web-fallback` — explicit web-search fallback layer at apps/api when RAG endpoint returns no citation (alternative orchestration to the RAG-internal hybrid; useful if Gate D 2c moves to apps/api orchestration)
  - `m2-wrap-up` — flip `NEXANDRO_LABELS_PROD_ENABLED=true` post legal review + flip `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` post corpus ingestion
