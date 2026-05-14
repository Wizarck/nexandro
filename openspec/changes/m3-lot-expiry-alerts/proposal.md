## Why

FR8 (prd-m3.md line 533): *"System can flag `Lot`s within a configurable proximity of expiry (default 7 days) and surface them to the relevant role."* The PRD §Strategic Differentiators line 103 makes the same promise customer-facing: *"An agent can answer 'which lots are 7+ days from expiry and not yet committed to a sale?'"*. Architecture-m3.md §Functional Coverage line 64 anchors this to the lot lifecycle BC: *"Lot lifecycle (creation on receipt → expiry alerts → consumption in recipes)"*.

Kitchen FIFO/FEFO discipline collapses if expiry alerts arrive too late. A 7-day banner is informational; the actionable signal is **T-72h** (Head Chef can still re-route to a daily-special menu) and **T-24h** (last-chance staff cook-off or write-off before waste). Without this slice the lot table holds `expires_at` but no one is told.

Slice #1 (`m3-lot-aggregate`, merged) already shipped the `idx_lots_org_expires_active` partial index per ADR-031 (migration 0026, indexes line 27 of slice #1 proposal):

```
(organization_id, expires_at) WHERE expires_at IS NOT NULL
```

This slice is what that index was provisioned for. No new index migration is needed for the `lots` side; the only new schema is the **fired-log table** so duplicate alerts within the same band are suppressed.

Per `[[feedback_agent_as_ux_surface]]`, there is **no first-party UX** here. The `LotExpiryNear` event routes to Hermes (WhatsApp / Telegram / AgentChatWidget per architecture-m3.md line 80 + line 652), which is the operator-facing notification surface for M3 MVP. The j8 AI-obs dashboard surfaces the event count as a sanity widget but is not required for FR8 to be considered satisfied.

This slice is **independent** of every M3 slice except #1 (`m3-lot-aggregate`, already merged at master `0dab33b`). It runs in **Track C / Wave 2.2 Block 1** in full parallel with slices #2, #4, #5, #6, #7. Per Wave 2.1 retro `[[feedback_subagent_apply_typing_fix_cascade]]`, the apply phase will be defensive: inline types under `apps/api/src/inventory/expiry/`, Zod `.min(1)` not `.nonempty()`, CJS-aware import for `@nestjs/schedule` adapters.

## What Changes

- **Migration `0028_create_expiry_alerts_fired_table.ts`** — new append-only `expiry_alerts_fired` log:
  - `id uuid PK`, `organization_id uuid NOT NULL`, `lot_id uuid NOT NULL FK lots`
  - `alert_band text NOT NULL CHECK (alert_band IN ('t-72h','t-24h'))`
  - `fired_at timestamptz NOT NULL DEFAULT now()` — server timestamp at emission
  - `expires_at_snapshot timestamptz NOT NULL` — copy of `lots.expires_at` at fire time, for audit replay if the lot is later mutated
  - 2 indexes:
    - `(organization_id, lot_id, alert_band, fired_at DESC)` — dedup lookup (the hot path)
    - `(organization_id, fired_at DESC)` — operator-facing "what fired last hour" Hermes status query
  - No down-migration data move; table is append-only and drop-safe on rollback.
- **`apps/api/src/inventory/expiry/`** new sub-module inside the existing inventory BC (peer of `inventory/lot/` from slice #1):
  - `domain/events.ts` — `LotExpiryNearEvent` typed `AuditEventEnvelope` (`aggregateType='lot'`, `eventType='LOT_EXPIRY_NEAR'`); Zod schema for the payload; `alert_band` literal union `'t-72h' | 't-24h'`.
  - `domain/expiry-alerts-fired.entity.ts` — TypeORM entity matching migration 0028.
  - `application/expiry-alerts-fired.repository.ts` — append-only repo. Two methods: `recordFired(input)` and `findRecentFor(organizationId, lotId, band, withinHours)`. No `update` / `delete`.
  - `application/expiry-scanner.service.ts` — cron-driven scanner. `@Cron('*/5 * * * *')` (5-minute tick per ADR-EXPIRY-SCHEDULE-CADENCE). On each tick: query lots within either band window, filter by dedup repo, emit one `LotExpiryNearEvent` per surviving row.
  - `expiry.module.ts` — NestJS module wiring `ScheduleModule.forRoot()` import + scanner + repo.
- **`apps/api/src/inventory/inventory.module.ts`** — re-exports `ExpiryModule`.
- **`apps/api/src/app.module.ts`** — `ScheduleModule.forRoot()` registered at the root (idempotent; safe if other slices also import it).
- **No `packages/contracts/` change.** Per `[[feedback_subagent_apply_typing_fix_cascade]]` Wave 2.1 lesson, the event payload type is inlined at `apps/api/src/inventory/expiry/domain/events.ts`. Downstream Hermes BC (when it exists) imports via TypeScript path alias; no cross-package package boundary forced.
- **BREAKING**: none. Pure additive — no existing lot reader changes; no contract changes to slice #1.

## Capabilities

### New Capabilities

- `inventory-expiry-alerts`: backend rule that emits `LotExpiryNearEvent` at T-72h and T-24h before `lot.expires_at`. Includes the cron scanner, dedup append-only log, event registration, and tenancy gating. Does NOT include downstream Hermes routing (claimed by the existing Hermes BC) or the j8 dashboard widget (claimed by slice #20 `m3-ai-obs-ui`).

### Modified Capabilities

- None. M2 lot lookups are unchanged. Slice #1's `inventory-lots` capability is consumed read-only.

## Impact

- **Prerequisites**: `m3-lot-aggregate` (slice #1) merged at master `0dab33b`. The `lots.expires_at` column + `idx_lots_org_expires_active` partial index land via migration 0026 (slice #1).
- **Code**:
  - `apps/api/src/inventory/expiry/` (new sub-BC: ~350 LOC across 5 files + tests)
  - `apps/api/src/migrations/0028_create_expiry_alerts_fired_table.ts` (~70 LOC)
  - `apps/api/src/inventory/inventory.module.ts` modified (re-export ExpiryModule; ~3 LOC change)
  - `apps/api/src/app.module.ts` modified (ScheduleModule.forRoot import; ~3 LOC change)
  - Tests: ~20 new unit + INT tests (clock-mocked windowing, dedup, tenancy, index-plan assertion, scheduler resilience).
- **Performance**:
  - Scan query is `SELECT id, organization_id, location_id, supplier_id, expires_at, quantity_remaining FROM lots WHERE expires_at BETWEEN now() AND now() + interval '72 hours' AND expires_at > now() AND quantity_remaining > 0 ORDER BY expires_at`. Plan MUST use `idx_lots_org_expires_active` (assertion in INT test per ADR-EXPIRY-INDEX-USE).
  - At Wave 2.1 modelling — ~50 lots/day/org × 30 orgs × 7-day window = ~10.5k rows in the 72h window cap. Index-scan cost is negligible per 5-minute tick.
  - Dedup query is `SELECT 1 FROM expiry_alerts_fired WHERE organization_id=? AND lot_id=? AND alert_band=? AND fired_at > now() - interval '23 hours' LIMIT 1`. Plan uses the dedup compound index.
  - 5-minute cron worst-case alert latency: 5 minutes after the band threshold is crossed. Acceptable per kitchen ops; not a regulatory hot path.
- **Storage**: `expiry_alerts_fired` grows ~2 rows per expiring lot (one per band). At ~50 lots/day/org × 30 orgs × 2 bands × 365 days = ~1.1M rows/year → ~200 MB/year incl. indexes. Negligible until M4 scale.
- **Audit**: event TYPE registered in the union via `domain/events.ts`. The `@OnEvent` subscriber registration in `apps/api/src/audit-log/audit-log.subscriber.ts` is **deferred to slice #21** (`m3-audit-log-hash-chain-hardening`) per the same Wave 2.1 pattern slice #1 used (ADR-EXPIRY-NO-EMIT-HERE). The scanner emits via `EventEmitter2`; subscriber wiring lands in batch.
- **Rollback**: drop the `expiry_alerts_fired` table in a follow-up migration. The scanner cron is idempotent — disabling the env var `OPENTRATTOS_EXPIRY_SCANNER_ENABLED=false` halts emission without code change. Slice #1's lots table is untouched.
- **Out of scope** (claimed by other slices):
  - Hermes routing of `LotExpiryNearEvent` → WhatsApp / Telegram fan-out. Owned by the existing Hermes BC (Wave 1.13 [3a]+[3b]); this slice emits the event and stops.
  - j8 dashboard widget surfacing alert counts / acknowledgement queue → `m3-ai-obs-ui` (slice #20).
  - `@OnEvent` subscriber that writes to `audit_log` → `m3-audit-log-hash-chain-hardening` (slice #21).
  - Lot consumption that decrements `quantity_remaining` → `m3-lot-consumption-events` (slice #2, parallel).
  - Per-org configurable band windows (e.g. T-7d for shelf-stable items). The 72h / 24h literal pair is MVP; configurability is a hypothetical `m3-expiry-alert-policy-config` followup.
  - Acknowledgement / snooze / dismiss workflow. MVP fires once per band per lot per 23h — operators address waste downstream.
  - Email or SMS dispatch fallback when Hermes channels are unconfigured. Fallback to structured logger only; email follows in slice #22's `EmailDispatchService` if a customer asks.
- **Parallelism**: `Depends on: [m3-lot-aggregate]` (merged). Writes exclusively to `apps/api/src/inventory/expiry/` + `apps/api/src/migrations/0028_*` + 2 line-touches in `apps/api/src/inventory/inventory.module.ts` and `apps/api/src/app.module.ts`. No overlap with slices #2 (`apps/api/src/inventory/lot-consumption/`), #4 (`apps/api/src/inventory/cost-resolver/`), #5/#6/#7 (procurement subtree). Track B (AI-obs) + Track C peers (`m3-audit-log-hash-chain-hardening`, `m3-email-dispatch-di` already merged) are file-path disjoint. Effort: **S**.
