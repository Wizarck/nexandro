# Tasks — m3.x-hash-chain-window-prevhash-seed

## §1 Diagnosis

- [x] Re-read `validateChainIntegrity()` + `loadChainLookback()` in frame; confirm sliding-window semantics broken when window starts mid-chain.
- [x] Confirm the off-by-one in the H2b skip-comment ("~101st append" should read "write 102").
- [x] Confirm the unit test suite for `validateChainIntegrity` never exercises a sliding window starting at row > 0.

## §2 Production fix

- [x] `apps/api/src/audit-log/application/audit-log-hash-chain.ts:121` — change `let prevHash: Buffer | null = null` to `let prevHash: Buffer | null = rows.length > 0 ? rows[0].prevHash : null` and update the function's JSDoc to document the within-window validation contract.

## §3 Unit test additions

- [x] `apps/api/src/audit-log/application/audit-log-hash-chain.spec.ts` — add 2 cases in the `validateChainIntegrity` block:
  - `'validates a sliding window starting mid-chain (rows N..N+M)'` — build a 100-row chain, slice rows 50..99, assert `{ ok: true }`.
  - `'detects tampering in a sliding window starting mid-chain'` — same slice, tamper row 75's `payloadAfter`, assert `{ ok: false, firstBrokenRowId: 'row-75' }`.

## §4 INT test un-skip

- [x] `apps/api/src/audit-log/application/audit-log-hash-chain-integrity.int.spec.ts`:
  - Remove `it.skip` + SKIP comment on `AC-CHAIN-2 — chain remains valid at length 200; 201st append succeeds`.
  - Remove `it.skip` + SKIP comment on `AC-CHAIN-2b — tampering a row outside the 100-row window does NOT block the next emit`.
  - Replace skip-comment blocks with a brief one-line note pointing to slice `m3.x-hash-chain-window-prevhash-seed` that fixed them.

## §5 Local gates

- [x] `pnpm --filter @opentrattos/api test -- audit-log-hash-chain` passes (unit-level coverage of the fix).
- [x] `pnpm --filter @opentrattos/api tsc --noEmit` passes.
- [x] `pnpm --filter @opentrattos/api lint` passes for the changed files.
- [ ] CI Integration job runs AC-CHAIN-2 + AC-CHAIN-2b on real Postgres and they pass (verified post-merge).

## §6 §4.5.6 AI-reviewer signoff

- [x] Profile: production-bug-fix slice. Scope: 1-line prod change + 2 unit cases + 2 INT un-skips.
- [x] Reviewer self-review checklist:
  - One root cause documented + multiple alternative hypotheses ruled out?
  - Behavioural invariants enumerated + each shown preserved?
  - No collateral changes (only the 1 line + tests + un-skip)?
  - Memory note ready to update the obsolete `m3.x-hash-chain-canonicalise-timestamp-precision` followup name?

## Deferred / out of scope

- `m3.x-audit-log-idempotency-cache-injection` — separate AC-CHAIN-7 + idempotency-dedup failure (different root cause: `@Optional()` DI null under TestingModule). Next slice to pick.
- Renaming the obsolete followup `m3.x-hash-chain-canonicalise-timestamp-precision` in any docs that referenced it — none found in the project tree (the only references are in two memory files + the F4 PR body).
