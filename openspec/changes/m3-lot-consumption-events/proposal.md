## Why

M3 traceability hinges on a single fact: *which lot fed which dish at which table at which time*. Without that fact, the recall slices (#11 incident search, #12 trace tree, #13 86-flag dispatch) have nothing to traverse. FR6 (PRD line 531) phrases it as "Head Chef / Manager / Staff can consume a `Lot` in a recipe execution, decrementing available stock and linking the consumption event to the `audit_log`."

Slice #1 (`m3-lot-aggregate`, merged at 0dab33b) shipped the foundation: `lots` + `stock_moves` tables, entities, repositories, factory. StockMove rows already exist as the canonical movement journal. What's missing — and what this slice adds — is:

1. A canonical **`LotConsumed` event** emitted whenever an outbound `stock_moves` row lands as part of a recipe/menu-item flow.
2. The **traversal indexes** on `stock_moves` (and on `audit_log` payload paths) that let FR15 (forward-trace lot → recipes → menu items → locations) hit p95 < 500ms at 100k events per NFR-PERF-1.
3. A **read-side query helper** (`StockMoveRepository.findConsumptionsByLot`) that downstream recall slices call instead of hand-rolling SQL.

Three downstream slices block on this work:

| Slice | Why it needs `LotConsumed` |
|---|---|
| `m3-incident-search-multi-anchor` (#11) | Searches audit_log by lot anchor; relies on `aggregate_type='lot'` + `eventType='LOT_CONSUMED'` rows being present and indexed |
| `m3-trace-tree-forward-reverse` (#12) | Traverses lot → consumption → recipe → menu-item edges; cannot render the tree without consumption-event nodes |
| `m3-recall-86-flag-dispatch` (#13) | Dossier "lot affected" section enumerates consumption events to scope the 86-flag recipient list |

Per architecture-m3.md line 306: "ADR-031 (indexing) MUST land before recall slices (ADR-028) — load test depends on indexes existing." Slice #1 deferred the consumption-graph traversal indexes to this slice (design.md ADR-LOT-INDEXES, line 75: *"The compound + traversal indexes for consumption-graph (forward + reverse trace) are deliberately NOT in this slice — they belong to slice #2"*). This is the slot.

## What Changes

- **Migration `0037_add_lot_compound_and_traversal_indexes.ts`** — adds two traversal indexes that slice #1 explicitly deferred (architecture-m3.md line 517):
  - `idx_stock_moves_org_lot_outbound` on `stock_moves(organization_id, lot_id, created_at DESC) WHERE move_type='outbound'` — forward-trace hot path "what did this lot feed".
  - `idx_audit_log_org_lot_consumption` on `audit_log(organization_id, (payload_after->>'lot_id'), created_at DESC) WHERE aggregate_type='lot' AND event_type='LOT_CONSUMED'` — anchors FR15 forward-trace from the audit-log envelope side, complementing the lot-side index.
  - Verification: `EXPLAIN ANALYZE` snapshot for both indexes committed to `docs/architecture-decisions.md` ADR-031.
- **`apps/api/src/inventory/consumption/`** new BC (sibling of `inventory/lot/` from slice #1):
  - `domain/events.ts` — `LotConsumedEvent` typed `AuditEventEnvelope` shape; Zod validator at the boundary.
  - `domain/consumption-input.ts` — `RecordConsumptionInput` value object (qty, lot_id, recipe_id?, menu_item_id?, nexandro_tag?, reason?).
  - `application/consumption.service.ts` — single public method `recordConsumption(organizationId, actorUserId, input)` that (a) loads the lot, (b) appends a `stock_moves` row with `move_type='outbound'` via the slice #1 `StockMoveRepository.append()`, (c) builds the typed `LotConsumedEvent` envelope and emits it through `EventEmitter2` (the M2 event bus from Wave 1.9).
  - `application/forward-trace.query.ts` — `findConsumptionsByLot(organizationId, lotId, limit, offset)` read-side helper that slice #11/#12 consume.
  - `consumption.module.ts` — NestJS module wiring; imported by the inventory module.
- **`packages/contracts/src/m3/consumption.ts`** — `LotConsumedEvent` envelope + `LotConsumedPayload` Zod schema. Top-level `organization_id` field per audit-log multi-tenant convention (ADR-CONSUMPTION-MULTI-TENANT-PAYLOAD).
- **No audit-log subscriber wiring**. Per slice #1 design.md ADR-LOT-NO-EVENT-EMIT-HERE precedent, this slice registers the event type and emits it on the bus, but the `AuditLogSubscriber.persistEnvelope()` `KNOWN_EVENTS` set is updated by slice #21 (`m3-audit-log-hash-chain-hardening`). A smoke INT test asserts that calling `consumption.service.recordConsumption()` in this slice's BC produces:
  - A `stock_moves` outbound row (real persistence).
  - A `LotConsumedEvent` on the in-process bus (verified by a test-only listener).
  - But NO `audit_log` row (subscriber not registered yet — by design).
- **NestJS wiring**: `apps/api/src/inventory/inventory.module.ts` (created in slice #1) gains `ConsumptionModule` as a child import. `app.module.ts` already imports `InventoryModule`; no app-level wiring change.
- **BREAKING**: none. M2's `ingredient.lot_code` string column unchanged. M2 `RecipeExecutionService` (Wave 1.4) does NOT call `recordConsumption()` yet — that wiring is M3 procurement-side work (slice #7 or a follow-up that bridges the existing recipe-execution flow into the new consumption BC).

## Capabilities

### New Capabilities

- `inventory-consumption-events`: canonical `LotConsumed` event emission seam + forward-trace query helper + traversal indexes (migration 0037). Foundation for FR15 (forward-trace) and FR17/FR18 (recall 86-flag dispatch + dossier). Does NOT include the recall search UI, the 86-flag dispatcher, or the dossier renderer — those are slices #11, #12, #13.

### Modified Capabilities

- `inventory-lots`: gains migration 0037 (two traversal indexes on `stock_moves` + `audit_log`). The Lot/StockMove entities themselves are unchanged; only the index footprint grows.

## Impact

- **Prerequisites**: slice #1 `m3-lot-aggregate` merged (0dab33b). No other M3 dependencies.
- **Code**:
  - `apps/api/src/inventory/consumption/` (new BC: domain + application + module). ~350 LOC.
  - `apps/api/src/migrations/0037_add_lot_compound_and_traversal_indexes.ts`. ~70 LOC.
  - `packages/contracts/src/m3/consumption.ts` (1 envelope + payload Zod schema). ~60 LOC.
  - Test fixtures: ~20 new tests across event-shape validation + service unit + forward-trace integration + idempotency + index-usage assertions.
- **Performance**:
  - Two new indexes; expected p95 < 50ms for forward-trace at 100k events per NFR-PERF-1 sub-budget.
  - Write overhead per `stock_moves` insert: ~2 extra WAL entries (one per traversal index target). Budgeted in ADR-031 write-amplification line (≤4 WAL entries/row).
  - Event emission adds ~1-2ms to `consumption.service.recordConsumption()` (synchronous bus dispatch); meets NFR-PERF-* "<5ms overhead vs raw insert" target.
- **Storage growth**: ~80 bytes per traversal-index row × ~5000 consumption events/day/org × 365 × 30 orgs = ~4 GB/year for the two indexes combined. Negligible at M3 scale.
- **Audit**: `LotConsumedEvent` is registered as a typed envelope but NOT persisted to `audit_log` by this slice. Slice #21 wires the subscriber. The smoke test in this slice asserts the absence of `audit_log` writes to prevent accidental double-write at slice #21 landing.
- **Rollback**: down migration drops the two indexes. The `consumption/` BC is feature-flagged via the same `M3_ENABLED` env gate that slice #1 introduced; flipping it off detaches the module without dropping data (StockMove rows remain readable through slice #1 surfaces).
- **Out of scope** (claimed by other slices, do NOT pre-empt):
  - Audit-log subscriber registration (`KNOWN_EVENTS` update) → slice #21 `m3-audit-log-hash-chain-hardening`.
  - Incident search by anchor → slice #11 `m3-incident-search-multi-anchor`.
  - Forward-trace + reverse-trace tree rendering → slice #12 `m3-trace-tree-forward-reverse`.
  - 86-flag dispatch + dossier → slice #13 `m3-recall-86-flag-dispatch`.
  - UX: zero UI in this slice — all consumers are agent-routed (Hermes) or downstream operator screens (slice #11+).
  - Recipe-execution → consumption-service wiring: existing M2 `RecipeExecutionService` (Wave 1.4) is unchanged; integration with the consumption seam is a follow-up tracked by the procurement block.
- **Parallelism**: this slice writes exclusively to `apps/api/src/inventory/consumption/` + `apps/api/src/migrations/0037_*` + `packages/contracts/src/m3/consumption.ts`. File-path disjoint from all other Wave 2.2 slices in flight. Depends on slice #1 (merged); blocks slices #11, #12, #13.

- **Effort estimate**: M (~350 LOC application + ~70 LOC migration + ~20 tests; matches the gate-c slice list "M" sizing).
