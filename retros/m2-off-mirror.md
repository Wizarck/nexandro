# retros/m2-off-mirror.md

> **Slice**: `m2-off-mirror` · **PR**: [#70](https://github.com/Wizarck/nexandro/pull/70) · **Merged**: 2026-05-01 · **Squash SHA**: `58f513e`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: First slice **fully implemented by a background subagent** under `Agent` tool with `general-purpose` role. Main thread did `m2-recipes-core` (PR #69) in parallel.

## What we shipped

The OFF (Open Food Facts) hybrid local-mirror + REST-fallback architecture per ADR-015. Self-contained BC at `apps/api/src/external-catalog/`: domain entity + factory, sync worker (cursor-based incremental, weekly cron, region-scoped to ES + IT), search service (cache-first with REST fallback + persist-on-hit + outage degradation via typed `OffApiOutageError`), 2 endpoints (`GET /health/external-catalog` public + `POST /external-catalog/sync` Owner-only), migration `0010_external_food_catalog` with `pg_trgm` GIN for fuzzy name search.

29 new unit tests, 1 INT spec (round-trip + UNIQUE + region scope + sync cursor + DB CHECK), 5 new i18n keys with `EXTERNAL_CATALOG_*` prefix.

## What worked

- **Subagent prompt was tight enough that the agent stayed on-spec.** ~600 words covering scope + boundaries + conventions + verification. 0 boundary violations reported. The subagent only touched declared paths + the explicitly-allowed shared files (`app.module.ts`, `locales/*.json`, `package.json`).
- **Locale-key prefix discipline** (mine `RECIPE_*` / `CYCLE`, subagent's `EXTERNAL_CATALOG_*`) made the merge conflict a clean append-merge — both PRs added new keys at the bottom of the same `errors` block; the rebase auto-resolved everything except the JSON brace placement, which I fixed in 30 seconds.
- **Pure-function OFF mapper isolated from the service.** Test coverage of edge cases (missing fields, unexpected types, OFF schema variations) is cheap because the mapper is `(json) => entity` with no I/O.
- **Cron + manual trigger split.** `@Cron` decorator handles weekly background; the `POST /sync` endpoint covers the "force a refresh" admin path. No state machine for "is sync running?" because the typed `EXTERNAL_CATALOG_SYNC_IN_PROGRESS` error covers concurrent invocation.
- **Subagent runtime: 11 minutes.** Way under the original 3-hour estimate. The smaller-than-expected duration was a function of (a) tight scope, (b) M2 wave 0 having just shipped clean conventions to imitate, and (c) the agent not getting derailed by interactive negotiation.

## What didn't (and the fixes)

- **PR #70 came back DIRTY (CONFLICTING) when CI tried to start.** Root cause: subagent's branch was created from `26786b0` (post-m2-data-model archive) BEFORE m2-recipes-core merged at `d75d3fd`. The locale conflict was inevitable. Fix: rebased on master, hand-merged the locale block (just removed conflict markers, kept both sets of keys), force-with-lease pushed. CI ran cleanly on the rebased tip.
- **`npm install @nestjs/schedule` reformatted `apps/api/package.json` arrays to multiline.** Subagent restored the inline style by hand. For next time: document this in the M2 retro and consider a `.npmrc` formatting hint.
- **Worktree had no `node_modules`** when the subagent started — wt_add.py creates the worktree but doesn't install deps. The subagent ran `npm install` from scratch (~9s), but it's avoidable if `wt_add.py` runs `npm install` (or equivalent for non-Node projects) post-creation. Filed as a follow-up for ai-playbook.
- **Tasks 5.1 (live 200k-row sync), 6.1 (runbook), 6.2 (monitoring alert) deferred.** Operational, not code; they belong to a deploy + monitoring stack selection, not this slice.
- **OFF v1 search API's `last_modified_t=>X` filter is best-effort** per their docs — silently ignored sometimes. Subagent's sync code falls back to "fetch latest by sort order" when the filter yields zero rows; the test asserts the filter IS in the URL (best-effort but contract-checked).

## Surprises

- **Subagent runtime undershot estimate by 16x.** Expected 2-3 hours; got 11 minutes. The Agent tool's `general-purpose` role is fast when the prompt is operationally complete (no clarification round-trips needed).
- **The merge conflict was FOUR lines per file** (one open brace, one block of 3-4 keys, one close brace). The rebase took longer to type out than to resolve. Consider locale-conflict-as-a-first-class-pattern: same prefix for the same slice, easy diff resolution.
- **M2-off-mirror's INT spec runs in `pg_trgm`-extension territory.** Postgres extensions are migration-time concerns. The migration's `CREATE EXTENSION IF NOT EXISTS pg_trgm;` is the right place. Confirmed by the subagent's spec round-tripping fuzzy queries.

## What to keep

1. **Subagent for self-contained slices.** OFF mirror is the canonical case: new BC, new migration, new module, no entanglement with existing code beyond the wiring file. Reuse pattern for: external integrations, label generators, MCP server, anything with a clean module boundary.
2. **Locale-key prefix per slice.** `RECIPE_*` vs `EXTERNAL_CATALOG_*` made the JSON conflict trivial. Codify in a future retro / playbook update.
3. **Ten-minute prompt-drafting investment** to save 1.5 hours of parallel work.
4. **`pg_trgm` extension creation in the migration.** Postgres-specific but correct; M3 batch/lot tables that need fuzzy search will follow the same pattern.

## What to change

1. **`wt_add.py` should `npm install` post-creation.** Add the hook so subagents (and humans) skip the cold start.
2. **Consider a slice-prefix locale convention** in `ai-playbook` so future Wave-N parallel slices conflict-free by construction.
3. **OFF v1 API filter sometimes silent — switch to v2 API** when v2 stabilises (currently in beta per OFF docs). Tracked as a follow-up.
4. **Monitoring stack selection** (alert when `lastSyncAt > 14d`). Belongs to a separate ops slice or ELIGIA infra work.

## Wave-N parallelism observations (this slice's record)

| Aspect | Number |
|---|---|
| Subagent prompt drafting | 10 min |
| Subagent runtime | 11 min |
| Locale conflict resolution | 30 sec (one hand-edit per file × 2 files) |
| PR open + CI + admin-merge | 5 min |
| Total m2-off-mirror wall-clock cost (main-thread time) | ~16 min |
| What main thread did during that 16 min | Wrote m2-recipes-core (~1.5 h) — net win = ~1 h saved vs sequential |

The §6.6 cost-benefit threshold (~30 min of parallelisable work) was met comfortably. Both slices > 1 hour of work each; aggregate wall-clock saving = ~1.5 hours.

## Cross-references

- Specs (archived): `openspec/specs/m2-off-mirror/`
- ADRs: ADR-015 (hybrid local mirror + REST fallback)
- Foundation: `openspec/specs/m2-data-model/` (Ingredient.nutrition jsonb consumed by `#5`)
- Parallel sibling: `retros/m2-recipes-core.md` (PR #69, same wave)
- ai-playbook: `specs/release-management.md` §6.4 (wave parallelism), `specs/git-worktree-bare-layout.md`
