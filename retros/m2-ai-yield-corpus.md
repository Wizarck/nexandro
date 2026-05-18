# retros/m2-ai-yield-corpus.md

> **Slice**: `m2-ai-yield-corpus` · **PR**: [#88](https://github.com/Wizarck/nexandro/pull/88) · **Merged**: 2026-05-06 · **Squash SHA**: `6d63e6c`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.8 — first cross-language slice**. Closes the operational loop on Wave 1.7 (`m2-ai-yield-suggestions`) so the production AI feature flag becomes flippable. Zero TypeScript LOC modified — the proxy speaks the canonical contract `apps/api`'s `GptOssRagProvider` already expects. First slice that introduces a Python toolchain alongside the Turborepo TS workspaces (`tools/rag-proxy/` + `tools/rag-corpus/`).

## What we shipped

**rag-proxy (FastAPI service, ~750 LOC + tests):**
- `tools/rag-proxy/` Python package, deployed alongside LightRAG on the VPS in a Docker container. Stateless: every audit row still lives in `apps/api`'s `ai_suggestions` table per Wave 1.7.
- Translates LightRAG's prose+references shape into the canonical `{value, citationUrl, snippet}` contract via `user_prompt` JSON-only schema injection. One retry on parse failure with stricter prompt.
- Brave Search fallback when LightRAG returns no high-confidence match — filtered against a hostname whitelist of authoritative domains (USDA, EUR-Lex, EFSA, FDA, WHO, FAO, CIAA, Wikipedia food-science, ScienceDirect open access). Daily UTC budget counter prevents runaway cost; over budget → `null`.
- Iron-rule guard mirrored from `apps/api/src/ai-suggestions/application/types.ts::applyIronRule` exactly: citationUrl + snippet non-empty after trim, value finite ∈ [0, 1], snippet truncated to 500 chars + ellipsis. Pure function, unit-testable in isolation.
- Bearer auth on the public `POST /query` (RAG_PROXY_API_KEY); LightRAG auth via X-API-Key translated internally.
- `GET /health` returning `{status, lightrag, brave}` for operational probes.
- 60 tests across 5 files (iron_rule / extractor / lightrag_client / brave_client / main_e2e). Coverage 93.35% (above 85% gate). ruff + mypy strict clean.
- Dockerfile (multi-stage python:3.12-slim) + docker-compose.example.yml for VPS deployment.

**rag-corpus (Python ingestion package):**
- `tools/rag-corpus/` ingestion scripts using RAGAnything's library API to pipe authoritative corpus into LightRAG.
- `common.py` — `IngestTracker` with idempotent dedup via `.ingested.jsonl` (SHA-256 of source_url + content); `init_lightrag` lazy import (lightrag-hku is in `[prod]` extras only, not `[dev]`, to keep CI/test installs lightweight without multi-GB ML wheels).
- `ingest_usda.py` — FoodData Central (Foundation + SR Legacy) CSV → chunks tagged `[source_url=https://fdc.nal.usda.gov/fdc-app.html#/food-details/{fdc_id} era=modern source=usda-fdc]`.
- `ingest_eu_1169.py` — Reglamento (UE) 1169/2011 PDF → article (`Artículo N`) and annex (`ANEXO N`) splits, tagged with EUR-Lex consolidated URL + section anchor.
- `ingest_escoffier.py` — Project Gutenberg edition of *Le Guide Culinaire*, split by recipe number markers (Escoffier numbers entries 1–5012). Tagged `era=historical` so the LLM is told to prefer modern sources for modern technique queries.
- `ingest_ciaa.py` — gated by `CIAA_PERMISSION_GRANTED=true` env. Without permission, prints instructions and exits 0 cleanly (CI-safe).
- `scripts/run_all.sh` — runs all four scripts in dependency order; CIAA gating doesn't fail the script.
- 33 tests across 5 files. ruff clean.

**4 new ADRs in `docs/architecture-decisions.md`:**
- **ADR-021** — Corpus is USDA + EU 1169/2011 + Escoffier (Gutenberg); CIAA gated; modern cookbooks (Larousse, CIA, McGee) explicitly out of scope until legal due diligence.
- **ADR-022** — rag-proxy is a stateless Python service in front of LightRAG; no LightRAG modification (no fork, no upstream PR dependency).
- **ADR-023** — Brave Search fallback with hostname whitelist + daily budget; default off until operator opts in post corpus rollout.
- **ADR-024** — LightRAG → canonical contract response mapping via `user_prompt` JSON schema; ignore `references[]` for citationUrl (corpus stamps URL as metadata, LLM cites it via schema).

**CI workflow `.github/workflows/python-tools.yml`:**
- Two jobs (`rag-proxy (lint + test)`, `rag-corpus (lint + test)`) running on `ubuntu-latest` with Python 3.12. Each: pip install dev deps → ruff check → mypy strict → pytest. Triggered on changes under `tools/rag-{proxy,corpus}/**` or workflow itself.

**`apps/api/.env.example`:**
- New file documenting that `NEXANDRO_AI_RAG_BASE_URL` should target the rag-proxy URL (not LightRAG directly) per ADR-022. Documents all five Wave 1.7 + this-slice env vars (the master flag + base URL + bearer + timeout + model labels).

## What surprised us

- **`pip --user` on Windows Store Python is glacially slow + silent.** The `pip install --user respx` command I ran took ~10 minutes in background and produced zero stdout the entire time. Multiple attempts ran in parallel before one finally succeeded. Fix for next time: use `python -m pip install --target=...` to a known location, or use a proper venv with `--upgrade-deps` to bootstrap pip. The Windows Store Python's built-in `python -m venv .venv` does NOT include pip by default — you have to use `--upgrade-deps` flag.
- **`str.format()` clobbers literal JSON braces.** The `VALUE_FROM_SNIPPET_PROMPT` constant had `{"value": null}` as part of the instruction text, then I called `.format(kind=..., snippet=...)` — Python's str.format treats `{"value"` as a placeholder. Got `KeyError: '"value"'` at runtime. Fix: escape literal braces as `{{` and `}}`. Caught by integration test, not by linting. Reminder: when authoring prompt templates with embedded JSON examples, either escape braces or use `string.Template` instead of `str.format`.
- **Ruff auto-fix is more aggressive than expected.** Removed `# noqa: SLF001` comments that I had placed defensively for private-attribute access in tests. The access still works because the rule didn't actually fire (the file already had `from __future__ import annotations` which silences some checks). Lesson: don't pre-emptively add noqa unless you've seen the rule fire.
- **respx + httpx async + FastAPI TestClient compose cleanly.** The TestClient uses ASGI transport (in-process) for the FastAPI app, while the app's internal `httpx.AsyncClient` calls are intercepted by `respx.mock`. No special wiring needed — the e2e tests for the orchestrator just work.

## Patterns reinforced or discovered

- **Provider abstraction via DI token in apps/api was the right pre-investment.** Wave 1.7 introduced `AI_SUGGESTION_PROVIDER` symbol + factory pattern. This slice consumes it without code changes — `NEXANDRO_AI_RAG_BASE_URL` is the only env knob; the proxy speaks the same contract `GptOssRagProvider` already expects. Net TS LOC change for this slice: 0.
- **Stateless proxy, stateful caller.** apps/api's `ai_suggestions` table holds every audit row (Wave 1.7 pattern); the proxy is restart-safe and rollback-safe (kill the container → null path → "manual entry"). Avoided double-caching: every cache concept lives in apps/api's existing table.
- **Failure-collapse-to-null is a great contract.** The proxy never raises to apps/api. Network errors, 4xx, 5xx, parse failures, timeouts, aborts → all surface as `null`. The chef sees the same "manual entry only" UX regardless of root cause. apps/api never has to discriminate failure modes; the iron rule is the only condition that matters.
- **Domain whitelist > post-LLM critique for source authority.** Brave is a generic web search; without a whitelist it'll happily return Reddit threads as "citations". Rather than running an extra LLM call to vet every result (doubles cost), pre-vet at the hostname level. ADR-023 made this explicit.
- **Python in `tools/` is the right escape hatch.** Turborepo's TypeScript workspaces don't naturally accommodate Python packages. `tools/` is a conventional out-of-band location; CI runs Python in a separate workflow file. No npm-script hooks pretending Python is a TS workspace.
- **License gating in code (CIAA_PERMISSION_GRANTED) over disclaimers.** The iron rule's audit trail demands a positive permission record, not a "we hope this is OK" note. The script runs but does nothing without explicit env opt-in. Same gating pattern can carry forward to other permission-required corpus sources.
- **`era` metadata tag on Escoffier 1903.** Lets the LLM know that classical-but-historical sources should be deprioritized for modern technique queries. The `user_prompt` includes "prefer modern sources for modern technique" instruction. Cheap way to handle public-domain-but-stale.

## Things to file as follow-ups

- **`m2-ai-yield-cookbooks-modern`** — ingest Larousse Gastronomique, *The Professional Chef* (CIA), *On Food and Cooking* (McGee). Blocked on publisher licensing agreements (~3-6 weeks legal). Once cleared, scripts likely look just like `ingest_escoffier.py` with publisher-specific URL formats.
- **`m2-ai-yield-structured-outputs`** — patch LightRAG's LLM call layer to pass `response_format` / `tools` parameter through to the underlying model API (OpenAI / Anthropic / Ollama recent versions). Forces 100% valid JSON output. Worth doing only if measured user_prompt failure rate exceeds ~10% in production. Until then, the retry + Brave-fallback + null path is acceptable per FR19.
- **`m2-wrap-up`** — flip `NEXANDRO_LABELS_PROD_ENABLED=true` post legal review (Wave 1.6 follow-up) + flip `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` post corpus ingestion (this slice). The actual flag flips are operational config changes, not a code slice; document the runbook in `docs/operations/`.
- **rag-proxy multi-replica budget counter.** Current implementation uses an in-memory UTC-day counter; multi-replica deployments would double-count Brave queries. Move to Redis-backed counter when usage volume justifies. Until then "soft budget" semantics are documented in ADR-023.
- **Codegen pipeline for proxy ↔ apps/api contract.** Currently the `{value, citationUrl, snippet}` shape is duplicated as TypeScript types in `apps/api/src/ai-suggestions/application/types.ts` and Python pydantic in `tools/rag-proxy/src/rag_proxy/schemas.py`. Drift risk is low (3 fields, stable for ~9 months) but real. Consider a shared JSON schema if the contract grows.
- **Operational runbook for VPS deployment.** This slice ships the code; the actual deployment (TLS, secret rotation, observability, log aggregation, monitoring of LightRAG-miss / Brave-fallback / null ratio) is operational. Create `docs/operations/rag-proxy-deployment.md` capturing the setup once it's actually deployed.
- **`m2-ai-yield-claude-haiku-provider`** — drop in a `ClaudeHaikuProvider` alongside `GptOssRagProvider` for orgs with Anthropic API keys. Pluggable via the existing DI token; ~150 LOC. Deferred until there's actual demand or measured quality gap with the gpt-oss-20b path.

## Process notes

- Single-thread Wave 1.8. The proxy + corpus + ADRs are tightly coupled (proxy depends on corpus URL stamping; ADRs document both); parallelizing across multiple workers wouldn't have helped.
- Gate D was approved in chat across 5 forks (1a+c / 2a / 3c-pluggable / 4 bge-m3 / 5 keep nano-vectordb) plus 2 bloqueadores (1=user_prompt JSON-only / 2=Python proxy) plus Caso A (existing RAGAnything+LightRAG on VPS). The architecture diagram + request-by-request flow walk-through with the user before any code was written paid off — zero re-architecting during implementation.
- The user provided their Brave API key inline. Treated it as a secret throughout: never committed, never echoed, documented as `.env`-only via `BRAVE_API_KEY` env var. Never saved to memory either (per security guidance).
- Shipped Python 3.12 strict; 0 mypy errors, 0 ruff errors after auto-fix. The `mypy ignore_missing_imports = true` in rag-corpus is intentional for the lazy-imported lightrag/raganything (those packages aren't pinned in `[dev]`).
