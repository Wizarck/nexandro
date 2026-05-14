## Why

Every M3 slice merged so far (Waves 2.1 + 2.2) has shipped event TYPES in its own `domain/events.ts` (or sibling `types.ts`) files, emitted them on the in-process bus, and **deferred** wiring the `AuditLogSubscriber` side to this slice. Each slice's `design.md` carries the matching ADR (`ADR-LOT-NO-EVENT-EMIT-HERE`, `ADR-CONSUMPTION-NO-EMIT-HERE`, `ADR-EXPIRY-NO-EMIT-HERE`, `ADR-SNAPSHOT-NO-EMIT-HERE`, `ADR-PO-NO-AUDIT-EMIT-HERE`, `ADR-GR-NO-AUDIT-EMIT-HERE`, `ADR-EMAIL-AUDIT-EVENT-REGISTERED-NOT-EMITTED`). The accumulated technical debt now lands here in one cross-cutting slice.

Concretely, the bus has been emitting events that nobody persists. From Wave 2.1:

- `LOT_CREATED`, `STOCK_MOVE_CREATED` (slice #1 `inventory/lot/`) — declared in `domain/stock-move.entity.ts` comments; emit-side deferred (factory + repo are ready, the BC owner ships emission after this subscriber lands).
- `EMAIL_DISPATCHED`, `EMAIL_FAILED` (slice #22 `shared/email-dispatch/`) — declared in `shared/email-dispatch/types.ts`; emit-side owned by future consumer slices (#13/#15/#19).

From Wave 2.2:

- `LOT_CONSUMED` (slice #2 `inventory/consumption/domain/events.ts`) — **actively emitted** by `ConsumptionService.recordConsumption()`.
- `LOT_EXPIRY_NEAR` (slice #3 `inventory/expiry/domain/events.ts`) — **actively emitted** by `ExpiryScannerService.scan()` on channel `audit.event`.
- `COST_SNAPSHOT_RECORDED` (slice #5 `inventory/cost/snapshot/`) — **actively emitted** by `CostSnapshotService.snapshotConsumption()`.
- `PO_CREATED`, `PO_SENT`, `PO_RECEIVED_PARTIAL`, `PO_RECEIVED_FULL`, `PO_CANCELLED`, `PO_CLOSED` (slice #6 `procurement/po/`) — declared in `m3-po-aggregate/design.md`; emit-side TBD by ops follow-up (`PoService` ready, hooks pending).
- `GR_CONFIRMED`, `GR_LINE_QTY_VARIANCE`, `GR_LINE_PRICE_VARIANCE` (slice #7 `procurement/gr/`) — **actively emitted** by `GrConfirmationService.confirm()`.

Beyond fan-out of subscribers, the M2 `audit_log` table itself is missing two regulatory-grade hardening features that M3 needs:

1. **Hash chain integrity (ADR-AUDIT-HASH-CHAIN, new)** — each new audit row carries a SHA-256 hash that covers `(prev_hash, row_canonical_json)`. A bounded lookback validator (100 rows) runs on every append and refuses to commit if the chain breaks. Without this, a malicious-or-buggy DB UPDATE can silently rewrite history — fatal for EU 178/2002 + HACCP traceability.
2. **Retention metadata (ADR-AUDIT-RETENTION-CLASS, new)** — each row carries a `retention_class ENUM('regulatory','operational','ephemeral')` derived from the event type at write time. Migrations 0024 sets up the column + computed default; downstream archival follow-ups partition / cold-store by class.

This slice consumes pre-reserved migration slots **0023** (hash chain hardening — column + index) and **0024** (retention metadata — column + computed default). Both slots were marked reserved in `gate-c-slice-list-m3-2026-05-14.md`. The accumulated event types are wired onto `AuditLogSubscriber` (one new `@OnEvent` method per event type), the new hash chain validator is added to `AuditLogService.record()`, and retention class is computed at write time.

## What Changes

- **`apps/api/src/migrations/0023_audit_log_hash_chain.ts`** — adds two columns to `audit_log`:
  - `row_hash bytea NOT NULL` (SHA-256 over canonical `(prev_hash, row_payload)`).
  - `prev_hash bytea NULL` (hash of the previous row in tenant-scoped order; `NULL` for the first row per org).
  - Adds index `ix_audit_log_chain` on `(organization_id, created_at DESC, id DESC)` so the lookback validator runs in bounded time.
  - Backfill: for every existing row in `audit_log`, compute `(prev_hash, row_hash)` in tenant-scoped chronological order. Idempotent on re-run via `WHERE row_hash IS NULL`.
- **`apps/api/src/migrations/0024_audit_log_retention_class.ts`** — adds one column to `audit_log`:
  - `retention_class text NOT NULL DEFAULT 'operational' CHECK (retention_class IN ('regulatory','operational','ephemeral'))`.
  - Backfill: classifies existing rows by `event_type`:
    - `regulatory`: `AGENT_ACTION_FORENSIC`, `LOT_CONSUMED`, `GR_CONFIRMED`, `COST_SNAPSHOT_RECORDED`, `LOT_EXPIRY_NEAR` (HACCP / EU 178/2002 footprint).
    - `ephemeral`: `AGENT_ACTION_EXECUTED` (lean request-anchored row; 90-day rolling).
    - `operational`: everything else (default — 7-year M3 operational floor).
  - Adds index `ix_audit_log_retention` on `(organization_id, retention_class, created_at DESC)` for the partition / cold-store follow-up.
- **`apps/api/src/audit-log/application/types.ts`** — extends `AuditEventType` const with 14 new entries (and their persisted UPPER_SNAKE_CASE names): `LOT_CREATED`, `STOCK_MOVE_CREATED`, `LOT_CONSUMED`, `LOT_EXPIRY_NEAR`, `COST_SNAPSHOT_RECORDED`, `PO_CREATED`, `PO_SENT`, `PO_RECEIVED_PARTIAL`, `PO_RECEIVED_FULL`, `PO_CANCELLED`, `PO_CLOSED`, `GR_CONFIRMED`, `GR_LINE_QTY_VARIANCE`, `GR_LINE_PRICE_VARIANCE`, `EMAIL_DISPATCHED`, `EMAIL_FAILED`. Each entry maps to the existing bus channel name shipped by the producing slice.
- **`apps/api/src/audit-log/application/audit-log.subscriber.ts`** — adds 14+ new `@OnEvent` handlers (one per event type). Each handler calls `persistEnvelope()` or `persistTranslated()` depending on whether the producing slice emits the canonical envelope shape or a snake_case payload. Per ADR-SUBSCRIBER-FAN-OUT, all handlers live in the same class.
- **`apps/api/src/audit-log/application/audit-log-hash-chain.ts`** — new module:
  - `computeRowHash(prevHash: Buffer | null, canonical: string): Buffer` — SHA-256 over `prev_hash || canonical_json`.
  - `canonicaliseRow(row: AuditLog): string` — deterministic JSON serialisation (sorted keys, ISO timestamps, no NaN).
  - `HashChainBrokenError` — surfaced when validation fails on append.
- **`apps/api/src/audit-log/application/audit-log.service.ts`** — `record()` now:
  - Loads the most recent row for `organizationId` (via `ix_audit_log_chain`) to obtain `prev_hash`.
  - Computes `row_hash` from `(prev_hash, canonicaliseRow(row))`.
  - Validates the previous 100 rows' chain on every write (per ADR-HASH-CHAIN-VALIDATION-PER-WRITE); throws `HashChainBrokenError` if the chain is broken, which fails the write per ADR-HASH-CHAIN-RECOVERY.
  - Computes + sets `retention_class` from a lookup table per ADR-AUDIT-RETENTION-CLASS.
- **`apps/api/src/audit-log/application/audit-log-idempotency.ts`** — new module that dedupes incoming envelopes via `(event_type, aggregate_id, correlation_id)` keys per ADR-IDEMPOTENT-EMIT-DEDUP. Backed by an LRU cache (10 K entries, 1 hour TTL).
- **BREAKING**: none. The new columns have safe defaults (`prev_hash NULL`, `retention_class='operational'`); existing readers don't reference them. Hash chain backfill is idempotent. Existing `audit_log` write paths (cost service, ai-suggestions, agent-middleware, agent-chat) continue to work — the new validation runs transparently after the envelope is built.

## Capabilities

### New Capabilities

- `audit-log-hash-chain`: SHA-256 chain across `audit_log` rows + per-write lookback validation + `HashChainBrokenError` surfacing per ADR-HASH-CHAIN-VALIDATION-PER-WRITE + ADR-HASH-CHAIN-RECOVERY. Foundation for EU 178/2002 + HACCP regulatory traceability (FR/NFR cited in design.md).
- `audit-log-retention-class`: per-row `retention_class` derived at write time from event type. Foundation for the M3.x cold-storage archival follow-up.

### Modified Capabilities

- `m2-audit-log`: extends `AuditEventType` with 14+ M3 entries; adds matching `@OnEvent` handlers; tightens `record()` with hash chain + retention. Read surface (`/audit-log` controller) is unchanged.

## Impact

- **Prerequisites**: All Wave 2.1 + 2.2 slices merged at master commit `902df7b` (verified). No other in-flight slice touches `apps/api/src/audit-log/` or claims migration slots 0023 / 0024.
- **Code**:
  - `apps/api/src/audit-log/application/audit-log.subscriber.ts` — extend ~14 new @OnEvent methods + dedup wiring (~150 LOC added).
  - `apps/api/src/audit-log/application/audit-log-hash-chain.ts` — new module (~80 LOC).
  - `apps/api/src/audit-log/application/audit-log-idempotency.ts` — new module (~60 LOC).
  - `apps/api/src/audit-log/application/audit-log.service.ts` — `record()` extension (~50 LOC delta).
  - `apps/api/src/audit-log/application/types.ts` — extend constants (~40 LOC delta).
  - `apps/api/src/audit-log/domain/audit-log.entity.ts` — extend with new columns (~15 LOC delta).
  - `apps/api/src/migrations/0023_audit_log_hash_chain.ts` — new migration (~110 LOC).
  - `apps/api/src/migrations/0024_audit_log_retention_class.ts` — new migration (~80 LOC).
  - Tests: ~20 new unit tests covering subscriber fan-out, hash chain validation, retention classification, idempotent dedup.
- **Performance**:
  - Hash chain validation reads the previous 100 rows per append (covered by `ix_audit_log_chain` partial index). Expected overhead: ≤5 ms p95 at 1 M rows/org. Within NFR-PERF-2 write budget for write paths.
  - Retention class is a constant-time lookup at write — no measurable overhead.
  - Idempotency cache is in-process LRU; O(1) lookup.
- **Storage growth**: `row_hash` + `prev_hash` add 64 bytes/row; `retention_class` adds ~12 bytes/row. Total ~76 bytes/row × ~5 K rows/day/org × 365 d × 30 orgs = ~4 GB/year. Within NFR-SCALE.
- **Audit**: every new M3 event type now persists to `audit_log` per the wired subscriber methods. Regulatory chain-of-custody is satisfied for HACCP + EU 178/2002.
- **Rollback**:
  - Migration 0023 down drops `row_hash`, `prev_hash`, and `ix_audit_log_chain`. Loses chain integrity but doesn't break existing reads.
  - Migration 0024 down drops `retention_class` and `ix_audit_log_retention`.
  - Subscriber fan-out rollback: the new `@OnEvent` methods can be removed without restoring older behavior — the events keep firing on the bus and become no-ops at the audit-log side, which matches pre-this-slice behavior.
- **Out of scope** (claimed by other slices, do NOT pre-empt):
  - Cold-storage archival of `retention_class='operational'` rows after 7 years → M3.x follow-up.
  - Cryptographic signature over the chain root (HSM signing) → M4+ regulatory follow-up.
  - PO state event emission (slice #6 service code calls `events.emit()` from the natural PO lifecycle methods); this slice ONLY wires the subscriber side. If `PO_*` events never fire from PoService, the new handlers stay quiescent until the emit-side hook lands.
  - Email dispatch event emission (slice #22 emit-side is in consumer slices #13/#15/#19); same deferred-emit treatment.
- **Parallelism**: file-path scope = `apps/api/src/audit-log/**` + `apps/api/src/migrations/0023_*` + `apps/api/src/migrations/0024_*`. No parallel siblings in Wave 2.3 (cross-cutting slice — singleton). Verified: master at `902df7b` has no in-flight PRs touching these paths.
- **Effort estimate**: L (~485 LOC application + ~190 LOC migration + ~20 tests; matches gate-c slice list "L" sizing for cross-cutting slices).
