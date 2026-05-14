## 1. Migration 0023 — hash chain columns + index + backfill

- [ ] 1.1 `apps/api/src/migrations/0023_audit_log_hash_chain.ts` — add `row_hash bytea NOT NULL` + `prev_hash bytea NULL` to `audit_log`
- [ ] 1.2 Same migration: add `ix_audit_log_chain` on `(organization_id, created_at DESC, id DESC)` (composite btree, covers the 100-row lookback hot path)
- [ ] 1.3 Same migration: backfill loop in tenant-scoped chronological order using `(organization_id ASC, created_at ASC, id ASC)` — for each row, compute `prev_hash` from prior row's `row_hash` and `row_hash` from SHA-256 over canonicalised payload; guard with `WHERE row_hash IS NULL` for idempotency
- [ ] 1.4 Down migration drops `ix_audit_log_chain` then drops both columns

## 2. Migration 0024 — retention_class column + index + backfill

- [ ] 2.1 `apps/api/src/migrations/0024_audit_log_retention_class.ts` — add `retention_class text NOT NULL DEFAULT 'operational' CHECK (retention_class IN ('regulatory','operational','ephemeral'))`
- [ ] 2.2 Same migration: add `ix_audit_log_retention` on `(organization_id, retention_class, created_at DESC)` for the future cold-storage archival query path
- [ ] 2.3 Same migration: backfill `retention_class='regulatory'` via single UPDATE keyed on event_type IN (regulatory list per design.md ADR-AUDIT-RETENTION-CLASS); idempotent
- [ ] 2.4 Same migration: backfill `retention_class='ephemeral'` for event_type='AGENT_ACTION_EXECUTED'; idempotent
- [ ] 2.5 Down migration drops `ix_audit_log_retention` then drops the column

## 3. Hash chain primitives

- [ ] 3.1 `apps/api/src/audit-log/application/audit-log-hash-chain.ts`:
  - `canonicaliseRow(row: AuditLog): string` — deterministic JSON serialisation (sorted keys; Dates → ISO; no NaN; jsonb payloads canonicalised recursively)
  - `computeRowHash(prevHash: Buffer | null, canonical: string): Buffer` — SHA-256 (`crypto.createHash('sha256')`)
  - `validateChainIntegrity(rows: AuditLog[]): { ok: true } | { ok: false; firstBrokenRowId: string }` — pure function; iterates rows oldest-to-newest, recomputes each row's hash, compares against stored `row_hash`
- [ ] 3.2 `apps/api/src/audit-log/application/errors.ts`:
  - Add `HashChainBrokenError extends AuditLogQueryError` carrying `firstBrokenRowId` and `organizationId`

## 4. Idempotency dedup

- [ ] 4.1 `apps/api/src/audit-log/application/audit-log-idempotency.ts`:
  - `class AuditLogIdempotencyCache` (Injectable) — wraps an LRU instance (capacity 10 000, TTL 1 h)
  - `shouldDedup(eventType: string, aggregateId: string, correlationId?: string, payloadHash?: string): boolean` — checks the cache; sets the key if not present
  - `payloadHash(payload: unknown): string` — SHA-256 of stable canonicalisation; used for the fallback key when `correlationId` is absent
- [ ] 4.2 Unit-test the LRU: cap + TTL behaviour

## 5. AuditLogService.record() extension

- [ ] 5.1 `apps/api/src/audit-log/application/audit-log.service.ts`:
  - Inject `AuditLogIdempotencyCache`
  - In `record()`, BEFORE building the row:
    - Compute `payloadHash` from envelope
    - Check `idempotencyCache.shouldDedup(eventType, aggregateId, correlationId, payloadHash)` — if duplicate, log debug + return early (no INSERT)
  - In `record()`, build the row, then:
    - Load most recent 100 rows for `envelope.organizationId` via `ix_audit_log_chain`
    - Call `validateChainIntegrity(rows)`; throw `HashChainBrokenError` if broken AND `process.env.AUDIT_LOG_HASH_CHAIN_ENABLED !== 'false'`
    - Compute `prev_hash` = last row's `row_hash` (or null if empty); compute `row_hash` for the new row
    - Compute `retention_class` from the lookup table (`computeRetentionClass(eventType: string): RetentionClass`)
    - Set `row.rowHash`, `row.prevHash`, `row.retentionClass` on the entity
    - Persist via `repo.save(row)` (inside transactional context)
- [ ] 5.2 Add `computeRetentionClass(eventType: string): RetentionClass` helper in `audit-log.service.ts` or sibling helper module

## 6. AuditLog entity extension

- [ ] 6.1 `apps/api/src/audit-log/domain/audit-log.entity.ts`:
  - `@Column({ name: 'row_hash', type: 'bytea' }) rowHash!: Buffer`
  - `@Column({ name: 'prev_hash', type: 'bytea', nullable: true }) prevHash: Buffer | null = null`
  - `@Column({ name: 'retention_class', type: 'text' }) retentionClass!: RetentionClass`
  - Export `RetentionClass` type union + `RETENTION_CLASSES` const array

## 7. AuditEventType + AuditEventTypeName extension

- [ ] 7.1 `apps/api/src/audit-log/application/types.ts`:
  - Add 14 entries to `AuditEventType`:
    - `LOT_CREATED: 'm3.inventory.lot-created'`
    - `STOCK_MOVE_CREATED: 'm3.inventory.stock-move-created'`
    - `LOT_CONSUMED: 'm3.inventory.lot-consumed'`
    - `LOT_EXPIRY_NEAR: 'audit.event'` (note: slice #3 uses the generic channel)
    - `COST_SNAPSHOT_RECORDED: 'cost.cost-snapshot-recorded'`
    - `PO_CREATED: 'procurement-po.created'`
    - `PO_SENT: 'procurement-po.sent'`
    - `PO_RECEIVED_PARTIAL: 'procurement-po.received-partial'`
    - `PO_RECEIVED_FULL: 'procurement-po.received-full'`
    - `PO_CANCELLED: 'procurement-po.cancelled'`
    - `PO_CLOSED: 'procurement-po.closed'`
    - `GR_CONFIRMED: 'procurement-gr.confirmed'`
    - `GR_LINE_QTY_VARIANCE: 'procurement-gr.line-qty-variance'`
    - `GR_LINE_PRICE_VARIANCE: 'procurement-gr.line-price-variance'`
    - `EMAIL_DISPATCHED: 'shared.email.dispatched'`
    - `EMAIL_FAILED: 'shared.email.failed'`
  - Mirror entries in `AuditEventTypeName` lookup
  - Note: for `LOT_EXPIRY_NEAR` the bus channel name is shared with other events (`audit.event`); the handler is dispatched solely by the matching channel; the persisted `event_type` distinguishes it via the canonical name on the envelope

## 8. AuditLogSubscriber extension

- [ ] 8.1 `apps/api/src/audit-log/application/audit-log.subscriber.ts`:
  - Add `@OnEvent('m3.inventory.lot-created')` `onLotCreated()` — `persistTranslated` to envelope shape
  - Add `@OnEvent('m3.inventory.stock-move-created')` `onStockMoveCreated()` — `persistTranslated`
  - Add `@OnEvent('m3.inventory.lot-consumed')` `onLotConsumed()` — translates `LotConsumedEvent` (inline shape) to canonical envelope
  - Add `@OnEvent('audit.event')` `onAuditEvent()` — generic envelope handler; dispatches on `payloadAfter.eventType` if present (for `LOT_EXPIRY_NEAR`)
  - Add `@OnEvent('cost.cost-snapshot-recorded')` `onCostSnapshotRecorded()` — `persistEnvelope` (already envelope-shaped per slice #5)
  - Add 6× `@OnEvent('procurement-po.*')` handlers — `persistTranslated`
  - Add `@OnEvent('procurement-gr.confirmed')` `onGrConfirmed()` — translates `GrConfirmedEventPayload` to envelope
  - Add `@OnEvent('procurement-gr.line-qty-variance')` `onGrLineQtyVariance()` — translates
  - Add `@OnEvent('procurement-gr.line-price-variance')` `onGrLinePriceVariance()` — translates
  - Add `@OnEvent('shared.email.dispatched')` `onEmailDispatched()` — `persistEnvelope`
  - Add `@OnEvent('shared.email.failed')` `onEmailFailed()` — `persistEnvelope`
  - Add dedup short-circuit at handler entry: compute key, check `idempotencyCache.shouldDedup()`, log + return if duplicate

## 9. Module wiring

- [ ] 9.1 `apps/api/src/audit-log/audit-log.module.ts`:
  - Confirm `AuditLogSubscriber` is in `providers` (already is — per existing module shape)
  - Add `AuditLogIdempotencyCache` to `providers`
  - Confirm `EventEmitterModule.forRoot()` is imported at `app.module.ts` level (already is — verified)
- [ ] 9.2 No new module needed — all hardening providers live in the existing `AuditLogModule`

## 10. Unit tests

- [ ] 10.1 `audit-log-hash-chain.spec.ts`:
  - `canonicaliseRow` is deterministic across object-key orderings
  - `computeRowHash` matches a known vector (e.g. SHA-256 of an empty-string seed canonical row)
  - `validateChainIntegrity` returns `ok: true` for a valid chain
  - `validateChainIntegrity` returns `ok: false` with `firstBrokenRowId` on tampered middle row
- [ ] 10.2 `audit-log-idempotency.spec.ts`:
  - `shouldDedup` returns false on first call, true on second call with same key
  - TTL expiry releases the slot
  - LRU eviction at capacity boundary
  - `payloadHash` is stable across calls with equivalent payloads
- [ ] 10.3 `audit-log.subscriber.spec.ts` (extend the existing spec file):
  - Add 1 test per new event type: emit the canonical channel name, assert `recordSpy` called once with correct `event_type` + envelope shape
  - Add a test for `LOT_CONSUMED` translation from the slice #2 `LotConsumedEvent` shape to the canonical envelope
  - Add a test for `GR_CONFIRMED` translation from `GrConfirmedEventPayload`
  - Add a test for the deduplication path: emit the same event twice, assert `recordSpy` called only once
- [ ] 10.4 `audit-log.service.spec.ts` (extend):
  - Test `record()` sets `row_hash` and `prev_hash` correctly for the first row + the Nth row
  - Test `record()` throws `HashChainBrokenError` when the lookback validator detects a mismatch
  - Test `AUDIT_LOG_HASH_CHAIN_ENABLED=false` skips validation but still computes hashes
  - Test `retention_class` is computed correctly for `regulatory`, `ephemeral`, and default `operational` event types
  - Per [[feedback_subagent_apply_typing_fix_cascade]] PR #128 lesson: mocked repository's `save` must simulate the `@CreateDateColumn` behaviour for `createdAt` if test asserts on it

## 11. Integration smoke (deferred to CI)

- [ ] 11.1 Validate migrations 0023 + 0024 apply cleanly on the CI test container (covered by the existing migrations pipeline; no new INT spec required since the unit + service-level coverage is sufficient for the new logic — the INT smoke is just "migrations don't crash")
- [ ] 11.2 No new INT spec; existing audit-log INT specs continue to pass (verify `audit-log-export.int.spec.ts`, `audit-log-fts.int.spec.ts`, `audit-log-forensic-split-migration.int.spec.ts` are not broken by the chain + retention additions)

## 12. Emit-side follow-up tracking (this slice DOES NOT emit)

- [ ] 12.1 `LOT_CREATED` / `STOCK_MOVE_CREATED` emit-side: documented in this slice as deferred; ops follow-up will wire `LotFactory.create` and `StockMoveRepository.append` to emit on the bus
- [ ] 12.2 `PO_CREATED`/`PO_SENT`/`PO_RECEIVED_*`/`PO_CANCELLED`/`PO_CLOSED` emit-side: documented in this slice as deferred per slice #6 plan; emit-side TBD by ops follow-up wiring inside `PoService` lifecycle methods
- [ ] 12.3 `EMAIL_DISPATCHED` / `EMAIL_FAILED` emit-side: deferred to consumer slices (#13/#15/#19) per slice #22's plan

## 13. Documentation + handoff

- [ ] 13.1 Update `docs/operations/audit-log-runbook.md` with a new section on hash chain validation (kill-switch env var, validation error response shape, operator recovery procedure)
- [ ] 13.2 Update `docs/architecture-decisions.md` with new ADRs (ADR-028 AUDIT-HASH-CHAIN, ADR-029 AUDIT-RETENTION-CLASS, ADR-030 AUDIT-IDEMPOTENT-EMIT-DEDUP — numbering picks up from existing ADR-027)

## 14. CI + PR hygiene

- [ ] 14.1 `pnpm -w typecheck` passes
- [ ] 14.2 `pnpm -w lint` passes
- [ ] 14.3 `pnpm -w test` passes (unit suite — fast)
- [ ] 14.4 `openspec validate m3-audit-log-hash-chain-hardening` returns 0
- [ ] 14.5 PR description cites the slice contract row (gate-c slice list slice #21), the migration slots claimed (0023 + 0024), and the 6+ ADRs introduced
- [ ] 14.6 Gate D review: human reviewer confirms proposal.md + design.md + specs/audit-log-hardening/spec.md + tasks.md are coherent before invoking `/opsx:apply`
