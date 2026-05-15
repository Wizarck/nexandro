# m3.x-h2b-skipped-tests-investigation

## Problem

H2b `m3-audit-log-hash-chain-int-coverage` (PR #150) shipped 3 `it.skip`'d tests with skip-comments claiming production behaviour didn't match the spec:

1. **AC-CHAIN-2 200-append** — skipped on "non-determinism in canonicaliseRow"
2. **AC-CHAIN-2b tamper outside 100-row window** — skipped on "production validates the FULL chain on every write, not 100-row window"
3. **AC-CHAIN-7 correlation_id dedup** — skipped on "production AuditLogService does NOT dedup by correlation_id at the persistence layer"

Two of the three skip-comments are **wrong about production behaviour** (re-checked via `apps/api/src/audit-log/application/audit-log.service.ts` and `audit-log-idempotency.ts`):

- Production DOES bound the lookback to `AUDIT_LOG_CHAIN_LOOKBACK_ROWS = 100` (line 48 of service).
- Production DOES dedup by `correlation_id` (snake_case) on `payload_after` via the LRU cache wired through `AuditLogService.record()` (lines 88-104).

## Proposal

Un-skip all 3 tests with diagnostic comments preserved on each. Push to CI and observe:

- **AC-CHAIN-2 200-append**: most likely still fails due to canonicaliseRow timestamp precision drift (JS Date ms vs Postgres TIMESTAMP μs truncation when reloaded). If so, file `m3.x-hash-chain-canonicalise-timestamp-precision`.
- **AC-CHAIN-2b tamper outside window**: should pass given the actual bounded lookback. If it still fails it shares the precision-drift root cause with the above.
- **AC-CHAIN-7 dedup**: should pass — the cache is provided in the harness; both calls use the same `correlation_id`. If it fails, the most likely cause is `@Optional()` ctor param resolving to null because the provider key doesn't match, file `m3.x-audit-log-idempotency-cache-injection`.

This is an **observation slice** — un-skip + ship + read CI. No fix attempted blindly. If CI reveals real fixes, they land as separate slices.

## Out of scope

- Fixing canonicaliseRow's timestamp handling (would be a production change deferred until CI confirms it's the root cause).
- Adding a strict-mode flag to AuditLogSubscriber (the parallel `m3.x-audit-log-subscriber-strict-mode` already covers that).
