## 1. Repo scaffold for Python tools

- [ ] 1.1 Create `tools/rag-proxy/` with `pyproject.toml` (Python 3.12, deps: fastapi, uvicorn, httpx, pydantic, pydantic-settings, python-dotenv; dev: pytest, pytest-asyncio, respx, ruff, mypy)
- [ ] 1.2 Create `tools/rag-corpus/` with `pyproject.toml` (Python 3.12, deps: raganything[all], lightrag-hku, requests, beautifulsoup4, pdfplumber, tqdm; dev: pytest, ruff)
- [ ] 1.3 Each package has `README.md` documenting purpose + how to run + env vars + deploy notes
- [ ] 1.4 Both packages have `LICENSE_NOTE.md` documenting upstream licenses (RAGAnything = MIT, LightRAG = MIT, USDA = public domain, EU 1169 = Decision 2011/833/EU, Escoffier Gutenberg = public domain, CIAA = permission-gated)
- [ ] 1.5 Add `tools/` to root `.gitignore` exclusions for `.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`, `.mypy_cache/`

## 2. rag-proxy implementation

- [ ] 2.1 `tools/rag-proxy/src/rag_proxy/config.py` — pydantic `Settings` reading env:
  - `LIGHTRAG_BASE_URL` (required)
  - `LIGHTRAG_API_KEY` (optional, sent as `X-API-Key`)
  - `LIGHTRAG_TIMEOUT_S` (default 30)
  - `LIGHTRAG_MODE` (default `hybrid`)
  - `LIGHTRAG_SCORE_THRESHOLD` (default 0.6)
  - `BRAVE_API_KEY` (optional — required only when `BRAVE_ENABLED=true`)
  - `BRAVE_ENABLED` (default `false`)
  - `BRAVE_TIMEOUT_S` (default 10)
  - `BRAVE_DAILY_BUDGET` (default 1000)
  - `BRAVE_DOMAIN_WHITELIST` (default = curated authoritative list, comma-separated)
  - `RAG_PROXY_API_KEY` (required, accepted as `Authorization: Bearer <key>` from apps/api)
- [ ] 2.2 `tools/rag-proxy/src/rag_proxy/schemas.py` — pydantic models:
  - `QueryRequest { kind: Literal["yield","waste"]; query: str; context: dict[str, Any] = {} }`
  - `QueryResponse { value: float; citation_url: str; snippet: str }` (or `None` returned)
  - `LightRagQueryRequest { query: str; mode: str; include_references: bool; include_chunk_content: bool; user_prompt: str }`
  - `LightRagQueryResponse { response: str; references: list[Reference] }`
- [ ] 2.3 `tools/rag-proxy/src/rag_proxy/lightrag_client.py` — async `httpx.AsyncClient` wrapper:
  - `query(query: str, kind: str) → LightRagQueryResponse | None`
  - Timeout, 4xx/5xx, parse errors → `None`
  - Auth via `X-API-Key`
- [ ] 2.4 `tools/rag-proxy/src/rag_proxy/extractor.py` — pure functions:
  - `build_user_prompt(kind: str) → str` returning the JSON-only schema instruction (yield vs waste variant)
  - `extract_json(response_text: str) → dict | None` that strips markdown fences, parses JSON, returns dict or None
  - `extract_value_from_snippet(llm_client, snippet: str, kind: str) → float | None` for Brave-fallback value extraction
- [ ] 2.5 `tools/rag-proxy/src/rag_proxy/iron_rule.py` — pure function:
  - `apply_iron_rule(value: Any, citation_url: Any, snippet: Any) → QueryResponse | None`
  - Mirrors `apps/api/src/ai-suggestions/application/types.ts::applyIronRule` exactly: citationUrl + snippet non-empty after trim, value finite ∈ [0, 1], snippet truncated to 500 chars + `…` if cut
- [ ] 2.6 `tools/rag-proxy/src/rag_proxy/brave_client.py` — async wrapper:
  - `search(query: str, domain_whitelist: list[str]) → BraveResult | None`
  - In-memory daily counter resets at UTC midnight; over budget → `None` immediately (no API call)
  - Filters results by hostname suffix match against whitelist
  - Returns `{url, title, snippet}` of top whitelisted result
- [ ] 2.7 `tools/rag-proxy/src/rag_proxy/main.py` — FastAPI app:
  - `POST /query` with Bearer auth check, request → LightRAG → if low confidence → Brave → iron rule → response (200 with body, or 200 with `null` body)
  - `GET /health` returning `{status: "ok", lightrag: bool, brave: bool}` based on connectivity probes
  - CORS off (proxy is internal only)
  - Logs structured JSON: query summary + path taken (lightrag-success / brave-fallback / null) + latency
- [ ] 2.8 `tools/rag-proxy/src/rag_proxy/__main__.py` — `python -m rag_proxy` entrypoint launching uvicorn

## 3. rag-proxy tests

- [ ] 3.1 `tests/test_iron_rule.py` — covers: empty citationUrl, empty snippet, value < 0, value > 1, NaN value, snippet > 500 chars truncated with ellipsis, all-valid pass-through (≥10 cases)
- [ ] 3.2 `tests/test_extractor.py` — covers: clean JSON, JSON wrapped in ```json``` fence, JSON wrapped in ``` fence, prose-then-JSON, prose-only (returns None), malformed JSON (returns None), null value (returns dict with null) (≥8 cases)
- [ ] 3.3 `tests/test_lightrag_client.py` — `respx` mock: 200 success, 401, 500, timeout, malformed JSON response → all map correctly
- [ ] 3.4 `tests/test_brave_client.py` — `respx` mock: 200 with whitelisted result returned, 200 with all-non-whitelisted filtered to None, daily budget exceeded short-circuits, 401 → None
- [ ] 3.5 `tests/test_main_e2e.py` — full chain mocked: (a) LightRAG returns clean JSON → 200 response, (b) LightRAG returns prose → Brave fallback success → 200, (c) both fail → 200 with `null` body, (d) missing Bearer → 401, (e) wrong Bearer → 401
- [ ] 3.6 Coverage target: ≥85% across `rag_proxy/`

## 4. rag-corpus ingestion scripts

- [ ] 4.1 `tools/rag-corpus/src/rag_corpus/common.py` — shared helpers:
  - `init_lightrag(working_dir: Path, api_key: str | None) → LightRAG` instance
  - `ingest_document(rag, content: str, source_url: str, era: str = "modern") → str` (returns doc_id; tags with metadata so user_prompt can cite source_url)
  - Idempotency via SHA-256 hash of `(source_url, content)`; skip if already ingested (track in `working_dir/.ingested.jsonl`)
- [ ] 4.2 `tools/rag-corpus/src/rag_corpus/ingest_usda.py`:
  - Downloads USDA FoodData Central CSV (FoundationFoods + SRLegacy) from `fdc.nal.usda.gov/fdc-app.html#/download-datasets`
  - For each food item, builds a chunk with name + description + nutrient summary + canonical URL `https://fdc.nal.usda.gov/fdc-app.html#/food-details/{fdc_id}`
  - Tags `era=modern`, `source=usda-fdc`
  - Idempotent: skips already-ingested fdc_ids
- [ ] 4.3 `tools/rag-corpus/src/rag_corpus/ingest_eu_1169.py`:
  - Downloads consolidated PDF of Reglamento (UE) Nº 1169/2011 from EUR-Lex (`https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:02011R1169-20180101`)
  - Parses with `pdfplumber`, splits per Article + Annex
  - Tags `era=modern`, `source=eur-lex`, canonical URL = `https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:02011R1169-20180101#Art{N}`
- [ ] 4.4 `tools/rag-corpus/src/rag_corpus/ingest_escoffier.py`:
  - Downloads Project Gutenberg Escoffier *Le Guide Culinaire* English translation (`https://www.gutenberg.org/files/...`)
  - Splits per recipe / technique entry
  - Tags `era=historical`, `source=escoffier-gutenberg`, canonical URL = Gutenberg book URL + section anchor
- [ ] 4.5 `tools/rag-corpus/src/rag_corpus/ingest_ciaa.py`:
  - **Gated**: at script start, checks `CIAA_PERMISSION_GRANTED=true`; if not, prints permission instructions + exits 0 cleanly (does not error CI)
  - Placeholder ingestion logic (URL list + parse pattern) committed but inert
- [ ] 4.6 `tools/rag-corpus/scripts/run_all.sh` — runs ingestion in dependency order; exits non-zero only on script error (not on CIAA-permission-not-granted)

## 5. rag-corpus tests

- [ ] 5.1 `tests/test_common.py` — idempotency hash + ingested.jsonl track/skip
- [ ] 5.2 `tests/test_ingest_usda.py` — fixture CSV (10 rows) → mock LightRAG → assert N chunks ingested + URL metadata correct
- [ ] 5.3 `tests/test_ingest_eu_1169.py` — fixture mini-PDF → mock LightRAG → assert article splits correct
- [ ] 5.4 `tests/test_ingest_escoffier.py` — fixture text → mock LightRAG → assert recipe splits correct
- [ ] 5.5 `tests/test_ingest_ciaa_gating.py` — assert CIAA_PERMISSION_GRANTED=false → script exits 0 without ingestion

## 6. ADRs in docs/architecture-decisions.md

- [ ] 6.1 ADR-CORPUS-LICENSING — corpus sources licensing matrix; CIAA gated; Escoffier accepted; modern cookbooks out of scope
- [ ] 6.2 ADR-RAG-PROXY — proxy architecture, stateless, iron-rule preflight, no LightRAG modification
- [ ] 6.3 ADR-BRAVE-FALLBACK — domain whitelist, daily budget, null-on-budget-exceeded
- [ ] 6.4 ADR-RESPONSE-MAPPING — LightRAG `user_prompt` JSON contract; ignore `references[]` for citationUrl; trust only LLM-cited URL

## 7. Dockerization

- [ ] 7.1 `tools/rag-proxy/Dockerfile` — multi-stage: builder (poetry export → pip install) + runtime (python:3.12-slim + uvicorn)
- [ ] 7.2 `tools/rag-proxy/.dockerignore`
- [ ] 7.3 `tools/rag-proxy/docker-compose.example.yml` — sample compose stanza for VPS deploy alongside LightRAG (commented, illustrative — actual deploy is operational)
- [ ] 7.4 `tools/rag-corpus/scripts/Dockerfile` — minimal, for one-shot cron runs (alternative to running on host)

## 8. CI

- [ ] 8.1 `.github/workflows/python-tools.yml`:
  - Triggers: push to any branch, PR
  - Job `rag-proxy-lint`: ruff check + mypy strict
  - Job `rag-proxy-test`: pytest + coverage ≥85%
  - Job `rag-corpus-lint`: ruff check + mypy strict
  - Job `rag-corpus-test`: pytest
- [ ] 8.2 Existing TS workflow remains unchanged (Python tools are a separate pipeline)

## 9. apps/api documentation update

- [ ] 9.1 `apps/api/.env.example`: add comment block above `NEXANDRO_AI_RAG_BASE_URL` clarifying it should point at the rag-proxy URL (not LightRAG directly), with example `https://rag-proxy.nexandro.local/query`
- [ ] 9.2 No code changes in `apps/api/`; verify `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=false` still default

## 10. Verification

- [ ] 10.1 `openspec validate m2-ai-yield-corpus` — must pass
- [ ] 10.2 Python: `cd tools/rag-proxy && pytest && ruff check . && mypy src/` — green
- [ ] 10.3 Python: `cd tools/rag-corpus && pytest && ruff check . && mypy src/` — green
- [ ] 10.4 TS: `npm test` at root — full M2 suite still green (no regressions; this slice should not touch any TS)
- [ ] 10.5 TS: `npm run lint` at root — clean
- [ ] 10.6 TS: `npm run build` at root — clean (no apps/api change should affect build)
- [ ] 10.7 Manual smoke (deferred to post-deploy): bring up LightRAG + rag-proxy on VPS; ingest USDA sample; flip `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` and `NEXANDRO_AI_RAG_BASE_URL=https://rag-proxy.nexandro.local`; chef sees real citation in YieldEditor

## 11. CI + landing

- [ ] 11.1 Implementation pushed (Gate D approved in chat: 1a+c / 2a / 3c-pluggable / 4a-bge-m3 / 5-keep-nano-vectordb / bloqueador-1=a / bloqueador-2=proxy / Caso A)
- [ ] 11.2 All CI checks green; admin-merge once required checks pass
- [ ] 11.3 Archive `openspec/changes/m2-ai-yield-corpus/` → `openspec/specs/m2-ai-yield-corpus/`
- [ ] 11.4 Write `retros/m2-ai-yield-corpus.md`
- [ ] 11.5 Update auto-memory `project_m1_state.md` — **rag-proxy + corpus shipped; AI yield production flag flippable; M2 wrap-up next slice**
- [ ] 11.6 File follow-up slices:
  - `m2-ai-yield-cookbooks-modern` — Larousse + CIA + McGee after legal due diligence
  - `m2-ai-yield-structured-outputs` — patch LightRAG (or fork) for 100% valid JSON via response_format if user_prompt reliability proves insufficient
  - `m2-wrap-up` — flip `NEXANDRO_LABELS_PROD_ENABLED=true` post legal review + flip `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` post corpus ingestion
