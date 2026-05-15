## 1. Hash chain integrity INT spec

- [ ] 1.1 New file `apps/api/src/audit-log/application/audit-log-hash-chain-integrity.int.spec.ts`
- [ ] 1.2 Test module setup: `Test.createTestingModule()` with `TypeOrmModule.forRoot({ url: process.env.DATABASE_URL ?? 'postgres://opentrattos_test:opentrattos_test@localhost:5433/opentrattos_test', entities, migrations, synchronize: false })` — providers include `AuditLogService` + `AuditLogIdempotencyCache`
- [ ] 1.3 `beforeAll`: `dataSource.runMigrations()`
- [ ] 1.4 `beforeEach`: `TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE`
- [ ] 1.5 `afterAll`: `dataSource.destroy()` + `app.close()`
- [ ] 1.6 AC-CHAIN-1: first row per tenant has `prev_hash IS NULL`; row #2's `prev_hash = row1.row_hash`; both row hashes match `validateChainIntegrity()` recompute
- [ ] 1.7 AC-CHAIN-2: seed 200 rows; the 201st `record()` succeeds + validates correctly (lookback bound NOT exceeded; chain remains valid)
- [ ] 1.8 AC-CHAIN-2b: tampering row at index 5 (~195 rows back) does NOT block the next emit (proves the bound is bounded, not unbounded; the older tamper is outside the synchronous detection window)
- [ ] 1.9 AC-CHAIN-3: seed 50 rows; raw `UPDATE audit_log SET payload_after = '{"tampered":true}'::jsonb WHERE id = $row25.id`; next `record()` throws `HashChainBrokenError` with `firstBrokenRowId = row25.id`; assert DB row count remains 50 (no 51st row written)
- [ ] 1.10 AC-CHAIN-7: with `AuditLogIdempotencyCache` wired, two `record()` calls with identical `(eventType, aggregateId, correlationId)` produce exactly one DB row

## 2. Retention class CHECK constraint INT spec

- [ ] 2.1 New file `apps/api/src/audit-log/application/audit-log-retention-class.int.spec.ts`
- [ ] 2.2 Same harness shape as task §1.2-§1.5
- [ ] 2.3 AC-CHAIN-4: raw `INSERT ... retention_class = 'foobar'` rejected with SQLSTATE `23514` (CHECK violation)
- [ ] 2.4 AC-CHAIN-4b: raw insert with each of `'regulatory'`, `'operational'`, `'ephemeral'` succeeds
- [ ] 2.5 AC-CHAIN-4c: every value in `RETENTION_BY_EVENT_NAME` round-trips through a `record()` and lands in the DB as one of the three CHECK-accepted classes
- [ ] 2.6 AC-CHAIN-4d (drift surface): assert `pg_constraint.conname='audit_log_retention_class_check'` exists; assert the constraint definition contains the three literal values

## 3. Multi-tenant + per-aggregate INT spec

- [ ] 3.1 New file `apps/api/src/audit-log/application/audit-log-hash-chain-multi-tenant.int.spec.ts`
- [ ] 3.2 Same harness shape as task §1.2-§1.5
- [ ] 3.3 AC-CHAIN-5: seed 10 rows for org A + 10 rows for org B; raw UPDATE on org A's row #5 corrupts org A's chain; `record()` against org B succeeds; `record()` against org A throws `HashChainBrokenError`
- [ ] 3.4 AC-CHAIN-6a (per-aggregate happy path): within ONE org, interleave 25 lineage-A emits + 25 lineage-B emits ordered by emit time; `validateChainIntegrity()` returns `{ ok: true }` over the full 50-row tenant chain
- [ ] 3.5 AC-CHAIN-6b (per-aggregate boundary): tamper a lineage-A row mid-chain; the NEXT emit against lineage-B also fails with `HashChainBrokenError` — documenting that the chain is tenant-scoped, NOT aggregate-scoped (see ADR-PER-AGGREGATE-PARTITIONING in design.md)

## 4. Quality gates

- [ ] 4.1 `npm install`
- [ ] 4.2 `npm run typecheck` clean
- [ ] 4.3 `npm run lint` clean (no new violations)
- [ ] 4.4 `npm run test:api` green (unit tests unchanged; INT specs are excluded from the unit suite per `testPathIgnorePatterns: ["\\.int\\.spec\\.ts$"]`)
- [ ] 4.5 If `DATABASE_URL` reachable and Docker / VPS-Postgres available: `npm run test:int` green
- [ ] 4.6 If DB unreachable: document in PR body that INT was typecheck-only; tests are skipped at the connection layer (TypeOrm `forRoot()` throws `ECONNREFUSED` on `runMigrations()` — the spec file's `beforeAll` failure tears down the suite cleanly without flake)

## 5. OpenSpec artefacts

- [x] 5.1 `proposal.md`
- [x] 5.2 `design.md`
- [x] 5.3 `tasks.md` (this file)
- [x] 5.4 `specs/audit-log/spec.md`
- [x] 5.5 `.openspec.yaml`

## Deferred

- **D1** — async hash-chain rebuild for >10 K rows. The synchronous lookback in slice #21 is hard-capped at 100 rows; tampers older than that go undetected on append. A periodic background job that walks the full chain in batches + emits a `chain.integrity-report` for ops belongs in a follow-up. Filed as M3.x `m3-audit-log-async-hash-chain`.
- **D2** — partition-by-time of `audit_log`. With multi-year retention + multi-tenant scale, declarative partitioning by `created_at` quarter is the natural next step. Out of scope for this INT slice. Filed as M3.x.
- **D3** — cold-storage archival CLI. The `retention_class` column is the foundation; the CLI that walks `regulatory` rows to long-term S3 storage is M3.x.
- **D4** — Merkle anchor publication. Optional regulatory-grade public proof: periodically publish the latest tenant chain head's `row_hash` to a trusted timestamp authority. M3.x.
- **D5** — subscriber fan-out INT coverage — sibling slice H2a `m3-audit-log-subscriber-int-coverage`. THIS slice scopes only the chain + retention DB primitives. Sibling slice covers the subscriber's `@OnEvent` fan-out under real bus emissions.
