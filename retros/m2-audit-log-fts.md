# retros/m2-audit-log-fts.md

> **Slice**: `m2-audit-log-fts` · **PR**: [#94](https://github.com/Wizarck/nexandro/pull/94) · **Merged**: 2026-05-06 · **Squash SHA**: `e7e1fb1`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.11 — first FTS slice on the project**. Adds Postgres dual-config (Spanish + English) full-text search over `audit_log` via TWO functional GIN indexes — no stored `tsv` column, no entity changes. The `GET /audit-log` endpoint gains an optional `?q=<text>` parameter ranked by `GREATEST(ts_rank_es, ts_rank_en) DESC` with `created_at DESC` as recency tiebreaker.

## What we shipped

**Migration `0019_audit_log_fts.ts`:**
- TWO functional GIN indexes — `ix_audit_log_fts_es` and `ix_audit_log_fts_en` — each combining `jsonb_to_tsvector('<lang>', payload_*, '["string"]')` for the jsonb columns + `to_tsvector('<lang>', coalesce(reason/snippet, ''))` for the text columns. The `'["string"]'` jsonb filter argument extracts only string values from the jsonb tree (skipping numbers, booleans, keys, punctuation noise).
- No table column added (functional indexing approach, F1=a). Postgres builds both indexes by full-table scan at `CREATE INDEX` time — no manual backfill needed (F4=OK).
- `hasTable('audit_log')` guard for fresh-schema safety.
- `down()` drops both indexes; underlying columns untouched.

**`audit-log-fts.sql.ts` (NEW — single source of truth):**
- Exports four constants: `ES_VECTOR_SQL` / `EN_VECTOR_SQL` (with `a.` alias for the QueryBuilder) + `ES_VECTOR_SQL_MIGRATION` / `EN_VECTOR_SQL_MIGRATION` (alias-stripped via `.replace(/a\./g, '')` for the migration's `CREATE INDEX` clauses).
- Migration AND service reference the same string literal — eliminates the dominant failure mode for functional-index FTS setups (drift between indexed expression and queried expression → silent fallback to Sequential Scan).

**`AuditLogService.query()` extended:**
- New optional `filter.q?: string`. When present, `qb.andWhere` adds an OR'd dual-config tsquery predicate (`(es_vector) @@ plainto_tsquery('spanish', :q) OR (en_vector) @@ plainto_tsquery('english', :q)`); `qb.orderBy` becomes `GREATEST(ts_rank(es_vec, q_es), ts_rank(en_vec, q_en)) DESC` with `addOrderBy('a.created_at', 'DESC')` as tiebreaker.
- When absent, ordering reverts to the pre-FTS `created_at DESC` only — backward compatible.
- Empty string `q=''` is treated as absent (length-check guard).

**DTO + controller:**
- `AuditLogQueryDto.q?` with `@IsOptional + @IsString + @MaxLength(200)` — caps payload-bombing without over-normalising. `plainto_tsquery` handles malicious-looking input safely (it's tokenised, not regex).
- Controller passes `query.q` through to the service filter.

**Tests:**
- 5 unit tests in `audit-log.service.spec.ts` — q-absent ordering, q-present FTS clause shape, ORDER BY uses GREATEST, empty `q` treated as absent, AND-with-other-filters.
- 5 DTO tests in new `audit-log-query.dto.spec.ts` — valid q, q absent, over-200 reject, non-string reject, exact-200 boundary accept.
- 1 controller pass-through test.
- Net: +11 unit tests; 643 → 654 jest green at completion.
- INT spec `audit-log-fts.int.spec.ts` (Postgres) — 6 seed rows mixing Spanish + English text + match cases (`tomate`, `chicken`, `pollo`, `inexistente`) + AND-with-aggregateType + 3 ranking scenarios (SD4-a stable order, SD4-b cross-config, SD4-c recency tiebreaker) + index-contract tests via `pg_indexes.indexdef`.

## What surprised us

- **The EXPLAIN-based plan check was a dud.** I shipped the v1 INT spec with an `EXPLAIN (FORMAT JSON)` assertion that the plan referenced `ix_audit_log_fts_es` or `_en`, intending to surface migration/service drift. CI failed v1 because Postgres preferred Seq Scan on cost grounds (only 6 seed rows). v2 added `SET LOCAL enable_seqscan = off` — also failed: with seqscan disabled, the planner picked `ix_audit_log_aggregate` (a multi-column B-tree whose leading column is `organization_id`) and post-filtered the FTS predicate. **Lesson**: EXPLAIN-based assertions on small test tables are fundamentally unstable because the planner has multiple cheaper paths to the answer than your fancy GIN. The v3 fix asserted directly on `pg_indexes.indexdef` for the structural drift contract — which is what we actually wanted to test (do the indexes exist with the right tokens?). The EXPLAIN approach was a category error: it conflated "planner cost model" with "planner contract".
- **`SET LOCAL enable_seqscan = off` is not a silver bullet.** I'd assumed it forced the planner to use a specific index; what it actually does is "remove Sequential Scan from the candidate paths". If multiple indexes are candidates, the planner still picks the cheapest one. To force a specific index for testing, you'd need `pg_hint_plan` or the brutal `SET enable_indexscan = off ; SET enable_bitmapscan = off ; SET enable_indexonlyscan = off` to leave only the GIN index — but that's fragile and tests planner behaviour rather than schema correctness.
- **Functional indexes are the cleaner choice over generated columns.** The original Gate D fork (F1) was between (a) `jsonb_to_tsvector` functional indexing and (c) generated `STORED` `tsv` column. The user picked (a). Implementation confirmed why: ZERO entity changes, ZERO TypeORM coupling, no `select: false / insert: false / update: false` annotations to maintain. The migration adds two indexes; the service builds the WHERE clause from shared SQL fragments; the entity is identical to Wave 1.9. The only sharp edge is the planner-contract requirement that the WHERE expression match the index expression character-for-character — codified by the shared-source-of-truth file.
- **The user's pick override mid-flight cost a full file rewrite.** I'd written `proposal.md`, `design.md`, `tasks.md` based on my Gate D recommendations (1c/2a/5a) before user confirmation. User overrode with (1a/2d/5b) plus opened a sub-question on F3 endpoint shape. I had to rewrite all three files from scratch with the new picks, then add a 5-fork sub-decision pass (SD1–SD4). Lesson committed to memory as `feedback_user_decides_gates.md`: never write artefacts before all picks are explicitly confirmed; never substitute my recommendation when the user overrides one fork. Linked to global CLAUDE.md universal principle 6 (approval-gated progression).
- **Multi-config FTS via OR'd vectors is more verbose than expected.** With F2=d (Spanish + English) and SD3=a (always-both, no `lang` hint), the WHERE clause balloons to 8 lines: two tsvector expressions, OR'd with `@@ plainto_tsquery` for each config. The `GREATEST(ts_rank_es, ts_rank_en)` ORDER BY clause is even longer. Acceptable trade-off for the chef-facing UX (user doesn't declare language) but the SQL is wide. The shared `audit-log-fts.sql.ts` constants help; without them this would be unreadable.

## Patterns reinforced or discovered

- **Shared SQL source-of-truth for functional indexes.** When migration's `CREATE INDEX (<expression>)` and service's `WHERE … @@ tsquery` need the EXACT same SQL expression to use the index, codify the expression as exported string constants and reference both consumers from the same file. The drift surface vanishes. This pattern would also work for partial indexes, expression indexes on computed columns, and any other "two consumers must agree on a SQL fragment" case (e.g. RLS policies, materialised view definitions).
- **`pg_indexes.indexdef` is the right contract test for functional indexes.** When you want to verify "index X exists with expression Y", query `pg_indexes` and assert key tokens are present in `indexdef`. This sidesteps the entire planner-cost-model rabbit hole. EXPLAIN-based tests are appropriate for performance assertions on PROD-shaped data, not for structural contract verification.
- **Empty string is not a meaningful query.** The service's `if (filter.q && filter.q.length > 0)` guard treats `q=''` as absent. Important for chef-facing endpoints where users might submit empty form fields. Without the guard, `plainto_tsquery('spanish', '')` builds an empty tsquery and matches everything (or nothing, depending on Postgres version) — confusing wire behaviour.
- **`jsonb_to_tsvector(..., '["string"]')` over `to_tsvector(payload::text)`.** The first extracts only string values from the jsonb tree; the second tokenises the JSON serialisation including keys, braces, quotes, and number literals. For audit-payload search, the first is dramatically better signal-to-noise. Cost: requires Postgres ≥ 11. We're on 16, fine.
- **`GREATEST(rank_a, rank_b)` over `rank_a + rank_b` for cross-config ranking.** Adding ranks double-counts when the same row matches both configs; GREATEST takes the stronger signal. For cross-config FTS this is the canonical pattern — verified empirically in the SD4-b test.
- **Backward-compat-by-construction via opt-in params.** `q` is optional; absent → existing query semantics intact. The service has a clean `if (q) { … } else { existing path }` branch. This is the safest pattern for adding capabilities to a stable endpoint: zero behaviour change for callers who don't opt in.
- **CI is your INT spec safety net.** Local Postgres wasn't available; I shipped INT spec untested against a real DB. CI caught the EXPLAIN-fragility issue twice (v1 + v2). The fix-on-next-commit cycle was 5 min per iteration. Worth the cost; trying to set up local Docker for one test would have taken longer.

## Things to file as follow-ups

- **`m2-audit-log-fts-weighted`** — `setweight()` to boost `reason`+`snippet` (deliberate, semantic) over `payload_*` (jsonb noise). Filed as design.md non-goal; revisit if ranking quality feedback warrants. Trigger: chef complaint that "I searched for X and got irrelevant rows ranked above the obvious ones".
- **`m2-audit-log-fts-trigram`** — `pg_trgm` GIN/GIST index for substring matching (`car` matching `carrot`). Useful when stemming alone misses partial matches. Filed.
- **`m2-audit-log-fts-highlight`** — `ts_headline()` to return matched-text snippets in the response. Currently the chef sees the full row + reads `payload_after` themselves; highlighting would surface "the 30-char snippet around the match" inline. Adds wire shape to the response.
- **`m2-audit-log-fts-lang-hint`** — optional `lang` query param to skip the unused config. Currently always-both per SD3=a. Performance optimisation if both indexes prove expensive at PROD scale. Filed.
- **`m2-audit-log-fts-online-build`** — refactor migration to use `CREATE INDEX CONCURRENTLY` if `audit_log` grows past ~10M rows. CONCURRENTLY can't run inside a transaction so the migration would need a special non-transactional shape. Not blocking at current scale.
- **`m2-audit-log-export`** (Wave 1.12) — CSV export. Already filed; next slice.

## Process notes

- Gate D had **5 forks** (F1–F5) + **4 sub-forks** (SD1–SD4) after user override. The sub-forks were necessary because F1=a + F2=d combined opened structural choices (one combined index vs two per-language; equal vs weighted columns; always-both vs lang-hint; what to test for ranking). I surfaced all four and asked the user to pick — user confirmed my recommendations on all four (b/a/a/d).
- The mid-flight pivot (user override of F1/F2/F5) cost ~3 file rewrites. Lesson committed: never pre-write artefacts based on my recommendations.
- CI iteration: v1 (committed 0c353a8) → INT failed on EXPLAIN cost. v2 (c042e84) → still failed (other index picked). v3 (f4b8575) → refactor to pg_indexes contract test → green. Build/Lint/Test/Storybook/Gitleaks/CodeRabbit all passed on every iteration.
- Local jest at 654/654 (was 643). Net +11 unit tests + 11 INT scenarios (deferred to CI Postgres docker).
- Build clean. Lint clean. CodeRabbit reviewed cleanly.
- Squash-merged at `e7e1fb1`. Local branch deletion was blocked by the active worktree (warning, non-fatal); cleaned up after archive.
- Hindsight retain queue still pending drain (10 items from Wave 1.7–1.10 + this Wave's lessons). SOPS age key not loadable from Claude Code shell; user to drain manually when convenient.
