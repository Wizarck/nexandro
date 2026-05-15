## Why

M3 hardening wave H2b. Slice #21 `m3-audit-log-hash-chain-hardening` introduced rowHash/prevHash chained integrity on the `audit_log` table (migrations 0023 + 0024) plus a 100-row lookback validation on every write and a `retention_class` CHECK enum constraint. The slice landed extensive UNIT coverage in `audit-log-hash-chain.spec.ts` (172 LOC) and `audit-log.service.spec.ts` (507 LOC), but **no integration test exercises the chain end-to-end against a real Postgres** including:

1. The `ix_audit_log_chain` btree index actually drives the lookback.
2. The `audit_log_retention_class_check` DB CHECK constraint actually rejects values outside `('regulatory','operational','ephemeral')`.
3. Tamper detection works under a real out-of-band `UPDATE audit_log SET payload_after = ...` (the surface the chain is designed to catch — a DBA / compromised connection rewriting history).
4. Multi-tenant isolation: corrupting org A's chain does NOT block org B from emitting.
5. Per-aggregate independence: lineage A and lineage B within one org remain independently valid.
6. Idempotent re-emit through the chain: the LRU dedup short-circuits BEFORE the chain append so no chain row is produced for a duplicate envelope.

Without this INT coverage, slice #21's regulatory guarantees (EU 178/2002 + HACCP traceability) rest only on unit tests that mock out the DB. A future refactor — e.g. swapping the QueryBuilder lookback to raw SQL, or changing the canonicalisation rules in `audit-log-hash-chain.ts` — could silently desync application-side hashing from migration-side backfill hashing without any failing unit test, because both sides mock the same canonicalisation helper. The INT spec closes that hole by running migrations 0023 + 0024 against a real Postgres, then exercising the public `AuditLogService.record()` write path and asserting the on-disk row layout matches the validator's expectations on every append.

## What Changes

- **`apps/api/src/audit-log/application/audit-log-hash-chain-integrity.int.spec.ts`** — new INT spec (Postgres-backed):
  - AC-CHAIN-1 — rowHash/prevHash wire correctly: first row per tenant has `prev_hash IS NULL`; subsequent rows have `prev_hash = priorRow.row_hash` and `row_hash = SHA-256(prev_hash || canonicaliseRow(row))`.
  - AC-CHAIN-2 — 100-row lookback: insert 200 valid rows; the 201st append succeeds and reads only ≤100 rows for validation (asserted via row count after a measured lookback call, not EXPLAIN ANALYZE — keeps the assertion stable across PG planner versions).
  - AC-CHAIN-3 — mid-chain tamper detection: insert 50 rows; directly `UPDATE audit_log SET payload_after = '...' WHERE id = $rowAt25.id` (the public API will not let you write a bad hash; raw SQL is mandatory); the next `record()` call detects the mismatch and throws `HashChainBrokenError` with `firstBrokenRowId = rowAt25.id`. The 51st row is NOT written (DB row count unchanged).
  - AC-CHAIN-7 — idempotent re-emit: with the `AuditLogIdempotencyCache` wired, two `record()` calls with identical `(eventType, aggregateId, correlationId)` produce exactly one DB row.
- **`apps/api/src/audit-log/application/audit-log-retention-class.int.spec.ts`** — new INT spec (Postgres-backed):
  - AC-CHAIN-4 — DB CHECK rejects unknown retention_class: a raw `INSERT ... retention_class = 'foobar'` is rejected by the Postgres CHECK constraint with a `23514` SQLSTATE.
  - AC-CHAIN-4b — DB CHECK accepts the three canonical values: `'regulatory'`, `'operational'`, `'ephemeral'` all insert successfully.
  - AC-CHAIN-4c — `computeRetentionClass()` ↔ DB CHECK contract: every value in `RETENTION_BY_EVENT_NAME` (the lookup table in `types.ts`) is one of the three CHECK-accepted values; round-trips through a `record()` call land the row with the lookup-derived value.
- **`apps/api/src/audit-log/application/audit-log-hash-chain-multi-tenant.int.spec.ts`** — new INT spec (Postgres-backed):
  - AC-CHAIN-5 — multi-tenant chain isolation: corrupt org A's tail row via direct UPDATE; org B's next `record()` succeeds (org B's lookback never touches org A's rows).
  - AC-CHAIN-6 — per-aggregate chain partitioning: within ONE org, interleave 50 lineage-A + 50 lineage-B rows. After interleaving, the full chain (read in `(created_at, id)` order) validates per `validateChainIntegrity()`; corrupting a lineage-A row only breaks the chain on the next append in org-level lookback, NOT a per-aggregate sub-chain (the lookback is tenant-scoped, NOT aggregate-scoped — see design.md ADR-PER-AGGREGATE-PARTITIONING for the reconciliation).
- **No production code touched.** No migration. No service changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `audit-log-hash-chain`: backfills end-to-end INT coverage. No code behaviour change.
- `audit-log-retention-class`: backfills end-to-end INT coverage. No code behaviour change.

## Impact

- **Prerequisites**: slice #21 (`m3-audit-log-hash-chain-hardening`) merged at master tip `5cca037`. Migrations 0023 + 0024 are present in `apps/api/src/migrations/`. The full M3 wave (22/22) is closed.
- **Code**:
  - Three new INT spec files at `apps/api/src/audit-log/application/*.int.spec.ts` (jest config: `rootDir: 'src'`, `testRegex: '.*\\.int\\.spec\\.ts$'`, picked up by `npm run test:int`).
  - Zero production code touched.
  - Combined LOC budget ~600-800.
- **Performance**: INT specs run only via `npm run test:int` (requires `DATABASE_URL` and a real Postgres). Unit suite (`npm run test:api`) unchanged.
- **Risk**: None — test-only addition. The specs may flake on a misconfigured DB harness; they skip cleanly when `DATABASE_URL` is unset (TypeOrm `forRoot` falls back to `postgres://opentrattos_test:opentrattos_test@localhost:5433/opentrattos_test` per the convention in the existing `audit-log-fts.int.spec.ts`).
- **No BREAKING.** No public API touched.

## Out of scope (deferred)

- **Async hash-chain rebuild for >10 K rows** — filed as M3.x `m3-audit-log-async-hash-chain`. Slice #21 design.md ADR-HASH-CHAIN-VALIDATION-PER-WRITE caps the synchronous validation at 100 rows; a periodic full-chain audit job is out of scope here.
- **Partition-by-time of audit_log** — filed as M3.x.
- **Cold-storage archival CLI** — filed as M3.x. The `retention_class` column is the foundation; this slice only verifies the CHECK constraint.
- **Merkle anchor publication** — filed as M3.x.
- **Subscriber fan-out INT coverage** — sibling slice H2a `m3-audit-log-subscriber-int-coverage` owns the fan-out side. THIS slice scopes only the hash chain + retention DB primitives.
