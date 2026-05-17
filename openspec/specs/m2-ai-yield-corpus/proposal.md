## Why

`m2-ai-yield-suggestions` (Wave 1.7) shipped the apps/api surface — provider abstraction, iron-rule guard, audit/cache table, controllers, UI editors. It is gated by `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=false` in production because **no real RAG endpoint is wired**: the contract `{value, citationUrl, snippet}` exists, but nothing on the other side returns useful answers.

This slice closes that gap operationally. It is a 3-leg delivery:

1. **Corpus**: ingest authoritative sources (USDA FoodData Central, EU Reglamento 1169/2011, CIAA Spain, Escoffier *Le Guide Culinaire* public-domain edition) into the existing RAGAnything+LightRAG deployment on the VPS.
2. **Proxy**: a thin Python FastAPI service (`rag-proxy`) sitting in front of LightRAG that (a) translates LightRAG's prose+references response into the canonical `{value, citationUrl, snippet}` contract, (b) injects a JSON-only `user_prompt` per LightRAG capability, (c) falls back to Brave Search API (with a whitelist of authoritative domains) when LightRAG returns no high-confidence match, (d) preflights the iron rule before responding.
3. **Zero changes to apps/api**: `GptOssRagProvider` already speaks the canonical contract. Pointing `NEXANDRO_AI_RAG_BASE_URL` at the proxy is the only consumer-side change. No new TypeScript provider class.

LightRAG is **not modified**. All translation logic lives in the proxy.

## What Changes

- New `tools/rag-proxy/` Python package: FastAPI service, ~250 LOC, Dockerized, deploys on the VPS alongside LightRAG.
  - `POST /query` accepting `{kind: 'yield'|'waste', query, context}` and returning `{value, citationUrl, snippet} | null`.
  - Iron-rule guard mirrored from `apps/api/src/ai-suggestions/application/types.ts::applyIronRule` (citationUrl + snippet non-empty + value ∈ [0,1]).
  - Configurable score threshold (default `0.6` over LightRAG hybrid score) before triggering Brave fallback.
  - Brave Search domain whitelist (default: `fdc.nal.usda.gov`, `eur-lex.europa.eu`, `efsa.europa.eu`, `fda.gov`, `who.int`, `fao.org`, `ciaa.es`, `sciencedirect.com` open-access only).
- New `tools/rag-corpus/` Python package: ingestion scripts using RAGAnything's library API.
  - `ingest_usda.py` — FoodData Central CSV → RAGAnything → LightRAG.
  - `ingest_eu_1169.py` — Reglamento 1169/2011 PDF → RAGAnything → LightRAG.
  - `ingest_ciaa.py` — CIAA Spain materials (gated on permission email; placeholder + clear license note).
  - `ingest_escoffier.py` — *Le Guide Culinaire* via Project Gutenberg (public domain, +100 years).
  - Each script idempotent + checkpointable; logs source URL + hash + ingestion timestamp.
- New ADRs (M2 series, 4 entries) in `docs/architecture-decisions.md` documenting:
  - Corpus licensing matrix.
  - rag-proxy architecture + iron-rule preflight.
  - Brave Search domain whitelist + fallback semantics.
  - LightRAG `→` canonical contract response mapping.
- `apps/api/.env.example`: documents that `NEXANDRO_AI_RAG_BASE_URL` should point at the proxy, not at LightRAG directly.
- **BREAKING**: none — additive, behind the existing feature flag.

## Capabilities

### New Capabilities

- `m2-ai-yield-corpus`: operational corpus + RAG-proxy infrastructure. Closes the loop on `m2-ai-yield-suggestions` so the feature flag can be flipped on.

### Modified Capabilities

- `m2-ai-yield-suggestions` (operationally): the existing slice's `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` flag becomes flippable to `true` once the proxy is deployed and corpus ingested. No code changes there.

## Impact

- **Prerequisites**: `m2-ai-yield-suggestions` (Wave 1.7) merged. ✅
- **Code**: `tools/rag-proxy/` + `tools/rag-corpus/` (Python, separate from the TypeScript monorepo workspaces). `apps/api/.env.example` documentation update.
- **External dependencies**:
  - LightRAG already running on the user's VPS (RAGAnything ingestion + LightRAG retrieval, default config: bge-m3 + nano-vectordb).
  - Brave Search API key (env `BRAVE_API_KEY`, never committed).
  - Python 3.12 runtime on the VPS for proxy + ingestion scripts.
- **Audit**: every suggestion that reaches apps/api still produces an `ai_suggestions` row per Wave 1.7. The proxy is stateless — it does not write to the database.
- **Rollback**: stop the proxy container; apps/api falls back to "manual entry only" via the existing iron-rule null path. No data integrity risk.
- **Out of scope**:
  - Modern cookbooks (Larousse, CIA, McGee) — separate slice `m2-ai-yield-cookbooks-modern` after legal due diligence.
  - LightRAG structured-outputs patch (forces 100% valid JSON) — separate slice `m2-ai-yield-structured-outputs` if the prompt-engineering reliability of `user_prompt` proves insufficient in practice.
  - VPS provisioning / TLS / reverse proxy config — that is operational documentation, not a code slice.
  - Claude Haiku / Hermes provider — pluggable via existing `AI_SUGGESTION_PROVIDER` DI token from Wave 1.7; no contract change.
