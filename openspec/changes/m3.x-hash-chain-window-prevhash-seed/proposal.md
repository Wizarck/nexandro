# m3.x-hash-chain-window-prevhash-seed

## Problem

`AuditLogService.record()` validates the hash chain over the most-recent 100 rows on every append (per ADR-HASH-CHAIN-VALIDATION-PER-WRITE, slice #21). At write **N=102 and beyond** for a tenant, the lookback window slides past the chain root (row 1) and `validateChainIntegrity()` throws `HashChainBrokenError` even on an untampered chain. Production tenants will hit this as soon as they accumulate 101 audit rows.

The skip-comments in H2b's `audit-log-hash-chain-integrity.int.spec.ts` attributed the failure to "canonicaliseRow timestamp-precision drift". After reading the production code in frame, this diagnosis is **incorrect**.

## Root cause

`validateChainIntegrity()` (audit-log-hash-chain.ts:121) initialises `prevHash = null` unconditionally, then iterates oldest-to-newest computing `expected = SHA(prevHash, canonicaliseRow(row))`. This is correct **only** when the input begins at the chain root (a row whose stored `prevHash = null`).

`loadChainLookback()` (audit-log.service.ts:205) returns the most-recent `AUDIT_LOG_CHAIN_LOOKBACK_ROWS=100` rows (DESC + reversed to oldest-first). At write 102, with rows 1..101 already persisted, the lookback returns rows 2..101. The validator now starts iteration at row 2 with `prevHash=null`, but row 2's stored `row_hash` was computed with `prevHash = row1.rowHash`. The recomputed hash diverges → `HashChainBrokenError` thrown → write 102 rejected.

**Symptoms covered by this hypothesis**:

| Test | Window at validate-time | First row of window | prevHash init | Outcome |
|---|---|---|---|---|
| AC-CHAIN-1 (2 rows) | [row1] before write 2 | row1 (root) | null ✓ | PASS |
| AC-CHAIN-3 (50 rows + tamper at row 25) | rows 1..50 | row1 (root) | null ✓ | tamper detected; PASS |
| AC-CHAIN-2 (200 writes) | rows 2..101 at write 102 | row2 (not root) | null ✗ | mismatch on row 2; **fail at ~write 102** |
| AC-CHAIN-2b (200 rows + tamper at row 5 + write 201) | rows 101..200 at write 201 | row101 (not root) | null ✗ | mismatch on row 101; **fail** |

Symptom location ("~101st append" in the skip-comment) matches: first append where the window first excludes the root is **N=102**, not 101. The off-by-one is a typo in the original observation.

The unit tests for `validateChainIntegrity` (audit-log-hash-chain.spec.ts:131-170) all exercise full chains starting at row 0 with `prevHash=null` — none exercises a sliding window starting mid-chain. That's why slice #21 shipped with this bug undetected.

## Proposal

One-line production fix:

```ts
// audit-log-hash-chain.ts — validateChainIntegrity()
- let prevHash: Buffer | null = null;
+ let prevHash: Buffer | null = rows.length > 0 ? rows[0].prevHash : null;
```

Semantics after fix: the first row of the window is validated against **its own stored `prev_hash`** (self-consistent — `SHA(row.prevHash, canonicalise(row))` must equal `row.rowHash`). Subsequent rows derive `prevHash` from the prior row's `rowHash` as before. The validator now correctly validates the chain **within** the window without requiring the window to begin at chain root — which is precisely the intent of ADR-HASH-CHAIN-VALIDATION-PER-WRITE (bounded-cost per-write validation; older tampers caught by the offline D1 audit).

## Behavioural invariants preserved

- **Tamper at row N within window**: row N's stored `row_hash` was computed with the original `prev_hash`. Recomputed `SHA(prevHash, canonicalise(rowN))` uses the same stored `prevHash` (untampered) and the **tampered** content → divergence → detected. ✓
- **Tamper to row N's `prev_hash` only**: validator computes `expected = SHA(rowN.prevHash, canonicalise(rowN))` using the tampered value; doesn't match stored `row_hash` (which was computed with the original prev). Detected. ✓
- **Tamper to row N's `prev_hash` AND `row_hash` consistently**: would require also re-computing every downstream `row_hash`. Within-window any downstream divergence is detected; outside-window the offline D1 audit catches it. (No regression vs current behaviour — slice #21's design accepted bounded-window detection.)
- **Empty input**: still returns `{ ok: true }`. ✓
- **Full-chain audit (offline D1)**: called with all rows for a tenant; row 0 is the root with stored `prevHash = null`; initialisation seeds `null`; identical behaviour to today. ✓
- **Legacy unbackfilled rows (rowHash=null)**: branch at audit-log-hash-chain.ts:123 still resets `prevHash = null` correctly. ✓

## Test additions

- Unit: `validateChainIntegrity` with a sliding window (rows 50..99 of a 100-row chain). Should return `{ ok: true }` after the fix; would return `{ ok: false, firstBrokenRowId: 'row-50' }` before the fix.
- Unit: same sliding window with row 75 tampered. Should detect at row 75 with the fix.
- Integration: un-skip `AC-CHAIN-2 (200-append)` and `AC-CHAIN-2b (tamper outside window)` in `audit-log-hash-chain-integrity.int.spec.ts`. Both should pass with the fix.

## FR mapping

Closes the AC-CHAIN-2 + AC-CHAIN-2b coverage and resolves the (mis-named) followup `m3.x-hash-chain-canonicalise-timestamp-precision`. NFR-PERF-2 budget unchanged (no extra DB roundtrip).

## Out of scope

- The unrelated H2b followup `m3.x-audit-log-idempotency-cache-injection` (AC-CHAIN-7 dedup test failure — separate `@Optional()` DI bug).
- Re-validating offline D1 full-chain audit semantics — unchanged (the fix is a no-op when row 0 is the chain root).
- Renaming the (now-obsolete) followup `m3.x-hash-chain-canonicalise-timestamp-precision` — handled in memory update.
