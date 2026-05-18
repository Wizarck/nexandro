# rag-corpus

Authoritative corpus ingestion scripts for the nexandro AI yield/waste suggestion engine.

Pipes USDA FoodData Central, EU Reglamento 1169/2011, Escoffier *Le Guide Culinaire* (Project Gutenberg), and (when permitted) CIAA Spain materials through [RAGAnything](https://github.com/HKUDS/RAG-Anything) into the existing [LightRAG](https://github.com/HKUDS/LightRAG) instance.

## Sources

| Source | Script | License | Notes |
|---|---|---|---|
| USDA FoodData Central | `ingest_usda.py` | Public domain (US Government Work) | CSV download from `fdc.nal.usda.gov` |
| EU Reglamento 1169/2011 | `ingest_eu_1169.py` | Decision 2011/833/EU (free reuse) | Consolidated PDF from EUR-Lex |
| Escoffier *Le Guide Culinaire* | `ingest_escoffier.py` | Public domain (>100 years) | Project Gutenberg edition |
| CIAA Spain materials | `ingest_ciaa.py` | Permission required | Gated on `CIAA_PERMISSION_GRANTED=true` |

Modern copyrighted cookbooks (Larousse, CIA, McGee) are explicitly **out of scope** until a separate slice covers legal due diligence.

## Run

```bash
cd tools/rag-corpus
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,prod]"
cp .env.example .env  # then edit

# one-shot ingestion (idempotent)
python -m rag_corpus.ingest_usda
python -m rag_corpus.ingest_eu_1169
python -m rag_corpus.ingest_escoffier

# optional, gated:
CIAA_PERMISSION_GRANTED=true python -m rag_corpus.ingest_ciaa
```

Or run all in dependency order:

```bash
bash scripts/run_all.sh
```

## Run tests

```bash
pip install -e ".[dev]"
pytest
ruff check .
mypy src/
```

The dev deps deliberately exclude `raganything` and `lightrag-hku` — those pull a multi-GB ML stack. Tests mock the `LightRAG` client. Use `pip install -e ".[dev,prod]"` only when actually ingesting on a machine with the full stack.

## Idempotency

Each script tracks ingested chunks via SHA-256 of `(source_url, content)` in `${WORKING_DIR}/.ingested.jsonl`. Re-running skips already-ingested chunks; only new content is added.

## Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `LIGHTRAG_WORKING_DIR` | yes | — | LightRAG storage directory (must match LightRAG server config) |
| `LIGHTRAG_API_KEY` | no | — | If LightRAG server requires auth |
| `CIAA_PERMISSION_GRANTED` | for CIAA only | `false` | Set to `true` after explicit written permission |

## License

Same as parent repository. Upstream notes in `LICENSE_NOTE.md`.
