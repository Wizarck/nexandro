## 1. Backend DTOs + Zod schemas

- [ ] 1.1 `apps/api/src/ai-observability/dashboard/dto/ai-obs.dto.ts` — Zod schemas for `OverviewQueryDto`, `CostByTagQueryDto`, `FailuresQueryDto` (input) and `OverviewResponseDto`, `CostByTagResponseDto`, `FailuresResponseDto` (output). Use `.min(1)` over `.nonempty()`; no `@nexandro/contracts` imports.
- [ ] 1.2 Define `PERIODS = ['24h','7d','30d','this_month','last_month'] as const` and `FAILURE_RANGES = ['24h','7d'] as const`.
- [ ] 1.3 Define `SEVERITY = ['P1','P2','P3'] as const`; severity classification table `SEVERITY_BY_EVENT_TYPE: Record<string, Severity>` covering `VISION_LLM_CALL_FAILED` (P1), `PRICING_ROW_NOT_FOUND` (P2), `CONFIDENCE_BAND_AMBIGUOUS` (P2), `OTLP_EXPORTER_503` (P3), `RATE_LIMIT_HIT` (P3).
- [ ] 1.4 Export inferred TypeScript types via `z.infer<typeof ...>` for controller use.

## 2. AiObsQueryService — read-only queries

- [ ] 2.1 `apps/api/src/ai-observability/dashboard/ai-obs-query.service.ts` — `@Injectable()` class wrapping the TypeORM repositories.
- [ ] 2.2 Inject `@InjectRepository(AuditLog)` (existing M2 entity). DO NOT inject `AiUsageRollup` directly — define a private interface `AiUsageRollupRow` matching slice #19's expected entity shape and query via `DataSource.query<AiUsageRollupRow>('SELECT ... FROM ai_usage_rollup WHERE ...')` so the slice compiles whether or not #19 has merged.
- [ ] 2.3 `getOverview(orgId: string, period: Period): Promise<OverviewResponseDto>`:
  - Compute period boundaries (`24h` = now-24h..now; `this_month` = first-of-month..now; etc).
  - Query rollup: error rate (`SUM(error_count) / SUM(calls_count)`), cost total + budget context (joins `organizations.ai_monthly_budget_eur`), tier (cross-references `BudgetService.evaluateOrg()` from slice #19; falls back to `null` if module unavailable), heatmap matrix (`SELECT day_of_week, hour_of_day, SUM(calls_count)`), top-N cost-by-capability + cost-by-model.
  - Detect anomalies: simple z-score on per-capability spend vs trailing 7d avg; multiplier ≥ 2 surfaces.
  - Compute savings: lookup table of `(capability, current_model, suggested_model, expected_savings_pct)` — static seed; M3.x makes this dynamic.
  - Compute blast radius: GROUP BY model with `SUM(calls_count)` + dependent capabilities list + fallback note (hardcoded per ADR-030 known providers).
  - If rollup is empty → return `{ status: 'empty', period, ... zero placeholders }`.
- [ ] 2.4 `getCostByTag(orgId: string, period: Period): Promise<CostByTagResponseDto>`:
  - Reads from rollup table with `GROUP BY (payload_after->>'nexandro.tag')` (slice #19 stores tag in payload jsonb).
  - Sort descending; cap at 10 rows; aggregate `NULL` tag under `(sin tag)`.
- [ ] 2.5 `getFailures(orgId: string, range: FailureRange): Promise<FailuresResponseDto>`:
  - Query `audit_log` with `event_type IN (failure set)` AND `organization_id = orgId` AND `created_at >= now() - interval`.
  - `GROUP BY event_type`; `ORDER BY count DESC`; `LIMIT 5`.
  - Map each row via `SEVERITY_BY_EVENT_TYPE`; compute relative time + hint copy.

## 3. DashboardController — 3 GET endpoints

- [ ] 3.1 `apps/api/src/ai-observability/dashboard/dashboard.controller.ts` — `@Controller('m3/ai-obs')` class with `@ApiTags('ai-observability')`.
- [ ] 3.2 `@Get('overview') @Roles('OWNER','MANAGER')` — validates query DTO via Zod, calls `AiObsQueryService.getOverview()`, returns response DTO. Throws `UnprocessableEntityException` with `{ code: 'INVALID_PERIOD', allowed: [...] }` on Zod failure.
- [ ] 3.3 `@Get('cost-by-tag') @Roles('OWNER','MANAGER')` — same shape as 3.2.
- [ ] 3.4 `@Get('failures') @Roles('OWNER','MANAGER')` — same shape as 3.2.
- [ ] 3.5 Add meta-test in `dashboard.controller.spec.ts`: introspect every method decorated with `@Get` and assert `Reflect.getMetadata(ROLES_METADATA_KEY, method)` includes both `'OWNER'` and `'MANAGER'`. Future-proof against drive-by additions.

## 4. DashboardModule — wire into AiObservabilityModule

- [ ] 4.1 `apps/api/src/ai-observability/dashboard/dashboard.module.ts` — Nest module exporting `DashboardController` + providing `AiObsQueryService`. Imports `TypeOrmModule.forFeature([AuditLog])`.
- [ ] 4.2 `apps/api/src/ai-observability/ai-observability.module.ts` — append `DashboardModule` to the `imports` array; do not touch the existing `OtelService` / `SpanEnricherInterceptor` providers.

## 5. Backend unit tests

- [ ] 5.1 `apps/api/src/ai-observability/dashboard/ai-obs-query.service.spec.ts` — unit tests on `getOverview`, `getCostByTag`, `getFailures`. Mock the TypeORM `DataSource.query` + `AuditLog` repo. Use `@CreateDateColumn` mock pattern from prior slices.
- [ ] 5.2 Cover: happy path (populated), empty-rollup path (status='empty'), period boundary (`24h` vs `this_month`), tag aggregation (`null` tag → `(sin tag)`), severity classification (P1/P2/P3).
- [ ] 5.3 `apps/api/src/ai-observability/dashboard/dashboard.controller.spec.ts` — covers 3 endpoints + RBAC meta-test + 422 validation error.
- [ ] 5.4 Run `pnpm --filter @nexandro/api test ai-observability/dashboard` and verify all green.

## 6. ui-kit primitive — Sparkline

- [ ] 6.1 `packages/ui-kit/src/components/Sparkline/Sparkline.tsx` — pure `<svg>` polyline component. Props: `{ data: number[], threshold?: number, peak?: { index: number, value: number }, ariaLabel: string }`. Renders an `<svg viewBox="0 0 120 40" role="img" aria-label={ariaLabel}>` with dashed gridline at `threshold` and circle marker at `peak`.
- [ ] 6.2 `Sparkline.types.ts` — exported props interface.
- [ ] 6.3 `Sparkline.test.tsx` — Vitest + React Testing Library. Cover: renders the right number of points, ariaLabel propagates, peak marker renders when supplied.
- [ ] 6.4 `Sparkline.stories.tsx` — 3 stories: stable line, line with peak, line with threshold.
- [ ] 6.5 Export from `packages/ui-kit/src/components/Sparkline/index.ts` + the root barrel `src/index.ts`.

## 7. ui-kit primitive — Heatmap

- [ ] 7.1 `packages/ui-kit/src/components/Heatmap/Heatmap.tsx` — fixed-grid CSS-grid heatmap. Props: `{ rows: number, cols: number, rowLabels: string[], colLabels: string[], cells: number[][], max: number, onCellClick?: (row, col) => void, cellAriaLabel: (row, col, value) => string }`. Maps each cell value to one of 6 OKLCH lightness steps (`--heat-0..--heat-5`).
- [ ] 7.2 `Heatmap.types.ts` — exported props interface.
- [ ] 7.3 Keyboard nav: arrow keys move focus between cells; Space/Enter fires `onCellClick`. Add `tabIndex={0}` on each `<button>` cell + keyboard handler at the container level.
- [ ] 7.4 `Heatmap.test.tsx` — cover: cell count, ariaLabel computed per cell, arrow-key navigation moves `document.activeElement`, click fires callback.
- [ ] 7.5 `Heatmap.stories.tsx` — 2 stories: 7×24 weekly heatmap, 4×12 quarterly heatmap.
- [ ] 7.6 Export from barrel.

## 8. ui-kit primitive — BadgeChip

- [ ] 8.1 `packages/ui-kit/src/components/BadgeChip/BadgeChip.tsx` — pill badge with variant prop. Variants: `info`, `warn`, `error`, `fatal`, `p1`, `p2`, `p3`, `neutral`. Maps to OKLCH foreground/background pair (`--warn-fg/--warn-bg` for warn; `--destructive` for fatal/p1; `--mute` for p3/neutral).
- [ ] 8.2 Props: `{ variant, children, ariaLabel?: string }`. Always renders a `<span role="status">` with the colour + glyph + text.
- [ ] 8.3 `BadgeChip.test.tsx` — covers all 8 variants render the right CSS variable + ariaLabel passthrough.
- [ ] 8.4 `BadgeChip.stories.tsx` — variant matrix.
- [ ] 8.5 Export from barrel.

## 9. ui-kit primitive — MetricCard + EmptyStateCard

- [ ] 9.1 `packages/ui-kit/src/components/MetricCard/MetricCard.tsx` — bordered surface panel. Props: `{ eyebrow: string, headline?: ReactNode, sub?: ReactNode, wide?: boolean, footer?: ReactNode, refreshButton?: { onClick: () => void, label: string } }`. Renders `<section class="widget">` matching the j8 mock CSS.
- [ ] 9.2 `MetricCard.types.ts` — exported props.
- [ ] 9.3 `MetricCard.test.tsx` — cover: renders eyebrow/headline/sub, refresh button click fires callback, footer renders.
- [ ] 9.4 `MetricCard.stories.tsx` — 4 stories: default, wide, with-footer, with-refresh.
- [ ] 9.5 `packages/ui-kit/src/components/EmptyStateCard/EmptyStateCard.tsx` — empty-state primitive. Props: `{ title: string, body?: string, ctaHref?: string, ctaLabel?: string }`. Centered text on dashed border.
- [ ] 9.6 `EmptyStateCard.test.tsx` + `EmptyStateCard.stories.tsx`.
- [ ] 9.7 Export both from barrel.

## 10. Frontend API + types

- [ ] 10.1 `apps/web/src/m3/ai-obs/api/aiObs.ts` — fetch wrappers for the 3 endpoints. Reuses the shared `api<T>()` from `apps/web/src/api/client.ts`. Defines `AppliedAiObsFilter`, `Period`, `FailureRange` types.
- [ ] 10.2 `apps/web/src/m3/ai-obs/api/aiObs.types.ts` — TypeScript shapes mirroring the backend response DTOs. May import from `@nexandro/contracts` (frontend is the intended consumer pattern).

## 11. Frontend TanStack Query hooks

- [ ] 11.1 `apps/web/src/m3/ai-obs/hooks/useAiObsOverview.ts` — `useQuery({ queryKey: ['ai-obs','overview', orgId, period], queryFn: () => getOverview(orgId, period), staleTime: 30_000 })`.
- [ ] 11.2 `apps/web/src/m3/ai-obs/hooks/useAiObsCostByTag.ts` — same shape, `staleTime: 30_000`.
- [ ] 11.3 `apps/web/src/m3/ai-obs/hooks/useAiObsFailures.ts` — `staleTime: 5_000`.
- [ ] 11.4 `apps/web/src/m3/ai-obs/hooks/useWidgetConfig.ts` — localStorage-backed `{ order, hidden, v: 1 }` with default fallback + corruption recovery. Exposes `{ config, setOrder, toggleHidden }`.
- [ ] 11.5 Test coverage: each hook has `*.test.ts` covering stale-time behaviour + refetch + default/corrupt config handling.

## 12. Frontend — 8 widgets + 4 chrome components

- [ ] 12.1 `apps/web/src/m3/ai-obs/widgets/ErrorRateWidget.tsx` — consumes `overview.errorRate`. Uses `<MetricCard>` + `<Sparkline>` + semaphore inline.
- [ ] 12.2 `CostTotalWidget.tsx` — monetary headline + budget bar with ticks.
- [ ] 12.3 `BudgetStatusWidget.tsx` — tier `<BadgeChip>` + burn-rate copy.
- [ ] 12.4 `CostByCapabilityWidget.tsx` — bar-list.
- [ ] 12.5 `CostByModelWidget.tsx` — bar-list.
- [ ] 12.6 `CostByTagWidget.tsx` — bar-list. Consumes `useAiObsCostByTag`.
- [ ] 12.7 `UsageHeatmapWidget.tsx` — wide widget consuming `<Heatmap>`.
- [ ] 12.8 `Top5FailuresWidget.tsx` — wide widget. Consumes `useAiObsFailures`. Renders deep-link to `/audit-log?eventType=...`.
- [ ] 12.9 `chrome/AnomalyChip.tsx` — conditional render from `overview.anomalies[0]`.
- [ ] 12.10 `chrome/SavingsOppCard.tsx` — conditional render from `overview.savingsOpportunities[0]`.
- [ ] 12.11 `chrome/BlastRadiusCard.tsx` — wide card with 4 model panels.
- [ ] 12.12 `chrome/OtlpBanner.tsx` — sticky footer.
- [ ] 12.13 Each widget has a `*.test.tsx` covering: happy render, empty state, ariaLabel correctness.

## 13. Frontend — screen + route

- [ ] 13.1 `apps/web/src/m3/ai-obs/AiObsDashboardScreen.tsx` — wraps everything. `<RoleGuard role={['OWNER','MANAGER']} currentRole={role} fallback={<AccessDenied />}>` + scope-eyebrow + page-head + range chip group + grid composition. Reads `useWidgetConfig` for order + hidden.
- [ ] 13.2 `AiObsDashboardScreen.test.tsx` — covers: Owner sees grid, Manager sees grid, Staff sees AccessDenied, signed-out sees SignedOut.
- [ ] 13.3 `apps/web/src/main.tsx` — add `{ path: 'ai-obs/dashboard', element: <AiObsDashboardScreen /> }` to the router children. Add lazy import statement.

## 14. Navigation integration

- [ ] 14.1 `apps/web/src/App.tsx` — add a `<Link to="/ai-obs/dashboard">AI obs</Link>` inside the existing `<RoleGuard role={['OWNER', 'MANAGER']}>` nav block; positioned after the existing "Auditoría" link.

## 15. End-to-end verification

- [ ] 15.1 Verify Storybook builds locally: every new ui-kit primitive has a story that renders without warnings.
- [ ] 15.2 Verify the dashboard page renders against a populated demo fixture (set `VITE_DEMO_USER_ROLE='OWNER'`, `VITE_DEMO_ORG_ID='org-demo'`).
- [ ] 15.3 Verify the dashboard page renders the empty state when no rollup rows exist.
- [ ] 15.4 Verify Vitest reports zero red across `packages/ui-kit` + `apps/web` + `apps/api/ai-observability/dashboard`.
- [ ] 15.5 Verify the `dashboard.controller.spec.ts` meta-test catches the addition of an un-decorated `@Get` (introduce a fake undecorated endpoint, run test, assert failure, revert).
