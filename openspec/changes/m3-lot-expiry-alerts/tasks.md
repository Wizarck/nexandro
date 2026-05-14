## 1. Migration 0028 — expiry_alerts_fired table + 2 indexes

- [ ] 1.1 `apps/api/src/migrations/0028_create_expiry_alerts_fired_table.ts` — create `expiry_alerts_fired` table per design.md ADR-EXPIRY-DEDUPLICATION (5 columns + 2 indexes)
- [ ] 1.2 Same migration: column shape
  - `id uuid PK DEFAULT gen_random_uuid()`
  - `organization_id uuid NOT NULL` (no FK by convention — performance over referential constraint for log tables, matches `audit_log` pattern)
  - `lot_id uuid NOT NULL FK lots ON DELETE CASCADE`
  - `alert_band text NOT NULL CHECK (alert_band IN ('t-72h','t-24h'))`
  - `fired_at timestamptz NOT NULL DEFAULT now()`
  - `expires_at_snapshot timestamptz NOT NULL`
- [ ] 1.3 Same migration: create `idx_expiry_alerts_fired_dedup` on `(organization_id, lot_id, alert_band, fired_at DESC)` — supports the dedup lookup hot path (REQ-EX-3)
- [ ] 1.4 Same migration: create `idx_expiry_alerts_fired_org_fired` on `(organization_id, fired_at DESC)` — supports operator-facing "what fired in the last hour" Hermes status queries
- [ ] 1.5 Down migration drops the table (no data dependency outside this BC)
- [ ] 1.6 Migration smoke test: assert `pg_indexes` shows both indexes after up migration; assert table absent after down

## 2. Domain layer — event type + entity + errors

- [ ] 2.1 `apps/api/src/inventory/expiry/domain/events.ts`:
  - Export `LotExpiryNearPayload` Zod schema per design.md ADR-EXPIRY-EVENT-PAYLOAD (10 fields, `alert_band` literal union, `quantity_remaining` numeric)
  - Export `LotExpiryNearEvent` typed `AuditEventEnvelope` (`aggregateType='lot'`, `eventType='LOT_EXPIRY_NEAR'`)
  - Export the inferred TS types via `z.infer<typeof ...>` — do NOT re-export from `packages/contracts/` (Wave 2.1 lesson `[[feedback_subagent_apply_typing_fix_cascade]]`: inline types under apps/api, no cross-package coupling)
  - Use `z.enum(['t-72h','t-24h'])` for the band discriminator — NOT `.nonempty()` arrays (Wave 2.1 lesson (b))
- [ ] 2.2 `apps/api/src/inventory/expiry/domain/expiry-alerts-fired.entity.ts` — TypeORM entity matching migration 0028 columns; `alert_band` typed as union `'t-72h'|'t-24h'`; `numericTransformer` for `fired_at` / `expires_at_snapshot` per slice #1 convention (hoist above class declarations per slice #1 retro commit `84bd1f5`)
- [ ] 2.3 `apps/api/src/inventory/expiry/domain/errors.ts`:
  - `ExpiryAlertsFiredImmutableError` — repository refuses UPDATE / DELETE
  - `ExpiryDedupWindowConflictError` — raised when concurrent replicas race the dedup INSERT (unique-constraint violation caught + downgraded to debug log)
  - `InvalidAlertBandError` — raised by Zod payload validation when band is not in the literal union

## 3. Application layer — append-only fired-log repository

- [ ] 3.1 `apps/api/src/inventory/expiry/application/expiry-alerts-fired.repository.ts`:
  - `recordFired(input: { organizationId, lotId, alertBand, expiresAtSnapshot }): Promise<ExpiryAlertsFiredEntity>` — INSERT-only; catches PK / unique-constraint exceptions and re-raises as `ExpiryDedupWindowConflictError` so the scanner can log + skip
  - `findRecentFor(organizationId, lotId, alertBand, withinHours: number = 23): Promise<ExpiryAlertsFiredEntity | null>` — uses `idx_expiry_alerts_fired_dedup`; returns the most-recent row in the window or null
  - **No** `update`, `delete`, `save` methods exposed. Append-only at the application layer. Calling them throws `ExpiryAlertsFiredImmutableError`.
  - Every method takes `organizationId` as the FIRST parameter (per REQ-EX-4)

## 4. Application layer — ExpiryScannerService (cron-driven)

- [ ] 4.1 `apps/api/src/inventory/expiry/application/expiry-scanner.service.ts`:
  - `@Injectable()` decorated; constructor injects `LotRepository` (read-only `findByExpiryWindow` method — see task 4.2), `ExpiryAlertsFiredRepository`, `EventEmitter2`, `Logger`
  - `@Cron(CronExpression.EVERY_5_MINUTES)` decorator on `runTick()` method (per design.md ADR-EXPIRY-SCHEDULE-CADENCE)
  - `runTick()` body:
    1. Short-circuit if `OPENTRATTOS_EXPIRY_SCANNER_ENABLED !== 'true'` (per REQ-EX-7 scenario 3)
    2. For each band `['t-72h', 't-24h']`:
       - Query lots in the band window (delegates to repo per task 4.2)
       - For each lot: check dedup (`findRecentFor(..., withinHours: 23)`); skip if a row exists
       - Otherwise: call `recordFired(...)` first, then `eventEmitter.emitAsync('audit.event', envelope)` — order matters per REQ-EX-7 scenario 2
       - Per-lot exceptions: log at error level with structured fields, continue to next lot (REQ-EX-7 scenario 1)
    3. Tick-level exceptions: log + return; cron framework re-fires in 5 min
- [ ] 4.2 Extend `apps/api/src/inventory/lot/application/lot.repository.ts` with `findByExpiryWindow(organizationId, withinHours: number): Promise<Lot[]>`:
  - Read-only query; this slice MAY add the method even though slice #1 owns the file (write paths are disjoint — this is a small additive method on the same repository class)
  - SQL per design.md ADR-EXPIRY-INDEX-USE (filters `expires_at > now()`, `expires_at <= now() + interval $1 hours`, `quantity_remaining > 0`, `expires_at IS NOT NULL`)
  - **Tenancy check**: `organizationId` in WHERE clause (REQ-EX-4); test asserts plan uses `idx_lots_org_expires_active` (REQ-EX-8)
- [ ] 4.3 CJS interop note (Wave 2.1 lesson `[[feedback_subagent_apply_typing_fix_cascade]]` (c)): `@nestjs/schedule` ships dual ESM/CJS; the apply phase MUST use the standard NestJS import (`import { Cron, CronExpression, ScheduleModule } from '@nestjs/schedule'`). If TypeScript complains about `default` interop, the fix is `import * as schedule + (schedule as any).default ?? schedule` — NOT a tsconfig change.

## 5. Module wiring (NestJS)

- [ ] 5.1 `apps/api/src/inventory/expiry/expiry.module.ts`:
  - Imports `TypeOrmModule.forFeature([ExpiryAlertsFiredEntity, Lot])` (Lot is for the additive read-only repo method)
  - Providers: `ExpiryScannerService`, `ExpiryAlertsFiredRepository`
  - Exports: `ExpiryAlertsFiredRepository` (for slice #20 j8 widget consumption)
- [ ] 5.2 `apps/api/src/inventory/inventory.module.ts`:
  - Add `ExpiryModule` to imports + exports (re-export so downstream callers can inject via `InventoryModule`)
- [ ] 5.3 `apps/api/src/app.module.ts`:
  - Add `ScheduleModule.forRoot()` to imports if not already present (idempotent — slice #16 may have already added it for AI-obs cron; check before adding)
  - Confirm M3 feature flag gating: scanner runs only when `M3_ENABLED=true` AND `OPENTRATTOS_EXPIRY_SCANNER_ENABLED=true`

## 6. Unit tests — domain + repository (mocked DB)

- [ ] 6.1 `expiry-alerts-fired.entity.spec.ts` — TypeORM mapping (column names, types, nullable, CHECK constraint enforcement at app layer is N/A — DB-level only)
- [ ] 6.2 `expiry-alerts-fired.repository.spec.ts`:
  - `recordFired` happy path: INSERT succeeds; returned row matches input
  - `recordFired` PK conflict: simulated unique-constraint exception is re-raised as `ExpiryDedupWindowConflictError`
  - `findRecentFor` returns row when within window; returns null when outside
  - `findRecentFor` includes `organization_id` in the query (assert query string matches)
  - `update` / `delete` paths throw `ExpiryAlertsFiredImmutableError`
- [ ] 6.3 `expiry-scanner.service.spec.ts` (clock-mocked via Jest `useFakeTimers`):
  - Single-lot, no prior fire: emits exactly one event, writes exactly one fired-log row
  - Single-lot, prior fire within 23h: no emit, no write
  - Single-lot, prior fire 24h ago: emits + writes (REQ-EX-3 scenario 2)
  - Lot at `expires_at - 1h` in both bands: emits BOTH t-72h and t-24h events (REQ-EX-2 scenario 2)
  - Lot with `quantity_remaining=0`: no emit (REQ-EX-5)
  - Lot with `expires_at <= now()`: no emit (REQ-EX-6)
  - Scanner exception during lot N: logged + skipped; lots N+1 onward still process (REQ-EX-7 scenario 1)
  - `OPENTRATTOS_EXPIRY_SCANNER_ENABLED=false`: scanner is no-op (REQ-EX-7 scenario 3)
- [ ] 6.4 `lot.repository.spec.ts` extension: assert `findByExpiryWindow` filters on `expires_at IS NOT NULL`, `expires_at > now()`, `quantity_remaining > 0`, `organization_id`

## 7. Integration tests (real Postgres via VPS-postgres or testcontainer)

- [ ] 7.1 `expiry-scanner.int-spec.ts` — uses VPS-postgres test instance per `[[reference_vps_postgres_test]]` (eligia-vps SSH tunnel on 127.0.0.1:5433) when Docker Desktop unavailable; otherwise existing testcontainer harness from slice #1
- [ ] 7.2 Tenancy test: seed orgA + orgB with overlapping lot data in the T-24h window; run one tick scoped to orgA; assert (a) only orgA emits events, (b) only orgA writes dedup rows, (c) orgB's data is unchanged (REQ-EX-4)
- [ ] 7.3 Dedup test: seed one lot in T-24h window; run tick twice 5 minutes apart (via fake clock); assert exactly one event emitted + one dedup row written (REQ-EX-3)
- [ ] 7.4 Recovery test: simulate scanner exception on lot 2 of 5; assert lots 1, 3, 4, 5 all process and 4 events emit + 4 dedup rows write (REQ-EX-7)
- [ ] 7.5 Index plan assertion: seed 1,000 lots across 2 orgs; run `EXPLAIN (ANALYZE, FORMAT JSON)` on the scan query; parse plan JSON; assert `Index Name: idx_lots_org_expires_active` is present and no `Seq Scan` on `lots` (REQ-EX-8)
- [ ] 7.6 No-audit-row smoke test: run a full tick that emits 3 events; assert the `audit_log` table has zero new rows (subscriber registration is slice #21's job; REQ-EX-1 scenario plus design.md ADR-EXPIRY-NO-EMIT-HERE)
- [ ] 7.7 Event-bus listener assertion (per `[[feedback_event_subscriber_int_specs]]`): register a test-only `@OnEvent('audit.event')` subscriber class in the test module's providers list; call `emitAsync` from the scanner; assert the listener captures the event payload before the test assertion runs

## 8. Documentation + ADR persistence

- [ ] 8.1 Add `apps/api/src/inventory/expiry/README.md` — BC purpose, public surface (1 read-only repo for consumption by slice #20), event type emitted, env flags (`OPENTRATTOS_EXPIRY_SCANNER_ENABLED`), what's claimed by downstream slices (#21 subscriber, #20 widget)
- [ ] 8.2 Update `docs/architecture-decisions.md` with the 5 local ADRs: ADR-EXPIRY-SCHEDULE-CADENCE, ADR-EXPIRY-DEDUPLICATION, ADR-EXPIRY-EVENT-PAYLOAD, ADR-EXPIRY-NO-EMIT-HERE, ADR-EXPIRY-INDEX-USE (extending the canonical M3 ADR list)
- [ ] 8.3 Open follow-up tracking issue for slice #21 referencing the `LOT_EXPIRY_NEAR` event type (so the batch subscriber registration includes it)

## 9. CI + PR hygiene

- [ ] 9.1 `pnpm -w typecheck` passes
- [ ] 9.2 `pnpm -w lint` passes
- [ ] 9.3 `pnpm -w test` passes (unit + INT)
- [ ] 9.4 `openspec validate m3-lot-expiry-alerts` returns 0
- [ ] 9.5 PR description cites the slice contract row (Gate C slice list 2026-05-14, row 3), the migration slot claimed (0028), and the dependency on slice #1 (already merged at `0dab33b`)
- [ ] 9.6 Gate D review: human reviewer confirms all 4 artifacts (proposal + design + spec + tasks) are coherent before invoking `/opsx:apply`
