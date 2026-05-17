# M2 production runbook

> Slice: `m2-wrap-up` · Last updated: 2026-05-06
>
> Covers deploy + smoke + rollback for the two production-gated M2 surfaces:
> - **Labels** (Wave 1.6: `m2-labels-rendering`)
> - **AI yield/waste suggestions** (Wave 1.7: `m2-ai-yield-suggestions` + Wave 1.8: `m2-ai-yield-corpus`)

## 0. Pre-flight checklist

Before flipping any flag in production, confirm:

- [ ] **Legal review** for the target jurisdiction is filed and approved (labels surface). Copy of the legal opinion archived in operational records (folder of your choice; suggested: encrypted blob storage with the operator's records).
- [ ] **Per-jurisdiction reminder**: the 2026-05-06 legal clearance covers Spain/EU only. If deploying to a different jurisdiction (UK / US / LATAM / APAC), repeat the legal review for that jurisdiction's labelling regulations (FDA Part 101, FSA, ANVISA, etc.) BEFORE flipping `NEXANDRO_LABELS_PROD_ENABLED=true` in that environment.
- [ ] **rag-proxy Docker image** built from `tools/rag-proxy/Dockerfile` and pushed to your registry, OR built directly on the VPS via `docker build`.
- [ ] **LightRAG deployment** running on the VPS with `bge-m3` embeddings + `nano-vectordb` (or whatever your existing RAGAnything+LightRAG stack uses).
- [ ] **Corpus ingested** via `tools/rag-corpus/scripts/run_all.sh`. Track via `${LIGHTRAG_WORKING_DIR}/.ingested.jsonl` — should contain entries from `usda-fdc`, `eur-lex-1169-2011`, and (optionally) `escoffier-gutenberg`.
- [ ] **Brave Search API key** provisioned (only required if `BRAVE_ENABLED=true` in the proxy; default is `false` for first deploy).
- [ ] **Production `.env` audited**: no leaked dev defaults, all secrets rotated, file-system permissions `0600` owned by the apps/api process user.

## 1. Labels surface

### 1.1 Deploy

The labels surface ships in `apps/api` (`/recipes/:id/label` + `/recipes/:id/print` endpoints) and `packages/label-renderer`. No separate service needed; deploy with the rest of `apps/api`.

```bash
# In your production .env for apps/api:
NEXANDRO_LABELS_PROD_ENABLED=true
```

Rebuild + restart `apps/api`:

```bash
npm --workspace=apps/api run build
pm2 restart api  # or systemctl, docker compose up -d, etc.
```

### 1.2 Smoke test

1. Log into the kitchen tablet as a Manager.
2. Open any recipe with mandatory fields populated (per Article 9 of EU 1169/2011: name, ingredients with allergen highlighting, net quantity, BBE, storage, business name+address, country of origin where required, energy + macros).
3. Click "Vista previa" on the label panel.
4. Confirm the PDF renders with: ingredients list (descending mass), allergens emphasised (Article 21 — bold), macros table per 100g + per portion, footer with business identity.
5. Click "Imprimir" and confirm a print job hits the configured `IppPrintAdapter` (or your custom adapter if `m2-labels-print-adapter-phomemo` ships later).

### 1.3 Rollback

```bash
# In production .env:
NEXANDRO_LABELS_PROD_ENABLED=false
```

Restart `apps/api`. Endpoints `/recipes/:id/label` + `/recipes/:id/print` immediately return 404; UI hides the label panel. No data loss; the `Recipe.portions` and `Organization.label_fields` columns stay populated. Re-enable by flipping the flag back to `true` and restarting.

## 2. AI yield/waste suggestions surface

### 2.1 Deploy rag-proxy

```bash
# On the VPS, alongside the existing RAGAnything+LightRAG stack:
cd /path/to/nexandro-clone
git pull
cd tools/rag-proxy
cp .env.example .env
# Edit .env to set:
# - LIGHTRAG_BASE_URL: http://lightrag:9621 (or your internal LightRAG URL)
# - LIGHTRAG_API_KEY: paste your LightRAG X-API-Key here, if auth enabled
# - RAG_PROXY_API_KEY: generate a strong random secret per environment
# - BRAVE_ENABLED: false on first deploy (corpus-only path)
# - BRAVE_API_KEY: leave empty until you opt into Brave fallback later
docker build -t nexandro/rag-proxy:latest .
docker compose -f docker-compose.example.yml up -d
```

Verify health:
```bash
curl http://localhost:8000/health
# expect: {"status":"ok","lightrag":true,"brave":false}
```

### 2.2 Ingest corpus (one-time, idempotent)

On the VPS (same machine as LightRAG, or any machine that can write to `LIGHTRAG_WORKING_DIR`):

```bash
cd /path/to/nexandro-clone/tools/rag-corpus
python -m venv .venv && source .venv/bin/activate
pip install -e ".[prod]"

# Set required env:
export LIGHTRAG_WORKING_DIR=/var/lib/lightrag    # MUST match your LightRAG server config

# Download corpus to a local cache directory:
mkdir -p ./corpus
# USDA FoodData Central CSV (Foundation Foods + SR Legacy):
#   https://fdc.nal.usda.gov/download-datasets
#   Save as ./corpus/food.csv + ./corpus/food_nutrient.csv
# EU Reglamento 1169/2011 consolidated PDF:
#   https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:02011R1169-20180101
#   Save as ./corpus/eu-1169-2011.pdf
# Escoffier Le Guide Culinaire (Project Gutenberg):
#   Find the current Gutenberg ID for the public-domain English translation
#   Save as ./corpus/escoffier.txt
#   export ESCOFFIER_BOOK_ID=<the_gutenberg_id>

# Run all ingestion scripts (idempotent):
bash scripts/run_all.sh
```

Re-running is safe: each script tracks ingested chunks via SHA-256 in `${LIGHTRAG_WORKING_DIR}/.ingested.jsonl` and skips duplicates.

### 2.3 Configure apps/api + flip the flag

```bash
# In apps/api production .env:
NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true
NEXANDRO_AI_RAG_BASE_URL=https://rag-proxy.nexandro.local   # your proxy URL
NEXANDRO_AI_RAG_API_KEY=        # paste the same value as RAG_PROXY_API_KEY in rag-proxy/.env
NEXANDRO_AI_RAG_TIMEOUT_MS=5000
NEXANDRO_AI_RAG_MODEL_NAME=gpt-oss-20b-rag
NEXANDRO_AI_RAG_MODEL_VERSION=1.0
```

Restart `apps/api`.

### 2.4 Smoke test

1. Log into the kitchen tablet as a Manager.
2. Open the recipe builder for a new recipe.
3. Add an ingredient with no override yet (e.g. "Beef chuck, raw").
4. Click "Sugerir IA" on the YieldEditor.
5. Within ~2-5 seconds, confirm:
   - A suggestion appears with a citation popover (URL + snippet + model name).
   - The citation URL points at one of: `fdc.nal.usda.gov`, `eur-lex.europa.eu`, or your other corpus sources (NOT `localhost`, NOT a corpus file path).
   - Accept the suggestion. Confirm `ai_suggestions` row created via `psql` (`status='accepted'`).
6. Repeat for the WasteFactorEditor on a recipe.

### 2.5 Optional — enable Brave fallback later

Once the corpus path is proven (a week of monitoring with no chef complaints about coverage gaps), opt into Brave for the long-tail queries:

In `tools/rag-proxy/.env` on the VPS, set:
- `BRAVE_ENABLED=true`
- `BRAVE_API_KEY` to your Brave Search API subscription key (placeholder shape; never commit the real value)
- `BRAVE_DAILY_BUDGET=1000`
- `BRAVE_DOMAIN_WHITELIST` stays default (USDA, EUR-Lex, EFSA, FDA, WHO, FAO, CIAA, Wikipedia, ScienceDirect)

Restart the rag-proxy container. No apps/api changes needed.

### 2.6 Rollback (AI surface)

Tier 1 — disable AI suggestions only (simplest):
```bash
# In apps/api production .env:
NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=false
```
Restart apps/api. Every `/ai-suggestions/*` endpoint returns 404; YieldEditor + WasteFactorEditor hide AI affordances. The `ai_suggestions` table stays intact (history preserved). Chef enters yield/waste manually.

Tier 2 — keep AI surface but unwire the proxy:
```bash
# In apps/api .env:
NEXANDRO_AI_RAG_BASE_URL=http://localhost:0/disabled
```
Restart. Every suggestion call collapses to `null` per Wave 1.7's iron-rule contract — chef sees "manual entry only — no citation available". Less drastic than Tier 1; useful when investigating proxy issues without disabling the entire AI surface.

Tier 3 — stop the rag-proxy container:
```bash
docker compose -f docker-compose.example.yml stop rag-proxy
```
Same effect as Tier 2 from apps/api's perspective: HTTP request fails → null suggestion. The `ai_suggestions` audit history stays intact.

## 3. Per-jurisdiction reminder (labels)

The 2026-05-06 legal clearance behind ADR-019's `NEXANDRO_LABELS_PROD_ENABLED=true` covers **Spain/EU only**. If you deploy nexandro to:

- **UK** — repeat the review against UK FIC (Food Information for Consumers) regulations.
- **US** — repeat against FDA 21 CFR Part 101.
- **LATAM** — repeat per country (ANVISA in Brazil, COFEPRIS in Mexico, INVIMA in Colombia, etc.).
- **APAC** — repeat per country (FSANZ for Australia/NZ, FSSAI for India, etc.).

Until the per-jurisdiction review lands, keep `NEXANDRO_LABELS_PROD_ENABLED=false` for that deployment and chefs will still build recipes — just without the auto-generated regulatory labels.

## 4. Monitoring suggestions (post-deploy)

Suggested operator dashboards / alerts (not part of this slice; file as follow-up if needed):

- **rag-proxy structured logs**: ratio of `lightrag-success` / `brave-fallback` / `null` outcomes per query. Track over time to detect corpus coverage gaps.
- **`ai_suggestions` table**: chef accept/reject ratio. PRD KPI: ≥70% accept rate. Reject reasons (free text, ≥10 chars) reveal where the model gives bad guesses.
- **Brave daily budget**: log when `brave.budget_exceeded` warnings fire. Adjust `BRAVE_DAILY_BUDGET` if hitting the cap regularly.
- **Label print failures**: monitor 422 responses from `POST /recipes/:id/print` (operator forgot to populate Article 9 mandatory fields) and 5xx from the print adapter (printer offline / queue full).

---

End of runbook. Questions/issues → open a GitHub issue tagged `operations`.
