## Why

Slice #19 `m3-ai-obs-budget-tier-emitter` (Wave 2.4 sibling, parallel worktree) builds the **producer side** of M3 AI observability: it lands the `ai_usage_rollup` hourly table, the `ai_pricing` historical table, the `BudgetService` tier system (`info`/`warn`/`error`/`fatal`) with `BurnRateCalculator`, and the `AI_BUDGET_TIER_CROSSED` audit event. None of that is visible to Owner/Manager — there is no surface in `apps/web/` that lets a non-engineer ask the question "are we under budget? what's our error rate? which model burns the most cash?".

This slice (#20) ships the **consumer side**: a read-only `/ai/observability` route that renders the j8 mock as 8 production widgets + 4 chrome elements, backed by 3 GET endpoints aggregating slice #19's `ai_usage_rollup` rows + slice #21's hash-chained `audit_log` rows. FR45 (6-widget dashboard) + FR46 (drill-down from widget → individual call) close out at end of this slice. The j8 mock at `master/docs/ux/variants/mock-j8-ai-observability.html` is the canonical reference: ErrorRateWidget with sparkline + 1% threshold, CostTotalWidget with budget bar + ticks, BudgetStatusWidget with tier badge + burn-rate copy, three bar-list widgets (CostByCapability / CostByModel / CostByTag), wide UsageByDayHeatmap (7 × 24), wide Top5FailuresWidget with P1/P2/P3 severity coding, plus an anomaly chip, a savings opportunity card, a blast-radius card, and a sticky OTLP-status footer banner.

This slice is **UI-heavy + backend READ-ONLY**. We never write to `ai_usage_rollup` or `audit_log` — slice #19 owns the rollup writes, slice #21 owns audit writes, and slice #20 reads aggregates from both. No new migrations. No mutating endpoints. RBAC enforced server-side (`@Roles('OWNER', 'MANAGER')`) and mirrored client-side (`<RoleGuard>`); Staff sees 403. Per-user widget order + visibility persist in `localStorage` (preference, not collaborative state).

## What Changes

- **`apps/api/src/ai-observability/dashboard/dashboard.controller.ts`** — new NestJS controller with three `@Get` endpoints, each `@Roles('OWNER', 'MANAGER')`-gated:
  - `GET /m3/ai-obs/overview?period=24h|7d|30d|this_month|last_month&organizationId=...` — returns the 6-core widgets in one payload (errorRate + sparkline series, costTotal + budget context, budgetStatus tier+burn rate, costByCapability top-N, costByModel top-N, usageHeatmap 7×24 cell matrix).
  - `GET /m3/ai-obs/cost-by-tag?period=...&organizationId=...` — widget #7 (eligia cross-pollination); top-N tags + their share of spend.
  - `GET /m3/ai-obs/failures?range=24h|7d&organizationId=...` — Top 5 failures + severity classification (P1/P2/P3) + last-occurrence timestamp + suggested next step.
- **`apps/api/src/ai-observability/dashboard/ai-obs-query.service.ts`** — pure read-side service over slice #19's `ai_usage_rollup` table + slice #21's `audit_log` (filtered to `event_type IN ('VISION_LLM_CALL_FAILED', 'PRICING_ROW_NOT_FOUND', 'OTLP_EXPORTER_503', 'CONFIDENCE_BAND_AMBIGUOUS', 'RATE_LIMIT_HIT')`). Always scoped by `organizationId`. Cache reads through the LRU layer registered by slice #19 (TTL 60 s).
- **`apps/api/src/ai-observability/dashboard/dashboard.module.ts`** — wires the controller + service into `AiObservabilityModule`.
- **`apps/api/src/ai-observability/dashboard/dto/ai-obs.dto.ts`** — Zod schemas + inferred types for the three response shapes. NO `@nexandro/contracts` import per Wave 2.1+ hard rule; types stay inline at the controller boundary.
- **`apps/api/src/ai-observability/dashboard/rbac.guard.ts`** — local guard composition that piggy-backs the existing `RolesGuard`; no new auth substrate.
- **`apps/web/src/m3/ai-obs/AiObsDashboardScreen.tsx`** — new page mounted at `/ai-obs/dashboard` (route added in `apps/web/src/main.tsx`). Composes 8 widgets + 4 chrome elements in a 3-column grid per j8 mock §spatial. Wraps in `<RoleGuard role={['OWNER','MANAGER']}>`.
- **`apps/web/src/m3/ai-obs/widgets/`** — 8 widget files (`ErrorRateWidget.tsx`, `CostTotalWidget.tsx`, `BudgetStatusWidget.tsx`, `CostByCapabilityWidget.tsx`, `CostByModelWidget.tsx`, `CostByTagWidget.tsx`, `UsageHeatmapWidget.tsx`, `Top5FailuresWidget.tsx`) + 4 chrome (`AnomalyChip.tsx`, `SavingsOppCard.tsx`, `BlastRadiusCard.tsx`, `OtlpBanner.tsx`).
- **`apps/web/src/m3/ai-obs/hooks/`** — three TanStack Query hooks (`useAiObsOverview.ts`, `useAiObsCostByTag.ts`, `useAiObsFailures.ts`) plus `useWidgetConfig.ts` (localStorage-backed order/visibility per-user preference).
- **`apps/web/src/m3/ai-obs/api/aiObs.ts`** — fetch wrappers + applied-filter types.
- **`packages/ui-kit/src/components/Sparkline/`** — minimal `<svg>` line chart with peak marker + threshold gridline; consumed by `ErrorRateWidget`.
- **`packages/ui-kit/src/components/Heatmap/`** — fixed-grid 7×24 (or N×M) heatmap with OKLCH lightness ramp; consumed by `UsageHeatmapWidget`.
- **`packages/ui-kit/src/components/BadgeChip/`** — small pill badge (info/warn/error/fatal/p1/p2/p3 variants); consumed by `BudgetStatusWidget`, `Top5FailuresWidget`, `AnomalyChip`.
- **`packages/ui-kit/src/components/MetricCard/`** — bordered surface panel with eyebrow + headline + sub-copy + optional last-refreshed footer; consumed by every widget.
- **`packages/ui-kit/src/components/EmptyStateCard/`** — onboarding-friendly empty state ("Activity in last 30 days: 0"); consumed by every widget when the rollup is empty for first-time orgs.
- **BREAKING**: none. New routes + endpoints; no schema changes. RBAC mirrors existing M2 audit-log RBAC. Wave 1.19 audit-log UI stays untouched.

## Capabilities

### New Capabilities

- `ai-obs-ui`: Owner+Manager browse-only dashboard at `/ai-obs/dashboard` rendering j8 with 8 widgets + 4 chrome elements; per-user localStorage-backed widget config; data-freshness badge per widget per ADR-DATA-FRESHNESS-BADGE; empty-state UX for first-time orgs per ADR-EMPTY-STATE.
- `ai-obs-read-api`: 3 GET endpoints (`/m3/ai-obs/overview`, `/m3/ai-obs/cost-by-tag`, `/m3/ai-obs/failures`) backed by `ai-obs-query.service.ts` reading slice #19's `ai_usage_rollup` + slice #21's `audit_log`. RBAC `@Roles('OWNER','MANAGER')`; multi-tenant scoping enforced via existing `OrganizationGuard`.

### Modified Capabilities

- `ai-observability` (module): extends the BC scaffold from slice #16 (`m3-vision-llm-provider-di-otel`) with a `dashboard/` subdirectory. The module already imports `SharedVisionLlmModule`; this slice adds `DashboardController` + `AiObsQueryService` providers. Slice #19's `RollupModule` + `BudgetModule` are sibling imports (the parallel worktree lands them in `rollup/` + `budget/` — same module — when both PRs merge).

## Impact

- **Prerequisites**: master at `d596868` (Wave 2.3 merged); slice #19 (`m3-ai-obs-budget-tier-emitter`, sibling Wave 2.4) provides the `ai_usage_rollup` table + `BudgetService`. We code defensively: read-side queries assume slice #19 has landed; if not, the response is the empty-state payload (zero rows, all widgets render `<EmptyStateCard>`). No file collisions: slice #19 writes to `apps/api/src/ai-observability/rollup/` + `budget/`; this slice writes to `apps/api/src/ai-observability/dashboard/`. Disjoint from #18 (`apps/api/src/photo-storage/`).
- **Code**:
  - `apps/api/src/ai-observability/dashboard/` — new module (~450 LOC application + ~280 LOC tests).
  - `apps/web/src/m3/ai-obs/` — new screen + 12 widget components + 4 hooks (~900 LOC + ~350 LOC tests).
  - `packages/ui-kit/src/components/` — 5 new primitives (Sparkline, Heatmap, BadgeChip, MetricCard, EmptyStateCard) with Storybook stories (~600 LOC + ~250 LOC tests).
  - `apps/web/src/main.tsx` — one new route entry.
- **Performance**:
  - Dashboard payload size ≤ 50 KB (verified: 6 widgets × N=10 top-N + heatmap 7×24 cell matrix ≤ 168 numeric cells).
  - Backend response p95 ≤ 200 ms thanks to LRU cache hit (60 s TTL); cold p95 ≤ 800 ms because the rollup pre-aggregates.
  - Client uses TanStack Query with `staleTime: 30 000` on the overview, `staleTime: 5 000` on the failure stream (more time-sensitive). Manual refresh button on each widget forces revalidation.
- **Storage growth**: none — read-only.
- **Audit**: dashboard reads emit no audit rows (it's a query path, not a state change). Per ADR-OBS-UI-READ-ONLY-NO-AUDIT.
- **Rollback**:
  - Remove `dashboard/` directory + the route entry from `main.tsx`. No data migration to revert.
  - `packages/ui-kit/` additions are pure-new; nothing references them outside this slice.
- **Out of scope** (claimed by other slices or future follow-ups):
  - Real-time WebSocket streaming of dashboard data → M3.x performance follow-up (TanStack Query polling suffices for MVP).
  - Configurable widget thresholds (error-rate green/amber/red boundaries) → hardcoded for MVP per j8 mock §accessibility; user-overridable thresholds = M3.x.
  - Drill-down deep-link from `failure-row → audit_log/?eventType=X&since=...` → links rendered as `<a href>` but full deep-link wiring is part of the Wave 1.19 audit-log UI already; we just emit the right URL.
  - OTLP endpoint re-configuration via the dashboard ("Cambiar endpoint" link) → footer rendered but link is to `/owner-settings#otlp` (already shipped in slice #M1.5 owner settings); no new settings UI here.
- **Parallelism**: file-path scope = `apps/api/src/ai-observability/dashboard/**`, `apps/web/src/m3/ai-obs/**`, `packages/ui-kit/src/components/{Sparkline,Heatmap,BadgeChip,MetricCard,EmptyStateCard}/**`, plus one route line in `apps/web/src/main.tsx`. Verified disjoint from siblings:
  - Slice #18 `m3-photo-storage-lifecycle` writes to `apps/api/src/photo-storage/` — disjoint.
  - Slice #19 `m3-ai-obs-budget-tier-emitter` writes to `apps/api/src/ai-observability/{rollup,budget}/` — disjoint.
  - Wave 2.3 slice #21 (already merged) wrote to `apps/api/src/audit-log/` + migrations 0023/0024 — disjoint.
- **Effort estimate**: L (~1 800 LOC implementation + ~880 LOC tests; matches gate-c slice list "L" sizing for UI-heavy slices).
