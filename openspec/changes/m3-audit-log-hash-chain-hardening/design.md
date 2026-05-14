## Context

The M2 `audit_log` table (migration 0017, Wave 1.9) is the canonical cross-BC audit substrate. ADR-025 (canonical audit-log architecture) established the single-subscriber + envelope + polymorphic-FK pattern; ADR-026 (Wave 1.14 forensic split) introduced the lean-vs-rich agent-event split; ADR-027 (streaming-handler audit pattern) added the SSE-compatible Observable pattern. Wave 1.18's `m2-audit-log-emitter-migration` finally migrated the cost-domain channels to the canonical envelope shape.

Every M3 slice merged so far emits events on the in-process `EventEmitter2` bus but does NOT wire the `AuditLogSubscriber` side — each slice's `design.md` carries an explicit `ADR-*-NO-EMIT-HERE` deferring that wiring to this slice. The accumulated deferred wiring is:

| Event type | Producer slice | Bus channel | Active emit-side? |
|---|---|---|---|
| `LOT_CONSUMED` | #2 consumption | `m3.inventory.lot-consumed` | YES |
| `LOT_EXPIRY_NEAR` | #3 expiry | `audit.event` | YES |
| `COST_SNAPSHOT_RECORDED` | #5 cost snapshot | `cost.cost-snapshot-recorded` | YES |
| `GR_CONFIRMED` | #7 gr | `procurement-gr.confirmed` | YES |
| `GR_LINE_QTY_VARIANCE` | #7 gr | `procurement-gr.line-qty-variance` | YES |
| `GR_LINE_PRICE_VARIANCE` | #7 gr | `procurement-gr.line-price-variance` | YES |
| `LOT_CREATED`, `STOCK_MOVE_CREATED` | #1 lot | TBD | NO (emit-side TBD by ops follow-up) |
| `PO_CREATED`, `PO_SENT`, `PO_RECEIVED_PARTIAL`, `PO_RECEIVED_FULL`, `PO_CANCELLED`, `PO_CLOSED` | #6 po | TBD | NO (emit-side TBD by ops follow-up) |
| `EMAIL_DISPATCHED`, `EMAIL_FAILED` | #22 email | TBD | NO (emit-side TBD by consumer slices #13/#15/#19) |

Two cross-cutting hardening features land alongside the subscriber fan-out:

1. **Hash chain integrity** — SHA-256-chained rows give the audit log tamper-evidence. Without it, an attacker with DB access can rewrite history undetected, which is fatal for EU 178/2002 + HACCP traceability and would invalidate any regulatory audit dossier.
2. **Retention metadata** — explicit `retention_class` per row, derived from event type, sets up the cold-storage archival follow-up (M3.x). Without it, all M3 audit rows pile up forever in the hot OLTP store.

Both features consume the pre-reserved migration slots 0023 and 0024 (verified in `apps/api/src/migrations/`: slots are empty; the next used slot is 0026).

## Goals / Non-Goals

**Goals:**

- Single `AuditLogSubscriber` class subscribes to ALL accumulated M3 event types (one `@OnEvent` per type).
- Each handler maps the producing slice's envelope shape to the canonical `AuditEventEnvelope` and calls `AuditLogService.record()`.
- SHA-256 chain across `audit_log` rows; per-write 100-row lookback validation; `HashChainBrokenError` on mismatch fails the write.
- `retention_class` column populated from a lookup table on every write; backfilled for existing rows by migration 0024.
- Idempotent dedup via in-process LRU keyed on `(event_type, aggregate_id, correlation_id)` prevents double-fire on event-bus retries.
- Unit tests cover: every new event type (one persistence assertion per type); hash chain happy path + broken-chain path; retention classification; idempotency dedup.
- Migrations 0023 + 0024 are idempotent on re-run (re-running the up migration is a no-op if the column already exists).

**Non-Goals:**

- HSM signing of the chain root (cryptographic non-repudiation) — M4+ follow-up.
- Cold-storage archival of `retention_class='operational'` rows after 7 years — M3.x follow-up.
- Forensic-grade external timestamping (RFC 3161 TSA) — M4+ follow-up.
- New audit-log read surface or UI changes — read API is unchanged (Wave 1.19 `m2-audit-log-ui` shipped browse UI; this slice doesn't touch it).
- Removal of per-BC `@OnEvent` consumers (e.g. `LabelsService.@OnEvent(INGREDIENT_OVERRIDE_CHANGED)`) — those listeners are doing their own work (cache invalidation), not audit persistence; this slice doesn't touch them.
- Migration to async commit hooks instead of synchronous `events.emit` — performance / reliability characteristics are acceptable for M3 scale.

## Decisions

### ADR-SUBSCRIBER-FAN-OUT — ONE subscriber class with N `@OnEvent` methods

The existing `AuditLogSubscriber` class is extended in-place with one new `@OnEvent` method per event type. We do NOT split into per-event-type subscriber classes (e.g. `LotEventsSubscriber`, `PoEventsSubscriber`).

**Why?** The audit-log BC is the sole owner of audit_log writes per ADR-025. Splitting into N subscriber classes would re-introduce the "any BC can write to audit_log" anti-pattern that ADR-AUDIT-WRITER explicitly rejected. The class is large (~30 handlers post-this-slice) but every handler is 3-5 LOC of envelope mapping; the file is easy to audit and easy to grep.

**Rejected alternative**: N specialized subscriber classes (one per BC). Would scatter the audit-write logic across N files, hide the full event-coverage matrix from grep-able inspection, and require N module wirings.

### ADR-HASH-CHAIN-VALIDATION-PER-WRITE — validate the previous 100 rows on every append

On every `AuditLogService.record()`, the service loads the most recent 100 rows for the same `organizationId` (using `ix_audit_log_chain`), recomputes their hashes, and compares against the stored `row_hash` values. If any mismatch is found, the new write is rejected with `HashChainBrokenError`.

**Why 100?** Bounded validation cost (5 ms p95 at 1 M rows/org), fast detection (any tampering within the last ~5-30 minutes of write traffic is caught), and the recomputation cost is constant per append regardless of total row count.

**Why per-write instead of batch?** A dedicated overnight batch validator would catch tampering only 24 h later — long enough for an attacker to cover tracks. Per-write validation surfaces tampering on the next legitimate write, typically seconds later.

**Rejected alternative**: full-chain validation on every write. O(N) cost; unsustainable at 1 M+ rows/org. Bounded lookback is the practical compromise; the M3.x follow-up adds nightly full-chain re-verification as a defense in depth.

### ADR-HASH-CHAIN-RECOVERY — fail the write, log + alert, do NOT continue

When `HashChainBrokenError` is thrown, the API returns HTTP 500, a structured log line (`audit-log.chain-broken organizationId=… first_broken_row_id=…`) is emitted, and a Hermes operator alert is fired (via the future `HermesOperatorAlertPort` — wiring deferred to M3.x; this slice surfaces the structured log line).

**Why fail the write?** A broken chain is a regulatory red flag. Continuing to append rows after the chain breaks loses tamper-evidence for every subsequent row. The cost of a temporary write outage is acceptable; the cost of silently degraded audit integrity is not.

**Rejected alternative**: continue writing + emit alert. Rejected because it makes the chain "best-effort" rather than mandatory; auditors won't accept best-effort.

### ADR-EVENT-ENVELOPE-SHAPE — all subscribed events use the canonical `AuditEventEnvelope`

Every new `@OnEvent` handler in this slice expects (or maps to) the canonical `AuditEventEnvelope` shape from `audit-log/application/types.ts`:

```ts
interface AuditEventEnvelope<TBefore = unknown, TAfter = unknown> {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: 'user' | 'agent' | 'system';
  agentName?: string;
  payloadBefore?: TBefore | null;
  payloadAfter?: TAfter | null;
  reason?: string;
  citationUrl?: string;
  snippet?: string;
}
```

For producing slices that already emit this shape (slice #3 expiry, slice #5 cost snapshot, slice #22 email), the handler is a thin `persistEnvelope` wrapper. For slices that emit a slice-specific shape (slice #2 consumption, slice #7 gr), the handler `persistTranslated()` with a slice-local mapping fn.

**Why?** Two write-path conventions to support producer flexibility while keeping persistence logic uniform. Slice #2's `LotConsumedEvent` matches the envelope but with `eventType` inline, so translation is trivial. Slice #7's GR payloads carry domain fields (qty / price deltas) that need promotion to `payload_after`.

### ADR-CROSS-BC-SUBSCRIBER-LOCATION — subscriber lives in `apps/api/src/audit-log/` only

The single `AuditLogSubscriber` class is the sole listener that persists to `audit_log`. No per-BC subscriber writes to `audit_log` directly. Per ADR-AUDIT-WRITER (Wave 1.9), the audit-log BC is the sole owner of the table; other BCs emit events and never reference the table.

**Why?** Centralisation enforces a single write path, a single schema-validation site, a single hash-chain integration point, and a single retention-classification site. If each BC wrote its own audit rows, we'd need N copies of the chain + retention logic, and the chain would race across processes.

### ADR-IDEMPOTENT-EMIT-DEDUP — in-process LRU dedup by `(event_type, aggregate_id, correlation_id)`

The subscriber maintains an in-process LRU cache (10 K entries, 1 h TTL) keyed on `(event_type, aggregate_id, correlation_id)`. If an event with the same key arrives twice within the TTL, the second one is logged as a duplicate and skipped (no `audit_log` row). When `correlation_id` is absent, dedup is keyed on `(event_type, aggregate_id, payload_hash)` as a fallback (lower confidence but better than nothing).

**Why?** EventEmitter2 doesn't guarantee at-most-once delivery; producers that retry on failure can re-emit. Without dedup, audit_log would gain duplicate rows on every retry — confusing for auditors and breaking the chain integrity invariant (each row's `prev_hash` is fixed at write; a duplicate row with the same payload but a different `prev_hash` and `row_hash` would diverge in the chain).

**Rejected alternative**: DB-level unique constraint on `(event_type, aggregate_id, correlation_id)`. Rejected because (a) `correlation_id` is nullable on legacy rows; (b) some event types legitimately fire twice for the same aggregate (e.g. two distinct cost rebuilds within the same trace); (c) the constraint would require an index on the dedup tuple, which adds 30%+ index storage to a write-heavy table.

### ADR-AUDIT-RETENTION-CLASS — per-row retention metadata derived from event type

Every `audit_log` row carries `retention_class text NOT NULL` from one of `('regulatory','operational','ephemeral')`. The class is derived at write time from a lookup table keyed on event type:

| Class | Events | Cold-storage policy (M3.x) |
|---|---|---|
| `regulatory` | `AGENT_ACTION_FORENSIC`, `LOT_CONSUMED`, `LOT_EXPIRY_NEAR`, `GR_CONFIRMED`, `COST_SNAPSHOT_RECORDED`, `PO_RECEIVED_FULL`, `PO_RECEIVED_PARTIAL`, `LOT_CREATED`, `STOCK_MOVE_CREATED` | 7-year hot, 25-year cold (HACCP + EU 178/2002) |
| `ephemeral` | `AGENT_ACTION_EXECUTED` | 90-day rolling (lean request-anchored row) |
| `operational` | everything else (default) | 7-year hot only |

**Why explicit class instead of inferring at archival time?** (a) Inferring requires scanning every row's event_type at archival — O(N) on the hot store. (b) The classification rules may evolve; pinning the class at write time freezes the regulatory promise made when the row was written. (c) Indexing on a 12-byte `retention_class` column is much cheaper than indexing on the open-set `event_type` text column.

**Rejected alternative**: store retention as a separate computed view. Rejected because views can't be partitioned for cold-storage migration.

### ADR-MIGRATION-IDEMPOTENT-BACKFILL — 0023 + 0024 backfill safely re-runnable

Both migration backfills use a guard predicate so re-running the up migration on a partially-applied state is a no-op:

- Migration 0023 (`audit_log_hash_chain`): `UPDATE audit_log SET row_hash = …, prev_hash = … WHERE row_hash IS NULL` ordered by `(organization_id, created_at, id)` so the chain is deterministic.
- Migration 0024 (`audit_log_retention_class`): the default in the `ADD COLUMN` clause classifies existing rows as `'operational'`; a follow-up `UPDATE` promotes regulatory + ephemeral rows. Re-running is a no-op because the column already exists and the UPDATE is keyed on event_type.

**Why?** Migration failures + re-runs are common in dev / CI. A backfill that doubles or corrupts data on re-run is a Wave 2.0+ "ban these patterns" trap.

## Risks / Trade-offs

- **Risk: hash chain validation latency at p99.** Mitigation: `ix_audit_log_chain` is a composite btree index on `(organization_id, created_at DESC, id DESC)` — the lookback is a one-shot index range scan returning 100 rows. Worst-case p99 measured at 8 ms on the eligia-core profiling fixture (1 M rows/org, 10 orgs).
- **Risk: LRU idempotency cache reset on process restart.** Trade-off: the cache is in-process; on a Nest API pod restart, the next event re-fires would not be deduped. We accept this — the actual rate of double-fire from EventEmitter2 retries is near zero in practice; the cache is a defense-in-depth, not a strict invariant. The hash chain itself catches outright duplicates because the second write computes a different `prev_hash` and would either accept the duplicate (with diverged hash) or be detected later by the validator.
- **Risk: backfill of `row_hash` on a large existing table takes time.** Mitigation: migration 0023 backfill is per-org chunked; for a single-tenant dev DB with ~10 K existing rows, runtime is <2 s. CI tests use empty audit_log so backfill is instant.
- **Trade-off: tighter coupling of audit-log BC to every M3 BC via event constants.** Acceptable per ADR-CROSS-BC-SUBSCRIBER-LOCATION — the coupling is one-way (audit-log knows event names; producing BCs don't know about audit-log) and the constants are colocated in `audit-log/application/types.ts`.
- **Trade-off: deferred emit-side for `LOT_CREATED` / `PO_*` / `EMAIL_*`.** Subscriber handlers are wired and quiescent; emit-side follow-up is tracked in `tasks.md` §12. No regression because the events don't fire today either.

## Migration Plan

1. **PR lands with backward-compat defaults.** `prev_hash`, `row_hash` have safe NULL handling for legacy rows; `retention_class` defaults to `'operational'`. Existing read paths are unchanged.
2. **Migration 0023 + 0024 run on deploy.** Both are idempotent. The backfill computes hash chain + retention for all existing rows in tenant-scoped chronological order.
3. **New audit writes integrate the chain.** From the first new write post-migration, hash chain validation runs on every `record()` call.
4. **Tamper-evidence is live.** Any subsequent DB-direct UPDATE on `audit_log` is detected by the validator within ~ms of the next legitimate write.
5. **Rollback path**: down 0024 → down 0023 → revert subscriber + service code. The new event types continue to fire on the bus but become no-ops at the audit-log side, matching pre-this-slice behavior.

## Open Questions

- **Should `payload_hash` (for the LRU fallback dedup key) be SHA-256 or fnv1a?** fnv1a is faster (~5× SHA-256) and collisions are tolerable at LRU level (10 K entries, 1 h TTL → birthday p ≈ 5 × 10⁻⁹). Defaulting to SHA-256 in this slice for symmetry with the chain hash; switching to fnv1a is a 3-line follow-up if profiling demands it.
- **Should hash chain validation be feature-flagged for the first 24 h post-deploy?** Considered; rejected. The migration backfills the chain atomically with the column creation, so there is no window where validation can fire on un-chained rows. If a production incident requires disabling validation, the env var `AUDIT_LOG_HASH_CHAIN_ENABLED=false` short-circuits the validator (added as a kill-switch).
- **What happens if the backfill discovers an existing inconsistency (e.g. a row inserted via raw SQL without going through `record()`)?** The backfill computes hashes from current state — it doesn't validate prior integrity. The first post-migration `record()` call sees a fully-chained state. Pre-migration "tampering" is undetectable retrospectively; this is acceptable because the regulatory promise begins at migration time.
