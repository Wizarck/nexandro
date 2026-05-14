## ADDED Requirements

### Requirement: ai_usage_rollup table aggregates per-(organization, period) AI spend

The system SHALL create the `ai_usage_rollup` table (migration 0032) with composite PK `(organization_id, period_yyyy_mm)`, storing aggregated AI usage per organization per calendar month. The system SHALL upsert rows via `INSERT … ON CONFLICT (organization_id, period_yyyy_mm) DO UPDATE`. The `total_cost_eur` column SHALL use `numeric(15,4)` precision matching the M2 money convention. `tier_crossed_at jsonb` SHALL persist per-tier first-crossing timestamps on the same row.

#### Scenario: new (org, period) pair inserts a fresh row
- **GIVEN** an organization with no `ai_usage_rollup` row for the current period
- **WHEN** the rollup scheduler completes a tick that observed at least one AI call
- **THEN** a new row is inserted with `total_cost_eur > 0`, `total_calls > 0`, `last_aggregated_at = now()`, and `tier_crossed_at = '{}'::jsonb`

#### Scenario: existing (org, period) pair updates in place
- **GIVEN** an `ai_usage_rollup` row for org X period 2026-05 with `total_cost_eur=10.00`
- **WHEN** the scheduler tick observes new spend bringing the total to 15.50
- **THEN** the SAME row updates to `total_cost_eur=15.50` (composite PK guarantees one row per (org, period))

#### Scenario: PK constraint prevents duplicate (org, period) rows
- **WHEN** two concurrent scheduler ticks attempt to insert the same `(organization_id, period_yyyy_mm)`
- **THEN** the `INSERT … ON CONFLICT` clause merges into a single row (one INSERT, one UPDATE; never two rows)

#### Scenario: period_yyyy_mm CHECK constraint rejects malformed periods
- **WHEN** an `INSERT` is attempted with `period_yyyy_mm = '2026-5'` (missing zero-pad)
- **THEN** the CHECK constraint `period_yyyy_mm ~ '^\d{4}-\d{2}$'` rejects the write

### Requirement: organizations.ai_monthly_budget_eur is nullable; NULL means unlimited

The system SHALL extend the `organizations` table with `ai_monthly_budget_eur numeric(12,2) NULL` (migration 0032). NULL SHALL mean unlimited budget — tier evaluation short-circuits for orgs with NULL.

#### Scenario: NULL budget skips tier evaluation but preserves telemetry
- **GIVEN** organization X with `ai_monthly_budget_eur IS NULL`
- **WHEN** the scheduler tick aggregates spend for X
- **THEN** the `ai_usage_rollup` row is upserted normally, BUT no `BudgetTierService.evaluate()` call runs and no `AI_BUDGET_TIER_CROSSED` event fires

#### Scenario: setting a budget on an existing org activates tier evaluation
- **GIVEN** organization X with `ai_monthly_budget_eur IS NULL` and existing rollup row with `total_cost_eur=60`
- **WHEN** an Owner updates `ai_monthly_budget_eur = 100.00`
- **AND** the next scheduler tick runs
- **THEN** the tier evaluation runs (60% spent → already past `info` 50% threshold), emits one `AI_BUDGET_TIER_CROSSED` event with `tier='info'`, and records `tier_crossed_at = {"info": "<iso>"}`

### Requirement: BudgetTierService evaluates 4 tiers at 50/75/90/100% thresholds

The system SHALL evaluate budget tiers `info` (50%), `warn` (75%), `error` (90%), `fatal` (100%+). Tier names + thresholds are pinned to the architecture artifact ADR-030 "Budget tier system" sub-decision. `BudgetTierService.evaluate({ currentSpend, budgetLimit, alreadyCrossed })` SHALL return the list of newly-crossed tiers (zero, one, or many).

#### Scenario: 49% spent crosses no tier
- **WHEN** `currentSpend=49`, `budgetLimit=100`, `alreadyCrossed={}` is evaluated
- **THEN** the result is `[]` (empty list)

#### Scenario: 50% exactly crosses the info tier
- **WHEN** `currentSpend=50`, `budgetLimit=100`, `alreadyCrossed={}` is evaluated
- **THEN** the result is `['info']`

#### Scenario: 75% exactly crosses warn (info already crossed)
- **WHEN** `currentSpend=75`, `budgetLimit=100`, `alreadyCrossed={ info: '<iso>' }` is evaluated
- **THEN** the result is `['warn']` (info NOT re-emitted)

#### Scenario: bulk-cross from 40% to 95% in one tick
- **GIVEN** `alreadyCrossed={}` (no prior crossings) and a spike in spend
- **WHEN** `currentSpend=95`, `budgetLimit=100` is evaluated
- **THEN** the result is `['info','warn','error']` in tier-severity order — bulk emission

#### Scenario: 110% crosses fatal but does NOT block calls
- **WHEN** `currentSpend=110`, `budgetLimit=100`, `alreadyCrossed={ info, warn, error }` is evaluated
- **THEN** the result is `['fatal']` AND the scheduler emits the event AND any subsequent AI calls continue to succeed (soft enforcement per ADR-030)

### Requirement: AI_BUDGET_TIER_CROSSED event emits at most once per (org, period, tier)

The system SHALL emit `AI_BUDGET_TIER_CROSSED` on bus channel `ai-observability.budget-tier-crossed` at most ONCE per `(organization_id, period_yyyy_mm, tier)`. The system SHALL persist the crossing timestamp atomically with the rollup upsert in `tier_crossed_at jsonb`. The system SHALL reset the tier set at month boundary UTC.

#### Scenario: same tier crossed twice in the same period — second tick suppresses emission
- **GIVEN** rollup row with `tier_crossed_at = { "info": "2026-05-01T10:00:00Z" }`
- **WHEN** the scheduler tick observes spend still above the info threshold
- **THEN** no new `AI_BUDGET_TIER_CROSSED` event is emitted (idempotency gate)

#### Scenario: new month starts a fresh tier set
- **GIVEN** rollup row for period `2026-05` with `tier_crossed_at = { "info", "warn" }`
- **WHEN** the clock crosses to `2026-06` and the scheduler creates a new rollup row for period `2026-06` with `tier_crossed_at = '{}'::jsonb`
- **THEN** the same org's June spend can re-trigger `info` + `warn` independently

#### Scenario: tier_crossed_at jsonb update atomic with rollup upsert
- **WHEN** the scheduler computes a new tier crossing
- **THEN** the same `INSERT … ON CONFLICT … DO UPDATE` statement writes both the spend totals AND the updated `tier_crossed_at` field (single statement; not two)

#### Scenario: correlation_id derived from (orgId, period, tier) so audit-log dedup catches double-fires
- **WHEN** the scheduler emits `AI_BUDGET_TIER_CROSSED`
- **THEN** the event envelope carries a `correlation_id` of shape `<orgId>:<period>:<tier>` so the slice #21 audit-log idempotency cache catches replays across scheduler restarts

### Requirement: BurnRateCalculator projects month-end spend; emits forecast at projection > 1.2 × budget

The system SHALL implement two pure functions in `apps/api/src/ai-observability/budget/domain/burn-rate.ts`: `projectMonthEndSpend({ currentSpend, daysIntoMonth, daysInMonth })` and `daysUntilEmpty({ remainingBudget, avgDailySpend })`. The scheduler SHALL emit a `forecast`-tier `AI_BUDGET_TIER_CROSSED` event when `projectMonthEndSpend > budgetLimit × 1.2` AND `tier_crossed_at.forecast` is not yet set for the period.

#### Scenario: projection of monthly spend from partial-month data
- **WHEN** `projectMonthEndSpend({ currentSpend: 60, daysIntoMonth: 15, daysInMonth: 31 })` is called
- **THEN** the result is `124` (60 / 15 × 31 = 124)

#### Scenario: zero days into month returns zero projection
- **WHEN** `projectMonthEndSpend({ currentSpend: 0, daysIntoMonth: 0, daysInMonth: 31 })` is called
- **THEN** the result is `0` (defensive — no division by zero)

#### Scenario: forecast emit triggered when projection > 1.2 × budget
- **GIVEN** org X with `budgetLimit=100`, `currentSpend=70`, `daysIntoMonth=10`, `daysInMonth=31`
- **WHEN** the scheduler evaluates burn rate
- **THEN** projected EoM = 217 (70/10×31), which exceeds 100 × 1.2 = 120, AND a `forecast`-tier event is emitted

#### Scenario: forecast emit suppressed when already crossed this period
- **GIVEN** `tier_crossed_at = { "forecast": "<iso>" }` for the current period
- **WHEN** the projection again exceeds the 1.2× threshold
- **THEN** no new `forecast` event is emitted

#### Scenario: daysUntilEmpty handles zero-spend case
- **WHEN** `daysUntilEmpty({ remainingBudget: 50, avgDailySpend: 0 })` is called
- **THEN** the result is `null` (unlimited runway — burn rate is zero)

#### Scenario: daysUntilEmpty floor on partial day
- **WHEN** `daysUntilEmpty({ remainingBudget: 50, avgDailySpend: 7 })` is called
- **THEN** the result is `7` (50 / 7 ≈ 7.14, floored to 7 — conservative)

### Requirement: LRU cache falls back when rollup upsert fails

The system SHALL maintain a process-local LRU cache (capacity 1024 orgs, TTL 1 hour) of the last successful aggregate per `(organizationId, period_yyyy_mm)` key. When the rollup `INSERT … ON CONFLICT` fails, the system SHALL serve tier evaluation from the cached aggregate AND log a structured `ai-budget.rollup.fallback` warn line. The cache SHALL implement the check-and-insert dedup pattern (verify still-present key BEFORE missing-key path) per the Wave 2.3 #136 lesson.

#### Scenario: successful upsert refreshes the cache
- **WHEN** the scheduler tick completes a successful `INSERT ON CONFLICT`
- **THEN** the LRU cache key `<orgId>:<period>` is set to the new aggregate snapshot

#### Scenario: rollup upsert fails — tier evaluation continues against cached aggregate
- **GIVEN** the LRU cache holds `<orgId>:<period> → { total_cost_eur: 60 }` from the prior tick
- **WHEN** the next tick's `INSERT ON CONFLICT` throws (Postgres outage)
- **THEN** tier evaluation runs against the cached `total_cost_eur=60`, a structured warn log line `ai-budget.rollup.fallback orgId=<id> period=<yyyy-mm> reason=<message>` is emitted, AND tier crossings continue to fire

#### Scenario: cache miss + upsert failure skips tier evaluation
- **GIVEN** no LRU entry for `<orgId>:<period>` (cold cache)
- **WHEN** the upsert fails
- **THEN** tier evaluation is SKIPPED for this tick (cannot evaluate without an aggregate); a structured warn log notes the cold-cache fallback

#### Scenario: check-and-insert dedup avoids spurious double emission
- **GIVEN** the LRU is at capacity (1024 entries) and the requested key is still present from a recent insert
- **WHEN** `verifyEligible(key)` is called
- **THEN** the still-present key check runs FIRST and returns `false` (already seen); the missing-key path NEVER runs for this call

#### Scenario: cache TTL expires after 1 hour
- **GIVEN** an entry inserted into the LRU at T=0
- **WHEN** time T=3601 seconds passes
- **THEN** the entry is evicted by TTL; the next `get(key)` returns undefined

### Requirement: RollupScheduler runs on @Cron('*/5 * * * *') with env-flag gate

The system SHALL register `RollupSchedulerService.tick()` with `@Cron('*/5 * * * *')` from `@nestjs/schedule`. The system SHALL short-circuit the tick when `process.env.OPENTRATTOS_AI_BUDGET_SCHEDULER_ENABLED !== 'true'`. Per-organization exceptions SHALL log + skip; whole-tick exceptions SHALL log without killing the scheduler.

#### Scenario: env flag off — tick is a no-op
- **GIVEN** `OPENTRATTOS_AI_BUDGET_SCHEDULER_ENABLED=false` (or unset)
- **WHEN** the cron fires
- **THEN** the handler returns immediately with no DB or bus traffic

#### Scenario: per-org exception logs + continues with next org
- **GIVEN** orgs A, B, C with active spend; org B's repo call throws
- **WHEN** the scheduler tick runs
- **THEN** orgs A and C are processed normally, org B's exception is logged with structured fields, and the tick completes (does not propagate)

#### Scenario: scheduler resilient to whole-tick exception
- **WHEN** the tick's enumerate-active-orgs query itself throws
- **THEN** the exception is caught + logged; the next 5-minute tick re-runs cleanly (no scheduler death)

### Requirement: AI_BUDGET_TIER_CROSSED persists to audit_log via AuditLogSubscriber

The system SHALL extend `AuditLogSubscriber` (apps/api/src/audit-log/application/audit-log.subscriber.ts) with one new `@OnEvent('ai-observability.budget-tier-crossed')` handler. The handler SHALL call `persistEnvelope()` (the envelope shape is already canonical). The system SHALL extend `AuditEventType` + `AuditEventTypeName` constants with the new entry. The system SHALL default `retention_class='operational'` for `AI_BUDGET_TIER_CROSSED` (no regulatory or ephemeral footprint).

#### Scenario: AI_BUDGET_TIER_CROSSED event persists one audit_log row
- **WHEN** the scheduler emits an `AI_BUDGET_TIER_CROSSED` event with envelope-shaped payload
- **THEN** the subscriber's `onAiBudgetTierCrossed` method persists exactly one `audit_log` row with `event_type='AI_BUDGET_TIER_CROSSED'`, `aggregate_type='ai_usage_rollup'`, `aggregate_id='<orgId>:<period>'`, `actor_kind='system'`, `retention_class='operational'`

#### Scenario: malformed payload skips persistence with warn log
- **WHEN** the bus delivers a payload missing the `organizationId` field
- **THEN** `validateEnvelope()` returns null; the row is NOT persisted; a structured `audit-log.subscriber.skipped` warn line is emitted

#### Scenario: handler co-exists with slice #18 photo handlers (concatenation merge)
- **GIVEN** slice #18 adds `PHOTO_UPLOADED` + `PHOTO_DELETED` handlers to the same file
- **WHEN** both slices merge to master
- **THEN** the resolved file contains both slice #18's 2 handlers and slice #19's 1 handler; no conflict in logic

### Requirement: multi-tenant invariant enforced at AiUsageRollupRepository

The system SHALL gate every public `AiUsageRollupRepository` method on an `organizationId` parameter. The system SHALL include `organization_id = $1` in every WHERE clause; queries that omit it SHALL fail static analysis (the M3 cross-tenant fixture infrastructure from slice #21 ADR-CROSS-TENANT-FIXTURES) at INT-spec time.

#### Scenario: repository.findByPeriod gates on organizationId
- **WHEN** `findByPeriod(orgIdA, '2026-05')` is called
- **THEN** the SQL WHERE clause is `WHERE organization_id = $1 AND period_yyyy_mm = $2` with `$1 = orgIdA`

#### Scenario: cross-tenant read returns empty
- **GIVEN** rows for orgA and orgB in period 2026-05
- **WHEN** `findByPeriod(orgB, '2026-05')` is called
- **THEN** only orgB's row is returned; orgA's row is NOT in the result set

#### Scenario: repository.upsertAggregate writes only the requested orgId
- **WHEN** `upsertAggregate(orgIdA, '2026-05', { totalCostEur: 50, … })` is called
- **THEN** the resulting row's `organization_id = orgIdA`; no row mutates for any other org

### Requirement: numericTransformer hoist on AiUsageRollup entity

The system SHALL declare `numericTransformer` as a const hoisted ABOVE the `@Entity` decorator on `AiUsageRollup`, matching the Wave 2.1 typing-cascade convention. The transformer SHALL coerce TypeORM's string-from-numeric to a JS `number` (and accept `number` on the way back).

#### Scenario: numeric column read returns number, not string
- **GIVEN** a rollup row with `total_cost_eur=12.34` in Postgres
- **WHEN** the repository hydrates the entity
- **THEN** `entity.totalCostEur` is the JS number `12.34` (NOT the string `"12.34"`)

#### Scenario: null numeric coerces to zero on read
- **WHEN** a hypothetical row has `total_cost_eur IS NULL` (defensive; column is NOT NULL DEFAULT 0)
- **THEN** the transformer returns `0` (matches the cost-snapshot entity pattern)
