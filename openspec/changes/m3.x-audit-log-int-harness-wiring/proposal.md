# m3.x-audit-log-int-harness-wiring

## Problem

The 4 INT suites shipped (describe.skip'd) by H2a `m3-audit-log-subscriber-int-coverage` (PR #149) silently failed every test — `fetchRows` returned 0 rows after every `emitAndWait`. The skip-comment hypothesised that `@OnEvent` decorators weren't registering under the TestingModule harness, but the real cause was different.

## Root cause (TWO defects, the second is the dominant one)

**Defect A — bootstrap lifecycle never runs (dominant).** `Test.createTestingModule({...}).compile()` returns a compiled module but does NOT execute NestJS bootstrap hooks. The `@OnEvent` decorators on `AuditLogSubscriber` are wired by `@nestjs/event-emitter`'s `EventEmitterReadinessWatcher` during `onApplicationBootstrap`. Without `await app.init()`, the subscriber is silently inert — every emit fires into the void, the test sees 0 persisted rows, and there is no error to log because no handler was ever attached. Fix: add `await app.init()` immediately after `.compile()` in the harness.

**Defect B — UUID-typed column rejects fixture strings (secondary).** `audit_log.actor_user_id` is `uuid` (entity:48). Fixtures passed `actorUserId: 'user-1'` etc. After fixing Defect A the subscriber DOES fire, but persistence still fails on the UUID rejection — and the `AuditLogSubscriber.persistEnvelope` try/catch swallows it (per ADR-AUDIT-WRITER). Fix: replace non-UUID actor strings with valid UUID literals in the 4 INT specs. Same fix applies to `AGENT_ACTION_EXECUTED.executedBy` (translated to `actorUserId`).

The original PR (#149) hit Defect A first which masked Defect B. Both must be fixed for the suites to surface real ACs.

## Proposal

Two-line change per spec file:

1. Remove the `describe.skip` + SKIP comment block on each of the 4 suites.
2. Replace every `'user-1'`, `'user-A'`, `'user-B'` literal with a hex-format UUID constant (`TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`, `USER_A`, `USER_B`).

Zero production-code change. Zero migration. Zero harness change.

## FR mapping

Closes the AC-INT-1 through AC-INT-6 coverage gap that H2a's PR body claimed but every test silently failed.

## Out of scope

- Whether `AuditLogSubscriber` should rethrow (vs swallow) on UUID-type DB rejection. Filed `m3.x-audit-log-subscriber-strict-mode` to decide whether tests should observe the rejection (with `throwOnInsertFailure?: boolean` constructor flag).
- INT spec for the `*_INVOICE_PHOTO_ENABLED` kill-switch path.
