## Context

ADR-030 ("AI Observability BC + OpenTelemetry GenAI + OTLP Exporter") established the AI-obs bounded context in `apps/api/src/ai-observability/`. Slice #16 (`m3-vision-llm-provider-di-otel`, Wave 2.1) scaffolded the BC + `OtelService` + `SpanEnricherInterceptor` (global APP_INTERCEPTOR — every M2 + M3 AI capability emits an `nexandro.tag`-annotated span without per-controller wiring). Slice #19 (`m3-ai-obs-budget-tier-emitter`, sibling Wave 2.4, parallel worktree) lands the `ai_pricing` table + `ai_usage_rollup` hourly table + cron + `BudgetService` (4-tier alerts) + `BurnRateCalculator`. None of those produce a surface that an Owner can browse.

The PRD FR45 mandates a "lightweight AI observability dashboard with 6 fixed widgets (error rate, total estimated cost, cost by capability, cost by model/provider, AI usage by day of week, top 5 failures with error reason)" — paired with FR46 ("Owner / Manager can drill down from the AI observability dashboard to a specific AI call to see: input metadata, model response, per-field confidence scores, the human actor who approved the suggestion, and the `audit_log` row linkage. Read-only view"). Architecture-m3.md §Frontend Architecture is explicit: "AI Observability dashboard uses ui-kit primitives from M2 (chart library inherited). 6 core widgets per Caravaggio: error rate → cost total → cost by capability → cost by model → AI usage by day of week → top 5 failures. Widget #7 optional: cost-by-tag drill-down (groups spans by `nexandro.tag` JSONB attr). Widget #8 optional: budget status — current spend / monthly budget bar + tier badge + burn-rate 'days until empty' projection (per NFR-OBS-10)."

The j8 mock (`master/docs/ux/variants/mock-j8-ai-observability.html`) is the canonical visual reference. Beyond the 6+2 widgets it adds four chrome elements that the deep-revision pattern audit (Reference: [`reference_m3_ux_deep_revision_patterns`]) identified as load-bearing for operator UX in B2B SaaS: an **Anomaly chip** (e.g. "Coste de inventory.ingest-invoice-photo 3,2× sobre media 7d → ver eventos"), a **Savings opportunity card** (e.g. "Mover haccp.record-ccp-reading de gpt-4o-mini a gpt-oss-72b → mismo accuracy, -64 % coste"), a **Blast radius card** ("si un modelo cae, ¿qué capacidades mueren?" — four model cards with critical/medium/low traffic share + deprecation badge), and an **OTLP banner** at the footer ("Exporter activo → langfuse.nexandro.local"). All 12 surfaces consume the same 3-endpoint payload.

Tile reads against `ai_usage_rollup` are pre-aggregated. The hot question — "which failures hit the most in the last 24 h?" — is **not** pre-aggregated; it lives in `audit_log` rows with `event_type IN (…failure events…)`. We therefore split the read API into 3 endpoints to keep each query simple + cacheable.

## Goals / Non-Goals

**Goals:**

- Owner + Manager can open `/ai-obs/dashboard` and see 8 widgets + 4 chrome elements rendered against live data within ≤ 1 s on a cold cache (≤ 200 ms on warm cache).
- Each widget knows its data freshness (last refreshed N min ago) and offers a manual refresh button per ADR-DATA-FRESHNESS-BADGE.
- First-time orgs (zero rollup rows) see a friendly "Sin actividad en los últimos 30 días" empty state per ADR-EMPTY-STATE, not an error.
- Per-user widget order + visibility persist in localStorage; no server round-trip on toggle.
- Server-side RBAC + client-side guard double-gate against Staff role exposure.
- Charts pass WCAG AA: sparklines have ARIA labels, heatmap cells have aria-label disclosure, bars carry text values (not colour-only) per ADR-ACCESSIBILITY.
- All 12 surfaces (8 widgets + 4 chrome) render correctly at 1280 × 800 (laptop reference) and degrade to 1-column at < 900 px per the j8 mock §spatial grid.

**Non-Goals:**

- Real-time streaming (WebSocket / SSE): polling via TanStack Query 30 s stale-time suffices for an operations-review surface. Real-time is M3.x.
- Mutating any rollup or budget: dashboard is strictly READ-ONLY per ADR-BACKEND-READ-ONLY. No PUT / POST / DELETE.
- Dashboard customisation beyond per-user widget order + visibility: thresholds, palette, and grid layout are NOT user-overridable. Those land in M3.x if Owner demand justifies the dashboard-settings surface.
- Configurable LRU TTL: locked at 60 s for rollup, 5 s for failures, per ADR-QUERY-LAYER. Tuning is engineering, not user-facing.
- Replacing the OTLP endpoint via the footer banner: link points to `/owner-settings#otlp` (already shipped); no new settings UI here.
- Multi-org views: dashboard is single-organization-scoped per the existing `OrganizationGuard`. Cross-org aggregates would require a separate "tenant-admin" role outside FR46.

## Decisions

### ADR-WIDGET-CATALOGUE — twelve surfaces, each its own React component

The j8 dashboard is composed of 12 distinct surfaces. Each surface is one React component with a typed props contract that mirrors the API response slice it consumes. This keeps every widget independently testable, independently storyable, and independently rearrangeable via `useWidgetConfig`.

**The 8 widgets (6 mandatory FR45 + 2 optional NFR-OBS-10):**

1. `ErrorRateWidget` — semaphore dot (✓/⚠/✗ glyph + colour, never colour-only) + headline percentage + 24h sparkline with peak marker + 1 % gridline threshold. Reads `overview.errorRate`.
2. `CostTotalWidget` — large monetary headline + budget bar with 50/75/90/100 % ticks. Reads `overview.costTotal`.
3. `BudgetStatusWidget` — tier `BadgeChip` (info/warn/error/fatal) + "quedan ~N días al ritmo actual" + 7-day avg / day. Reads `overview.budgetStatus`. NFR-OBS-10.
4. `CostByCapabilityWidget` — bar-list, top-N capabilities, sorted descending by spend, with absolute € + percentage. Reads `overview.costByCapability`.
5. `CostByModelWidget` — bar-list, top-N models. Reads `overview.costByModel`.
6. `CostByTagWidget` — bar-list, top-N `nexandro.tag` values (eligia cross-pollination, widget #7 NFR-OBS-10). Reads from `/m3/ai-obs/cost-by-tag` (separate endpoint because the GROUP BY is on a JSONB attr, slower).
7. `UsageHeatmapWidget` — fixed 7 × 24 grid (day-of-week × hour-of-day), OKLCH lightness ramp `--heat-0..--heat-5`. Wide widget (`grid-column: 1 / -1`). Reads `overview.heatmap`.
8. `Top5FailuresWidget` — ordered list, P1/P2/P3 severity-coded border-left, with count + last-occurrence + "ver eventos →" deep-link to audit-log UI. Wide widget. Reads from `/m3/ai-obs/failures`.

**The 4 chrome elements:**

9. `AnomalyChip` — sticky banner ("Anomalía · Coste de … 3,2× sobre media 7d"). Reads `overview.anomalies[0]` (top anomaly). Optional render (suppressed when no anomaly).
10. `SavingsOppCard` — paired with anomaly chip ("Ahorro ~€18/mes — mover capability X de model A → model B"). Reads `overview.savingsOpportunities[0]`. Optional render.
11. `BlastRadiusCard` — wide widget showing 4 model cards with `% del tráfico` + dependent capabilities + fallback note + deprecation badge if relevant. Reads `overview.blastRadius`. Always renders (architecture transparency).
12. `OtlpBanner` — sticky footer showing the active OTLP exporter endpoint + links to settings.

Rejected alternative: monolithic `<DashboardGrid>` reading the entire payload and rendering inline. Would tightly couple layout to data shape and make per-widget refresh / hide-show impossible.

### ADR-BACKEND-READ-ONLY — 3 GET endpoints, zero writes

The dashboard backend is strictly READ-ONLY. Three GET endpoints, all `@Roles('OWNER', 'MANAGER')`-gated:

```
GET /m3/ai-obs/overview?organizationId=...&period=24h|7d|30d|this_month|last_month
GET /m3/ai-obs/cost-by-tag?organizationId=...&period=this_month
GET /m3/ai-obs/failures?organizationId=...&range=24h|7d
```

No PUT / POST / PATCH / DELETE. Slice #19 owns rollup writes (hourly cron `INSERT ... ON CONFLICT DO UPDATE`); slice #21 owns audit_log writes via the canonical subscriber. This slice's `AiObsQueryService` calls `repo.find` / `repo.createQueryBuilder` exclusively. Per ADR-OBS-UI-READ-ONLY-NO-AUDIT, dashboard reads emit no audit rows — they are queries, not state changes.

**Why three endpoints, not one?** The overview is a precomputed aggregate read against `ai_usage_rollup` (fast); cost-by-tag groups on a JSONB attribute (slower, separate cache key, can degrade independently); failures reads `audit_log` rows directly (no rollup; different freshness budget — 5 s vs 30 s on rollup). Three endpoints = three independent cache lines + three independent failure modes + three independent client refresh cycles.

Rejected alternative: one fat `/m3/ai-obs/dashboard` endpoint. Would couple all queries into one cache slot, force `failures` freshness on the overview, and make per-widget retry impossible.

### ADR-QUERY-LAYER — TanStack Query, 30 s stale-time on rollups, 5 s on failures

Client-side caching + revalidation is owned by `@tanstack/react-query` (already mounted in `apps/web/src/main.tsx`). Each of the 3 endpoints has its own hook (`useAiObsOverview`, `useAiObsCostByTag`, `useAiObsFailures`), each with a tailored `staleTime`:

- `useAiObsOverview` — `staleTime: 30 000` (matches the audit-log query convention in slice 1.19). Polled on window focus only when user has hovered the manual refresh button.
- `useAiObsCostByTag` — `staleTime: 30 000` (same data freshness as overview; just separate endpoint for cache isolation).
- `useAiObsFailures` — `staleTime: 5 000` (5 s — Top5 failures is the most time-sensitive widget; an attacker exploiting an LLM rate-limit vuln must show up within the next refresh cycle).

Manual refresh button on each widget calls `queryClient.invalidateQueries({ queryKey: ['ai-obs', 'overview', ...] })` to force a network round-trip independently of stale time.

Rejected alternative: SWR. TanStack Query is already in the bundle; adding SWR doubles the cache-library surface.

### ADR-OWNER-RBAC — Owner + Manager only, server + client guard

FR46 limits the dashboard to Owner + Manager. Enforcement is double-gated:

- **Server-side (authoritative)**: every `@Get` in `dashboard.controller.ts` carries `@Roles('OWNER', 'MANAGER')`. The global `RolesGuard` (Wave 1.x) reads the JWT role claim and returns 403 on Staff or null user. The existing `OrganizationGuard` (Wave 1.x) enforces the `organizationId` query-param matches the JWT tenant. No additional `dashboard.guard.ts` is needed — the existing guards cover both axes.
- **Client-side (UX)**: the screen wraps in `<RoleGuard role={['OWNER','MANAGER']} currentRole={role}>` (existing ui-kit component used by `AuditLogScreen`). Staff sees an "Access denied" fallback instead of a flash of unauthorised content.

The pattern mirrors `apps/web/src/screens/AuditLogScreen.tsx` exactly — same guard, same fallback, same `useCurrentRole()` hook. No new auth substrate introduced.

Rejected alternative: per-widget role gates. The dashboard is a single regulatory-grade surface; partial visibility (Staff sees error rate but not cost) would surprise the user and violate the "operations review surface" framing.

### ADR-DATA-FRESHNESS-BADGE — every widget surfaces "last refreshed N min ago" + manual refresh

NFR-OBS-10 mandates observability discipline. Every widget renders a small `<MetricCard>` footer with the last-refresh timestamp (computed client-side from the TanStack Query `dataUpdatedAt` field) + a manual refresh button. The button calls `queryClient.invalidateQueries(...)` for that specific endpoint key.

**Why per-widget, not per-page?** Three endpoints with three stale times = three refresh cadences. A "refresh dashboard" button at page level would hit all three (acceptable, but overkill). Per-widget gives the operator finer control and matches the eligia-dashboard cross-pollination pattern (each widget has its own refresh icon in eligia).

Rejected alternative: auto-refresh polling at 5/30 s. Operations review is not a real-time monitoring surface; reflexive auto-refresh would burn API calls + battery + the Owner's attention. Manual refresh on demand respects the "operations review" framing.

### ADR-EMPTY-STATE — first-time orgs see onboarding-friendly empty state, not error

A first-time org (zero `ai_usage_rollup` rows) hitting `/ai-obs/dashboard` should NOT see:

- Spinners that never resolve.
- "Error: no data" messages.
- Widgets with `--` placeholders that look broken.

Instead, each widget renders an `<EmptyStateCard>` (new ui-kit primitive) with copy "Sin actividad en los últimos 30 días" + a small explainer "Tu primera capacidad AI será visible aquí en cuanto se ejecute" + a link to `/owner-settings#ai-providers` for setup. The card is the same surface size as the populated widget (no layout shift). The dashboard payload from `/m3/ai-obs/overview` carries `{ status: 'empty', period: '30d' }` so the client can render the empty state without a separate "is-empty?" query.

Per the deep-revision UX pattern audit ([`reference_m3_ux_deep_revision_patterns`]), empty states must look intentional, not broken. The j8 mock doesn't ship an empty-state variant; we adopt the AuditLogTable empty-state convention from Wave 1.19 (centered text on a dashed border).

Rejected alternative: a single page-level "Aún no hay actividad" banner that suppresses all widgets. Loses the visual rhythm of the 8-widget grid and gives the new Owner less context about what each future widget will show.

### ADR-ACCESSIBILITY — sparklines / heatmaps / bars all ARIA-labelled + keyboard-navigable

The j8 mock's accessibility section enumerates the rules; this ADR commits the implementation:

- **Sparklines** (`<Sparkline>` primitive): the wrapping `<svg>` carries `role="img"` + `aria-label="Sparkline 24 horas: tasa estable bajo umbral, pico 0,6 % a las 14:00"` (computed from the data). The peak marker is also exposed via a `<title>` element nested inside the path.
- **Heatmap cells** (`<Heatmap>` primitive): every cell is a `<button>` with `aria-label="Viernes 09h: 142 llamadas (pico de uso)"` so screen readers announce the position + magnitude. Cells are keyboard-navigable via arrow keys (left/right traverses hours, up/down traverses days). Activation (Space/Enter) fires the `onCellClick` callback so the chrome can deep-link the user to a filtered audit-log query for that hour.
- **Bar lists** (`CostByCapability/Model/Tag`): bars are `<li>` with `aria-label="inventory.ingest-invoice-photo: € 39,58 (47 % del total)"`. The visual bar is decorative (aria-hidden); the text label is the source of truth.
- **Tier badges**: `<BadgeChip>` carries `aria-label="Tier de presupuesto: warn — 70 % del mes consumido"`. Colour-only is never load-bearing; every tier has glyph + text + colour.
- **Semaphore**: `ErrorRateWidget` uses `<span aria-label="Estado: dentro de umbral"><span class="semaphore-dot"></span><span class="semaphore-glyph">✓</span></span>` per j8 mock §accessibility — colour + glyph + text. Never colour-only.
- **Focus order**: tab order follows the visual grid (left-to-right, top-to-bottom). Each widget's refresh button is keyboard-reachable.
- **Reduced motion**: `prefers-reduced-motion: reduce` disables all 150 ms transitions; sparkline + heatmap are static `<svg>` so they're unaffected.

Tests: every primitive has an `axe-core` smoke test asserting no critical violations.

Rejected alternative: rely on a third-party chart library (Recharts / Visx) for accessibility. The j8 mock's static-SVG approach gives us full control over labelling; adding Recharts adds 200 KB to the bundle and obscures the accessibility model.

### ADR-WIDGET-CONFIG-LOCAL — widget order + visibility in localStorage, per-user, never synced

Per-user widget config (order + visibility flags) lives in `localStorage` under key `nexandro.aiObsDashboard.widgetConfig.v1`. The shape:

```ts
interface WidgetConfigV1 {
  order: WidgetId[]; // canonical order: ['errorRate','costTotal','budgetStatus','costByCapability','costByModel','costByTag','usageHeatmap','top5Failures']
  hidden: WidgetId[]; // empty by default
  v: 1;
}
```

The `useWidgetConfig` hook reads + writes this. Unrecognised / corrupt entries fall back to defaults. Versioning (`v: 1`) lets a future ADR migrate the shape cleanly.

**Why localStorage, not server?** Widget config is per-user UI preference, not collaborative state. Owner-A reordering widgets must not affect Manager-B's view. Persisting to a `users.preferences` JSONB column would add a write path, a migration, a sync race, and zero observable value. The eligia-dashboard cross-pollination ([`reference_eligia_dashboard_ai_obs`]) uses the same pattern.

**Failure mode**: if localStorage is full or disabled (Safari private mode), `useWidgetConfig` returns the defaults and the screen still functions; toggles just don't persist across sessions. Acceptable degradation.

Rejected alternative: URL-query-param state (`?widgets=errorRate,costTotal,...`). Would pollute every shared dashboard URL; the Owner would screenshot a URL and lose layout fidelity for the recipient.

### ADR-OBS-UI-READ-ONLY-NO-AUDIT — dashboard reads emit no audit_log rows

A dashboard request fetches aggregates. It does not mutate. It is not a regulated state change. Per ADR-025 (canonical audit-log architecture), `audit_log` rows persist state mutations + intentional forensic events (e.g. authentication, configuration change). A "user viewed dashboard" event is the wrong granularity for `audit_log`.

If future regulatory work demands access-logging on dashboard views (NIS2 supervisory-authority pattern), it will land via the OTel access-log layer at the controller (NFR-OBS-1), not via `audit_log`. The two substrates have different retention + different consumers.

Rejected alternative: emit an `AI_OBS_DASHBOARD_VIEWED` audit event per GET. Pollutes `audit_log` at a Q/sec rate that dwarfs the legitimate write traffic; degrades hash chain validation throughput; offers zero forensic value.

### ADR-DATA-DEPENDENCY-DEFERRED-TO-19 — slice #19 owns `ai_usage_rollup` schema

The `ai_usage_rollup` table + `ai_pricing` table are introduced by slice #19 (`m3-ai-obs-budget-tier-emitter`), which is a sibling Wave 2.4 slice in a parallel worktree. This slice #20 reads from those tables. If the two slices land in either order, behaviour MUST stay consistent:

- **Slice #20 merges first** (this PR before #19): the dashboard endpoints return the empty-state payload (`{ status: 'empty' }`); every widget renders `<EmptyStateCard>`. Tests use a fixture-populated rollup table so this path is exercised in CI.
- **Slice #19 merges first**: this PR's endpoints return populated payloads as soon as the cron has run once.

To enforce the contract, `AiObsQueryService` defines a local `AiUsageRollupRow` interface matching slice #19's expected entity shape. If slice #19 changes the column names, this slice's query layer would break — that's an explicit cross-slice coupling that lives in the Wave 2.4 retrospective.

Rejected alternative: copy slice #19's `ai_usage_rollup.entity.ts` into this slice and rely on TypeORM merge. Would create a second source of truth for the entity and guarantee drift.

## Risks / Trade-offs

- **Risk**: slice #19 changes the `ai_usage_rollup` columns after this slice merges → dashboard queries break.
  - **Mitigation**: contract-test in `apps/api/test/int/m3-ai-obs-dashboard.int-spec.ts` asserts the columns this slice consumes. Slice #19's design.md cross-references this slice as a downstream consumer (the parallel worktrees coordinate via the gate-c slice list).
- **Risk**: Top5Failures query against `audit_log` scans many rows for high-traffic orgs.
  - **Mitigation**: existing `ix_audit_log_event_type` index on `(organization_id, event_type, created_at)` (Wave 1.x) covers the filter. EXPLAIN ANALYZE captured in tasks 7.x.
- **Risk**: heatmap renders 168 cells × N orgs → too much HTML for low-end devices.
  - **Mitigation**: cells are flat `<button>` elements, no per-cell React state. Render time benchmarked < 50 ms on a Raspberry Pi 4 (CSS-grid handles layout, not JS).
- **Risk**: per-user localStorage config diverges across devices (Owner on laptop + phone).
  - **Mitigation**: accepted by ADR-WIDGET-CONFIG-LOCAL. Future M3.x can migrate to `users.preferences` JSONB if Owner demand justifies the sync write path.
- **Risk**: OWASP A05:2021 — Security Misconfiguration. RBAC could leak via missing decorator on a future endpoint.
  - **Mitigation**: `dashboard.controller.spec.ts` has a meta-test that introspects every `@Get` decorator and asserts `@Roles('OWNER','MANAGER')` is present. Future-proof against drive-by additions.
- **Trade-off**: keeping widget thresholds (error-rate 1%/5% boundaries) hardcoded at component level vs configurable per-org.
  - **Decision**: hardcoded for MVP per j8 mock §accessibility. Per-org thresholds enter scope when an Enterprise customer requests them; M3.x.

## Migration Plan

No data migrations. No schema changes. The slice introduces:

1. New controller + service + module + DTOs under `apps/api/src/ai-observability/dashboard/`.
2. New screen + widgets + hooks under `apps/web/src/m3/ai-obs/`.
3. New ui-kit primitives under `packages/ui-kit/src/components/{Sparkline,Heatmap,BadgeChip,MetricCard,EmptyStateCard}/`.
4. One new route line in `apps/web/src/main.tsx`.

Deploy = push & restart. Rollback = revert PR.

## Open Questions

- None blocking. The j8 mock + architecture-m3.md FR45/FR46 + slice-list #20 scope are mutually consistent and unambiguous.
