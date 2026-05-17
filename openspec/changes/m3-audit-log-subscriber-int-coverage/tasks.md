## 1. Shared INT harness

- [ ] 1.1 `apps/api/src/audit-log/application/__helpers__/audit-log-int-harness.ts` — module that builds a NestJS TestingModule with `EventEmitterModule.forRoot()` + `TypeOrmModule.forRoot()` (DATABASE_URL fallback to `postgres://nexandro_test:nexandro_test@localhost:5433/nexandro_test`)
- [ ] 1.2 Same module: register `AuditLogSubscriber`, `AuditLogService`, `AuditLogIdempotencyCache` in providers (per `feedback_event_subscriber_int_specs` Hindsight memory — EventEmitterModule alone is insufficient; subscriber class must be in providers list)
- [ ] 1.3 Same module: expose `truncate()`, `emitAndWait(channel, payload)` (uses `emitter.emitAsync()` + `await` — no setTimeout), `fetchRows(orgId)`, `clearCache()` helpers
- [ ] 1.4 Same module: set `process.env.AUDIT_LOG_HASH_CHAIN_ENABLED='false'` in setup so chain validation does not couple this slice's tests to sibling H2b's contract

## 2. Fan-out matrix INT spec — AC-INT-1 + AC-INT-3 + AC-INT-6

- [ ] 2.1 `apps/api/src/audit-log/application/audit-log-subscriber-fan-out.int.spec.ts`
- [ ] 2.2 Parametrised matrix covering all 46 event types (10 M2 + 36 M3) — for each: emit representative envelope, assert exactly one row, assert `event_type` matches `AuditEventTypeName` mapping, assert `retention_class` matches `computeRetentionClass()` lookup
- [ ] 2.3 `persistDirect` path: `LOT_EXPIRY_NEAR` emitted on shared `audit.event` channel → row persists with `event_type='LOT_EXPIRY_NEAR'`
- [ ] 2.4 `persistTranslated` lean path: `AGENT_ACTION_EXECUTED` with `organizationId` → row persists with `aggregate_type='organization'`; without `organizationId` → no row (debug log only)
- [ ] 2.5 `persistTranslated` GR path: `GR_CONFIRMED` producer-shape with `grId` → row persists with `aggregate_type='goods_receipt'` and `aggregate_id=grId`
- [ ] 2.6 Retention class enforcement: assert regulatory events (`AGENT_ACTION_FORENSIC`, `LOT_CONSUMED`, `LOT_EXPIRY_NEAR`, `GR_CONFIRMED`, `COST_SNAPSHOT_RECORDED`, `PO_RECEIVED_FULL`, `PO_RECEIVED_PARTIAL`, `LOT_CREATED`, `STOCK_MOVE_CREATED`, all RECALL_*, all CCP_*, FSMS_STANDARD_CONFIGURED, EXPORT_BUNDLE_*, all PHOTO_INGESTION_*, PHOTO_EXTRACTION_FAILED, HITL_RETROACTIVE_CORRECTION) get `retention_class='regulatory'`; `AGENT_ACTION_EXECUTED` gets `'ephemeral'`; everything else gets `'operational'`
- [ ] 2.7 Negative test: attempt to write a row with `retention_class='unknown'` via raw `dataSource.query()` → fails with DB CHECK constraint violation (proves migration 0024's CHECK is live)

## 3. Multi-tenant isolation INT spec — AC-INT-2

- [ ] 3.1 `apps/api/src/audit-log/application/audit-log-subscriber-multi-tenant.int.spec.ts`
- [ ] 3.2 Two organisations A + B each emit `RECIPE_INGREDIENT_UPDATED` concurrently → rows persist with the correct `organization_id` each; cross-tenant fetch returns nothing
- [ ] 3.3 Same `aggregateId` UUID used by orgs A + B emitting on same channel → two distinct rows persist (org-scoped dedup key)
- [ ] 3.4 10 orgs × 5 events concurrent → 50 rows total, 5 per org, no cross-leak, no duplicates

## 4. Idempotency LRU dedup INT spec — AC-INT-4

- [ ] 4.1 `apps/api/src/audit-log/application/audit-log-subscriber-idempotency.int.spec.ts`
- [ ] 4.2 Same envelope emitted twice → one row, not two
- [ ] 4.3 Same envelope but different `payloadAfter` content → two rows (hash differs)
- [ ] 4.4 Same envelope but different `payloadAfter.correlation_id` → two rows (correlation_id overrides hash key)
- [ ] 4.5 Capacity eviction smoke: emit 10_005 distinct envelopes; assert `cache.size() <= 10_000` after the dust settles; all 10_005 rows persisted because each distinct envelope hashes to a unique key

## 5. Resilience INT spec — AC-INT-5

- [ ] 5.1 `apps/api/src/audit-log/application/audit-log-subscriber-resilience.int.spec.ts`
- [ ] 5.2 Translator throws scenario: emit `GR_CONFIRMED` with malformed payload (`{}` — missing `organizationId` and `grId`); subscriber's translator throws; emitter's `emitAsync()` resolves without rejection; no row persists; subsequent emit of a well-formed GR_CONFIRMED still produces a row
- [ ] 5.3 DB write fails transient scenario: spy on `service.record` to throw once; emit envelope; emitter's `emitAsync()` resolves; no row from the throwing emit; subsequent emits succeed (record restored)
- [ ] 5.4 validateEnvelope null scenario: emit envelope missing `actorKind` (sentinel undefined); subscriber logs warn + skips; emitter's `emitAsync()` resolves; subsequent emits succeed

## 6. Cleanup + lifecycle

- [ ] 6.1 All four specs use `beforeEach` TRUNCATE + cache clear so no state leaks across cases (`--runInBand` is the default per jest-integration.config.ts)
- [ ] 6.2 All four specs close DataSource + TestingModule in `afterAll`
- [ ] 6.3 None uses `describe.skip` (the recall placeholder pattern is for deferred implementations; ours are the deliverable)
- [ ] 6.4 None uses `setTimeout` to wait for the subscriber; all reads come after `await emitter.emitAsync(...)` completes

## 7. Quality gates

- [ ] 7.1 `npm install` from repo root
- [ ] 7.2 `npm run typecheck` clean
- [ ] 7.3 `npm run lint` clean
- [ ] 7.4 `npm run test --workspace=@nexandro/api` — unit tests still pass; INT tests not part of this command
- [ ] 7.5 (Optional) `npm run test:int --workspace=@nexandro/api` if local Postgres at 5433 available; otherwise rely on CI / future docker INT run

## §Deferred

- **D1** E2E HTTP-layer coverage of subscriber persistence (separate concern from fan-out; the `/audit-log` HTTP controller already has unit + service spec coverage; an E2E layer is a future ops follow-up if NFR-OBS-* requires it).
- **D2** Performance benchmarks of subscriber throughput (no NFR coupling at present; deferred to a future load-test follow-up if throughput becomes a constraint).
- **D3** CI infrastructure to actually run INT specs on every PR (current state: deferred-run-pending-docker matches the existing `audit-log-fts.int.spec.ts` + `audit-log-export.int.spec.ts` pattern; specs live in master but only run when DATABASE_URL is set).
- **D4** Time-based LRU TTL eviction test (covered by unit spec `audit-log-idempotency.spec.ts`; INT scope is capacity + wiring).
- **D5** Hash-chain INT coverage under fan-out (sibling slice H2b owns this; this slice disables chain validation to decouple).
- **D6** Migration of existing skipped INT specs (e.g. `apps/api/test/int/recall-traversal-depth.int-spec.ts`) into this slice's scope — that placeholder belongs to its originating slice's follow-up.
- **D7** Verification that all 46 event types listed in the fan-out matrix are actually emitted by their producing services (the originating slice's unit spec covers each producer; this slice only verifies the subscriber half).
