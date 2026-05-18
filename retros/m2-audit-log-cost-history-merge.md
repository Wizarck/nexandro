# retros/m2-audit-log-cost-history-merge.md

> **Slice**: `m2-audit-log-cost-history-merge` · **PR**: [#91](https://github.com/Wizarck/nexandro/pull/91) · **Merged**: 2026-05-06 · **Squash SHA**: `c43456d`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.10 — first slice that actively drops a legacy table** instead of adding alongside. Closes the loop on `m2-audit-log` (Wave 1.9) for the cost-history concern: `audit_log` is now the SINGLE source of truth for cost rebuild events; `recipe_cost_history` table + entity + repository all retired in one transaction. Triggered by `m2-audit-log-cleanup` being archived as no-op (the original cleanup target was misclassified).

## What we shipped

**Payload enrichment (`RECIPE_COST_REBUILT`):**
- `cost.service.recordSnapshot()` now emits ONE envelope per rebuild whose `payload_after` is `{reason, totalCost, components: Array<{recipeIngredientId, costPerBaseUnit, totalCost, sourceRefId}>}`.
- No longer writes to `recipe_cost_history` (table dropped in the same slice). Single canonical persistence path through the bus → `AuditLogSubscriber` → `audit_log` row.
- Atomic per rebuild: row count drops ~21× for typical 20-component recipes (N+1 rows → 1 row). Jsonb is cheap; payload size grows from ~200 B → 3-5 KB, well within Postgres performance envelope.

**`unpackHistoryRows(auditRow)` helper (`cost-history-unpack.ts`):**
- Turns one `audit_log` row into N+1 wire rows (1 totals + N components).
- Handles BOTH shapes:
  - **Rich (Wave 1.10+)** — `payload_after.components` array → 1 totals + N components.
  - **Thin (Wave 1.9)** — `payload_after` lacks `components` → 1 totals row only, no components. Backward-compatible with rows backfilled by Wave 1.9's migration.
- Synthetic `id` format = `<auditLogRowId>:<componentRefId|'totals'>` — stable, idempotent, lets the frontend dedupe.
- Defensive coercion: `totalCost` / `costPerBaseUnit` accept numeric strings and fall back to `0` on garbage; `reason` falls back to `'INITIAL'` if missing or unknown.

**Read-path migration:**
- `cost.service.getHistory(orgId, recipeId, windowDays)` queries `auditLog.query({aggregateType:'recipe', aggregateId:recipeId, eventTypes:['RECIPE_COST_REBUILT'], since, until, limit:200})` and `flatMap`s through the unpack helper.
- `cost.service.computeCostDelta(orgId, recipeId, from, to)` does the same query with `since=epoch, until=to`, then walks unpacked rows building two snapshots. Component-name resolution + delta math unchanged.
- `CostHistoryRowDto.fromEntity()` → `fromAuditUnpack()`. Wire shape preserved; only the synthetic `id` format changes (opaque to frontend, treated as keying string).

**Migration `0018_drop_recipe_cost_history.ts`:**
- `up()`:
  - `INSERT INTO audit_log` via `array_agg` + `jsonb_build_object` grouped by `(organization_id, recipe_id, computed_at)`. One audit row per `recordSnapshot()` invocation in history.
  - Fallback: when a group has no totals row (data corruption from a prior slice), `SUM(total_cost) FILTER (component_ref_id IS NOT NULL)` provides the audit row's `totalCost`.
  - `DROP INDEX` × 2 + `DROP TABLE recipe_cost_history`.
- `down()`:
  - `CREATE TABLE recipe_cost_history` with the exact 0011 schema.
  - Reverse-aggregate audit rows: each `RECIPE_COST_REBUILT` audit row → 1 totals legacy row + N component legacy rows (via `LATERAL jsonb_array_elements`).
  - `DELETE FROM audit_log WHERE event_type='RECIPE_COST_REBUILT'` so re-applying `up` doesn't double-insert.
- `hasTable` guard so the migration runs cleanly on fresh schemas where `recipe_cost_history` was never created.

**Module + dependency cleanup:**
- `cost.module.ts` imports `AuditLogModule`; removes `TypeOrmModule.forFeature([RecipeCostHistory])` + the `RecipeCostHistoryRepository` provider.
- `RecipeCostHistory` entity, repository, and entity spec **deleted** (3 files removed; 0 cost domain code left).
- Replaced with the `cost-change-reason.ts` standalone type file (carries `CostChangeReason` independent of the legacy entity).

**Consumers updated:**
- `recipes-cost.controller.ts` → `CostHistoryRowDto.fromAuditUnpack`.
- `menu-items.controller.ts` (`/menu-items/:id/cost-history`) → same.
- `cost.service.int.spec.ts` (Postgres) — fixture entity set drops `RecipeCostHistory`, adds `AuditLog`; provider list drops `RecipeCostHistoryRepository`, adds `AuditLogService`; TRUNCATE updated to drop `recipe_cost_history` and add `audit_log`.
- `menu-items.service.int.spec.ts` — same.
- `cost.service.spec.ts` + `cost.service.perf.spec.ts` — mock `AuditLogService` instead of `RecipeCostHistoryRepository`.

**Tests:**
- New: `cost-history-unpack.spec.ts` (8 tests) — rich payload, thin Wave 1.9 payload, missing/unknown reason fallback, numeric-string coercion, missing recipeIngredientId, empty components array, null payloadAfter.
- Adapted: 4 specs (cost.service + perf + cost.service.int + menu-items.service.int).
- Net: 612 → 643 apps/api tests green (+8 new unpack tests, −4 deleted entity spec tests, +27 from Wave 1.9 audit-log already counted in the prior baseline). Lint clean. Build clean.

## What surprised us

- **`recipe_cost_history` was deeper than I'd realised.** Two endpoints relied on it (`/cost-history` for Journey 2 default 14d window AND `/menu-items/:id/cost-history` for Owner dashboard's per-menu-item history). Plus an INT spec in `menus/`. Plus a `void history;` lint-silencer in `cost.service.int.spec.ts`. Took ~5 grep iterations to find every consumer; lesson: **before authoring a "drop table" slice, run `grep -rn <table-name> apps/` AND `grep -rn <EntityName>` AND `grep -rn <ColumnName>`** to surface all consumers, not just the obvious BC.
- **The `m2-audit-log-cleanup` no-op archive set this up.** When the original cleanup proposal was first written (in m2-audit-log retro §"Things to file as follow-ups"), I'd assumed all the per-BC audit columns were redundant. The Gate D investigation revealed **only `recipe_cost_history` had legitimate cleanup potential** (the others held current state). Without that no-op exercise, this slice would have been bundled into a larger, riskier "drop everything" PR.
- **Down-migration design forced clarification of "what does the data mean?"** Reverse-aggregating audit_log → recipe_cost_history is straightforward when each audit row has a clean components array. But a Wave 1.9 thin payload row reverse-aggregates to **just** a totals row (no components). The down-migration handles this gracefully (`COALESCE(...->'components', '[]')`), but the resulting `recipe_cost_history` would have gaps relative to pre-Wave-1.9 data. Documented as a known asymmetry; acceptable because down is for emergency rollback, not regular operations.
- **Synthetic `id` format change is a "client-visible" change** that's actually fine. The DTO's `id` field semantics shifted from "this row's UUID in recipe_cost_history" to "audit-log-row + segment marker". Frontend treats it as opaque key; no user-facing change. But IF a frontend somewhere parses the `id` for some reason (we checked — it doesn't), this would have broken. Lesson: **`id` field shape changes deserve a one-line callout in the proposal even when the wire format is "the same string field"**.
- **Audit_log's `MAX_LIMIT=200` is fine for cost-history default 14d window**. 14d × ~10 rebuilds/day = 140 rows comfortably below 200. Pathological hot recipes would hit the cap; filed as `m2-audit-log-cost-history-pagination` follow-up. The follow-up bullet is realistic, not speculative — once a recipe has a price-update cron firing every 30min, 14d × 48 = 672 rebuilds.

## Patterns reinforced or discovered

- **Drop the legacy in the SAME slice, not a follow-up.** Migrations 0011 (table create) and 0018 (table drop) bracket the lifetime of the legacy table cleanly. A "we'll clean up later" slice would have left the table around forever. Bias toward closing legacy in one transaction with the migration that obsoletes it.
- **Backward-compatible unpack helper.** `unpackHistoryRows()` handles both the new rich payload AND the legacy thin payload from Wave 1.9 backfill. This means the migration didn't have to "upgrade" the Wave 1.9 thin rows in place; they coexist with the new ones, the helper smooths over the difference. Read-path is forgiving; write-path is canonical.
- **Synthetic ids carrying composite identity.** When one storage row produces N wire rows, the wire `id` should encode the storage row + a discriminator (`<storage_id>:<segment>`). Stable across requests, dedupable client-side, opaque to consumers. Same pattern would work for any future "one audit row → N rendered rows" mapping (e.g. multi-allergen override audit).
- **`hasTable` guard on `up()` migrations.** Migration 0018 checks `await queryRunner.hasTable('recipe_cost_history')` before backfilling. This makes it safe on a fresh schema where 0011 + 0018 run in sequence on an empty DB — `recipe_cost_history` never exists, so the migration is a no-op. Filed in the m2-audit-log retro originally; reaffirmed here. Also valuable for **migrations that drop tables**: the guard prevents an error if the table was already dropped by a manual operator action.
- **Cost service no longer writes to its own audit table.** The audit goes through the bus. This breaks the assumption "cost.service owns its history storage" — and that's correct. The audit *event* is owned by the cost domain (it knows when a rebuild happened); the audit *storage* is owned by audit_log. Same separation of concerns lesson as Wave 1.9, applied one level deeper.
- **Backfill SQL exercise: `array_agg` + `jsonb_build_object` ORDER BY**. The `jsonb_agg(... ORDER BY rch.id)` ensures deterministic component ordering in the backfilled payload. Without `ORDER BY`, Postgres aggregates in undefined order and tests asserting on "first component" become flaky. Lesson reinforced for future audit-shaped backfills.

## Things to file as follow-ups

- **`m2-audit-log-cost-history-pagination`** — for hot recipes that exceed `AUDIT_LOG_MAX_LIMIT=200` rebuilds in window, add cursor-based pagination at the controller layer. Estimated trigger: a price-update cron firing every 30min on a popular ingredient.
- **`m2-audit-log-fts`** (Wave 1.11) — Postgres FTS over `payload_*` + `reason` + `snippet`. Already filed.
- **`m2-audit-log-export`** (Wave 1.12) — CSV export. Already filed.
- **`docs/operations/cost-history-migration.md`** — operator runbook for verifying migration 0018 succeeded in production: row count delta, sample queries on audit_log, grep for `RECIPE_COST_REBUILT` events. Useful for the deploy checklist.
- **Down-migration data-loss test** — INT test that runs `down` on a backfilled schema and verifies the legacy `recipe_cost_history` shape is recreated faithfully. Currently we trust the SQL by inspection; an INT test would catch regressions.

## Process notes

- Gate D forks were minimal (4 picks). Mid-implementation pivot was zero — the design held.
- Build broke 4 times in iteration as I found new consumer files (cost.service.spec, cost.service.perf.spec, menus.int.spec, menu-items.controller). Each fix was localised; the unit tests caught the breakage immediately. Lesson: **rely on the type checker as your discovery tool when refactoring across BCs**. `npm run build` after every related change surfaces consumers faster than grep alone.
- The slice closed the architectural debt that `m2-audit-log-cleanup` was filed to address — but in a more targeted way. The original cleanup proposal would have tried to drop the override jsonb columns too (which hold current state, not history); that mistake would have broken read-paths. The Gate D analysis behind `m2-audit-log-cleanup-noop` decision (committed as `5ca64c4`) prevented that bug.
- 643/643 tests green at completion (was 612 before m2-audit-log Wave 1.9). Lint clean. Build clean. CI auto-monitor running on push.
