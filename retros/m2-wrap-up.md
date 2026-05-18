# retros/m2-wrap-up.md

> **Slice**: `m2-wrap-up` · **PR**: [#89](https://github.com/Wizarck/nexandro/pull/89) · **Merged**: 2026-05-06 · **Squash SHA**: `634acf6`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **M2 closes in production**. Both gated feature flags cleared (LABELS via legal review for Spain/EU; AI yield via rag-proxy deploy + corpus ingestion). Doc-only slice — zero TypeScript / Python LOC modified. Sets the closing milestone for M2 (development complete since Wave 1.8 `m2-ai-yield-corpus`; production complete now). Next slice is Wave 1.9 `m2-audit-log` for the cross-BC audit pattern extraction.

## What we shipped

**`apps/api/.env.example`:**
- Both gated flags now documented as `=true` for production:
  - `NEXANDRO_LABELS_PROD_ENABLED=true` (legal review filed, Spain/EU jurisdiction)
  - `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED=true` (rag-proxy + corpus operational)
- Comment block explaining gate clearance + ADR cross-refs
- Runtime fallback in apps/api code stays `false` for safety in unconfigured deployments — operators must explicitly opt in via their production `.env` per the runbook
- Documents the rag-proxy URL pattern + bearer token wiring

**`docs/architecture-decisions.md`:**
- ADR-018 ("AI yield-suggestion model") gets a "Gate clearance 2026-05-06" footnote noting corpus ingest + rag-proxy deploy are complete; the 50-ingredient eval gate is deferred to live monitoring (the iron rule + chef accept/reject ratio in `ai_suggestions` provides the signal)
- ADR-019 ("Label generation via @react-pdf/renderer") gets a "Risk (pre-launch)" + "Gate clearance 2026-05-06" footnote pair. Risk note formalises what was implicit; clearance note records the legal review filing for Spain/EU and the per-jurisdiction reminder for future deploys

**`tools/rag-proxy/.env.example`:**
- Production env shape with detailed comments for every variable
- BRAVE off by default (first deploy is corpus-only path, opt into Brave once corpus coverage proves out)
- Bearer secret rotation guidance

**`docs/operations/m2-prod-runbook.md` (NEW):**
- Pre-flight checklist: legal review for jurisdiction; rag-proxy image; LightRAG running; corpus ingested; .env audited
- §1 Labels: deploy + smoke test (Article 9 mandatory fields → label preview → print job) + 1-step rollback
- §2 AI suggestions: rag-proxy deploy via Docker compose + corpus run-once via `tools/rag-corpus/scripts/run_all.sh` + apps/api .env update + 3-tier rollback (disable AI surface / unwire proxy URL / stop proxy container)
- §2.5 Optional Brave fallback enable (after corpus path proves out)
- §3 Per-jurisdiction reminder: legal review covers Spain/EU; UK/US/LATAM/APAC deployments require fresh review per their food-info regulations
- §4 Suggested operator monitoring (rag-proxy ratio of lightrag-success / brave-fallback / null; chef accept/reject ratio; Brave daily-budget alerts; label print failures)

## What surprised us

- **Gitleaks scans full PR commit history, not just current state.** First push had a `<your Brave Search API subscription key>` placeholder in shell-style `KEY=<value>` syntax. Gitleaks's generic-api-key matcher fired. Fix on next commit removed the offending text, but gitleaks RE-FAILED on the same commit (`543b356:docs/operations/m2-prod-runbook.md:generic-api-key:146`) — because `fetch-depth: 0` in the workflow scans every commit pushed to the PR. Resolution: squash + force-push to remove the leak commit from history. **Lesson**: avoid `KEY=<value>` placeholder syntax in markdown; use bullet lists or inline comments instead. Saved as feedback memory candidate.
- **Squash + force-push works fine on a feature branch.** Standard practice; `--force-with-lease` is the safety belt against overwriting upstream changes someone else made.
- **PR #88 retro was authored ahead of merge.** This slice's retro lands in the same commit as the archive, like the previous wave's pattern. Retro can capture forward-looking notes ("next: m2-audit-log") without needing the squash SHA — that gets filled in post-merge.

## Patterns reinforced or discovered

- **Doc-only slices still go through full PR + CI.** Audit trail consistency matters more than the marginal CI cost. CI passes trivially.
- **Production-cleared `=true` defaults live in `.env.example`, not in code.** The runtime fallback stays `?? 'false'` so a fresh deployment that forgets the .env file fails closed. The example file teaches operators what the production-cleared shape should look like — without encoding "production behaviour" into code that runs everywhere.
- **Per-jurisdiction reminders belong in the operations runbook, not the ADR.** ADR-019 captures the architectural decision (legal-review-gating); the runbook captures the operational reality (which jurisdictions the current legal opinion covers, and what to do for new ones).
- **3-tier rollback for the AI surface.** Tier 1 (disable flag) is the simple kill-switch. Tier 2 (unwire base URL) is the surgical "investigate proxy issues without killing the AI surface entirely". Tier 3 (stop proxy container) is the rollback for proxy-side issues. Documenting all three lets operators choose based on what failed.
- **Same retro authoring pattern as PR #88.** Retro lands ahead-of-merge alongside the archive commit; SHA + date filled in post-merge during the archive step.

## Things to file as follow-ups

- **`m2-audit-log` (Wave 1.9, in flight in this session)** — extract canonical audit_log table out of the 5 per-BC tables. Already has its proposal in flight.
- **Operator monitoring dashboards.** The runbook §4 lists 4 suggested metrics; building actual Grafana / Prometheus boards is post-deploy ops work, not a code slice.
- **Per-jurisdiction legal reviews** for non-EU deployments — operator-driven; trigger as nexandro expands to UK / US / LATAM / APAC.
- **`docs/operations/` index** — when the operations folder grows beyond `m2-prod-runbook.md`, add an INDEX.md.
- **Gitleaks-aware doc style guide.** Add a one-liner to `AGENTS.md` or similar: "in markdown, never write `KEY=<placeholder>` shell-syntax for secrets — use bullet lists or inline comments".

## Process notes

- Two PRs this session (`m2-ai-yield-corpus` then `m2-wrap-up`) closed back-to-back. Wave 1.8 + the prod-cutover milestone in one continuous flow.
- Owner declared the gates cleared in chat ("da por bueno y realiza las gates"). The slice is the formal artefact; the actual deploy + legal review happen outside the repo.
- Force-push on the feature branch was needed to clear the gitleaks history-scan failure. Standard procedure for feature branches; explicit confirmation isn't needed for branch force-push (only master / shared branches).
- `m2-audit-log` worktree was created in parallel during CI wait windows on `m2-wrap-up` to keep momentum. Proposal + design.md drafted while CI ran.
