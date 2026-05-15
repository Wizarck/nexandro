# Tasks — m3.x-h2b-skipped-tests-investigation

## §1 Diagnosis

- [x] Re-read `audit-log.service.ts` + `audit-log-idempotency.ts` against the 3 skip-comments.
- [x] Confirm production HAS bounded 100-row lookback (line 48 of service).
- [x] Confirm production DOES dedup by `correlation_id` snake-case on `payload_after` (lines 88-104).
- [x] Two of three skip-comments were wrong about production behaviour.

## §2 Un-skip + observe

- [x] AC-CHAIN-2 "chain remains valid at length 200; 201st append succeeds" — un-skipped with timestamp-precision-drift hypothesis comment.
- [x] AC-CHAIN-2b "tampering outside 100-row window does NOT block next emit" — un-skipped (production bounds lookback as the AC claims).
- [x] AC-CHAIN-7 "two record() calls yield one row" — un-skipped (production dedup is wired).

## §3 Observation pipeline — CI outcome (2026-05-15)

CI Integration run on the un-skip confirmed all 3 hypothesised root causes:

- **AC-CHAIN-2 200-append**: FAIL with HashChainBrokenError at the ~101st append. Confirms canonicaliseRow timestamp-precision drift.
- **AC-CHAIN-2b tamper outside window**: FAIL with the same HashChainBrokenError pattern. Untestable until the precision bug is fixed.
- **AC-CHAIN-7 correlation_id dedup**: FAIL with 2 rows instead of 1. Confirms AuditLogIdempotencyCache is not injected under the TestingModule (the `@Optional()` ctor param resolves to null even though the provider is registered in `providers: [...]`).

## §4 Re-skip with confirmed diagnosis

- [x] AC-CHAIN-2 re-skipped with confirmed canonicaliseRow precision-drift root cause + followup name.
- [x] AC-CHAIN-2b re-skipped (same root cause).
- [x] AC-CHAIN-7 re-skipped with confirmed cache-injection root cause + followup name.

## Filed followups

- `m3.x-hash-chain-canonicalise-timestamp-precision` — fix canonicaliseRow to round createdAt to a fixed precision so hash recomputation is stable across write→read→validate cycles.
- `m3.x-audit-log-idempotency-cache-injection` — diagnose why `@Optional()` resolves to null under TestingModule + either fix the harness DI OR tighten AuditLogService ctor to make the cache required.
