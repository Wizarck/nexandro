## Context

`m3-lot-aggregate` (slice #1, merged at `0dab33b`) shipped the `lots` table with the `expires_at` column and the partial index `idx_lots_org_expires_active` on `(organization_id, expires_at) WHERE expires_at IS NOT NULL` (slice #1 proposal.md line 27, design.md ADR-LOT-INDEXES line 70). That index was explicitly provisioned for *this* slice — slice #1 design.md names "expiry-alerts #3" as the owning slice in its index table.

PRD-m3 FR8 (line 533) is the canonical functional driver. PRD §Strategic Differentiators line 103 sets customer expectation: agents can answer *"which lots are 7+ days from expiry"*. The 7-day window is the **informational** ceiling; the **actionable** alert bands are tighter — T-72h (re-plan menu) and T-24h (last-chance staff dish / write-off).

Architecture-m3.md line 64 anchors this to "Lot lifecycle (creation on receipt → expiry alerts → consumption in recipes)" — a 3-stage lifecycle. Slice #1 covered the entity. Slice #2 covers consumption events. This slice covers the alert middle stage.

No first-party UX per `[[feedback_agent_as_ux_surface]]` (no first-party mobile/voice/chat UI; agents render UX via Hermes surfaces). The event flows out of this BC and Hermes (when present) routes it. The j8 AI-obs dashboard MAY surface an "alerts fired in the last hour" widget but is owned by slice #20.

Wave 2.1 retro `[[feedback_subagent_apply_typing_fix_cascade]]` codified five common subagent failures: (a) cross-package contract type imports breaking apps/api builds, (b) Zod `.nonempty()` deprecated in favor of `.min(1)`, (c) CJS interop on SendGrid-class packages, (d) over-narrow `createTransport` return types, (e) SMTP retry semantics on 4xx vs 5xx. Patterns (a)+(b)+(c) apply here: `@nestjs/schedule` is CJS-style; event payload type inline-only; Zod schema uses `.min(1)` on the alert band literal union.

## Goals / Non-Goals

**Goals:**

- Emit one `LotExpiryNearEvent` per lot per band (T-72h, T-24h) per 23-hour dedup window, **automatically** via a cron-driven scanner — no operator action required.
- Multi-tenant invariant: every scan query gates on `organization_id` (NestJS interceptor or repo-level enforcement; not at scheduler entry).
- Append-only fired-log preserves audit trail of every alert ever emitted; survives lot mutation.
- INT test asserts the scan query plan uses `idx_lots_org_expires_active` (no Seq Scan).
- Scheduler tolerates a single tick failure (DB blip, transient error) — the next tick recovers because alerts are idempotent within the 23-hour dedup window.
- Event TYPE registered in the typed event-envelope union; emission via `EventEmitter2`. Subscriber wiring (audit_log persistence) is **explicitly deferred** to slice #21 per the same pattern slice #1 used.

**Non-Goals:**

- Hermes routing of the emitted event to WhatsApp / Telegram / AgentChatWidget. Owned by the existing Hermes BC.
- Email / SMS dispatch fallback. The `EmailDispatchService` from slice #22 is available but consciously not wired here — alerts that fail to route via Hermes drop into the structured logger only.
- Configurable band windows per org (e.g. T-7d for canned goods, T-2h for cold cuts). MVP hard-codes 72h + 24h; a future `m3-expiry-alert-policy-config` slice introduces per-supplier policy if a customer asks.
- Acknowledgement / snooze / dismiss workflow. Operators address waste downstream; this slice is fire-and-forget.
- j8 AI-obs dashboard widget for alert counts. Owned by slice #20.
- The `@OnEvent` subscriber in `audit-log.subscriber.ts` that persists `LotExpiryNearEvent` into the `audit_log` table. Owned by slice #21 (`m3-audit-log-hash-chain-hardening`), same reason slice #1 deferred `LOT_CREATED` / `STOCK_MOVE_CREATED`.

## Decisions

### ADR-EXPIRY-SCHEDULE-CADENCE — 5-minute cron tick

The scanner runs via `@Cron('*/5 * * * *')` (every 5 minutes on the wall clock, all hours, all days). This is the compromise between **alert freshness** (operators want to hear about a T-24h lot within 5 minutes of the threshold crossing, not within 60 minutes) and **DB scan cost** (a 1-minute tick × 1440 ticks/day × 30 orgs = 43,200 scans/day; 5-minute tick × 30 orgs = 8,640 scans/day, 5x cheaper).

**Alternatives considered:**

1. **1-minute tick.** Rejected: 5x more scans for sub-1% improvement in alert freshness (kitchen operators don't react in sub-5-minute windows anyway).
2. **1-hour tick.** Rejected: a lot crossing the T-24h threshold at 12:01 wouldn't be alerted until 13:00 in the worst case, giving operators 22 hours instead of 23 to react. Cuts into the actionable margin.
3. **Event-driven** (trigger via a Postgres `LISTEN` channel on `lots.expires_at` boundaries). Rejected: complexity for marginal benefit. Cron is simpler, debug-friendlier, and trivially horizontally-safe (see ADR-EXPIRY-DEDUPLICATION for the dedup invariant that makes overlapping ticks harmless).

**Worst-case alert latency:** band-threshold crossing time + 5 minutes (next tick) = ~5 min P99.

**Cron failure tolerance:** if a tick fails (DB blip, exception in scanner), the next 5-minute tick re-queries the same window. Because the dedup repo uses a 23-hour lookback, a missed tick has no operator-visible impact (the alert fires 5 minutes later in the same band window). Documented in REQ-EX-7.

### ADR-EXPIRY-DEDUPLICATION — append-only fired-log table

We use a dedicated `expiry_alerts_fired` table (append-only log) rather than adding a `last_expiry_alert_fired_at` column on `lots`.

**Why a separate table?**

- **Audit-friendly.** Every alert ever fired is preserved as a row. Investigations ("did we tell anyone about lot X before it expired?") have a single source of truth.
- **No schema bloat on `lots`.** The hot `lots` table is read-heavy (cost resolver, recall, FIFO/FEFO). Adding two columns (`t72_fired_at`, `t24_fired_at`) widens every row even for lots that never expire (oil, salt).
- **Replay-safe.** If a lot is mutated (expiry pushed out by re-labeling) the historical row in `expiry_alerts_fired` is unaffected — we keep `expires_at_snapshot` captured at fire time.
- **Dedup query uses a tight compound index** (`(organization_id, lot_id, alert_band, fired_at DESC)`) — index-only lookup, no row fetch.

**Dedup window: 23 hours.** Chosen narrowly below 24h so that if an operator pushes expiry out by re-labeling and the lot re-enters a band, we fire the alert again next day rather than going silent. 23h is conservative against clock drift (NTP keeps clocks within ms but cron is wall-clock).

**Alternatives considered:**

1. **Column on `lots`.** Rejected per "schema bloat" + "audit-friendly" above.
2. **Redis-backed bloom filter.** Rejected: introduces Redis dependency for a non-hot-path operation; the table is cheaper.
3. **Materialized `lots.next_alert_at` column updated on each fire.** Rejected: write contention with consumption events from slice #2 on the same row.

### ADR-EXPIRY-EVENT-PAYLOAD — payload shape

Event TYPE: `'LOT_EXPIRY_NEAR'` in the `AuditEventEnvelope` union (registered in `apps/api/src/inventory/expiry/domain/events.ts`).

Payload (Zod schema, inlined per `[[feedback_subagent_apply_typing_fix_cascade]]` — no cross-package contract dependency):

```ts
const LotExpiryNearPayload = z.object({
  lot_id: z.string().uuid(),
  organization_id: z.string().uuid(),       // top-level for tenancy routing
  location_id: z.string().uuid(),
  supplier_id: z.string().uuid().nullable(),
  expires_at: z.string().datetime(),         // ISO-8601 UTC
  expires_at_snapshot_taken_at: z.string().datetime(),
  alert_band: z.enum(['t-72h', 't-24h']),    // discriminator for Hermes template selection
  hours_until_expiry: z.number().int().min(0).max(72),
  quantity_remaining: z.number().min(0),
  unit: z.enum(['kg', 'g', 'L', 'ml', 'un']),
  ingredient_id: z.string().uuid().nullable(),  // from lots join when available
});
```

**Why `organization_id` at the top level of the payload (not nested under `meta`)?** Hermes routing decisions key on tenancy first; nesting forces every consumer to navigate a path. Top-level matches the slice #1 + Wave 1.x audit envelope convention.

**Why `alert_band` as a string literal union (`'t-72h' | 't-24h'`) not an integer (24, 72)?** Hermes templates are bound to the literal — switching to ints would force a template refactor when slice #20 widget surfaces the alerts. Strings stay readable in logs without a lookup table.

**Why `quantity_remaining` is in the payload?** Hermes can render *"Lot L-2026-0042 expires in 24h with 8.2 kg remaining — divert to today's special?"* in a single template. Saves a follow-up query.

**Zod array validation reminder** (Wave 2.1 lesson `[[feedback_subagent_apply_typing_fix_cascade]]` (b)): the `alert_band` discriminator uses `z.enum([...])` not `.nonempty()`. If any future array fields need min-length, use `.min(1)`, never `.nonempty()`.

### ADR-EXPIRY-NO-EMIT-HERE — scanner emits to bus, NOT to audit_log directly

Following the pattern slice #1 used for `LOT_CREATED` + `STOCK_MOVE_CREATED` (slice #1 design.md ADR-LOT-NO-EVENT-EMIT-HERE line 83) and the Wave 1.18 / 1.19 audit-log emitter migration:

This slice **defines** the event type in `domain/events.ts` and **emits** via `EventEmitter2.emitAsync('audit.event', envelope)`. It does NOT register an `@OnEvent('audit.event')` subscriber that persists into `audit_log`. The subscriber wiring is **claimed by slice #21** (`m3-audit-log-hash-chain-hardening`) along with the other deferred M3 event registrations (`LOT_CREATED`, `STOCK_MOVE_CREATED`, `LOT_CONSUMED`, `EMAIL_DISPATCHED`). Reason: the audit envelope shape is not final until ADR-032 hash-chain hardening (migrations 0023+0024) lands; double-write risk if we wire it now.

**What this means for testing:** the INT test does NOT assert an `audit_log` row appears. It DOES assert (a) the event is emitted on the bus (mock listener captures it), (b) the `expiry_alerts_fired` row is written, (c) repeat fire within 23h is suppressed.

Per `[[feedback_event_subscriber_int_specs]]` — if INT tests need to verify the emit shape via a real subscriber, they MUST register a test-only subscriber class in the providers list AND use `emitAsync` (not `emit`) so the read-after-write in the test thread sees the event before the assertion. We'll use this pattern in `expiry-scanner.int-spec.ts` only for the bus-emission assertion.

### ADR-EXPIRY-INDEX-USE — rely on slice #1's partial index

This slice provisions **no new index on `lots`**. The expiry scan query uses `idx_lots_org_expires_active` from migration 0026 (slice #1):

```sql
CREATE INDEX idx_lots_org_expires_active
  ON lots (organization_id, expires_at)
  WHERE expires_at IS NOT NULL;
```

**Scan query shape** (template literal at `apps/api/src/inventory/expiry/application/expiry-scanner.service.ts`):

```sql
SELECT id, organization_id, location_id, supplier_id, expires_at,
       quantity_remaining, unit, ingredient_id
FROM lots
WHERE expires_at IS NOT NULL
  AND expires_at > now()
  AND expires_at <= now() + interval '72 hours'
  AND quantity_remaining > 0
ORDER BY expires_at;
```

The planner picks the partial index because (a) the `WHERE expires_at IS NOT NULL` clause aligns with the partial predicate, (b) `organization_id` is the leading column, (c) the `expires_at` upper bound is selective.

**INT test asserts plan uses the index** via `EXPLAIN (ANALYZE, FORMAT JSON)` parsed for the `"Index Name": "idx_lots_org_expires_active"` substring. Seq Scan on `lots` is a failing condition. REQ-EX-8 codifies the assertion.

**Why this matters:** if a future developer renames the index or drops the partial WHERE clause, the scanner silently degrades to a Seq Scan, alerts continue to fire, but DB load goes up 10x at scale. The INT test catches this on every PR.

**Dedup table index** (`expiry_alerts_fired`) is provisioned **in this slice's migration 0028** — it's a new table so the index lives here. See proposal.md.

## Risks / Trade-offs

- **[Risk]** Cron skew across multiple `apps/api` replicas: if 3 replicas all run `@Cron('*/5 * * * *')`, they each fire the scanner simultaneously and 3x the dedup-table writes. **Mitigation**: cron emission is idempotent (the dedup repo's 23h window suppresses duplicates within seconds of each other). At 3 replicas × 5-minute tick × 30 orgs the dedup-INSERT races resolve via the PK uniqueness — at most 1 row wins per `(org, lot, band, fired_at-rounded-to-second)`. Lost-race rows raise a unique-constraint exception caught and logged. Documented in REQ-EX-7.
- **[Risk]** `now()` clock skew across replicas leads to band-window edge cases (one replica sees lot in T-72h, another sees it in T-71h-59m). **Mitigation**: NTP keeps clocks within ms; the 23h dedup window absorbs second-scale skew without operator-visible impact.
- **[Risk]** Lot expiry mutated mid-day (operator extends shelf life via re-labeling) and the original alert was already fired. **Mitigation**: `expires_at_snapshot` in `expiry_alerts_fired` preserves the original. If the new `expires_at` re-enters a band window 24h+ later, a fresh alert fires. Customers needing fewer alerts after re-labeling can ack-suppress via a future M3.x slice.
- **[Risk]** Lot has `expires_at` in the past (operator forgot to mark consumed). **Mitigation**: the scan query has `expires_at > now()` clause — past-expiry lots are excluded, no alert fires. Slice #20 j8 widget surfaces these separately as a "past-expiry waste" KPI. Tested by REQ-EX-6.
- **[Risk]** Scanner exception kills the cron worker. **Mitigation**: `@Cron` handlers in `@nestjs/schedule` are wrapped — exceptions log + the next tick fires regardless. Structured logger emits at error level so existing M2 dashboards alert ops. REQ-EX-7 asserts this.
- **[Trade-off]** No retry on individual lot emission failure. If `EventEmitter2.emitAsync` throws for one lot, the scanner logs + continues to the next lot. Next tick (5 min later) re-considers the same lot (dedup row was never written). Worst-case: a lot retries every 5 minutes until success. Acceptable; alerts are best-effort and Hermes has its own delivery retries downstream.
- **[Trade-off]** Hard-coded 72h + 24h bands. Per-supplier configurability is real demand long-term (canned goods want T-30d, fresh dairy wants T-12h) but adds a config-resolution step on every scan. Defer until customer asks. Documented in proposal.md Out-of-scope.

## Migration Plan

1. **Stage 1 — Schema** (this PR): run migration 0028 on staging. No data; no scanner running yet (default `OPENTRATTOS_EXPIRY_SCANNER_ENABLED=false`).
2. **Stage 2 — Scanner enabled in staging**: set env true on one replica. Verify (a) 5-min ticks log, (b) dedup table fills, (c) no event-bus subscribers fire (subscriber lands in slice #21 — verified by absent `audit_log` rows).
3. **Stage 3 — Production rollout**: enable on production after slice #21 wires the audit subscriber, so the `LotExpiryNearEvent` round-trips into `audit_log` and Hermes routing (if configured) starts firing.
4. **Rollback**: env flag `OPENTRATTOS_EXPIRY_SCANNER_ENABLED=false` halts emission immediately. Migration 0028's down drops `expiry_alerts_fired`. No data depends on it outside this BC.

## Open Questions

- **`alert_band` upper bound discrimination**: if a lot crosses both T-72h and T-24h between consecutive scans (e.g., scanner was down for 2 days), do we fire both events on recovery, or only the tighter (T-24h)? **Proposed**: fire both, in band order. Hermes can dedup at the template level. Operator sees the trail of missed alerts.
- **Lots with `expires_at IS NULL`** (shelf-stable items per slice #1 ADR-LOT-SCHEMA): no alerts fire (the partial index excludes them; scan WHERE clause excludes them). Confirmed by REQ-EX-7 scenario.
- **Multi-location lot alerts**: a lot has exactly one `location_id`; the event payload carries it. Hermes BC decides which kitchen / channel to route based on `location_id`. This slice does not duplicate per-location.
- **Per-supplier band override**: deferred. Out-of-scope until customer asks; future `m3-expiry-alert-policy-config` slice.
- **AGPL vs Enterprise gating**: the scanner runs in the AGPL community build (no Enterprise license check). Per the dual-buyer reality, kitchen ops want expiry alerts whether or not they're on a paid tier.
