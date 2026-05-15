# Tasks — m3.x-audit-log-idempotency-cache-injection

## §1 Diagnosis

- [x] Verified `AuditLogIdempotencyCache` provider IS registered in `AuditLogModule.providers` (audit-log.module.ts:32-35) AND in the H2a harness (`__helpers__/audit-log-int-harness.ts:105-108`).
- [x] Verified the legacy `audit-log.service.spec.ts` (line 159-164) DOES NOT register the cache provider — backwards-compat constraint to preserve.
- [x] Identified root cause: `idempotencyCache: AuditLogIdempotencyCache | null` parameter type → emitted `design:paramtypes` metadata is `Object` (TS can't represent unions in decorator metadata); NestJS DI looks up `Object` token, fails, `@Optional()` returns undefined, default `= null` applies.

## §2 Production fix

- [x] `apps/api/src/audit-log/application/audit-log.service.ts` — add `@Inject(AuditLogIdempotencyCache)` between `@Optional()` and the parameter; update the doc comment to explain the explicit token requirement.

## §3 Unit test additions

- [x] `apps/api/src/audit-log/application/audit-log.service.spec.ts` — add a `describe('idempotency cache DI', () => { … })` block with 2 cases:
  - `'falls back to null when no provider is registered'` — builds a `TestingModule` with only `getDataSourceToken` provided, asserts `service['idempotencyCache']` is `null`.
  - `'injects the registered cache when AuditLogIdempotencyCache is in providers'` — builds a `TestingModule` with both providers, asserts the field is a non-null `AuditLogIdempotencyCache` instance.

## §4 INT test un-skip

- [x] `apps/api/src/audit-log/application/audit-log-subscriber-idempotency.int.spec.ts`:
  - Remove `it.skip` + SKIP comment block on `same envelope emitted twice → one row persists`. Replace with a one-liner pointing back to slice `m3.x-audit-log-idempotency-cache-injection`.
- [x] `apps/api/src/audit-log/application/audit-log-hash-chain-integrity.int.spec.ts`:
  - Remove `it.skip` + SKIP comment block on `AC-CHAIN-7 — two record() calls with identical (eventType, aggregateId, correlationId) yield one row`. Same one-liner pointer.

## §5 Local gates

- [x] `npm test --workspace=apps/api -- --testPathPattern=audit-log` — all unit specs green including the 2 new DI cases.
- [x] `npx tsc --noEmit -p apps/api/tsconfig.json` — no new errors in audit-log files.
- [x] `npx eslint` on the 4 changed files — clean.
- [ ] CI Integration on real Postgres confirms the 2 un-skipped tests pass.

## §6 §4.5.6 AI-reviewer signoff

- [x] Profile: production-bug-fix slice, defensively-shipped (no observable production impact today, but design-contract violation).
- [x] Reviewer self-review:
  - One root cause documented + the TS metadata-emit mechanism cited with code? **yes**
  - All 3 callers of AuditLogService analysed: production module, H2a harness, legacy service spec? **yes (invariants section)**
  - No collateral changes (only 1 decorator added, 2 unit cases, 2 INT un-skips)? **yes**

## Deferred / out of scope

- `m3.x-audit-log-idempotency-required-mode` — would tighten the cache from `@Optional()` to required if future telemetry shows the LRU dedup alone misses real double-fires (today's design accepts this as defence-in-depth per ADR-IDEMPOTENT-EMIT-DEDUP). Filed if/when needed.
- `m3.x-audit-log-subscriber-strict-mode` — orthogonal H2a followup (whether the subscriber should rethrow DB errors instead of swallowing). Untouched by this slice.
