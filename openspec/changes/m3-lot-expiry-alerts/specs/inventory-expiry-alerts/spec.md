## ADDED Requirements

### Requirement: System emits LotExpiryNearEvent when a lot enters the T-72h band

The system SHALL emit a `LotExpiryNearEvent` (with `alert_band='t-72h'`) for every lot whose `expires_at` falls strictly between `now()` and `now() + interval '72 hours'`, subject to the dedup invariant in REQ-EX-3 and the exclusions in REQ-EX-5 / REQ-EX-6. The scan SHALL run on a 5-minute cron tick per ADR-EXPIRY-SCHEDULE-CADENCE.

#### Scenario: Lot crossing the 72h threshold fires a t-72h event on the next tick

- **WHEN** a lot has `expires_at = now() + interval '71 hours 59 minutes'`, `quantity_remaining = 4.5`, no row in `expiry_alerts_fired` for `(lot_id, 't-72h')` within the last 23 hours
- **AND** the cron tick runs
- **THEN** exactly one `LotExpiryNearEvent` is emitted on the bus with `alert_band='t-72h'` and `hours_until_expiry=71`
- **AND** a row appears in `expiry_alerts_fired` with `alert_band='t-72h'`, `expires_at_snapshot` matching the lot's `expires_at`

#### Scenario: Lot outside the T-72h band does not fire a t-72h event

- **WHEN** a lot has `expires_at = now() + interval '80 hours'` (outside the 72h window)
- **AND** the cron tick runs
- **THEN** no event is emitted; no row is written to `expiry_alerts_fired`

#### Scenario: Lot with expires_at IS NULL is skipped

- **WHEN** a shelf-stable lot has `expires_at = NULL` (e.g., salt, oil)
- **AND** the cron tick runs
- **THEN** the scan query (which filters `expires_at IS NOT NULL` to align with the partial index) excludes the lot; no event fires

### Requirement: System emits LotExpiryNearEvent when a lot enters the T-24h band

The system SHALL emit a `LotExpiryNearEvent` (with `alert_band='t-24h'`) for every lot whose `expires_at` falls strictly between `now()` and `now() + interval '24 hours'`, subject to the dedup invariant in REQ-EX-3 and the exclusions in REQ-EX-5 / REQ-EX-6. T-24h alerts are emitted **in addition to** the earlier T-72h alert for the same lot, not as a replacement.

#### Scenario: Lot crossing 24h threshold fires a t-24h event independent of prior t-72h

- **WHEN** a lot has `expires_at = now() + interval '23 hours 50 minutes'`, `quantity_remaining = 1.2`
- **AND** the same lot has a t-72h row in `expiry_alerts_fired` from 2 days ago
- **AND** no t-24h row exists in `expiry_alerts_fired` within the last 23 hours
- **AND** the cron tick runs
- **THEN** exactly one `LotExpiryNearEvent` is emitted with `alert_band='t-24h'`
- **AND** a row appears in `expiry_alerts_fired` with `alert_band='t-24h'`
- **AND** the prior t-72h row is unchanged

#### Scenario: Lot in both bands simultaneously after scanner downtime fires both events

- **WHEN** the scanner is down for 36 hours and a lot crosses both the T-72h and T-24h thresholds during the outage
- **AND** the scanner recovers
- **THEN** the next tick emits exactly two `LotExpiryNearEvent` rows for the lot — one `alert_band='t-72h'`, one `alert_band='t-24h'`
- **AND** two corresponding rows appear in `expiry_alerts_fired`

### Requirement: Dedup invariant suppresses double-fire within 23 hours per band per lot

The system SHALL NOT emit a `LotExpiryNearEvent` for a given `(lot_id, alert_band)` pair if a row in `expiry_alerts_fired` for the same pair was inserted within the last 23 hours. The 23-hour window is narrower than the 24-hour band repeat ceiling so re-labeled lots become eligible for re-alerting on the next operational day.

#### Scenario: Second scan within 23h does not double-fire

- **WHEN** a lot fires a `t-24h` alert at 12:00:00
- **AND** the next cron tick runs at 12:05:00 with the lot still in the T-24h window
- **THEN** no second `LotExpiryNearEvent` is emitted
- **AND** no second row is written to `expiry_alerts_fired` for the `(lot_id, 't-24h')` pair

#### Scenario: Alert re-fires after 23-hour window elapses

- **WHEN** a lot fires a `t-24h` alert at 12:00 on day D
- **AND** the lot's `expires_at` is later extended (re-labeling) to put the lot back in a T-24h window 24 hours later at 12:00 on day D+1
- **AND** the cron tick runs at 12:05 on D+1
- **THEN** a fresh `LotExpiryNearEvent` is emitted with `alert_band='t-24h'`
- **AND** a second row is written to `expiry_alerts_fired` for the same lot
- **AND** both fired-log rows are preserved (append-only)

#### Scenario: Concurrent replicas resolve via PK contention without double emission

- **WHEN** three `apps/api` replicas each run the cron tick simultaneously for the same organization
- **AND** all three identify the same lot as eligible for a t-72h alert
- **THEN** the dedup-table INSERT races resolve at the DB level via the `(organization_id, lot_id, alert_band, fired_at)` index constraint
- **AND** at most one `expiry_alerts_fired` row is committed per `(lot_id, band)` per second-grain window
- **AND** lost-race replicas catch the unique-constraint exception, log it at debug level, and proceed to the next lot without emission

### Requirement: Multi-tenant isolation enforced in every scan and dedup query

The system SHALL include `organization_id` in every WHERE clause of every database query in the expiry scanner module. The scanner SHALL iterate organizations (or use a single multi-org query gated by `organization_id` projection) and never expose a "global" scan surface.

#### Scenario: Cross-tenant data isolation

- **WHEN** orgA has a lot in the T-24h window and orgB has a lot in the T-24h window
- **AND** the cron tick runs for orgA only (or for both)
- **THEN** the emitted `LotExpiryNearEvent` for orgA carries `organization_id = orgA_id`
- **AND** the orgA dedup row goes into `expiry_alerts_fired` with `organization_id = orgA_id`
- **AND** no event payload mixes orgA and orgB data; no dedup query for orgA returns orgB rows

#### Scenario: Dedup repo refuses queries without organization_id

- **WHEN** any code path calls `ExpiryAlertsFiredRepository.findRecentFor(lotId, band, withinHours)` without passing `organizationId` as the first parameter
- **THEN** the TypeScript build fails (no overload missing `organizationId`)

### Requirement: Lots with quantity_remaining = 0 are excluded from expiry alerting

The system SHALL NOT emit `LotExpiryNearEvent` for any lot whose `quantity_remaining` is zero. A fully-consumed lot does not produce kitchen waste; alerting on it is operator noise.

#### Scenario: Fully-consumed lot near expiry is silent

- **WHEN** a lot has `expires_at = now() + interval '12 hours'` (well inside T-24h) and `quantity_remaining = 0`
- **AND** the cron tick runs
- **THEN** the scan query excludes the lot (filter `quantity_remaining > 0`); no event is emitted; no fired-log row is written

#### Scenario: Partially-consumed lot still fires

- **WHEN** a lot has `expires_at = now() + interval '12 hours'` and `quantity_remaining = 0.001`
- **AND** the cron tick runs
- **THEN** a `LotExpiryNearEvent` is emitted with `quantity_remaining=0.001` in the payload (operator decides whether 1g is worth diverting)

### Requirement: Lots past expires_at are excluded from alerting

The system SHALL NOT emit `LotExpiryNearEvent` for any lot whose `expires_at <= now()`. Past-expiry lots are waste artifacts to be addressed separately (slice #20 j8 dashboard surfaces them as a KPI); the alerting stream is forward-looking only.

#### Scenario: Already-expired lot generates no alert

- **WHEN** a lot has `expires_at = now() - interval '2 hours'` (already expired) and `quantity_remaining = 2.0`
- **AND** the cron tick runs
- **THEN** the scan query excludes the lot (filter `expires_at > now()`); no event is emitted

#### Scenario: Lot crossing expires_at mid-tick fires no further alerts

- **WHEN** a lot fired its t-24h alert 24 hours ago and is now at `expires_at - 1 minute`
- **AND** a tick runs that catches it before it crosses `expires_at`
- **THEN** dedup correctly suppresses (within 23h); no new alert
- **WHEN** the next tick runs 5 minutes later, after `expires_at` has passed
- **THEN** scan-query exclusion (`expires_at > now()`) prevents any further event for the lot

### Requirement: Scheduler resilience — single tick failure tolerated without operator-visible impact

The system SHALL recover from a single failed cron tick (exception in scanner, DB timeout, transient connection error) without manual intervention. The next tick (≤5 minutes later) SHALL re-process the same band windows; because dedup logic is keyed off whether a fired-log row exists (not off the previous tick's success), no lot is silently missed.

#### Scenario: Scanner exception is logged and next tick recovers

- **WHEN** the scanner throws an exception while processing one of N lots in a tick
- **THEN** the scanner SHALL log the exception at error level with structured fields (`org_id`, `lot_id`, `tick_ts`)
- **AND** the scanner SHALL continue with the remaining N-1 lots in the same tick
- **AND** the next cron tick (5 minutes later) SHALL re-process the failed lot if it is still in a band window
- **AND** no `expiry_alerts_fired` row is written for the failed lot in the failed tick

#### Scenario: DB connectivity loss between scan and dedup-insert leaves no orphan emission

- **WHEN** the scan query succeeds but the dedup `INSERT INTO expiry_alerts_fired` fails (connection lost)
- **THEN** no `LotExpiryNearEvent` is emitted (the emit happens AFTER the dedup row is committed, per scanner-service implementation order)
- **AND** the next tick re-evaluates the lot and re-attempts the dedup-INSERT-then-emit sequence

#### Scenario: Scheduler can be disabled by env flag

- **WHEN** `NEXANDRO_EXPIRY_SCANNER_ENABLED=false` is set
- **THEN** the cron handler short-circuits at the start of each tick; no scan query runs; no events emit; no rows are written

### Requirement: INT test asserts scan query plan uses the partial index

The integration test suite SHALL include an assertion that `EXPLAIN (ANALYZE, FORMAT JSON)` for the scanner's primary scan query reports `idx_lots_org_expires_active` as the index used. A Seq Scan on `lots` SHALL fail the test. The assertion SHALL run against a test container seeded with at least 1,000 lots per organization across 2 organizations to exercise selectivity.

#### Scenario: EXPLAIN ANALYZE result includes the partial index name

- **WHEN** the INT test seeds 1,000 lots (mixed `expires_at` values, mixed organizations) and runs the scanner's scan query under `EXPLAIN (ANALYZE, FORMAT JSON)`
- **THEN** the parsed plan JSON contains `"Index Name": "idx_lots_org_expires_active"` at some node in the plan tree
- **AND** no `"Node Type": "Seq Scan"` appears against the `lots` relation

#### Scenario: Test fails on index removal or partial-WHERE change

- **WHEN** a developer drops the partial `WHERE expires_at IS NOT NULL` clause from migration 0026 (or renames the index)
- **AND** the INT test runs
- **THEN** the EXPLAIN assertion fails; CI blocks merge
