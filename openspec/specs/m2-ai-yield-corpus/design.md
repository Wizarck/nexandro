## Context

Wave 1.7 (`m2-ai-yield-suggestions`) shipped the apps/api surface for AI yield + waste suggestions with the iron-rule citation guard. The feature flag `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` is `false` in production because no real RAG endpoint backs it. This slice provides that backing.

The user already runs RAGAnything (HKUDS/RAG-Anything, multimodal ingestion library) wrapping LightRAG (HKUDS/LightRAG, retrieval + FastAPI server) on a VPS. Default config: bge-m3 multilingual embeddings + nano-vectordb file-based store. We **reuse this deployment unchanged** — adding only:

- A thin Python proxy in front of LightRAG for contract translation + Brave fallback.
- Ingestion scripts that pipe authoritative corpus (USDA, EU Reglamento 1169/2011, CIAA Spain, Escoffier public-domain) through RAGAnything into LightRAG.

The proxy speaks the canonical `{value, citationUrl, snippet}` contract. apps/api's existing `GptOssRagProvider` consumes the proxy without code changes — only `NEXANDRO_AI_RAG_BASE_URL` flips at deploy time.

## Goals / Non-Goals

**Goals:**

- Close the operational loop on Wave 1.7: real corpus + real fallback + flippable feature flag.
- Keep apps/api code unchanged (zero TypeScript LOC modified).
- Keep LightRAG unchanged (no fork, no patch, no upstream PR dependency).
- Iron rule enforced at proxy *and* at apps/api (defence in depth).
- Stateless proxy: every audit/cache row still lives in `ai_suggestions` per Wave 1.7.
- Idempotent + re-runnable ingestion scripts.
- Domain-whitelisted web fallback so Brave can't return a Reddit thread as a "citation".

**Non-Goals:**

- Modify LightRAG (structured outputs, response shape, etc.) — separate slice if prompt-engineering proves insufficient.
- Modern copyrighted cookbooks (Larousse / CIA / McGee) — separate slice with legal clearance.
- VPS provisioning / TLS / Docker-Compose orchestration (operational documentation, not code).
- Cross-org corpus federation — proxy is global per VPS instance; per-org segregation is M3+ if needed.
- Replace `GptOssRagProvider` with a `LightRagProvider` class — proxy keeps the existing contract intact.

## Decisions

### ADR-CORPUS-LICENSING — sources accepted into the corpus

| Source | License | Risk |
|---|---|---|
| USDA FoodData Central | US Government Work, public domain | None — explicit waiver |
| EU Reglamento 1169/2011 | Decision 2011/833/EU (free reuse with attribution) | None — official EU reuse policy |
| CIAA Spain materials | Permission required (private association) | Medium — needs explicit email approval; placeholder script gated until permission obtained |
| Escoffier *Le Guide Culinaire* (Project Gutenberg edition) | Public domain (>100 years) | None — confirmed via Gutenberg copyright page |

**Decision**: ingest USDA + EU + Escoffier immediately. CIAA script is committed but the data fetch is gated on a `CIAA_PERMISSION_GRANTED=true` env flag with a `LICENSE_NOTE.md` documenting the permission status. **Rationale**: Wave 1.7 documented that the iron rule is regulatory-grade; we cannot ingest copyrighted material without explicit grant. Modern cookbook ingestion (Larousse, CIA, McGee) is explicitly out of scope and filed as `m2-ai-yield-cookbooks-modern`. **Alternative considered**: ingest CIAA inline with a "best-effort permission" disclaimer — rejected because the iron rule's audit trail demands a positive permission record.

### ADR-RAG-PROXY — proxy architecture + iron-rule preflight

```
apps/api ─[POST /query, body {kind, query, context}]→ rag-proxy
                                                          │
                                                          ├─[POST /query w/ user_prompt JSON-only]→ LightRAG
                                                          │
                                                          ├─[GET /res/v1/web/search]→ Brave Search API
                                                          │   (only when LightRAG score < threshold or response unparseable)
                                                          │
                                                          └─[apply iron rule]→ {value, citationUrl, snippet} | null
```

**Decision**: separate Python service, FastAPI, ~250 LOC, deploys on VPS in same Docker network as LightRAG. Stateless. Iron rule mirrored from `apps/api/src/ai-suggestions/application/types.ts::applyIronRule` — same checks: citationUrl + snippet non-empty (after trim), value finite and ∈ [0, 1], snippet truncated to 500 chars + ellipsis if exceeded. **Rationale**: keeps apps/api unchanged, keeps LightRAG unchanged, isolates contract translation in one place. **Alternative considered**: implement translation inside apps/api as a `LightRagProvider` sibling to `GptOssRagProvider` — rejected because it pulls Brave HTTP + LLM-prose-parsing logic into the TypeScript monorepo (where Python tooling for LLM I/O is more mature) and couples apps/api to LightRAG's response shape. **Alternative considered**: extend LightRAG with a custom route — rejected because user explicitly said no LightRAG modification.

### ADR-BRAVE-FALLBACK — domain whitelist + fallback semantics

**Decision**: Brave Search is invoked only when (a) LightRAG returns empty `references[]`, OR (b) LightRAG's hybrid score (when surfaced) is below `0.6`, OR (c) parsing LightRAG's prose response into JSON fails after 1 retry. Brave results are filtered against an authoritative-domain whitelist (default below; configurable via env `RAG_PROXY_BRAVE_DOMAINS` as comma-separated). The top match's URL becomes `citationUrl`; its snippet (Brave returns this directly) becomes `snippet`; the `value` is extracted via a small downstream LLM call (same LightRAG endpoint, prompted to read only the snippet and emit `{value}` JSON). If extraction fails or no whitelisted result exists, return `null` → apps/api surfaces "manual entry only".

Default whitelist:
- `fdc.nal.usda.gov` (USDA FoodData Central)
- `eur-lex.europa.eu` (EU regulations)
- `efsa.europa.eu` (European Food Safety Authority)
- `fda.gov` (US FDA)
- `who.int` (WHO)
- `fao.org` (FAO)
- `ciaa.es` (CIAA Spain — public pages)
- `*.sciencedirect.com` (open access only — checked via response headers)
- `en.wikipedia.org` + `es.wikipedia.org` (food-science articles only — accepted with a known-low confidence weight in the iron rule's `snippet`; explicitly tagged in citation metadata)

**Rationale**: Brave is a generic web search and will gladly return Reddit, blogs, recipe content farms, etc. The whitelist enforces "iron rule" hygiene at the source-domain level. **Alternative considered**: use Brave's `result_filter=news` parameter — rejected because it excludes USDA/EU regulatory content. **Alternative considered**: post-LLM critique pass on each Brave result — rejected as expensive (extra LLM round-trip per query) without measurable quality gain over a pre-vetted whitelist. **Alternative considered**: drop Brave entirely, rely only on the corpus — rejected because the corpus is finite and the chef will hit gaps (regional ingredients, modern cooking techniques) that Brave can fill from authoritative sources.

### ADR-RESPONSE-MAPPING — LightRAG → canonical contract

LightRAG's `POST /query` returns:
```json
{
  "response": "<LLM prose, possibly JSON if user_prompt was structured>",
  "references": [
    { "reference_id": "r-NN", "file_path": "<corpus path>", "content": ["chunk1", "chunk2"] }
  ],
  ...
}
```

**Decision**: proxy injects this `user_prompt` per query:
> "Respond ONLY with valid JSON matching schema: `{value: number 0-1, citationUrl: string, snippet: string}`. The `value` is the suggested yield or waste factor. The `citationUrl` MUST be the canonical URL of the source document (e.g. https://fdc.nal.usda.gov/fdc-app.html#/food-details/{id}). The `snippet` is a verbatim ≤500-char excerpt from the source. Do not wrap in markdown. Do not add prose. If you cannot cite a verifiable source, respond with `{value: null, citationUrl: '', snippet: ''}`."

The proxy parses `response.response` as JSON. If parsing fails, it retries once with a stricter user_prompt. If that also fails, it triggers the Brave fallback. The proxy does **not** trust LightRAG's `references[]` to derive citationUrl — only the LLM's structured output, because `references[]` returns local file paths, not canonical URLs. **Rationale**: keeps the iron rule airtight: the citation is what the LLM committed to, not what the retrieval layer happens to surface. **Alternative considered**: use `references[0].file_path` as citationUrl — rejected because it leaks internal corpus paths and isn't a verifiable URL the user could open.

The corpus ingestion scripts include the canonical URL as document metadata (`source_url`) so the LLM has it to cite. This is the bridge: ingestion stamps the URL → retrieval surfaces it via context → LLM cites it via user_prompt schema.

## Risks / Trade-offs

- **[Risk] LightRAG LLM ignores `user_prompt` JSON schema (~5–10% of queries).** **Mitigation**: 1 retry with stricter prompt, then Brave fallback, then `null`. Iron rule at apps/api is the final safety net.
- **[Risk] Brave returns no whitelisted results for niche queries** (e.g. "yield% for piparra fritura"). **Mitigation**: chef enters manually — same UX as Wave 1.7's null path. Acceptable per FR19.
- **[Risk] Brave API key cost runs away.** **Mitigation**: proxy enforces a per-day query budget (default 1000/day, env `RAG_PROXY_BRAVE_DAILY_BUDGET`); over budget → skip Brave, return `null`. Free tier of Brave Search API is 2000/month — staying under budget by design.
- **[Risk] CIAA Spain permission never granted.** **Mitigation**: ingestion script is committed but data-fetch gated; corpus ships USDA + EU + Escoffier alone. CIAA is additive when permission lands.
- **[Risk] Escoffier 1903 yields are stylistically out of date.** **Mitigation**: corpus tags Escoffier chunks with `era=historical`; the LLM is told in `user_prompt` to prefer modern sources for modern technique queries. Acceptable trade-off for free public-domain coverage.
- **[Risk] Stateless proxy means no per-org access control** — every apps/api call hits the same LightRAG instance. **Mitigation**: proxy auth via shared secret (`RAG_PROXY_API_KEY`); apps/api authenticates per-org *upstream* of the proxy; corpus is non-PII scientific data, not org-specific.
- **[Trade-off] Python tools sit outside the Turborepo TypeScript workspaces.** Accepted: there's no reasonable Python-in-Turbo pattern, and `tools/` is the conventional escape hatch. CI for Python lives in its own GH Action job.

## Migration Plan

1. Scaffold `tools/rag-proxy/` with FastAPI + httpx + pydantic + pytest + ruff. Pin dependencies via `pyproject.toml`.
2. Implement `lightrag_client.py`, `brave_client.py`, `extractor.py`, `iron_rule.py`, `main.py` with full unit tests (mock LightRAG via `respx`, mock Brave via `respx`).
3. Scaffold `tools/rag-corpus/` with RAGAnything dependency.
4. Implement `ingest_usda.py`, `ingest_eu_1169.py`, `ingest_escoffier.py`, `ingest_ciaa.py` (last gated by env).
5. Add Dockerfile + Docker Compose snippet for proxy. README documents VPS deploy steps but the actual deploy is operational, post-merge.
6. ADRs added to `docs/architecture-decisions.md`.
7. CI: new GH Action job for Python tools (lint + tests).
8. apps/api `.env.example` updated to point `NEXANDRO_AI_RAG_BASE_URL` at the proxy URL pattern.

**Rollback**: stop the proxy Docker container; apps/api falls back to `null` on every suggestion call → "manual entry" UX. No data corruption risk because proxy is stateless.

## Open Questions

- **Should the proxy also speak LightRAG's auth (X-API-Key) or accept its own (Bearer)?** Decision: proxy accepts Bearer from apps/api (matches `GptOssRagProvider`'s expectation) and translates to X-API-Key when calling LightRAG internally. Two distinct keys: `RAG_PROXY_API_KEY` (apps/api → proxy) and `LIGHTRAG_API_KEY` (proxy → LightRAG).
- **Should we cache proxy responses?** Decision: no — apps/api's `ai_suggestions` table already caches. Double caching is complexity without benefit.
- **Do we ship the Brave fallback as `enabled: false` initially?** Decision: yes — env flag `RAG_PROXY_BRAVE_ENABLED=false` by default. Operator turns it on after corpus ingestion proves out and Brave key is in place. **Rationale**: smaller blast radius for first deploy; corpus-only path is simpler to debug.
