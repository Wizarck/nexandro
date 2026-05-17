## Context

M2 development is complete: 16 slices merged across 8 waves (Wave 1.0 — `m2-data-model`, `m2-recipes-core`, `m2-off-mirror` — through Wave 1.8 — `m2-ai-yield-corpus`). Two feature flags have been gating the external production surface, by design — both regulated artefacts whose risk surface required external clearance before flipping on:

- **Labels** (Wave 1.6, `m2-labels-rendering`): `NEXANDRO_LABELS_PROD_ENABLED` per ADR-019 §Risk. Generates EU 1169/2011-compliant nutritional labels; pre-launch external legal review required to confirm the label format meets compliance for the operator's jurisdiction(s).
- **AI yield/waste suggestions** (Wave 1.7, `m2-ai-yield-suggestions`): `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED` per ADR-018. Iron-rule citations require a real RAG corpus + proxy translation layer; both delivered by `m2-ai-yield-corpus` (Wave 1.8).

The Owner declares both gates cleared. This slice is the formal milestone.

## Goals / Non-Goals

**Goals:**

- Document the `.env.example` for `apps/api` so operators picking up the repo see `=true` as the documented production default.
- Annotate ADR-018 and ADR-019 with a dated "gate cleared" footnote for traceability.
- Ship a `docs/operations/m2-prod-runbook.md` with deploy steps + rollback for both surfaces (labels + AI suggestions).
- Update memory + retro to mark M2 as complete in production.

**Non-Goals:**

- Change runtime code defaults (`process.env.X ?? 'false'` pattern stays — safety default for unconfigured deployments). Operators must explicitly opt in via `.env` in their production environment.
- Trigger any actual deployment from CI. The runbook is operator-facing, not automation.
- Add new capabilities. This is a milestone closure, not a feature.

## Decisions

- **`.env.example` is documentation, not a runtime default.** Apps that read the file at build time would get the new defaults; apps that read `process.env` at runtime ignore it. We deliberately do not change the runtime fallbacks — a fresh deployment that forgets to copy `.env.example` to `.env` should still default to safe-off. The example file exists to teach the operator what the prod-cleared shape should look like.

- **ADRs get inline gate-clearance notes, not new ADRs.** The original ADRs already documented the risk + the gating mechanism. A footnote dated 2026-05-06 is the right granularity — it shows the gate cleared without creating an ADR-021 just to say "ADR-019's risk is now retired".

- **One operations runbook covers both surfaces.** Both flags depend on operator-controlled deploys (kitchen printer + LightRAG corpus + rag-proxy) so consolidating deploy + rollback into one doc reduces drift.

- **No retro deferral until later.** Most slices write a retro after merge. This slice's retro IS the milestone artefact; it's part of the slice itself.

## Risks / Trade-offs

- **[Risk] Operator forgets to deploy rag-proxy before flipping the AI flag.** **Mitigation**: the runbook walks the prerequisites + the fallback behaviour: with the flag on but the proxy unreachable, every suggestion call collapses to `null` per the Wave 1.7 contract — chef sees "manual entry only", no crash. Acceptable degradation.

- **[Risk] Legal review covers Spain/EU but operator deploys to a non-EU jurisdiction.** **Mitigation**: ADR-019 §Risk note flags this; the runbook reminds operators to repeat the legal review for each deployed jurisdiction before flipping the labels flag.

- **[Trade-off] Doc-only slice still goes through full PR + CI.** Accepted: keeps the audit trail consistent. CI has nothing to verify on a doc PR; passes trivially.

## Migration Plan

1. Update `apps/api/.env.example` — both flags to `true` with explanatory comments.
2. Append "Gate clearance 2026-05-06" footnotes to ADR-018 and ADR-019.
3. Write `docs/operations/m2-prod-runbook.md`.
4. Validate openspec.
5. Commit + push + open PR + admin-merge once CI is green.
6. Archive the change + write retro + update memory.

**Rollback**: revert the .env.example change (operators read `=true` but their actual prod `.env` has whatever they configured). The runbook stays — historical reference. ADR notes stay — they record what was true at the time. No data risk.

## Open Questions

- **Should we add a CI smoke test that asserts both flags are wired correctly?** Decision: no. The existing controller tests already cover flag-off behaviour (404 path); flag-on behaviour is validated by integration tests + manual smoke. A "is the flag actually on in prod?" test would be a deployment health check, not a CI test.
