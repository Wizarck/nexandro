# Design — m3-audit-log-hash-chain-int-coverage

> Hardening slice H2b. Backfills Postgres-backed INT coverage for slice #21's rowHash/prevHash chain + 100-row lookback + tamper detection + `retention_class` CHECK constraint + multi-tenant + per-aggregate independence + idempotent re-emit. Pure test-only — no production code change.

## ADRs

### ADR-100-ROW-LOOKBACK-VERIFICATION — assert the lookback bound functionally, not via EXPLAIN

**Decision**: assert the 100-row lookback bound by inserting >100 rows then observing chain validity, rather than asserting on Postgres's `EXPLAIN ANALYZE` `Rows Read` counter.

**Why**: EXPLAIN-based assertions are flaky across PG planner versions. The existing `audit-log-fts.int.spec.ts` already articulates the same lesson (lines 270-285) for the FTS index. The functional contract that matters for hash-chain integrity is:

1. The 100-row lookback validator runs successfully when the chain length is well above 100 (≥200 rows).
2. A tamper at chain position N detects on the next emit only if N is within the most recent 100 rows; tampers older than that ARE NOT caught synchronously (this is the documented limit of the per-write validator — see slice #21 spec.md "Lookback is bounded at 100 rows" scenario, plus design.md ADR-HASH-CHAIN-VALIDATION-PER-WRITE).

So the INT spec inserts 200 rows, tampers row index 5 (now ~195 rows back, well outside the 100-row window), and asserts the NEXT emit succeeds without raising — proving the validator's window IS bounded. Then it tampers row index 195 (within the window) and asserts the next emit DOES raise. The pair establishes the contract.

**Alternative considered**: `EXPLAIN (ANALYZE, BUFFERS) SELECT ...` plus `SET enable_seqscan = off` and a regex over the explain text. Rejected per the FTS spec rationale.

### ADR-TAMPER-DETECTION-PANIC-OR-CONTINUE — fail the new write; do NOT auto-rotate the chain root

**Decision**: when the per-write lookback detects a broken chain on append, the system throws `HashChainBrokenError`, refuses to commit the new row, and the caller surfaces HTTP 500. The chain does NOT auto-rotate — i.e. we do NOT insert a "chain reset" marker row and continue emitting under a fresh root.

**Why**:
- Slice #21 design.md (ADR-HASH-CHAIN-RECOVERY) chose fail-the-write explicitly. The rationale is that an undetected silent rotate would lose the forensic trail the regulator depends on (EU 178/2002, HACCP). The operator is expected to investigate WHY the chain broke (DB integrity? compromised connection? backup restore from inconsistent point?) before the audit log can be re-enabled.
- Auto-continue would mean: every detected tamper attempt is now hidden behind a single warning log; the attacker who can break the chain ONCE silently breaks it forever.
- The `AUDIT_LOG_HASH_CHAIN_ENABLED=false` env-var kill-switch exists for the disaster recovery window: ops can disable validation, manually re-anchor the chain (re-run the migration 0023 backfill against the surviving rows), then re-enable validation. This is the documented recovery path.

The INT spec asserts the panic-and-stop behaviour: after the 51st emit fails with `HashChainBrokenError`, the DB row count is unchanged at 50.

### ADR-MULTI-TENANT-CHAIN-INDEPENDENCE — tenant-scoped lookback is the isolation boundary

**Decision**: `AuditLogService.loadChainLookback()` filters by `organization_id`. The INT spec verifies that corrupting org A's tail row does NOT block org B's next `record()`.

**Why**: the slice #21 code already filters by org (see `audit-log.service.ts` line 209: `.where('a.organization_id = :orgId', ...)`). The INT spec backfills the missing assertion against a real DB. Without this test, a future refactor that drops the org filter (e.g. via a "global rebuild" follow-up) could silently introduce a cross-tenant data leak in the validator's read path — a Tier-1 multi-tenant defect.

The INT spec creates two orgs, seeds 10 rows each, tampers org A's row #5 via direct UPDATE, then calls `record()` against org B and expects success. Then it calls `record()` against org A and expects `HashChainBrokenError` (the org-A chain IS broken; the spec confirms BOTH directions of isolation).

### ADR-PER-AGGREGATE-PARTITIONING — chain is tenant-scoped, not aggregate-scoped — INT spec documents the boundary

**Decision**: the hash chain is per-`(organizationId)`, NOT per-`(organizationId, aggregateType, aggregateId)`. Within one org, all event-type emissions across all aggregates share a single tenant chain. The INT spec asserts:

1. Interleaving 50 lineage-A + 50 lineage-B emits within ONE org produces a single 100-row chain ordered by `(created_at, id)` that validates via `validateChainIntegrity()`.
2. Tampering one lineage-A row breaks the NEXT emit at the tenant level — including emits against lineage B, because the lookback is tenant-wide.

**Why**: per-aggregate sub-chaining was considered for slice #21 and rejected (design.md, ADR-HASH-CHAIN-SCOPE). Reasons retained here for the INT spec test author:
- Per-aggregate sub-chaining requires aggregate state to be defined at row level (`aggregate_type + aggregate_id`); but many M3 audit rows are "cross-aggregate" (e.g. an EXPORT_BUNDLE_GENERATED row references multiple aggregates). The single-tenant chain side-steps the issue.
- A tenant-wide chain is one continuous lookback per write; per-aggregate would be one lookback per `(aggregate_type, aggregate_id)` per write — N× the cost when an emit touches N aggregates.
- A tenant-wide chain trivially detects ANY tampering, regardless of which aggregate was touched. A per-aggregate chain only detects tampering within the specific aggregate's sub-chain.

The INT spec's role is **documenting** this boundary so a future contributor reading "per-aggregate" tasks doesn't introduce a regression assuming per-aggregate isolation. The test asserts the tenant-scoping holds: a corrupted lineage-A row blocks lineage-B's NEXT emit too.

### ADR-RETENTION-CHECK-DB-ENFORCED — the CHECK constraint is the source of truth, not the TS lookup

**Decision**: the INT spec asserts the DB CHECK constraint `audit_log_retention_class_check` actually rejects values outside `('regulatory','operational','ephemeral')` — via a raw `INSERT ... retention_class = 'foobar'` that expects a `23514` SQLSTATE error.

**Why**: the TS side has `computeRetentionClass()` plus the `RETENTION_CLASSES` const plus the `RetentionClass` union type. All three could be edited consistently to "add a new class" — but if the DB CHECK isn't updated in parallel, every write of the new class fails at runtime. The INT spec catches that drift by asserting:

1. The CHECK constraint exists with the exact three values (via `pg_constraint` lookup — same pattern the FTS spec uses for `pg_indexes`).
2. The `RETENTION_BY_EVENT_NAME` lookup table only emits values in the CHECK set.
3. A raw insert with a non-CHECK value fails.

This is "drift surfacing" coverage — the same pattern slice #21's FTS spec uses for the GIN index def.

## Test harness shape

Each INT spec follows the existing `audit-log-fts.int.spec.ts` harness:

1. `Test.createTestingModule()` with `TypeOrmModule.forRoot({ url: process.env.DATABASE_URL ?? 'postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test', migrations: [...], synchronize: false })`.
2. `dataSource.runMigrations()` in `beforeAll` — applies 0001 through current head, including 0023 + 0024.
3. `TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE` in `beforeEach` — guarantees a clean slate so prior-test rows don't poison the lookback window.
4. `afterAll`: `dataSource.destroy()` + `app.close()`.

Each spec is self-contained (does NOT depend on shared fixtures across spec files). A shared helper module is NOT introduced for this slice — the 200-row seed routine is small enough to inline, and avoiding the helper keeps the spec files independently runnable with `jest --testPathPattern=audit-log-hash-chain-integrity`.

## Why no `apps/api/test/int/` location

The slice prompt's "scope in" section suggests `apps/api/test/int/`. However, the existing INT spec convention in this repo (verified by `audit-log-fts.int.spec.ts`, `audit-log-forensic-split-migration.int.spec.ts`, `audit-log-export.int.spec.ts`) places INT specs **next to the source under test**, at `apps/api/src/.../application/*.int.spec.ts`. The jest config (`jest-integration.config.ts`) is configured with `rootDir: 'src'` + `testRegex: '.*\\.int\\.spec\\.ts$'`, so specs under `apps/api/test/int/` would NOT be picked up by `npm run test:int` without a config change.

Decision: keep the existing convention. New INT specs land at `apps/api/src/audit-log/application/`. This matches the reference INT specs already in master, requires zero config change, and ensures `npm run test:int` discovers the new specs immediately.

## Deferred / out of scope

See `proposal.md` "Out of scope" section. The deferred items file as separate M3.x backlog slices; none of them are required for the AC set in this slice.
