## ADDED Requirements

### Requirement: rag-proxy translates LightRAG responses to canonical AI suggestion contract

The system SHALL provide a stateless Python proxy (`rag-proxy`) that exposes `POST /query` accepting `{kind, query, context}` and returns `{value, citationUrl, snippet}` (or `null`) — the same contract that `apps/api`'s `GptOssRagProvider` consumes. The proxy SHALL translate LightRAG's prose+references response into this contract by injecting a JSON-only `user_prompt` schema and parsing the LLM's structured output.

#### Scenario: LightRAG returns clean JSON matching schema
- **WHEN** apps/api calls the proxy with `{kind: "yield", query: "yield% for raw beef chuck slow-cooked"}`
- **AND** LightRAG returns `{response: '{"value": 0.65, "citationUrl": "https://fdc.nal.usda.gov/...", "snippet": "..."}'}`
- **THEN** the proxy parses the JSON, applies the iron rule, and returns `{value: 0.65, citationUrl: "...", snippet: "..."}` with HTTP 200

#### Scenario: LightRAG returns prose without parseable JSON
- **WHEN** the LLM returns prose instead of JSON
- **THEN** the proxy retries once with a stricter user_prompt; if still unparseable, falls through to the Brave fallback (if enabled) or returns `null`

#### Scenario: Proxy ignores LightRAG's references[] for citationUrl
- **WHEN** LightRAG's response contains `references[{file_path: "/corpus/usda/foo.json"}]`
- **THEN** the proxy SHALL NOT use the file_path as citationUrl; only the LLM-cited URL from the JSON output is accepted as citationUrl

### Requirement: rag-proxy enforces iron rule before responding

The proxy SHALL apply the same iron rule as `apps/api/src/ai-suggestions/application/types.ts::applyIronRule` before returning any response: citationUrl and snippet must be non-empty after trim, value must be finite and within `[0, 1]`, snippet must be truncated to 500 chars with ellipsis if exceeded. Failures collapse to `null`.

#### Scenario: Empty citationUrl rejected
- **WHEN** LightRAG returns `{value: 0.7, citationUrl: "", snippet: "..."}`
- **THEN** the proxy returns `null`

#### Scenario: Value out of range rejected
- **WHEN** LightRAG returns `{value: 1.5, citationUrl: "...", snippet: "..."}`
- **THEN** the proxy returns `null`

#### Scenario: Snippet truncation
- **WHEN** LightRAG returns a snippet of 600 chars
- **THEN** the proxy truncates to 500 chars and appends `…`, then validates other fields and returns the truncated suggestion

### Requirement: rag-proxy falls back to Brave Search with domain whitelist

When LightRAG returns no high-confidence match (empty references, score below threshold, or unparseable JSON after retry), the proxy SHALL invoke Brave Search API and accept only results whose hostname matches the configured domain whitelist (default: `fdc.nal.usda.gov`, `eur-lex.europa.eu`, `efsa.europa.eu`, `fda.gov`, `who.int`, `fao.org`, `ciaa.es`, `*.sciencedirect.com` open-access, `en.wikipedia.org`, `es.wikipedia.org`).

#### Scenario: Brave fallback finds whitelisted result
- **WHEN** LightRAG returns null and Brave returns a top result on `fdc.nal.usda.gov`
- **THEN** the proxy extracts the URL + snippet from Brave, calls a small LLM round to derive `value` from the snippet, applies iron rule, and returns the suggestion

#### Scenario: Brave returns only non-whitelisted results
- **WHEN** Brave returns top results on `reddit.com`, `someblog.com`
- **THEN** the proxy filters all out, returns `null`

#### Scenario: Brave daily budget exceeded
- **WHEN** the in-memory daily Brave query counter exceeds `BRAVE_DAILY_BUDGET`
- **THEN** the proxy SHALL skip the Brave call entirely (no API hit) and return `null`

#### Scenario: Brave disabled by env
- **WHEN** `BRAVE_ENABLED=false`
- **THEN** the proxy SHALL never call Brave; LightRAG-only path; on LightRAG miss returns `null`

### Requirement: rag-proxy authenticates apps/api via shared bearer secret

The proxy SHALL accept incoming requests only with a valid `Authorization: Bearer <RAG_PROXY_API_KEY>` header. Missing or invalid bearer SHALL result in HTTP 401.

#### Scenario: Missing Authorization header
- **WHEN** a request arrives without `Authorization` header
- **THEN** the proxy responds with HTTP 401 and no body

#### Scenario: Invalid bearer token
- **WHEN** a request arrives with `Authorization: Bearer wrong-key`
- **THEN** the proxy responds with HTTP 401

### Requirement: rag-corpus ingests authoritative sources via RAGAnything

The system SHALL provide ingestion scripts that pipe authoritative corpus content through RAGAnything's library API into the existing LightRAG instance, tagging each document with its canonical source URL as metadata so the LLM can cite it via the `user_prompt` schema.

#### Scenario: USDA FoodData Central ingestion
- **WHEN** `python -m rag_corpus.ingest_usda` runs
- **THEN** every food item's chunk is ingested with metadata `{source_url: "https://fdc.nal.usda.gov/fdc-app.html#/food-details/{fdc_id}", era: "modern", source: "usda-fdc"}`

#### Scenario: Idempotent re-run
- **WHEN** an ingestion script is re-run on a corpus already partially ingested
- **THEN** previously-ingested chunks (matched by content hash + source URL) are skipped; only new chunks are added

#### Scenario: CIAA permission gating
- **WHEN** `ingest_ciaa.py` runs without `CIAA_PERMISSION_GRANTED=true`
- **THEN** the script prints permission instructions and exits 0 without ingesting any data

### Requirement: apps/api configuration points at rag-proxy, not LightRAG directly

The `apps/api/.env.example` SHALL document that `NEXANDRO_AI_RAG_BASE_URL` should target the rag-proxy URL (not LightRAG directly) so that the canonical `{value, citationUrl, snippet}` contract is honoured. No code changes in `apps/api/` are required for this slice.

#### Scenario: Operator deploys proxy + flips flag
- **WHEN** the operator sets `NEXANDRO_AI_RAG_BASE_URL=https://rag-proxy.nexandro.local/query` and `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true`
- **THEN** chef-issued yield/waste requests in the UI hit apps/api → GptOssRagProvider → rag-proxy → LightRAG, and the chef sees citations from the ingested corpus
