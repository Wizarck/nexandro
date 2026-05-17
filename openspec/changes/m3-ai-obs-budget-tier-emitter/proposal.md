## Why

Slice #16 (`m3-vision-llm-provider-di-otel`, Wave 2.1) shipped the AI-observability BC scaffold: `OtelService`, the `gen_ai.*` semantic-conventions surface, the `nexandro.tag` enricher, and empty placeholder directories at `apps/api/src/ai-observability/{rollup,dashboard,budget}/` so downstream slices (#19 + #20) can land without rebase friction. Slice #18 (`m3-photo-storage-lifecycle`) is in flight on a sibling worktree; slice #20 (`m3-ai-obs-ui`) lands the operator dashboard after this slice publishes its read surface.

This slice closes the **emit side** of NFR-OBS-10 (per-organization monthly AI budget with 4-tier alerts) and ADR-030 sub-decisions "Budget tier system" + "Rollup table" + "Dashboard caching" (eligia-dashboard cross-pollination). Concretely:

1. **`ai_usage_rollup` table** — append/upsert ledger that aggregates `gen_ai.usage.*` span attributes into per-`(organization_id, period_yyyy_mm)` rows on a 5-minute cron. Replaces the slice-#16 placeholder under `rollup/`. Per ADR-030 the rollup is NOT a materialized view; it is a plain table written by `INSERT … ON CONFLICT (organization_id, period_yyyy_mm) DO UPDATE` so the Postgres outage path (covered by LRU cache fallback) stays purely a read-side concern.
2. **4-tier budget alert system** — `info` (50% spent), `warn` (75%), `error` (90%), `fatal` (100%+). Each tier crosses ONCE per `(organization_id, period_yyyy_mm, tier)` until the next month boundary resets the tier set. Tier names + thresholds match the architecture ADR-030 "Budget tier system" sub-decision verbatim (the M3 architecture is the source of truth; the slice brief's alternate names `info/warning/critical/exceeded` are aliased here).
3. **`AI_BUDGET_TIER_CROSSED` event** — emitted on bus channel `ai-observability.budget-tier-crossed` with payload `(organizationId, period, tier, totalSpend, budgetLimit, projectedEom, crossedAt)`. Persisted to `audit_log` via a single `@OnEvent` handler appended to `AuditLogSubscriber` (slice #21 just merged its 14-handler fan-out; we extend with one more).
4. **`BurnRateCalculator`** — pure function projects month-end spend from `(currentSpend, daysIntoMonth, daysInMonth)`. When the projection exceeds `budgetLimit × 1.2`, emit an early-warning entry (same channel, payload tier `forecast`). Surfaces in slice #20 widget #8 (`BudgetStatusWidget` "days until empty").
5. **LRU cache fallback** — if the rollup `INSERT … ON CONFLICT` fails (Postgres outage, lock contention, timeout), the budget evaluator reads from a process-local LRU (1 K orgs × 1 h TTL) of the last successful aggregate. Pattern cross-pollinated from `eligia-core/dashboard/` per the memory-encoded `reference_eligia_dashboard_ai_obs` pattern. NOT a multi-instance cache — single-process LRU is sufficient for the AGPL community-edition target; Enterprise multi-instance is a follow-up (`m3-ai-budget-redis-cache`).
6. **`organizations.ai_monthly_budget_eur` column** — `DECIMAL(12,2) NULLABLE` (NULL = unlimited). Per ADR-030 the canonical currency is EUR (matches the `currency_code` org column + the M2 money convention). The slice brief named the column `total_cost_usd`; we use `total_cost_eur` to stay consistent with the architecture artifact + existing money-storage rules. This divergence from the brief is captured in design.md §ADR-CURRENCY-EUR.

This slice consumes pre-reserved migration slot **0032** (next free after slice #7's `0031_create_goods_receipts_tables.ts`; verified `apps/api/src/migrations/` has no 0032 file). The slice brief listed slot 0033 but slot 0032 is actually next — both 0024 (slice #21 retention_class) and 0031 (slice #7 GR) are the most recent landed slots, and no parallel slice currently claims 0032.

## What Changes

- **`apps/api/src/migrations/0032_create_ai_usage_rollup.ts`** — new migration:
  - Creates `ai_usage_rollup` table: `(organization_id uuid NOT NULL, period_yyyy_mm text NOT NULL CHECK (period_yyyy_mm ~ '^\d{4}-\d{2}$'), total_cost_eur numeric(15,4) NOT NULL DEFAULT 0, total_calls integer NOT NULL DEFAULT 0, total_input_tokens bigint NOT NULL DEFAULT 0, total_output_tokens bigint NOT NULL DEFAULT 0, last_aggregated_at timestamptz NOT NULL DEFAULT now(), tier_crossed_at jsonb NOT NULL DEFAULT '{}'::jsonb, PRIMARY KEY (organization_id, period_yyyy_mm))`.
  - Adds `organizations.ai_monthly_budget_eur numeric(12,2) NULL` (NULL = unlimited budget — calls succeed, tier evaluation short-circuits).
  - Adds index `ix_ai_usage_rollup_period_last_agg` on `(period_yyyy_mm, last_aggregated_at DESC)` for the scheduler's "list orgs due for aggregation" query.
  - Down migration drops the index, drops the table, drops the org column.
- **`apps/api/src/ai-observability/budget/domain/ai-usage-rollup.entity.ts`** — TypeORM entity for the new table; `numericTransformer` hoisted above `@Entity` (Wave 2.1 typing-cascade lesson). `@CreateDateColumn` NOT used (the column is `last_aggregated_at` with explicit upsert semantics, not a created_at).
- **`apps/api/src/ai-observability/budget/domain/budget-tier.ts`** — pure tier-crossing logic + tier name constants `{ INFO: 'info', WARN: 'warn', ERROR: 'error', FATAL: 'fatal' }` + threshold map `{ info: 0.50, warn: 0.75, error: 0.90, fatal: 1.00 }`.
- **`apps/api/src/ai-observability/budget/domain/burn-rate.ts`** — pure `projectMonthEndSpend({ currentSpend, daysIntoMonth, daysInMonth })` + `daysUntilEmpty({ remainingBudget, avgDailySpend })`.
- **`apps/api/src/ai-observability/budget/domain/errors.ts`** — typed errors: `AiUsageRollupQueryError`, `BudgetEvaluationError`, `LruCacheUnavailableError`.
- **`apps/api/src/ai-observability/budget/domain/events.ts`** — INLINE event shape `AiBudgetTierCrossedPayload` + channel constant `AI_BUDGET_TIER_CROSSED_CHANNEL = 'ai-observability.budget-tier-crossed'`. No `@nexandro/contracts` import (Wave 2.1+2.2+2.3 lesson).
- **`apps/api/src/ai-observability/budget/application/ai-usage-rollup.repository.ts`** — TypeORM repository wrapper; `upsertAggregate(orgId, period, agg)` uses `INSERT … ON CONFLICT … DO UPDATE`; `findByPeriod(orgId, period)` reads. Multi-tenant gate: every public method takes `organizationId` as the first arg.
- **`apps/api/src/ai-observability/budget/application/lru-rollup-cache.ts`** — Injectable wrapping `lru-cache` (capacity 1024, TTL 1 h). Methods: `get(key)`, `set(key, value)`, `verifyEligible(key)` (the check-and-insert pattern from #136 — verifies the still-present key BEFORE the missing-key path, dodging LRU eviction races).
- **`apps/api/src/ai-observability/budget/application/budget-tier.service.ts`** — pure tier-crossing evaluator: `evaluate({ currentSpend, budgetLimit, alreadyCrossed }): TierTransition[]`. Returns the list of newly-crossed tiers (zero, one, or many — bulk-cross when a single tick jumps multiple thresholds, e.g. 40% → 95%).
- **`apps/api/src/ai-observability/budget/application/burn-rate.calculator.ts`** — thin service wrapping `domain/burn-rate.ts`; injected into RollupScheduler so projection alerts share the same emission path.
- **`apps/api/src/ai-observability/budget/application/rollup-scheduler.service.ts`** — `@Cron('*/5 * * * *')` (`@nestjs/schedule`); aggregates spans from the OTel exporter sink into the `ai_usage_rollup` row for the current month, evaluates tier crossings, emits `AI_BUDGET_TIER_CROSSED` per newly-crossed tier. Env flag `NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED` (default off in dev, on in prod).
- **`apps/api/src/ai-observability/budget/budget.module.ts`** — wires the above + injects `OrganizationsRepository` (read-only) for the budget-limit lookup.
- **`apps/api/src/ai-observability/ai-observability.module.ts`** — extended to import `BudgetModule` + re-export it so consumers (slice #20 dashboard) can read rollup rows.
- **`apps/api/src/audit-log/application/types.ts`** — extend `AuditEventType` const with `AI_BUDGET_TIER_CROSSED: 'ai-observability.budget-tier-crossed'`. Mirror in `AuditEventTypeName`. Add to retention map: `'AI_BUDGET_TIER_CROSSED': 'operational'` (default).
- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — append ONE new `@OnEvent` handler (`onAiBudgetTierCrossed`) that calls `persistEnvelope()`. Slice #18 also extends this file with PHOTO_UPLOADED + PHOTO_DELETED handlers; merge-time conflict is resolved by concatenation.
- **`apps/api/src/iam/domain/organization.entity.ts`** — extend with `aiMonthlyBudgetEur: number | null` column mapping (`numericTransformer` for the nullable case).
- **BREAKING**: none. New column nullable. New events fire only when the scheduler is enabled. Existing `audit_log` write path is unchanged (only one new event type added).

## Capabilities

### New Capabilities

- `ai-obs-budget-tier`: 4-tier budget alert system (`info`/`warn`/`error`/`fatal` at 50/75/90/100% of monthly budget); one cross per `(organization_id, period_yyyy_mm, tier)` until month boundary reset; `AI_BUDGET_TIER_CROSSED` event with envelope payload; `audit_log` persistence via the existing subscriber. Per-tenant `ai_monthly_budget_eur` column on `organizations` (NULL = unlimited; tier evaluation short-circuits). Burn-rate projection emits forecast alerts when projected EoM exceeds `budgetLimit × 1.2`.
- `ai-obs-rollup`: `ai_usage_rollup` per-`(organization, period)` aggregate row, upserted on a 5-minute cron. LRU fallback (1 K orgs × 1 h TTL) serves stale data when Postgres is unavailable so tier evaluation continues during transient outages.

### Modified Capabilities

- `m2-audit-log`: extends with one new `@OnEvent` handler for `AI_BUDGET_TIER_CROSSED`. Retention class defaults to `'operational'`.
- `iam-organization`: extends `Organization` entity + DB schema with `ai_monthly_budget_eur` nullable column. No DTO/controller changes (Owner config UI lands in slice #20).

## Impact

- **Prerequisites**: Slice #16 (`m3-vision-llm-provider-di-otel`) merged — the `OtelService` + `pricing.ts` shape are consumed at read time by the dashboard (slice #20), but the rollup scheduler in THIS slice reads from the OTel exporter sink directly. Slice #21 (`m3-audit-log-hash-chain-hardening`) merged — `AuditLogSubscriber` has the fan-out scaffold we extend with one new handler. Slice #22 (`m3-email-dispatch-di`) merged — the `EMAIL_DISPATCH_SERVICE` token exists; **NOT** consumed in this slice (email side of NFR-OBS-10 deferred — the audit row IS the alert surface for this slice; email notification is folded into slice #20's Owner UI follow-up so the Owner explicitly opts into email cadence).
- **Code**:
  - `apps/api/src/migrations/0032_create_ai_usage_rollup.ts` — new migration (~100 LOC).
  - `apps/api/src/ai-observability/budget/` — ~9 files, ~600 LOC application + ~250 LOC tests.
  - `apps/api/src/audit-log/application/types.ts` — +5 LOC.
  - `apps/api/src/audit-log/application/audit-log.subscriber.ts` — +5 LOC (one new `@OnEvent`).
  - `apps/api/src/iam/domain/organization.entity.ts` — +5 LOC.
  - `apps/api/src/app.module.ts` — no change (`AiObservabilityModule` is already wired; the new `BudgetModule` is imported by it).
- **Performance**:
  - Scheduler runs every 5 min; per-tick cost ≈ N orgs × 1 INSERT ON CONFLICT per org. At 30 orgs (M3 scale) this is ~30 statements every 5 min — negligible WAL footprint.
  - Tier evaluation is O(4) per org (4 thresholds checked). Bulk-cross (40% → 95%) emits up to 4 events in one tick — acceptable.
  - LRU cache hit on outage is O(1).
  - Burn-rate calc is pure arithmetic — constant time.
- **Storage**:
  - `ai_usage_rollup` row width ~96 bytes; 30 orgs × 12 months = 360 rows/year. Negligible.
  - `organizations.ai_monthly_budget_eur` — 16 bytes/org. Negligible.
- **Audit**: every tier crossing persists one `audit_log` row with `retention_class='operational'` (7-year hot retention per ADR-AUDIT-RETENTION-CLASS).
- **Rollback**:
  - Migration down drops the table + index + column. Loses tier-crossing history but doesn't break readers (no upstream foreign keys into `ai_usage_rollup`).
  - Subscriber rollback: removing the `onAiBudgetTierCrossed` handler is non-breaking — the events keep firing and become no-ops at the audit-log side.
- **Out of scope** (claimed by other slices, do NOT pre-empt):
  - 6-widget AI obs dashboard UI (slice #20 `m3-ai-obs-ui`) — this slice publishes the rollup read surface; the chart layer + per-tag/per-model breakdown live in #20.
  - Email cadence for tier alerts (deferred follow-up; the audit row IS the canonical alert record).
  - Hard enforcement at `fatal` tier (`NEXANDRO_AI_BUDGET_HARD_BLOCK_ENABLED` flag) — soft enforcement only per ADR-030 "Budget tier system" sub-decision (matches eligia "report-not-enforce" pattern).
  - Per-organization tier-threshold customisation (50/75/90/100 are hard-coded MVP).
  - Redis-backed LRU swap (Enterprise multi-instance) — follow-up `m3-ai-budget-redis-cache`.
  - Owner UI for setting `ai_monthly_budget_eur` — slice #20.
- **Parallelism**: file-path scope = `apps/api/src/migrations/0032_*` + `apps/api/src/ai-observability/budget/**` + `apps/api/src/iam/domain/organization.entity.ts` + `apps/api/src/audit-log/application/{types.ts, audit-log.subscriber.ts}`. Slice #18 (`apps/api/src/photo-storage/**`) and slice #20 (`apps/web/src/m3/ai-obs/**`) are disjoint EXCEPT for `audit-log.subscriber.ts` where slice #18 also adds 2 handlers; merge resolves by concatenation. Slice #20 reads from `apps/api/src/ai-observability/**` but does NOT mutate.
- **Effort estimate**: L (~600 LOC application + ~100 LOC migration + ~250 LOC tests; matches gate-c slice list "L" sizing).
