## 1. Migration 0032 — ai_usage_rollup + organizations.ai_monthly_budget_eur

- [ ] 1.1 `apps/api/src/migrations/0032_create_ai_usage_rollup.ts` — create `ai_usage_rollup` table with composite PK `(organization_id, period_yyyy_mm)`, columns `total_cost_eur numeric(15,4) NOT NULL DEFAULT 0`, `total_calls integer NOT NULL DEFAULT 0`, `total_input_tokens bigint NOT NULL DEFAULT 0`, `total_output_tokens bigint NOT NULL DEFAULT 0`, `last_aggregated_at timestamptz NOT NULL DEFAULT now()`, `tier_crossed_at jsonb NOT NULL DEFAULT '{}'::jsonb`
- [ ] 1.2 Same migration: add CHECK constraint `period_yyyy_mm ~ '^\d{4}-\d{2}$'`
- [ ] 1.3 Same migration: add FK `fk_ai_usage_rollup_org` on `(organization_id) REFERENCES organizations(id)`
- [ ] 1.4 Same migration: add index `ix_ai_usage_rollup_period_last_agg` on `(period_yyyy_mm, last_aggregated_at DESC)`
- [ ] 1.5 Same migration: `ALTER TABLE organizations ADD COLUMN ai_monthly_budget_eur numeric(12,2) NULL`
- [ ] 1.6 Down migration: drop index, drop table, drop org column (FK order)

## 2. AiUsageRollup entity

- [ ] 2.1 `apps/api/src/ai-observability/budget/domain/ai-usage-rollup.entity.ts` — TypeORM entity for `ai_usage_rollup`
- [ ] 2.2 Hoist `const numericTransformer` ABOVE the `@Entity` decorator (Wave 2.1 typing-cascade convention)
- [ ] 2.3 Composite PK declared via `@PrimaryColumn` on both `organizationId` + `periodYyyyMm`
- [ ] 2.4 `tier_crossed_at` mapped as `@Column({ type: 'jsonb' })` with `Partial<Record<TierName, string>>` typing
- [ ] 2.5 Export `TierName = 'info' | 'warn' | 'error' | 'fatal' | 'forecast'` type union

## 3. BudgetTier domain primitives

- [ ] 3.1 `apps/api/src/ai-observability/budget/domain/budget-tier.ts`:
  - `TIER_THRESHOLDS: Record<TierName, number>` const map `{ info: 0.50, warn: 0.75, error: 0.90, fatal: 1.00 }`
  - `TIER_SEVERITY_ORDER: readonly TierName[]` = `['info', 'warn', 'error', 'fatal']` (forecast is separate)
  - `isAboveThreshold(currentSpend: number, budgetLimit: number, tier: TierName): boolean` — pure
- [ ] 3.2 Unit tests for boundary cases: 49.999% / 50.0% / 50.001% / 100% / 110%

## 4. BurnRateCalculator pure functions

- [ ] 4.1 `apps/api/src/ai-observability/budget/domain/burn-rate.ts`:
  - `projectMonthEndSpend({ currentSpend, daysIntoMonth, daysInMonth }): number`
  - `daysUntilEmpty({ remainingBudget, avgDailySpend }): number | null` (null = unlimited runway)
  - Zero-division guards on both
- [ ] 4.2 Unit tests for: partial month projection (15/31), first-of-month edge (`daysIntoMonth=0`), `avgDailySpend=0` returns null, `Math.floor` behavior on partial days

## 5. Domain errors

- [ ] 5.1 `apps/api/src/ai-observability/budget/domain/errors.ts`:
  - `AiUsageRollupQueryError extends Error` (wraps Postgres failure with structured fields `organizationId`, `period`, `cause`)
  - `BudgetEvaluationError extends Error` (wraps evaluation pipeline failure)
  - `LruCacheUnavailableError extends Error` (cold-cache + DB outage combined)

## 6. AI_BUDGET_TIER_CROSSED event shape

- [ ] 6.1 `apps/api/src/ai-observability/budget/domain/events.ts`:
  - `AI_BUDGET_TIER_CROSSED_CHANNEL = 'ai-observability.budget-tier-crossed' as const`
  - `interface AiBudgetTierCrossedPayload` inline (NO `@opentrattos/contracts` import per Wave 2.1+2.2+2.3 hard constraint):
    - `organizationId: string`
    - `aggregateType: 'ai_usage_rollup'`
    - `aggregateId: string` (composite `<orgId>:<period>`)
    - `actorUserId: null`
    - `actorKind: 'system'`
    - `payloadAfter: { period, tier, totalSpendEur, budgetLimitEur, projectedEomEur, crossedAt }`

## 7. AiUsageRollupRepository

- [ ] 7.1 `apps/api/src/ai-observability/budget/application/ai-usage-rollup.repository.ts`:
  - `@Injectable()` wrapping `Repository<AiUsageRollup>` from TypeORM
  - `findByPeriod(organizationId: string, period: string): Promise<AiUsageRollup | null>` — multi-tenant gate
  - `upsertAggregate(organizationId, period, aggregate): Promise<AiUsageRollup>` — `INSERT … ON CONFLICT (organization_id, period_yyyy_mm) DO UPDATE` raw query
  - `markTierCrossed(organizationId, period, tier, crossedAt): Promise<void>` — atomic jsonb merge via `jsonb_set`
  - `findActiveOrgsInPeriod(period): Promise<string[]>` — enumerate orgs with any rollup row this period (used by scheduler)
- [ ] 7.2 Unit-test multi-tenant gate: cross-tenant read returns empty

## 8. LruRollupCache

- [ ] 8.1 `apps/api/src/ai-observability/budget/application/lru-rollup-cache.ts`:
  - `@Injectable()` wrapping `lru-cache` (capacity 1024, TTL 1h = 3 600 000 ms)
  - `get(key: string): RollupSnapshot | undefined`
  - `set(key: string, value: RollupSnapshot): void`
  - `verifyEligible(key: string): boolean` — check still-present key FIRST, then mark (Wave 2.3 #136 lesson)
- [ ] 8.2 Unit tests: capacity overflow eviction, TTL expiry, check-and-insert race avoidance

## 9. BudgetTierService

- [ ] 9.1 `apps/api/src/ai-observability/budget/application/budget-tier.service.ts`:
  - `@Injectable()`
  - `evaluate({ currentSpend, budgetLimit, alreadyCrossed }): TierName[]` — returns list of newly-crossed tiers in severity order
  - Skips tiers already in `alreadyCrossed`
  - Returns empty list if `budgetLimit <= 0`
- [ ] 9.2 Unit tests cover: 49% → [], 50% → ['info'], 75% w/ info already → ['warn'], 95% from cold → ['info','warn','error'], 110% w/ info+warn+error → ['fatal']

## 10. BurnRateCalculatorService (thin wrapper)

- [ ] 10.1 `apps/api/src/ai-observability/budget/application/burn-rate.calculator.ts`:
  - `@Injectable()`
  - `shouldEmitForecast({ currentSpend, budgetLimit, daysIntoMonth, daysInMonth, alreadyCrossed }): { emit: boolean, projectedEom: number | null }`
  - Returns `emit: true` when `projectedEom > budgetLimit × 1.2` AND `alreadyCrossed.forecast === undefined`
- [ ] 10.2 Unit tests cover: under-1.2× → no emit, over-1.2× cold → emit, over-1.2× already-emitted → no emit, NULL budget → no emit

## 11. RollupSchedulerService

- [ ] 11.1 `apps/api/src/ai-observability/budget/application/rollup-scheduler.service.ts`:
  - `@Injectable()` with `@Cron('*/5 * * * *', { name: 'ai-budget-rollup' })`
  - Env-flag gate: `if (process.env.OPENTRATTOS_AI_BUDGET_SCHEDULER_ENABLED !== 'true') return;`
  - For each active org:
    1. Compute aggregate (sum of spans for current period; SOURCE: read from OTel exporter sink — implementation note: stub via injected `SpanAggregatorPort` interface for testability; concrete impl reads from rollup table itself for MVP, refining when slice #20 attaches a real span source).
    2. Upsert via `repository.upsertAggregate(orgId, period, aggregate)` — wrap in try/catch; on failure, log + fall back to `lruCache.get(key)`.
    3. On success, `lruCache.set(key, aggregate)`.
    4. Load `ai_monthly_budget_eur` for org via `OrganizationsRepository.findById(orgId)`; if NULL, skip remaining steps.
    5. Call `budgetTierService.evaluate({ currentSpend, budgetLimit, alreadyCrossed })`.
    6. For each newly-crossed tier: emit `AI_BUDGET_TIER_CROSSED`, mark `tier_crossed_at[tier] = now()` via `repository.markTierCrossed(...)`.
    7. Call `burnRateCalculator.shouldEmitForecast(...)`; if `emit=true`, emit `forecast`-tier event + mark.
  - Whole-tick exception caught + logged; per-org exception caught + logged + continues.
- [ ] 11.2 Define `SpanAggregatorPort` interface + token in `application/ports/span-aggregator.port.ts`
- [ ] 11.3 Provide `PlaceholderSpanAggregator` (returns zero spend) in `budget.module.ts` with throwing NotImplementedError until slice #20 attaches the real span source — MIRRORS slice #5's `CostSnapshotModule` placeholder pattern
- [ ] 11.4 Unit tests cover: env-flag-off no-op, per-org exception isolation, fallback-to-cache on upsert failure, bulk-cross emits multiple events, no-emit when org budget is NULL

## 12. Organization entity extension

- [ ] 12.1 `apps/api/src/iam/domain/organization.entity.ts`:
  - Add `@Column({ name: 'ai_monthly_budget_eur', type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericNullableTransformer }) aiMonthlyBudgetEur: number | null = null;`
  - Hoist `numericNullableTransformer` const above `@Entity` (matches Wave 2.1 lesson; handles `null` case)
- [ ] 12.2 No DTO / controller change (Owner config UI lands in slice #20)
- [ ] 12.3 Update `organization.entity.spec.ts` defensive tests if any reference field count

## 13. AuditLogSubscriber + types extension

- [ ] 13.1 `apps/api/src/audit-log/application/types.ts`:
  - Add `AI_BUDGET_TIER_CROSSED: 'ai-observability.budget-tier-crossed'` to `AuditEventType`
  - Mirror in `AuditEventTypeName` lookup: `'ai-observability.budget-tier-crossed': 'AI_BUDGET_TIER_CROSSED'`
  - No entry in `RETENTION_BY_EVENT_NAME` map — defaults to 'operational'
- [ ] 13.2 `apps/api/src/audit-log/application/audit-log.subscriber.ts`:
  - Add `@OnEvent(AuditEventType.AI_BUDGET_TIER_CROSSED)` handler `onAiBudgetTierCrossed(payload: AuditEventEnvelope): Promise<void>` — calls `persistEnvelope(AuditEventType.AI_BUDGET_TIER_CROSSED, payload)`
  - Place handler in a new "Slice #19 m3-ai-obs-budget-tier-emitter" section between existing M3 sections

## 14. BudgetModule wiring

- [ ] 14.1 `apps/api/src/ai-observability/budget/budget.module.ts`:
  - `@Module` imports `TypeOrmModule.forFeature([AiUsageRollup, Organization])`
  - Providers: `AiUsageRollupRepository`, `LruRollupCache`, `BudgetTierService`, `BurnRateCalculator`, `RollupSchedulerService` + `PlaceholderSpanAggregator` bound to `SPAN_AGGREGATOR_PORT`
  - Exports: `AiUsageRollupRepository` (read surface for slice #20)
- [ ] 14.2 `apps/api/src/ai-observability/ai-observability.module.ts`:
  - Import `BudgetModule`
  - Re-export `BudgetModule` so consumers see `AiUsageRollupRepository`
- [ ] 14.3 No change to `app.module.ts` (AiObservabilityModule already wired by slice #16)

## 15. Tests

- [ ] 15.1 Unit tests under `apps/api/src/ai-observability/budget/`:
  - `domain/budget-tier.spec.ts` — boundary cases for `isAboveThreshold`
  - `domain/burn-rate.spec.ts` — projection math + days-until-empty edge cases
  - `domain/events.spec.ts` — payload shape conforms to `AuditEventEnvelope`
  - `application/budget-tier.service.spec.ts` — bulk-cross + dedup logic
  - `application/burn-rate.calculator.spec.ts` — forecast emission gate
  - `application/lru-rollup-cache.spec.ts` — capacity / TTL / check-and-insert
  - `application/ai-usage-rollup.repository.spec.ts` — multi-tenant gate (mock TypeORM Repository); mock `@CreateDateColumn` not needed (entity has no `@CreateDateColumn` — uses explicit `last_aggregated_at`)
  - `application/rollup-scheduler.service.spec.ts` — env-flag, per-org exception isolation, fallback-to-cache, no-emit on NULL budget
- [ ] 15.2 Add `@OnEvent` registration test to `audit-log.subscriber.spec.ts` (new handler triggers `persistEnvelope`)
- [ ] 15.3 Property-based test placeholder: `domain/burn-rate.property.spec.ts` (optional MVP; full property suite deferred to slice #20 with real OTel span data)

## 16. Module wiring + smoke test

- [ ] 16.1 Verify `pnpm --filter apps/api build` succeeds (run only after pushed; do not pnpm install locally)
- [ ] 16.2 Smoke-import budget module from `ai-observability.module.ts`; verify NestJS DI graph resolves at app load without `OPENTRATTOS_AI_BUDGET_SCHEDULER_ENABLED` set

## 17. Docs follow-ups (post-merge, OUT OF SCOPE for this slice's commits)

- [ ] 17.1 `docs/operations/ai-observability.md` — `OPENTRATTOS_AI_BUDGET_SCHEDULER_ENABLED` + `OPENTRATTOS_AI_FX_RATE_USD_TO_EUR` env flags + tier severity table
- [ ] 17.2 NFR-OBS-10 row in `prd-m3.md` NFR table (documentation cleanup follow-up per architecture-m3.md note)
