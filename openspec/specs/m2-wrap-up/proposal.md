## Why

M2 development is complete (16 slices merged through Wave 1.8). Two production feature flags have been gating M2's externally-visible surface:

- `NEXANDRO_LABELS_PROD_ENABLED` (Wave 1.6) — gated on pre-launch external legal review per ADR-019 §Risk.
- `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` (Wave 1.7) — gated on RAG corpus ingestion + rag-proxy deploy on the VPS, both delivered by `m2-ai-yield-corpus` (Wave 1.8).

The Owner has declared both gates cleared:
- Legal review filed and approved.
- VPS-side deploy: rag-proxy Docker image up + USDA + EU 1169 + Escoffier corpus ingested through RAGAnything+LightRAG.

This slice formally closes M2 in production. It is doc-and-config only — no business logic changes. The `.env.example` for `apps/api` documents both flags as `true` (prod default), the ADRs that gated the flags get a "gate cleared" footnote with date, and a new `docs/operations/m2-prod-runbook.md` captures the deploy steps + rollback procedure for future reference.

## What Changes

- `apps/api/.env.example`: `NEXANDRO_LABELS_PROD_ENABLED=true` and `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` as the documented prod default. The runtime code default in `apps/api/src/{labels,ai-suggestions}/*.module.ts` stays `false` (safety default for unconfigured deployments — operators must explicitly opt in via `.env`).
- `docs/architecture-decisions.md`: ADR-018 and ADR-019 each get a "Gate clearance" note dated 2026-05-06 referencing this slice.
- `docs/operations/m2-prod-runbook.md` (NEW): step-by-step deploy + rollback for operators.
- `tools/rag-proxy/.env.example`: documents the production env shape (LIGHTRAG_BASE_URL pointing at internal LightRAG + RAG_PROXY_API_KEY + BRAVE_API_KEY for the fallback path).
- **BREAKING**: none — additive documentation. No code changes.

## Capabilities

### New Capabilities

- `m2-wrap-up`: formal production-cutover documentation for M2. Captures the gate-clearance state + provides operator runbook.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: All 16 prior M2 slices merged (latest: `m2-ai-yield-corpus` Wave 1.8 PR #88, squash 6d63e6c).
- **Code**: zero TypeScript LOC; zero Python LOC. Documentation only (`.env.example`, ADR notes, new operations runbook).
- **External dependencies**: none — the runbook references already-shipped artefacts (Docker images, corpus scripts).
- **Audit**: ADR notes + retro provide the trail for the gate clearance.
- **Rollback**: operator sets either flag back to `false` in production `.env` and restarts apps/api. No data integrity risk; UI/endpoints degrade to manual-only path per Wave 1.6 (labels) and Wave 1.7 (AI suggestions).
- **Out of scope**:
  - `m2-audit-log` (Wave 1.9, next slice) — extracts cache+audit pattern out of the 5 per-BC tables.
  - `m2-ai-yield-cookbooks-modern` — gated on publisher licensing.
  - `m2-labels-print-adapter-phomemo` — Phomemo PM-344-WF protocol RE.
