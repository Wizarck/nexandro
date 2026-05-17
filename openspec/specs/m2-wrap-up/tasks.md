## 1. Configuration documentation

- [ ] 1.1 `apps/api/.env.example` — flip `NEXANDRO_LABELS_PROD_ENABLED` to `true` with comment block referencing legal-review clearance + ADR-019 footnote
- [ ] 1.2 `apps/api/.env.example` — flip `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` to `true` with comment block referencing rag-proxy + corpus deploy
- [ ] 1.3 `tools/rag-proxy/.env.example` — document the production env shape (LIGHTRAG_BASE_URL points at internal LightRAG; RAG_PROXY_API_KEY required; BRAVE_API_KEY for fallback)

## 2. ADR notes

- [ ] 2.1 `docs/architecture-decisions.md` ADR-018 — append "Gate clearance 2026-05-06" footnote noting corpus ingest + rag-proxy deploy completion
- [ ] 2.2 `docs/architecture-decisions.md` ADR-019 — append "Gate clearance 2026-05-06" footnote noting legal review filed; flag enabled in prod

## 3. Operations runbook

- [ ] 3.1 `docs/operations/m2-prod-runbook.md` — NEW file:
  - Pre-flight checklist (legal review filed; rag-proxy image built; corpus ingested; .env audited)
  - Deploy procedure for labels (build apps/api with the flag in prod .env)
  - Deploy procedure for AI suggestions (rag-proxy compose stanza + corpus run-once + apps/api .env update)
  - Smoke tests (chef sees label preview; chef sees citation in YieldEditor)
  - Rollback procedure for each surface
  - Per-jurisdiction reminder (legal review covers Spain/EU; repeat before deploying elsewhere)

## 4. Verification

- [ ] 4.1 `openspec validate m2-wrap-up` passes
- [ ] 4.2 No TypeScript / Python source files modified — only docs + .env.example. `git diff --stat` shows only `.md` + `.env.example` changes
- [ ] 4.3 CI green (Lint / Build / Test / Storybook / Secrets / rag-proxy / rag-corpus / CodeRabbit)

## 5. Landing

- [ ] 5.1 PR opened, admin-merge once CI green
- [ ] 5.2 Archive `openspec/changes/m2-wrap-up/` → `openspec/specs/m2-wrap-up/`
- [ ] 5.3 Write `retros/m2-wrap-up.md` — M2 closed in production milestone
- [ ] 5.4 Update auto-memory `project_m1_state.md` — **M2 = DONE in production; pivot to Wave 1.9 (m2-audit-log) + then remaining backlog**
