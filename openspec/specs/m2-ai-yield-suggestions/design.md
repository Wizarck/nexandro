## Context

PRD §FR16–19 mandates AI-Assisted Authoring with citation-or-no-suggestion iron rule. The model selection is per ADR-013 (`gpt-oss-20b-rag` as M2 default; pluggable for `claude-haiku-hermes` etc.). Foundation: `#1 m2-data-model` schema, `#2 m2-recipes-core` Recipe contract. The AI surface is feature-flagged (`NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED`) so the rest of M2 ships even if the AI path isn't ready or has an outage.

## Goals / Non-Goals

**Goals:**
- AI suggestion of `yieldPercent` for first-use Ingredients with citation (FR16).
- AI suggestion of recipe-level `wasteFactor` classified by recipe pattern (FR17).
- Chef override flow: accept / accept-then-tweak / reject with attribution (FR18).
- **Iron rule**: no suggestion without a citation URL (FR19) — no degradation to "trust me" mode.
- Citation snippet ≤500 chars captured at suggestion time (cited content can drift).
- Pluggable model contract (single feature flag, swap providers at config layer).

**Non-Goals:**
- Nutritional inference (that's `#5` + `#7`).
- Allergen detection (that's `#7`).
- Cross-recipe pattern learning / fine-tuning loops (M3+).

## Decisions

- **Iron rule enforced server-side, not in prompt.** **Rationale**: prompts can be jailbroken; server-side guard checks every response for a non-empty `citationUrl` field and rejects malformed responses with "no suggestion" rather than degrading. Alternative: trust prompt contract — rejected because LLMs occasionally hallucinate citations.
- **Citation snippet captured at suggestion time** (not lazily fetched). **Rationale**: cited URL content drifts (paywall, edit, 404). Capture protects audit. Limit 500 chars to avoid bloat.
- **Single feature flag `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED`** controls the entire surface. **Rationale**: simple kill-switch if model misbehaves or RAG endpoint is down. M2 must work without AI per PRD architectural pillar (Agent-Optional).
- **Override audit shape**: every accept / tweak / reject writes an `audit_log` row with `{userId, suggestionId, action, valueBefore, valueAfter, reason, citationUrl, snippet, modelName, modelVersion}`. **Rationale**: future regulators or quality reviews need full chain of who accepted what AI claim and why.
- **Default model `gpt-oss-20b-rag`** but the contract is `AiSuggestionProvider` interface. Adding `claude-haiku-hermes` is a config + provider class change, no contract change.

## Risks / Trade-offs

- [Risk] Iron rule starves users when model can't cite. **Mitigation**: PRD accepts this — chef enters manually. The alternative (un-cited suggestions) is regulatory poison.
- [Risk] Citation URLs drift / 404 over time. **Mitigation**: snapshot snippet captured at suggestion time; UI surfaces "URL no longer reachable" if probe fails but historical record is intact.
- [Risk] Cost: every suggestion is an LLM call. **Mitigation**: cache suggestion per `{ingredientId, contextHash}`; reuse for 30 days unless chef rejects. Per-org quota config.

## Migration Plan

Steps:
1. Implement `AiSuggestionProvider` interface in `apps/api/src/ai-suggestions/types.ts`.
2. M2 implementation `GptOssRagProvider` calling internal RAG endpoint.
3. `AiSuggestionsService` orchestrates: lookup cache → call provider → enforce iron rule → persist suggestion → return.
4. Endpoints: `POST /ai-suggestions/yield`, `POST /ai-suggestions/waste`, `POST /ai-suggestions/:id/accept`, `POST /ai-suggestions/:id/reject`.
5. UI: `YieldEditor` + `WasteFactorEditor` components with citation popover.
6. Feature flag wired via env + config service.

Rollback: set `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=false`; UI hides suggestion buttons; chef enters manually.

## Open Questions

- Should suggestion cache be per-org or global? **Pending**: M2 ships per-org for safety; M3 may federate after audit shows no PII leakage.
