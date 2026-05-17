## Why

The single `AuditLogSubscriber` class at `apps/api/src/audit-log/application/audit-log.subscriber.ts` fans out 30+ `@OnEvent` handlers wired across M2+M3 (cost-domain channels, agent action lean + forensic, lot/stock-move/consumption, expiry-near, cost snapshot, PO 6 states, GR confirm + variances, email dispatched/failed, photo storage upload/delete, AI budget tier, recall 5 events, HACCP 3 events, APPCC export 2 events, photo ingestion 7 events). Each producing slice ships unit specs that mock the bus + `AuditLogService.record()`. Wave 2.3 slice #21 (`m3-audit-log-hash-chain-hardening`) also shipped unit specs at the service level.

What no slice covers: **end-to-end fan-out under real Postgres + EventEmitter2** with multi-tenant isolation, retention class enforcement (DB CHECK constraint from migration 0024), idempotency LRU dedup (10K capacity, 1h TTL), and try/catch swallowing (ADR-AUDIT-WRITER). The accumulated `*.int.spec.ts` files in `apps/api/src/audit-log/application/` cover FTS, export, and forensic split migration — none exercise the subscriber wiring through the bus.

This slice is the H2a half of the M3 hardening wave (H2b is hash-chain INT coverage, sibling slice — not touched here). It is **pure test addition**: zero schema change, zero production-code change, zero behaviour change. The deliverable is increased confidence that the 30+ wired handlers persist correctly under the real DB CHECK constraints, the real `EventEmitter2.emitAsync()` path, and the real LRU dedup.

## What Changes

- **`apps/api/src/audit-log/application/audit-log-subscriber-fan-out.int.spec.ts`** — the main fan-out matrix. For each of the 30+ channels wired in `AuditLogSubscriber`, emit a representative envelope via `EventEmitter2.emitAsync()` and assert one `audit_log` row lands with the right `event_type` name + `retention_class` per `RETENTION_BY_EVENT_NAME`. Covers `persistEnvelope` + `persistTranslated` + `persistDirect` paths.
- **`apps/api/src/audit-log/application/audit-log-subscriber-multi-tenant.int.spec.ts`** — multi-tenant isolation under concurrent emit. Two organisations A + B emit the same event type on the same channel concurrently; rows persist with the correct `organization_id` and never cross-leak.
- **`apps/api/src/audit-log/application/audit-log-subscriber-idempotency.int.spec.ts`** — LRU dedup. The same envelope emitted twice (within the TTL window) produces one row, not two. Verified against the production-config LRU (10K capacity, 1h TTL) wired via the module.
- **`apps/api/src/audit-log/application/audit-log-subscriber-resilience.int.spec.ts`** — try/catch swallowing per ADR-AUDIT-WRITER. A handler that throws (e.g. the GR translator on a malformed payload) MUST NOT propagate the error to the emitter, MUST log, AND MUST not block subsequent emissions.
- **`apps/api/src/audit-log/application/__helpers__/audit-log-int-harness.ts`** — shared test harness module. Builds a NestJS TestingModule with `EventEmitterModule.forRoot()` + `TypeOrmModule.forRoot()` against `process.env.DATABASE_URL ?? 'postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test'`. Registers `AuditLogSubscriber`, `AuditLogService`, `AuditLogIdempotencyCache` in providers (per `feedback_event_subscriber_int_specs` Hindsight memory — subscriber wiring needs explicit providers entry, EventEmitterModule alone is insufficient). Exposes `seedOrg(name)` + `truncateAuditLog()` + `emitAndWait(channel, payload)` utilities.

Per `feedback_event_subscriber_int_specs`, all emit→read sequencing uses `emitter.emitAsync()` + `await` so the read-after-write point is deterministic — no `setTimeout` flake.

**BREAKING**: none. Pure test addition. The new specs sit alongside existing `*.int.spec.ts` files in the audit-log BC and run only when `DATABASE_URL` is set (matches existing INT spec convention).

## Capabilities

### Modified Capabilities

- `audit-log-hardening`: extends with INT-grade verification of subscriber fan-out, multi-tenant isolation under concurrent emit, retention class DB enforcement, LRU dedup behaviour, and handler resilience under transient failure. No new requirements — the underlying contract was already shipped by slice #21 + producing slices; this slice adds AC-INT-* coverage requirements that bind the spec to integration tests.

## Impact

- **Prerequisites**: Master at `5cca037` (post-M3 22/22 merge). The audit-log BC + `AuditLogSubscriber` + `AuditLogIdempotencyCache` + migration 0024 (retention_class CHECK) all present.
- **Code**:
  - 4 new INT specs (~600-900 LOC total) under `apps/api/src/audit-log/application/`.
  - 1 shared harness module (~150 LOC) under `apps/api/src/audit-log/application/__helpers__/`.
  - Zero production code changes.
  - Zero migration changes.
- **Performance**: N/A — these are correctness tests; no benchmarking, no NFR coupling.
- **Audit**: increased coverage of regulatory chain-of-custody guarantees (multi-tenant isolation + retention class enforcement) for EU 178/2002 + HACCP audit trails.
- **Rollback**: trivial — delete the four new specs + harness.
- **Out of scope** (defer + document in tasks.md §Deferred):
  - E2E HTTP-layer coverage (separate concern — controller already has unit + service spec coverage).
  - Performance benchmarks of subscriber throughput (no NFR coupling; deferred to a future ops follow-up).
  - CI infrastructure for running INT specs (these are deferred-run-pending-docker per existing pattern — they live in master but only run when `DATABASE_URL` is set).
  - Migration of existing skipped INT specs into this slice's scope (e.g. `apps/api/test/int/recall-traversal-depth.int-spec.ts` stays deferred).
  - Slice H2b hash-chain INT coverage (sibling slice — do NOT touch hash-chain integrity tests in this slice).
- **Parallelism**: file-path scope = `apps/api/src/audit-log/application/audit-log-subscriber-*.int.spec.ts` + `apps/api/src/audit-log/application/__helpers__/audit-log-int-harness.ts`. No overlap with sibling H2b (its scope is `audit-log-hash-chain-*.int.spec.ts`).
- **Effort estimate**: M (~700 LOC test + ~150 LOC harness; no production touch).
