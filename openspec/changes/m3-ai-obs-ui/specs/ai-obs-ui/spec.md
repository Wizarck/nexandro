## ADDED Requirements

### Requirement: Dashboard route mounted at /ai-obs/dashboard for Owner + Manager

The system SHALL mount a new route `/ai-obs/dashboard` in `apps/web/src/main.tsx` rendering the j8 AI observability dashboard. The route SHALL be wrapped in a `<RoleGuard role={['OWNER', 'MANAGER']}>` client-side guard that renders an `<AccessDenied>` fallback for any other role.

#### Scenario: Owner navigates to the dashboard and sees all widgets
- **GIVEN** the demo user has `VITE_DEMO_USER_ROLE='OWNER'` and `VITE_DEMO_ORG_ID='org-1'`
- **WHEN** the user navigates to `/ai-obs/dashboard`
- **THEN** the page renders the 8 widgets + 4 chrome elements (anomaly chip, savings opportunity, blast radius, OTLP banner) inside the standard `<App>` shell

#### Scenario: Manager navigates to the dashboard and sees all widgets
- **GIVEN** the demo user has `VITE_DEMO_USER_ROLE='MANAGER'`
- **WHEN** the user navigates to `/ai-obs/dashboard`
- **THEN** the same 8 widgets + 4 chrome elements render (Manager has the same view as Owner — no per-widget gates)

#### Scenario: Staff navigates to the dashboard and sees Access denied
- **GIVEN** the demo user has `VITE_DEMO_USER_ROLE='STAFF'`
- **WHEN** the user navigates to `/ai-obs/dashboard`
- **THEN** the page renders the `<AccessDenied>` fallback with copy "Tu rol no tiene acceso a esta vista"; no widget data is fetched (verified via Vitest mock of `fetch`)

#### Scenario: Unsigned user sees the signed-out fallback
- **GIVEN** `VITE_DEMO_USER_ROLE` is unset
- **WHEN** the user navigates to `/ai-obs/dashboard`
- **THEN** the page renders `<SignedOut>` and `useAiObsOverview` does not fire

### Requirement: Backend exposes /m3/ai-obs/overview with 6-core widget data

The system SHALL expose `GET /m3/ai-obs/overview?organizationId=...&period=24h|7d|30d|this_month|last_month` returning a single payload covering the 6 core FR45 widgets plus widget #8 (BudgetStatus). The endpoint SHALL be `@Roles('OWNER','MANAGER')`-gated and `@OrganizationGuard`-scoped.

#### Scenario: Owner GET /m3/ai-obs/overview returns 6-core payload
- **GIVEN** seeded `ai_usage_rollup` rows for `org-1` spanning the last 30 days
- **WHEN** an Owner JWT issues `GET /m3/ai-obs/overview?organizationId=org-1&period=30d`
- **THEN** the response is 200 with body containing `errorRate`, `costTotal`, `budgetStatus`, `costByCapability`, `costByModel`, `heatmap`, `anomalies`, `savingsOpportunities`, `blastRadius`, `otlpExporter`, and `status: 'ok' | 'empty'` fields

#### Scenario: Staff GET /m3/ai-obs/overview returns 403
- **GIVEN** a Staff JWT
- **WHEN** the user issues `GET /m3/ai-obs/overview?organizationId=org-1&period=30d`
- **THEN** the response is 403 with body `{ code: 'INSUFFICIENT_ROLE', details: { required: ['OWNER','MANAGER'], actual: 'STAFF' } }`

#### Scenario: Owner GET /m3/ai-obs/overview rejects cross-tenant query
- **GIVEN** an Owner JWT for `org-1`
- **WHEN** the user issues `GET /m3/ai-obs/overview?organizationId=org-2&period=30d`
- **THEN** the response is 403 from the global `OrganizationGuard` (existing behaviour, regression-tested)

#### Scenario: empty rollup returns status='empty' not 500
- **GIVEN** no `ai_usage_rollup` rows for `org-1`
- **WHEN** the user issues the overview query
- **THEN** the response is 200 with `status: 'empty'` and every widget payload populated with zero-valued placeholders (e.g. `errorRate.value=0`, `costTotal.value=0`, `heatmap.cells=[[0×24]×7]`)

#### Scenario: invalid period query param returns 422
- **WHEN** the user issues `GET /m3/ai-obs/overview?organizationId=org-1&period=foo`
- **THEN** the response is 422 with `{ code: 'INVALID_PERIOD', allowed: ['24h','7d','30d','this_month','last_month'] }`

### Requirement: Backend exposes /m3/ai-obs/cost-by-tag with grouped tag spend

The system SHALL expose `GET /m3/ai-obs/cost-by-tag?organizationId=...&period=this_month` returning the top 10 `nexandro.tag` values by spend within the period. Tagless calls SHALL aggregate under the synthetic `(sin tag)` row.

#### Scenario: Owner GET /m3/ai-obs/cost-by-tag returns top-10 tags
- **GIVEN** seeded rollup rows with diverse `nexandro.tag` attributes
- **WHEN** an Owner JWT issues `GET /m3/ai-obs/cost-by-tag?organizationId=org-1&period=this_month`
- **THEN** the response is 200 with body `{ tags: [{ tag, totalEur, sharePct }, ...] }` ordered descending by `totalEur`, capped at 10 rows

#### Scenario: tagless calls aggregate under (sin tag)
- **GIVEN** seeded rollup rows where 5 % of the spend has no tag
- **WHEN** the user issues the cost-by-tag query
- **THEN** one row carries `tag: '(sin tag)'` with the aggregated tagless spend

### Requirement: Backend exposes /m3/ai-obs/failures with severity-coded Top-5

The system SHALL expose `GET /m3/ai-obs/failures?organizationId=...&range=24h|7d` returning the top 5 failure event types from `audit_log` within the range. Each failure SHALL carry a P1/P2/P3 severity classification derived from the event type.

#### Scenario: Owner GET /m3/ai-obs/failures returns top-5 severity-coded
- **GIVEN** seeded `audit_log` rows for `org-1` with `event_type` in the failure set in the last 24h
- **WHEN** an Owner JWT issues `GET /m3/ai-obs/failures?organizationId=org-1&range=24h`
- **THEN** the response is 200 with body `{ failures: [{ eventType, severity, count, lastOccurredAt, hint }, ...] }` ordered descending by `count`, capped at 5 rows

#### Scenario: severity classification — Vision-LLM timeout is P1
- **WHEN** the query returns a row with `eventType: 'VISION_LLM_CALL_FAILED'`
- **THEN** that row carries `severity: 'P1'` (blocks ingest)

#### Scenario: severity classification — pricing-row-not-found is P2
- **WHEN** the query returns a row with `eventType: 'PRICING_ROW_NOT_FOUND'`
- **THEN** that row carries `severity: 'P2'` (degrades cost calc)

#### Scenario: severity classification — OTLP 503 is P3
- **WHEN** the query returns a row with `eventType: 'OTLP_EXPORTER_503'`
- **THEN** that row carries `severity: 'P3'` (telemetry only, no service impact)

### Requirement: Three TanStack Query hooks own client-side caching + revalidation

The system SHALL provide three React hooks (`useAiObsOverview`, `useAiObsCostByTag`, `useAiObsFailures`) using `@tanstack/react-query` with tailored stale times: 30 s for overview, 30 s for cost-by-tag, 5 s for failures. Each hook SHALL accept an `organizationId` + `period|range` argument and return `{ data, isLoading, error, dataUpdatedAt, refetch }`.

#### Scenario: useAiObsOverview caches the response for 30 s
- **WHEN** the screen mounts and calls `useAiObsOverview('org-1', '24h')` twice within 30 s
- **THEN** only one `GET /m3/ai-obs/overview` request is fired (verified via fetch spy)

#### Scenario: useAiObsFailures has 5-second stale time
- **WHEN** the screen mounts and calls `useAiObsFailures('org-1', '24h')` twice within 5 s
- **THEN** only one `GET /m3/ai-obs/failures` request is fired

#### Scenario: refetch invalidates the cache and re-fetches immediately
- **WHEN** the user clicks the manual refresh button on a widget
- **THEN** the hook's `refetch()` is called, the cache entry is invalidated, and a fresh `GET` is issued regardless of staleness

#### Scenario: hooks expose dataUpdatedAt for the freshness badge
- **WHEN** a query resolves at `2026-05-14T12:00:00Z`
- **THEN** `dataUpdatedAt` equals `1747224000000` (ms epoch), enabling the `<MetricCard>` footer to render "Actualizado hace 0 min"

### Requirement: Widget config persists per-user in localStorage

The system SHALL persist a per-user widget config object under localStorage key `nexandro.aiObsDashboard.widgetConfig.v1`. The shape SHALL be `{ order: WidgetId[], hidden: WidgetId[], v: 1 }`. The `useWidgetConfig` hook SHALL read on mount, write on every mutation, and fall back to defaults on corruption.

#### Scenario: defaults on first visit
- **GIVEN** no entry in localStorage for the key
- **WHEN** `useWidgetConfig` mounts
- **THEN** it returns the canonical default order with `hidden: []`

#### Scenario: order persists across reloads
- **GIVEN** the user drags `costByTag` to position 0
- **WHEN** the page reloads
- **THEN** `useWidgetConfig` returns `order: ['costByTag', 'errorRate', 'costTotal', ...]`

#### Scenario: hidden widget renders as null + does not call its hook
- **GIVEN** `hidden: ['top5Failures']`
- **WHEN** the screen renders
- **THEN** `Top5FailuresWidget` is not in the DOM AND `useAiObsFailures` is not invoked (verified via fetch spy)

#### Scenario: corrupt entry falls back to defaults
- **GIVEN** localStorage contains `nexandro.aiObsDashboard.widgetConfig.v1 = '{"v": 99, "x"}'`
- **WHEN** `useWidgetConfig` mounts
- **THEN** the hook returns the defaults; no exception is thrown

### Requirement: ErrorRateWidget renders semaphore + sparkline + threshold

The `ErrorRateWidget` SHALL render a semaphore dot+glyph (✓/⚠/✗) coloured per the threshold (green < 1 %, amber 1–5 %, red > 5 %), the numeric percentage, an explanatory sub-line ("Umbral verde < 1 % · ámbar 1–5 % · rojo > 5 %"), and a 24-point sparkline with a 1 % dashed gridline + peak marker.

#### Scenario: error rate 0.4 % renders green semaphore + ✓ glyph
- **WHEN** the widget receives `{ value: 0.004, series: [...], peak: { hour: 14, value: 0.006 } }`
- **THEN** the rendered DOM contains `.semaphore-dot` with `background: var(--success)` and `.semaphore-glyph` with text `'✓'`

#### Scenario: error rate 2.3 % renders amber semaphore + ⚠ glyph
- **WHEN** the widget receives `{ value: 0.023, ... }`
- **THEN** the rendered DOM contains the amber glyph `'⚠'` and `aria-label` `"Estado: cerca del umbral"`

#### Scenario: error rate 7.1 % renders red semaphore + ✗ glyph
- **WHEN** the widget receives `{ value: 0.071, ... }`
- **THEN** the rendered DOM contains the red glyph `'✗'` and `aria-label` `"Estado: fuera de umbral — investiga"`

#### Scenario: sparkline carries aria-label disclosing the peak
- **WHEN** the widget renders with `peak: { hour: 14, value: 0.006 }`
- **THEN** the `<svg>` carries `aria-label` containing `"pico 0,6 % a las 14:00"`

### Requirement: BudgetStatusWidget renders tier badge + burn-rate copy

The `BudgetStatusWidget` SHALL render the tier as a `<BadgeChip>` with variant `info|warn|error|fatal`, accompanied by the percentage consumed and a burn-rate explanation ("Quedan ~N días al ritmo actual · media 7d € X / día").

#### Scenario: warn tier at 70 % renders amber badge + 13-day runway
- **WHEN** the widget receives `{ tier: 'warn', pctConsumed: 0.70, daysUntilEmpty: 13, avg7dDaily: 2.73 }`
- **THEN** the rendered DOM contains a `BadgeChip` with text `"Warn · 70 %"` and a sub-line `"Quedan ~13 días al ritmo actual · media 7d € 2,73 / día"`

#### Scenario: fatal tier at 100 % renders red badge + 0-day runway
- **WHEN** the widget receives `{ tier: 'fatal', pctConsumed: 1.00, daysUntilEmpty: 0, ... }`
- **THEN** the rendered DOM contains a `BadgeChip` with variant `fatal` (red `--destructive` border + foreground)

#### Scenario: null budget renders "Sin presupuesto configurado" copy
- **WHEN** the widget receives `{ tier: null, monthlyBudgetEur: null, ... }`
- **THEN** the headline is "Sin presupuesto configurado" with a link to `/owner-settings#ai-budget`

### Requirement: UsageHeatmapWidget renders 7×24 OKLCH-stepped grid

The `UsageHeatmapWidget` SHALL render a 7-row × 24-column grid where each cell's background is one of 6 OKLCH lightness steps (`--heat-0` … `--heat-5`) mapped from the call count. Cells SHALL be keyboard-navigable buttons with `aria-label` disclosing day + hour + count.

#### Scenario: Friday 09:00 with 142 calls renders as --heat-5
- **WHEN** the widget receives a cell `{ day: 4, hour: 9, count: 142, max: 150 }`
- **THEN** that cell's `background` resolves to `var(--heat-5)`

#### Scenario: cell aria-label discloses day + hour + count
- **WHEN** the widget renders the Friday 09:00 cell
- **THEN** the cell's `aria-label` equals `"Viernes 09h: 142 llamadas (pico de uso)"`

#### Scenario: Sunday 03:00 with 0 calls renders as --heat-0
- **WHEN** the widget receives a cell `{ day: 6, hour: 3, count: 0, max: 150 }`
- **THEN** that cell's `background` resolves to `var(--heat-0)`

#### Scenario: keyboard arrow navigation moves focus across cells
- **GIVEN** focus is on the Monday 09:00 cell
- **WHEN** the user presses `ArrowRight`
- **THEN** focus moves to the Monday 10:00 cell (verified via document.activeElement)

### Requirement: Top5FailuresWidget renders P1/P2/P3 severity coding + deep-link

The `Top5FailuresWidget` SHALL render 5 failure rows ordered by count descending, each with a `<BadgeChip>` (P1/P2/P3 variant), the event title, the count, the last-occurrence relative time, and a "Ver eventos →" link to `/audit-log?eventType=<X>&since=<...>`.

#### Scenario: P1 row has destructive-bordered card + red BadgeChip
- **WHEN** the widget receives a row `{ severity: 'P1', eventType: 'VISION_LLM_CALL_FAILED', count: 14, lastOccurredAt: ... }`
- **THEN** the row has `border-left: 3px solid var(--destructive)` and contains a `BadgeChip` with text `"P1"` and red colour

#### Scenario: P3 row has muted border + muted BadgeChip
- **WHEN** the widget receives `{ severity: 'P3', eventType: 'OTLP_EXPORTER_503', count: 3, ... }`
- **THEN** the row has `border-left: 3px solid var(--mute)`

#### Scenario: Ver eventos link deep-links to filtered audit-log
- **WHEN** a P1 row renders
- **THEN** the link's `href` is `/audit-log?eventType=VISION_LLM_CALL_FAILED&since=<24h-ago-iso>`

#### Scenario: empty failures renders an empty-state card
- **WHEN** the widget receives `{ failures: [] }`
- **THEN** the rendered DOM contains the `<EmptyStateCard>` copy "Sin fallos en el rango seleccionado"

### Requirement: Anomaly chip + Savings opp card + Blast radius card + OTLP banner render from overview payload

The 4 chrome elements (`AnomalyChip`, `SavingsOppCard`, `BlastRadiusCard`, `OtlpBanner`) SHALL render from the `overview` endpoint payload (no additional fetch). Anomaly + savings render conditionally; blast-radius + OTLP banner always render.

#### Scenario: anomaly chip renders when overview.anomalies is non-empty
- **WHEN** the overview payload carries `anomalies: [{ subject: 'inventory.ingest-invoice-photo', multiplier: 3.2, baseline: '7d avg', detail: '...', detectedAt: ... }]`
- **THEN** the chip renders the headline "Coste de inventory.ingest-invoice-photo 3,2× sobre media 7d"

#### Scenario: anomaly chip suppressed when overview.anomalies is empty
- **WHEN** the overview payload carries `anomalies: []`
- **THEN** the chip is not in the DOM

#### Scenario: blast radius card lists model dependencies
- **WHEN** the overview carries `blastRadius: [{ model: 'gpt-oss-vision-72b', criticality: 'critical', trafficPct: 0.57, dependents: ['inventory.ingest-invoice-photo','inventory.ingest-product-photo'], fallback: '...' }, ...]`
- **THEN** four model cards render with `criticality`-coded `border-left` colour

#### Scenario: OTLP banner renders active exporter endpoint
- **WHEN** the overview carries `otlpExporter: { endpoint: 'langfuse.nexandro.local', status: 'active' }`
- **THEN** the banner renders "Exporter activo → langfuse.nexandro.local" with links to `/owner-settings#otlp`

### Requirement: Every widget renders a "last refreshed N min ago" footer + manual refresh button

Every widget SHALL render a small footer with the freshness badge (computed from the TanStack Query `dataUpdatedAt`) and a manual refresh button. Clicking the button SHALL invalidate that endpoint's cache entry and force a re-fetch.

#### Scenario: freshness badge shows "Actualizado hace 0 min" right after fetch
- **GIVEN** a query just resolved at the current clock tick
- **THEN** the widget footer reads "Actualizado hace 0 min"

#### Scenario: freshness badge shows "Actualizado hace 2 min" after 2 minutes
- **GIVEN** a query resolved 2 minutes ago
- **THEN** the widget footer reads "Actualizado hace 2 min"

#### Scenario: manual refresh button forces a re-fetch
- **GIVEN** the user clicks the refresh button on `ErrorRateWidget`
- **THEN** `queryClient.invalidateQueries({ queryKey: ['ai-obs','overview', ...] })` is called AND a fresh `GET /m3/ai-obs/overview` request fires
