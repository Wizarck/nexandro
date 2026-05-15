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

## §3 Observation pipeline

- [ ] CI runs Integration job against test Postgres.
- [ ] Three possible outcomes per test:
  - PASS → spec was correct, skip-comment was wrong; this slice closes the loop on that test.
  - FAIL with the hypothesised root cause (precision drift / DI null) → file the appropriate followup.
  - FAIL with a NEW symptom → deeper investigation required, file `m3.x-h2b-deep-investigation`.

## Deferred (conditional on CI outcome)

- `m3.x-hash-chain-canonicalise-timestamp-precision` — fix canonicaliseRow to round timestamps to a fixed precision so hash recomputation is stable across write→read→validate cycles.
- `m3.x-audit-log-idempotency-cache-injection` — diagnose why `@Optional()` resolves to null under TestingModule if the cache provider is registered.
