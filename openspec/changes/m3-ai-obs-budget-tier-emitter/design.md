## Context

The AI Observability bounded context (`apps/api/src/ai-observability/`) was scaffolded by slice #16 (`m3-vision-llm-provider-di-otel`, Wave 2.1) with three placeholder directories — `rollup/`, `dashboard/`, `budget/` — reserved for slices #19 + #20. This slice (#19) lands the `budget/` BC and the `ai_usage_rollup` table, closing the emit-side of NFR-OBS-10 (per-organization monthly AI budget with 4-tier alerts).

The architecture artifact `_bmad-output/planning-artifacts/architecture-m3.md` §ADR-030 sub-decision "Budget tier system" is the authoritative spec for this slice. It pins:

- 4 tiers: `info` / `warn` / `error` / `fatal` at 50 / 75 / 90 / 100 % of monthly budget.
- Per-organization `ai_monthly_budget_eur DECIMAL(12,2) NULLABLE` (NULL = unlimited).
- Rollup is a plain table (NOT a materialized view) with `INSERT … ON CONFLICT DO UPDATE` upsert semantics.
- Soft enforcement: `fatal` emits but does NOT block calls (matches the eligia "report-not-enforce" pattern; Owner decides the cutoff, not the system).
- Trailing-7-day burn-rate avg drives the "days until empty" projection.
- LRU cache pattern cross-pollinated from `eligia-core/dashboard/` (memory: `reference_eligia_dashboard_ai_obs`).

The slice brief offered an alternate tier-name set (`info / warning / critical / exceeded`) and a USD-denominated column. This design ADR-CURRENCY-EUR + ADR-BUDGET-TIER-LEVELS captures the divergence: the architecture artifact is the source of truth (EUR + `info/warn/error/fatal`); the brief's alternates are NOT adopted.

The slice consumes pre-reserved migration slot **0032** (slice #7 GR landed `0031_create_goods_receipts_tables.ts`; slice #21 audit-log hash chain landed `0023` + `0024`; slot 0032 is free).

## Goals / Non-Goals

**Goals:**

- 4-tier budget alert system with one-cross-per-(org, period, tier) idempotency until month boundary.
- `ai_usage_rollup` table aggregating per-`(organization, period_yyyy_mm)` AI spend, upserted on a 5-minute cron.
- `AI_BUDGET_TIER_CROSSED` event emitted on bus channel `ai-observability.budget-tier-crossed`; persisted to `audit_log` via the existing single-subscriber pattern (one new `@OnEvent` handler on `AuditLogSubscriber`).
- `BurnRateCalculator` — pure functions for month-end projection + days-until-empty estimation; emits an early-warning entry when projection > `budgetLimit × 1.2`.
- LRU cache fallback (1 K orgs × 1 h TTL) when the rollup `INSERT ON CONFLICT` fails; tier evaluation continues against the last-known aggregate so transient Postgres outages don't suppress alerts.
- Multi-tenant safety: every public repository / service method accepts `organizationId` first; no implicit org context.
- Unit tests cover: tier-crossing boundaries (49.9% → 50% trips `info`; 99.9% → 100% trips `fatal`; bulk-cross 40% → 95% emits info+warn+error in one tick), burn-rate math, LRU cache cap + TTL + check-and-insert dedup, no-double-emit per `(org, period, tier)`, multi-tenant gate on the repo.

**Non-Goals:**

- 6-widget AI obs dashboard UI — slice #20 (`m3-ai-obs-ui`).
- Email notifications for tier crossings — deferred follow-up (the audit row IS the canonical alert).
- Hard call-blocking at `fatal` tier — soft enforcement only per ADR-030.
- Per-organization tier-threshold customisation — 50/75/90/100 are hard-coded MVP.
- Redis-backed multi-instance LRU — `m3-ai-budget-redis-cache` follow-up.
- Owner UI for setting `ai_monthly_budget_eur` — slice #20.
- Per-capability or per-tag budgets — out of scope; budget is org-monthly only.
- Backfilling historical rollup rows — the table starts populated by the next scheduler tick.

## Decisions

### ADR-BUDGET-TIER-LEVELS — 4 tiers (info / warn / error / fatal) at 50 / 75 / 90 / 100 %

Tier names + thresholds match `_bmad-output/planning-artifacts/architecture-m3.md` §ADR-030 "Budget tier system" sub-decision verbatim. The slice brief's alternate set (`info / warning / critical / exceeded`) is NOT adopted because (a) the architecture artifact is the canonical source of truth at Gate D, (b) renaming would create a brief-vs-artifact drift that future readers would have to reconcile, (c) the existing `eligia-core/dashboard/` cross-pollination uses `info/warn/error/fatal`.

Each tier crosses ONCE per `(organization_id, period_yyyy_mm, tier)`. The crossing timestamp is persisted on the rollup row's `tier_crossed_at jsonb` column as `{ "info": "<iso>", "warn": "<iso>", … }`. Crossings reset at month boundary UTC when the next-month rollup row is created.

**Why one-cross-per-period?** Without dedup the scheduler would emit at every tick that finds `currentSpend ≥ threshold`. At a 5-minute cadence with a hot operator, the bus would carry hundreds of redundant events; operators would tune the alert out.

**Why store crossings on the rollup row?** Single source of truth, atomic with the upsert. A separate `tier_crossed` table would need its own transaction + idempotency guard; the jsonb column on the rollup row gets both for free.

**Rejected alternative**: emit-once-per-deployment (no period reset). Rejected because the start of a new month is the natural reset signal; otherwise an org that crossed `fatal` in January would never get re-alerted in February.

### ADR-PERIOD-WINDOW — monthly budget, UTC month boundary, `period_yyyy_mm` text key

Period is identified by `text` of shape `YYYY-MM` (e.g. `'2026-05'`), computed from the row's `created_at` in UTC. Hard-coded to month windows — not week / quarter / sliding-30-day.

**Why UTC?** Matches the M2 audit_log + cost-snapshot + GR aggregate timestamps (all `timestamptz`). Multi-locale operator surfaces convert at the DTO layer.

**Why text instead of `int` (e.g. `202605`)?** Self-documenting in DB inspections; trivially regex-checkable (`CHECK (period_yyyy_mm ~ '^\d{4}-\d{2}$')`); maintains lexicographic chronological ordering.

**Why month, not week?** Budget is set by the Owner monthly (per ADR-030); aligning the rollup window to the budget window simplifies "remaining budget" arithmetic. Weekly burn-rate is the trailing 7-day moving average, computed at evaluation time from daily span aggregates — NOT stored as a separate weekly rollup.

**Rejected alternative**: `period_start_at timestamptz` + `period_end_at timestamptz`. Rejected because the window is always a calendar month — encoding it as two timestamps invites off-by-one bugs at the boundary.

### ADR-AGGREGATE-INTERVAL — 5-minute cron tick via `@Cron('*/5 * * * *')`

The rollup scheduler runs every 5 minutes via `@nestjs/schedule`. Per tick the scheduler:

1. Enumerates organizations with at least one OTel span in the current period (NOT all organizations — only the active ones).
2. For each org, computes the period aggregate (`sum(total_cost_eur)`, `count(*)`, `sum(input_tokens)`, `sum(output_tokens)`) from the OTel exporter sink for the current month.
3. Upserts the `ai_usage_rollup` row via `INSERT … ON CONFLICT (organization_id, period_yyyy_mm) DO UPDATE`.
4. Loads `organizations.ai_monthly_budget_eur` (if NULL → skip tier evaluation).
5. Evaluates `BudgetTierService.evaluate({ currentSpend, budgetLimit, alreadyCrossed })`.
6. Emits one `AI_BUDGET_TIER_CROSSED` event per newly-crossed tier.
7. Computes burn-rate projection; if projection > `budgetLimit × 1.2`, emits a forecast event (tier `forecast`).

**Why 5 minutes?** Matches the slice #3 `ExpiryScannerService` cadence — proven operational baseline. Hot operators see tier crossings within 5 minutes of the spend that tripped them; the architecture's 1-hour cadence (hourly cron per ADR-030 sub-decision "Rollup table") is the upper bound, not the lower. We tighten to 5 minutes because tier crossings are operationally hotter than the per-widget dashboard read (which is the 1-hour-cadence concern).

**Why a single global tick instead of per-org cron?** N orgs × per-org cron = N parallel Postgres workers; the global tick keeps cardinality bounded at 1.

**Rejected alternative**: hourly cron per ADR-030 sub-decision. Defensibly OK at small-org-count scale but trades alerting latency for slightly lower DB load. We prefer the tighter cadence; revisit if cron cost becomes an issue.

### ADR-LRU-CACHE-FALLBACK — process-local LRU (1 K orgs × 1 h TTL), check-and-insert dedup pattern

If the rollup `INSERT … ON CONFLICT` query fails (Postgres outage, lock timeout, network), the scheduler:

1. Falls back to the LRU's last successful aggregate for the same `(orgId, period)` key.
2. Evaluates tier crossings against the cached aggregate.
3. Logs a structured warn line `ai-budget.rollup.fallback orgId=<id> period=<yyyy-mm> reason=<message>` so operators see the degraded path.
4. On the next successful tick, the LRU is refreshed.

The LRU caches **the last successful aggregate**, NOT the budget evaluation result. Tier evaluation runs against fresh data when available, against the cached aggregate on outage.

**Pattern: check-and-insert dedup (from issue #136 Wave 2.3 lesson)**

The LRU's `verifyEligible(key)` method runs the **check on the still-present key BEFORE** the missing-key path:

```ts
verifyEligible(key: string): boolean {
  const existing = this.cache.get(key); // still present? (not evicted by recency / TTL)
  if (existing !== undefined) {
    return false; // already seen — skip
  }
  this.cache.set(key, true); // mark as seen
  return true;
}
```

Why? An earlier draft hit the missing-key path first, then later evictions caused the value to disappear from cache between checks, leading to spurious double-emission. The corrected order (verify-still-present first) eliminates the race per Wave 2.3 #136 lesson.

**Why 1 K orgs?** Far above M3 scale (~30 orgs). Headroom for AGPL community-edition load.

**Why 1 h TTL?** Matches the slice #21 idempotency cache TTL — operational consistency. Long enough to ride out a 30-min outage; short enough to evict stale aggregates that no longer reflect current spend.

**Rejected alternative**: Redis cache for multi-instance Enterprise. Out of scope for this slice (the AGPL community edition is single-instance); follow-up slice `m3-ai-budget-redis-cache` adds the swap-in.

### ADR-AI-USAGE-ROLLUP-TABLE — `ai_usage_rollup(organization_id, period_yyyy_mm, total_cost_eur, total_calls, total_input_tokens, total_output_tokens, last_aggregated_at, tier_crossed_at jsonb)`

Schema:

```sql
CREATE TABLE ai_usage_rollup (
  organization_id  uuid    NOT NULL,
  period_yyyy_mm   text    NOT NULL CHECK (period_yyyy_mm ~ '^\d{4}-\d{2}$'),
  total_cost_eur   numeric(15,4) NOT NULL DEFAULT 0,
  total_calls      integer NOT NULL DEFAULT 0,
  total_input_tokens  bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  last_aggregated_at  timestamptz NOT NULL DEFAULT now(),
  tier_crossed_at  jsonb   NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, period_yyyy_mm),
  CONSTRAINT fk_ai_usage_rollup_org
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX ix_ai_usage_rollup_period_last_agg
  ON ai_usage_rollup (period_yyyy_mm, last_aggregated_at DESC);
```

**Why `numeric(15,4)` for `total_cost_eur`?** Matches the M2 money-storage convention (`DECIMAL(15,4)` internal, 2-decimal UI display). AI per-token pricing is `DECIMAL(10,8)` in `ai_pricing` (slice #20 owns the seed), but the *aggregated* spend on the rollup row is regular money precision.

**Why `bigint` for tokens?** A single GPT-4o call can emit 100K+ output tokens; a busy org can rack up 10⁹+ tokens per month. `integer` (max ~2.1 B) is too small at the multi-year horizon.

**Why composite PK `(organization_id, period_yyyy_mm)`?** Natural key — there is exactly one row per (org, month). Avoids a separate `id uuid` + unique index. The PK is the upsert conflict target.

**Why `tier_crossed_at jsonb`?** See ADR-NO-EMIT-DUPLICATE. Stored on the rollup row so the upsert and the tier-crossing check are atomic.

**`numericTransformer` hoist (Wave 2.1 lesson)**: TypeORM returns `numeric` columns as strings (Postgres protocol). The transformer is hoisted above `@Entity` so the decorator factory captures the function reference at class-eval time, avoiding the TS6059 / CJS hoist trap from Wave 2.1.

**Rejected alternative**: materialized view over the OTel span sink. Refresh latency + lock contention on `REFRESH MATERIALIZED VIEW CONCURRENTLY` makes this slower at write time than `INSERT ON CONFLICT`, with no read-side win at our row count.

### ADR-BURN-RATE-CALCULATOR — pure functions in `domain/burn-rate.ts`

Two pure functions:

```ts
projectMonthEndSpend({ currentSpend, daysIntoMonth, daysInMonth }: ProjectInput): number {
  if (daysIntoMonth <= 0) return 0;
  return (currentSpend / daysIntoMonth) * daysInMonth;
}

daysUntilEmpty({ remainingBudget, avgDailySpend }: EmptyInput): number | null {
  if (remainingBudget <= 0) return 0;
  if (avgDailySpend <= 0) return null; // unlimited runway
  return Math.floor(remainingBudget / avgDailySpend);
}
```

Both pure — no DB, no DI, no clock. Callers pass `daysIntoMonth` + `daysInMonth` derived from `new Date()`. Testability + reuse across the scheduler (forecast emission) and slice #20 (`BudgetStatusWidget` display) is the design constraint.

**Forecast emission rule**: when `projectMonthEndSpend > budgetLimit × 1.2` AND the same forecast hasn't been emitted this month, the scheduler emits one extra event with payload tier `forecast` and a `projectedEom` field. Threshold `× 1.2` is a 20% over-budget projection — operationally a real signal, not noise.

**Why `avgDailySpend = trailing-7-day average`?** Per ADR-030 sub-decision "Budget tier system". The trailing window smooths weekend dips + holiday spikes that would otherwise produce false-positive forecasts. The 7-day window is computed by the scheduler from the daily breakdown of OTel span aggregates; the `BurnRateCalculator` receives the pre-computed `avgDailySpend` as a number.

**Rejected alternative**: exponentially-weighted moving average. Defensibly better at adapting to step changes, but trailing-window is the architecture-pinned choice and is easier to reason about.

### ADR-BUDGET-TIER-CROSSED-EVENT — inline payload shape, channel `ai-observability.budget-tier-crossed`

The event ships on bus channel `ai-observability.budget-tier-crossed` (matches the namespace pattern from M2/M3 events). Payload is declared INLINE in `apps/api/src/ai-observability/budget/domain/events.ts` — NO `@nexandro/contracts` import (Wave 2.1+2.2+2.3 hard-constraint lesson).

```ts
export interface AiBudgetTierCrossedPayload {
  organizationId: string;
  aggregateType: 'ai_usage_rollup';
  aggregateId: string; // composite "<orgId>:<period>"
  actorUserId: null;
  actorKind: 'system';
  payloadAfter: {
    period: string; // 'YYYY-MM'
    tier: 'info' | 'warn' | 'error' | 'fatal' | 'forecast';
    totalSpendEur: number;
    budgetLimitEur: number;
    projectedEomEur: number | null;
    crossedAt: string; // ISO-8601 UTC
  };
}
```

The shape is envelope-compatible with `AuditEventEnvelope` so `AuditLogSubscriber.persistEnvelope()` consumes it as-is — no `persistTranslated` translator needed.

**Why `aggregate_type = 'ai_usage_rollup'`?** The aggregate that crossed the tier is the rollup row; the `audit_log` foreign-aggregate convention (slice #21 ADR-EVENT-ENVELOPE-SHAPE) ties the audit row to the entity that mutated. The rollup row is the closest persisted entity to the tier-crossing event.

**Why `aggregateId = "<orgId>:<period>"`?** The rollup row has a composite PK (no surrogate `id uuid`). The composite-string form keeps `audit_log.aggregate_id` queryable for follow-up dashboards.

**Why `actorKind = 'system'`?** The scheduler is the actor; no user / agent is responsible for the crossing.

### ADR-NO-EMIT-DUPLICATE — `tier_crossed_at jsonb` on rollup row gates emission

Before emitting `AI_BUDGET_TIER_CROSSED`, the scheduler:

1. Reads the current rollup row's `tier_crossed_at` jsonb.
2. For each tier `T` in `{info, warn, error, fatal}` whose threshold has been crossed by `currentSpend`:
   - If `tier_crossed_at[T]` is null/absent → emit + record `tier_crossed_at[T] = <iso now>` in the SAME upsert.
   - If `tier_crossed_at[T]` is set → do nothing.
3. For tier `forecast`, the gate key is `tier_crossed_at.forecast`; emitted at most once per period.

The `tier_crossed_at` write happens atomically with the rollup `INSERT ON CONFLICT … DO UPDATE` so a crash between emit + write cannot leak duplicate events. On crash *before* the upsert commits, the event is replayed on the next tick — the audit-log idempotency cache (slice #21) de-dups by `(event_type, aggregate_id, correlation_id)`.

**Why store gates on the rollup row instead of a separate `tier_emitted_log` table?** Atomic with the data that drives the gate. A separate table would need its own transactional consistency contract; the jsonb column on the rollup row gives that for free.

**Why a single `correlation_id` per period+tier?** The scheduler generates `<orgId>:<period>:<tier>` as the correlation key; the audit-log subscriber's slice #21 idempotency cache catches double-fires across scheduler restarts.

### ADR-NULL-BUDGET-UNLIMITED — `ai_monthly_budget_eur IS NULL` short-circuits tier evaluation

When `organizations.ai_monthly_budget_eur IS NULL`, the scheduler:

1. STILL upserts the rollup row (we want the spend telemetry regardless).
2. SKIPS the tier-evaluation step entirely (no threshold to evaluate against).
3. SKIPS the burn-rate forecast step (no budget to project against).
4. SKIPS the audit-log emit step (no tier transition to record).

The "unlimited" path is the AGPL community-edition default — Owners set a budget if they want alerts, opt out by leaving NULL.

**Why not pick a default budget?** Picking would bias Owner perception. The architecture (ADR-030) explicitly chose NULL = unlimited; we honour it.

### ADR-CURRENCY-EUR — column is `total_cost_eur`, NOT `total_cost_usd`

The slice brief named the column `total_cost_usd`. The architecture artifact ADR-030 + the existing `organizations.currency_code` (locked at organization creation per ADR-007) + the M2 money convention (4-decimal storage, EUR base) all point to EUR. We use `total_cost_eur`.

**Why deviate from the brief?** The architecture artifact is the source of truth at Gate D; the slice brief is a working draft that occasionally drifts from the artifact. Aligning to the artifact prevents downstream confusion (e.g. slice #20 reading the column expects EUR per ADR-030; a USD column name would require translation at the read boundary).

**FX consideration**: AI provider pricing is published in USD (OpenAI, Anthropic). The `ai_pricing` seed (slice #20 ownership) stores rates as USD per million tokens; conversion to EUR happens at rollup time using a pinned FX rate per month. The pinned rate is recorded on the rollup row's `payloadAfter` envelope (slice #20 dashboard surfaces it). Out of scope for THIS slice: the FX-rate source / cadence. MVP convention: the scheduler computes EUR cost = USD cost × `NEXANDRO_AI_FX_RATE_USD_TO_EUR` (env var, default 0.92). Owner-visible FX-rate-of-record lands in slice #20's dashboard footer.

## Risks / Trade-offs

- **Bulk-cross emits multiple events in one tick.** A 40% → 95% jump in a single tick emits info + warn + error events. Operators may see a flurry. Mitigation: order events by tier severity so the operator's notification stream is monotonic; surface as a single "tier band" event in slice #20's UI by collapsing same-tick rows.
- **`AI_FX_RATE` env var creates a per-instance fork.** Two instances with different env values produce inconsistent EUR aggregates. Mitigation: documented in `docs/operations/ai-observability.md` (out-of-scope follow-up); slice #20 surfaces the FX rate so operators see it.
- **LRU cache loses contents on process restart.** First post-restart tick rebuilds from Postgres; if Postgres is down during restart, fallback is unavailable. Acceptable for AGPL single-instance; Enterprise Redis swap solves it.
- **5-minute cadence + 30 orgs × 1 SELECT + 1 UPSERT per tick = ~12 statements/min.** Bounded; well within Postgres throughput.
- **Forecast emit requires daily-aggregate data.** First-of-month has `daysIntoMonth=1`; projection is naïve `currentSpend × daysInMonth`. Acceptable as the projection is bounded by `× 1.2`; early-month false positives are rare.

## Migration Plan

1. Apply migration 0032 — creates `ai_usage_rollup`, adds `organizations.ai_monthly_budget_eur` (nullable).
2. Deploy with `NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED=false` (default) — scheduler is dormant.
3. Verify migration applied (`SELECT 1 FROM ai_usage_rollup LIMIT 0` returns clean).
4. Flip `NEXANDRO_AI_BUDGET_SCHEDULER_ENABLED=true` in prod env. First tick (5 min later) upserts rows for any orgs with span data.
5. Owner-side: budget config lands in slice #20 UI. Until then, Owners with `ai_monthly_budget_eur IS NULL` get telemetry rollup only, no alerts — graceful degradation per ADR-NULL-BUDGET-UNLIMITED.

Rollback: flip env flag off; if needed, run migration down (drops the table + column; loses tier history but no foreign keys into the rollup table so no cascade pain).

## Open Questions

- (resolved at design time) FX rate source: env var for MVP; slice #20 may add an Owner-configurable Postgres column per ADR-030 sub-decision "Pricing table" (which already plans for the FX rate alongside per-token pricing). Out of scope here.
- (resolved at design time) Whether to emit a `forecast` event for orgs with `daysIntoMonth < 7` (insufficient burn-rate signal). Decision: yes, with `daysIntoMonth=1` fallback projection = `currentSpend × daysInMonth`; the `× 1.2` threshold filters early-month noise.
- (deferred) Email cadence for tier alerts. Folded into slice #20's Owner UI; out of scope for this slice.
- (deferred) Per-capability or per-tag budgets. Org-monthly is the MVP; per-tag is a value-add only after slice #20 has surfaced the operator pain.
