# retros/m2-audit-log.md

> **Slice**: `m2-audit-log` · **PR**: [#90](https://github.com/Wizarck/nexandro/pull/90) · **Merged**: 2026-05-06 · **Squash SHA**: `1e420a6`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.9 — first post-M2 slice**. Canonical `audit_log` table extracts the cache+audit pattern that 5 prior M2 BCs re-implemented in their own per-BC tables/columns. `@OnEvent` subscriber decouples audit from business logic — services don't import `AuditLogService`; they emit events; the subscriber persists. Adding a new event type in M3+ is one constant + one `@OnEvent` handler.

## What we shipped

**Migration `0017_audit_log.ts`:**
- `audit_log` table with 14 columns: id, organization_id, event_type (text + length CHECK), aggregate_type + aggregate_id (polymorphic FK), actor_user_id (FK users), actor_kind (CHECK enum user/agent/system), agent_name, payload_before / payload_after jsonb, reason (≤2000 chars), citation_url, snippet (≤500 chars), created_at.
- 3 indexes covering the 3 expected access patterns: drill-down by aggregate, global filter by event type, partial user-history index (`WHERE actor_user_id IS NOT NULL`).
- Backfill in the same SQL transaction from 4 existing sources:
  - `ai_suggestions` accepted rows → `AI_SUGGESTION_ACCEPTED` events with citation + snippet preserved
  - `ai_suggestions` rejected rows → `AI_SUGGESTION_REJECTED` with reason mirrored
  - `recipe_cost_history` rows → `RECIPE_COST_REBUILT` with serialized history payload
  - `ingredients.overrides` jsonb (object form, per migration 0014) → `INGREDIENT_OVERRIDE_CHANGED`, one row per top-level field with `actor_user_id` recovered from `appliedBy` when available
  - `recipes.aggregated_allergens_override` jsonb → `RECIPE_ALLERGENS_OVERRIDE_CHANGED`
- `hasTable` / `hasColumn` guards on every backfill — works against fresh schemas where the source table doesn't exist yet.

**`apps/api/src/audit-log/` BC:**
- `domain/audit-log.entity.ts` — TypeORM entity, 14 columns matching the migration; constants: `AUDIT_SNIPPET_MAX = 500`, `AUDIT_REASON_MAX = 2000`.
- `application/types.ts` — `AuditEventEnvelope<TBefore, TAfter>` typed contract + `AuditEventType` channel constants matching existing bus names (e.g. `cost.ingredient-override-changed`) + `AuditEventTypeName` map translating channel → persisted `event_type` string (e.g. `INGREDIENT_OVERRIDE_CHANGED`). Two-name pattern: bus channel preserves module ownership; persisted event_type is the public, module-agnostic enum.
- `application/audit-log.service.ts` — `record(eventType, envelope)` persists; `query(filter)` applies filters + pagination. Defaults: 30-day window, 50 rows, max 200. Throws `AuditLogQueryError` for invalid range / limit / offset.
- `application/audit-log.subscriber.ts` — single class with 9 `@OnEvent` handlers. **Hybrid translation**: 3 NEW envelope-shaped events persist as-is (AI accept/reject + cost rebuilt); 6 LEGACY ad-hoc payloads (ingredients / allergens / recipes / supplier / agent-middleware) get translated per-type into the canonical envelope before persistence. Each handler wrapped in try/catch — DB failure logs + drops the row but does NOT propagate to the emitter.
- `interface/audit-log.controller.ts` + DTOs — `GET /audit-log` with required `organizationId` + optional filters (`aggregateType`, `aggregateId`, `eventType` comma-separated, `actorUserId`, `actorKind`, `since`, `until`, `limit`, `offset`). RBAC Owner+Manager. `AuditLogQueryError` translated to 422.

**3 NEW emit sites:**
- `ai-suggestions.service.acceptSuggestion()` — emits `AI_SUGGESTION_ACCEPTED` with envelope after the row save commits. Includes citation + snippet for audit trail.
- `ai-suggestions.service.rejectSuggestion()` — emits `AI_SUGGESTION_REJECTED` with `reason`.
- `cost.service.recordSnapshot()` — emits `RECIPE_COST_REBUILT` after `recipe_cost_history` rows save. Payload captures reason + totalCost + componentCount.

**Module wiring:**
- `audit-log.module.ts` registers entity + service + subscriber + controller.
- `app.module.ts` registers the new module alongside existing M2 modules.

**Tests (27 new across 3 files):**
- `audit-log.service.spec.ts` — record() persists envelope correctly + nullable fields preserved as null + agentName/actorKind handling. query() returns rows + total + clamped pagination, rejects invalid limit / negative offset / invalid date range, defaults to last-30d window. (10 tests)
- `audit-log.subscriber.spec.ts` — each of 6 legacy translators produces correct envelope; 3 new envelope-shape events persisted as-is; missing-required-fields skipped with warning; AGENT_ACTION_EXECUTED with null org skipped; record() failure swallowed without re-throwing; translator exception swallowed. (12 tests)
- `audit-log.controller.spec.ts` — happy path + filter passthrough + 422 translation for AuditLogQueryError + non-AuditLogQueryError rethrown unchanged + nullable DTO fields. (5 tests)
- Total apps/api suite: **639/639 passing** (was 612 prior to this slice). Lint clean. Build green.

## What surprised us

- **Existing event channel names use module-prefixed kebab-case** (`cost.ingredient-override-changed`, `agent.action-executed`). My initial constants assumed simple `INGREDIENT_OVERRIDE_CHANGED` — would have created **parallel channels** that nobody emits on. Fixed early when I read `cost/application/cost.events.ts`. Lesson reinforced: always inspect the existing emit sites + their constants file before assuming channel names.
- **Event payloads are NOT typed envelope shape** for the 6 legacy events — they're per-event ad-hoc objects (e.g. `IngredientOverrideChangedEvent { ingredientId, organizationId, field, appliedBy, reason }`). Spec said "5 BCs updated to publish typed AuditEventEnvelope". Mid-implementation I pivoted: instead of migrating 7 emit sites + several existing `@OnEvent` subscribers (cost.service / labels.service / dashboard.service that read the legacy field shapes), the **AuditLogSubscriber translates legacy payloads to envelope per-type**. Net result is the same audit row; blast radius is one new file (subscriber) instead of touching 7 + n services.
- **Two-name pattern (channel name vs persisted event_type)**: the bus channel `cost.ingredient-override-changed` is fine internally but leaks module ownership when persisted (it implies the cost module owns ingredient overrides, which is incorrect). Persisted event_type stays as the public, module-agnostic `INGREDIENT_OVERRIDE_CHANGED`. The `AuditEventTypeName` map is the bridge.
- **`recipes.aggregated_allergens_override`, NOT `recipes.allergens_overrides`**. My first migration had the wrong column name based on memory. Caught when I grepped the actual creator migration (`0012_recipe_allergens_extensions.ts`). Lesson: always read the migration creating a column before backfilling from it.
- **`recipe_cost_history.computed_at`, NOT `created_at`.** Same lesson — read the source migration (`0011_recipe_cost_history.ts`) before assuming column names.
- **Windows + Node 24 + Jest** workers crash with `spawn UNKNOWN`. Fixed by running `--runInBand`. Already documented in earlier slices' retros; reaffirmed.

## Patterns reinforced or discovered

- **Subscriber decouples audit from business logic.** Services emit events; subscriber persists. Adding a new event in M3+ HACCP / inventory / batches is a 1-line `@OnEvent` + a constants entry. No table change. No service change. The audit table grows linearly with event types but stays orthogonal to them.
- **`try/catch` in subscriber handlers swallows errors without propagating to emitter.** Fire-and-forget bus semantics: services finish their writes regardless of audit success. Worst case: one missing audit row, logged for ops visibility.
- **Hybrid translation pattern (legacy + envelope) keeps blast radius small.** When the proposal's "migrate all emitters" turns out to require touching N+ services, **translate at the subscriber instead**. Same audit outcome, far less code churn. Document the deviation in retro so the architecture intent stays clear ("envelope is canonical for new events; legacy events get translated").
- **Two-name pattern for module-prefixed channels.** Bus channel name preserves module ownership for routing (`cost.x`, `agent.y`); persisted name is the public, module-agnostic enum. Keep both, document the bridge.
- **Polymorphic FK with no real FK constraint.** `audit_log.aggregate_id` references entities across multiple tables (recipes, ingredients, ai_suggestions, supplier_items, organizations). No real FK because it spans tables. App-level guarantee: emitter only fires AFTER the entity exists. Documented in design.md ADR-AUDIT-SCHEMA.
- **Open-enum text columns over Postgres enums.** `event_type text NOT NULL CHECK (length 1..100)` instead of an enum. M3+ adds 5+ event types; each enum extension is a migration; each text addition is zero-migration. Trade-off: typo-resistance is app-side only (constants file), not DB-enforced.
- **Single migration with backfill in same transaction.** New table + 4 backfill INSERTs + 3 indexes all atomic. Operators don't see a moment where the table exists but is empty. Down migration drops the table (destructive — explicitly intended for rollback).
- **`hasTable` / `hasColumn` guards on backfill SELECTs.** Lets the migration run cleanly on fresh schemas where the source tables/columns don't exist yet (e.g. a new dev environment). No more "ERROR: relation does not exist" on first deploy.

## Things to file as follow-ups

- **`m2-audit-log-cleanup`** — drop redundant per-BC audit columns + tables now that audit_log is the canonical source: `recipe_cost_history` table, `ingredients.overrides` jsonb (or document as "current value, not history"), `recipes.aggregated_allergens_override` jsonb. Coordinate with consumers — labels.service / dashboard.service / cost.service may still read these as cache; cleanup must not break read paths.
- **`m2-audit-log-export`** — `GET /audit-log/export.csv` for offline analysis. Stream-based, paginated under the hood, RBAC Owner+Manager.
- **`m2-audit-log-fts`** — Postgres full-text-search index on `payload_before` + `payload_after` + `reason` + `snippet`. Lets the chef ask "show me everywhere we changed beef-chuck yields". Needs `tsvector` migration + GIN index.
- **`m2-audit-log-retention`** — partitioning by month + cold-storage move after N years. Worth doing when storage growth justifies (estimated >50 GB/year per heavy org).
- **`m2-audit-log-emitter-migration`** — migrate the 6 legacy emitters to the typed envelope shape, removing the per-type translation logic from the subscriber. Currently the subscriber has 6 translators; future-proof would be having NO translators (subscriber persists envelope as-is for every event). Trade-off: 6 service-level changes + n existing `@OnEvent` subscriber updates that read legacy field names.
- **`m2-audit-log-supplier-recipe-line-events`** — `SUPPLIER_PRICE_UPDATED` and `RECIPE_INGREDIENT_UPDATED` had no historical persistence so backfill couldn't reconstruct them. Going forward they're captured by the subscriber. Document the "data gap" in operator runbook.
- **`m2-audit-log-dlq`** — dead-letter queue for failed audit writes. Current behaviour is "log + drop"; if the emit volume justifies it, persist failed events to a retry table.
- **`audit_log` partition by month** — once volume crosses ~10M rows/org, partition by `created_at` month for query + archival ergonomics.

## Process notes

- Picks 1/2d/3a/4c/5 (suggested) approved upfront in chat. Design mock HTML built mid-session for visual review (Master approved). Implementation followed without re-architecting.
- Worktrees ran in parallel: `m2-wrap-up` PR #89 closed first, then `m2-audit-log` PR #90 implementation continued in same session.
- Hybrid translation pivot was a real-time scope reduction during implementation, NOT a re-design — same canonical envelope contract, just decided to defer migrating legacy emitters to a follow-up. Documented openly here so the architectural intent stays clear.
- Backfill correctness for `recipes.aggregated_allergens_override` and `ingredients.overrides` was validated only by SQL inspection; no INT spec was added because the schema seed data path doesn't currently populate either column. INT specs filed as a future improvement when there's a fixture for it.
- Apps/api suite: 612 → 639 tests (+27). Lint clean across workspaces. Build green. CI auto-monitor running on push.
