## Context

Slice #1 (`m3-lot-aggregate`, merged at 0dab33b) shipped `lots` + `stock_moves` tables, entities, `LotFactory`, and read-only repositories. StockMove is the canonical movement journal: every quantity change against a lot is one row, append-only, signed quantity, with `move_type` in (`inbound`, `outbound`, `adjustment`, `waste`).

What slice #1 explicitly deferred (design.md ADR-LOT-INDEXES, line 75): *"The compound + traversal indexes for consumption-graph (forward + reverse trace) are deliberately NOT in this slice — they belong to slice #2."* And ADR-LOT-NO-EVENT-EMIT-HERE (line 89): *"`STOCK_MOVE_CREATED` … emitted by consumption flows in slice #2."*

This slice picks up both deferred items and ships them as a thin operational BC. It does **not** wire the existing M2 `RecipeExecutionService` to call the new consumption seam — that's procurement-block follow-up work (likely between slice #7 GR reconciliation and the cost-resolver slices). This slice is the **plumbing**: the event type, the emitter point, the read-side query, the indexes. Consumers are slices #11/#12/#13.

ADR-031 (architecture-m3.md line 192) drives the index choices. ADR-030 (line 232) drives the `nexandro_tag` JSONB attribute requirement on every emitted event for downstream cost-by-tag drill-down. Both inform the event payload schema.

## Goals / Non-Goals

**Goals:**

- A single canonical `LotConsumedEvent` type, Zod-validated at boundary, with multi-tenant `organization_id` at top level (not nested in metadata).
- A single emitter seam: `ConsumptionService.recordConsumption(organizationId, actorUserId, input)` — every caller funnels through this method.
- Two traversal indexes per ADR-031 — one on `stock_moves`, one on `audit_log` — each justified by a downstream query pattern (forward-trace lot → consumption from FR15).
- A read-side `findConsumptionsByLot()` helper that slices #11/#12 call instead of hand-rolling SQL.
- Idempotency: same `stock_move_id` is never re-emitted (StockMove is append-only by slice #1's invariant; this slice inherits and exercises it).
- Append-only enforcement: events are facts; correction is a new `adjustment` row, never an edit.
- INT tests against a real Postgres test container (vps-postgres or local testcontainer) that assert index usage via `EXPLAIN ANALYZE`.

**Non-Goals:**

- Audit-log subscriber registration. The `LotConsumedEvent` is emitted on the bus, but `AuditLogSubscriber.persistEnvelope()` does NOT have `LOT_CONSUMED` in its `KNOWN_EVENTS` set until slice #21. Smoke test in this slice **asserts the absence** of audit-log rows to catch accidental coupling.
- Wiring existing M2 `RecipeExecutionService` to call `recordConsumption()`. The seam exists in this slice; callers come later (procurement block).
- UX. Zero UI surfaces. All consumers are agent-routed (Hermes) or downstream operator screens.
- Reverse-trace query (menu-item → lots). That's slice #12 (`m3-trace-tree-forward-reverse`); it traverses through `recipe_items` + `menu_items` joins not available in this BC.
- The 86-flag dispatcher or dossier renderer. Slices #13 territory.
- Recipe-execution → cost-snapshot persistence. That's slice #5 (`m3-cost-snapshot-persistence`).

## Decisions

### ADR-CONSUMPTION-EVENT-SCHEMA — canonical LotConsumed payload shape

The `LotConsumedEvent` envelope inherits the M2 `AuditEventEnvelope` shape (`event_type`, `aggregate_type`, `aggregate_id`, `organization_id`, `actor_user_id`, `payload_after`, `created_at`). The `payload_after` is a typed `LotConsumedPayload` with these fields:

| field | type | nullable | note |
|---|---|---|---|
| `organization_id` | uuid | NO | duplicated at top level **and** in payload per multi-tenant convention (see ADR-CONSUMPTION-MULTI-TENANT-PAYLOAD) |
| `lot_id` | uuid | NO | FK to `lots.id` from slice #1 |
| `stock_move_id` | uuid | NO | FK to the `stock_moves` row this event memorialises; idempotency anchor |
| `qty_consumed` | numeric(18,4) | NO | always positive in the payload (the stored `stock_moves.quantity` is signed negative; payload normalises to positive for human readability) |
| `unit` | text | NO | mirrors `lots.unit` at time of consumption (snapshot — lot's unit is immutable, but snapshot keeps event self-contained) |
| `recipe_id` | uuid | YES | populated when consumption is driven by a recipe execution |
| `menu_item_id` | uuid | YES | populated when consumption is driven directly by menu-item depletion (some agent flows skip the recipe layer) |
| `consumed_at` | timestamptz | NO | server-side timestamp at `recordConsumption()` call time (NOT the wall-clock the agent claimed) |
| `consumed_by_user_id` | uuid | NO | actor; matches the envelope-level `actor_user_id` but duplicated in payload for self-contained event consumers |
| `nexandro_tag` | text | YES | free-form tag per ADR-030 (e.g., `"recall-investigation"`, `"chef-tablet"`) for cost-by-tag drill-down |
| `reason` | text | YES | optional human note from the operator (e.g., `"prep for service"`, `"manual depletion - dropped"`) |

**Why duplicate `organization_id` and `consumed_by_user_id` in both envelope and payload?** Two reasons: (a) ADR-CONSUMPTION-MULTI-TENANT-PAYLOAD below — every payload MUST carry org_id at top level so downstream consumers (cost-rollup, recall, dashboard) never have to JOIN back to the envelope; (b) self-contained events survive replay and shipping to external systems without context loss.

**Why snapshot `unit` into payload when it's immutable on `lots`?** Defensive: if a hypothetical future migration ever widens or remaps units, historical events should preserve the unit-of-record at the time of consumption.

**Zod validation at the boundary**: `LotConsumedPayload` schema is defined once in `packages/contracts/src/m3/consumption.ts` and re-imported by the service. Service validates input via `LotConsumedPayloadSchema.parse(payload)` before emitting. Malformed input → thrown `ZodError` → 400 at the controller layer (per ADR-CONSUMPTION-BOUNDARY-VALIDATION below). Per Wave 2.1 lessons we use Zod `.min(1, msg)` for non-empty arrays (none here — single-event payload — but the convention is set).

### ADR-CONSUMPTION-EMITTER-LOCATION — emit from the consumption service, not from the StockMove repo

The natural temptation is to emit `LotConsumedEvent` directly from `StockMoveRepository.append()` whenever `move_type='outbound'`. Rejected. StockMove is a generic movement journal that also covers `inbound` (GR confirms), `adjustment` (manual corrections), and `waste` (spoilage). Not every `outbound` is a consumption event — e.g., a manager-issued "transfer to other location" is also outbound but is NOT a `LotConsumed`.

**Decision**: emission happens in `ConsumptionService.recordConsumption()`. This method (a) builds the `RecordConsumptionInput`, (b) calls `StockMoveRepository.append({ move_type: 'outbound', ... })`, (c) builds the `LotConsumedEvent` envelope using the persisted move's id, (d) emits on `EventEmitter2`. Other outbound move callers (transfer, waste) emit their own event types — not `LotConsumed`.

This keeps the repository generic and pushes domain semantics into the application layer. Matches the M2 pattern from `m2-cost-rollup-and-audit` where the cost-rollup service is the emitter, not the underlying entity repo.

### ADR-CONSUMPTION-NO-EMIT-HERE — event registered + emitted on bus, but NOT persisted to audit_log

Per slice #1 design.md ADR-LOT-NO-EVENT-EMIT-HERE precedent. This slice:

1. **Defines** the `LotConsumedEvent` envelope shape in `packages/contracts/src/m3/consumption.ts`.
2. **Emits** the event on `EventEmitter2` from `ConsumptionService.recordConsumption()`.
3. Does **NOT** add `LOT_CONSUMED` to `AuditLogSubscriber.persistEnvelope()`'s `KNOWN_EVENTS` set.

Result: in this slice's BC, calling `recordConsumption()` produces a real `stock_moves` row + a real event on the bus, but **no `audit_log` row**. A smoke INT test (`consumption.service.int-spec.ts`) asserts this absence to catch accidental coupling. Slice #21 (`m3-audit-log-hash-chain-hardening`) wires the subscriber + flips the smoke-test assertion to "present, with chained hash".

**Why not register the subscriber now and avoid the slice #21 dependency?** Two reasons:

1. The audit-log envelope shape is not finalised until ADR-032 hash-chain hardening migration 0023+0024 lands. Registering now would force a second migration to backfill chain hashes for `LotConsumed` rows produced between this slice and slice #21.
2. Slice #21 already does this batch registration for **all** M3 event types in one place (`LOT_CREATED`, `STOCK_MOVE_CREATED`, `LOT_CONSUMED`, `LOT_EXPIRY_NEAR`, `HACCP_RECORDED`, `GR_CONFIRMED`, etc.). Pre-emptive registration here = extra integration tax for no gain.

The trade-off (events on the bus without audit persistence in the gap window) is acceptable because:
- The bus is in-process; no external consumer yet.
- Test-only listeners verify emission shape in this slice's INT suite.
- StockMove rows ARE persisted, so the operational data exists; only the **audit envelope** is delayed.

### ADR-CONSUMPTION-TRAVERSAL-INDEX — two indexes, one per query side

Slice #1 already created `idx_stock_moves_org_lot_created` on `(organization_id, lot_id, created_at DESC)`. That index covers a generic "depletion history per lot" query but does NOT filter by `move_type`. Forward-trace queries from FR15 specifically ask "what consumption events happened against this lot" — i.e., outbound moves only.

Two new indexes land in migration 0037:

| Index | Cols / predicate | Query pattern | Owning consumer |
|---|---|---|---|
| `idx_stock_moves_org_lot_outbound` | `(organization_id, lot_id, created_at DESC) WHERE move_type='outbound'` | "what did this lot feed?" — forward-trace consumption side | slice #12 `m3-trace-tree-forward-reverse` |
| `idx_audit_log_org_lot_consumption` | `(organization_id, (payload_after->>'lot_id'), created_at DESC) WHERE aggregate_type='lot' AND event_type='LOT_CONSUMED'` | "find all LotConsumed events for this lot in audit_log" — recall search side | slice #11 `m3-incident-search-multi-anchor` |

**Why both?** They serve different consumers:
- Slice #12 traverses `stock_moves` for the tree shape (lot → moves → recipe_id → menu_items).
- Slice #11 searches `audit_log` for the anchored event list (multi-anchor incident search lands in audit_log envelopes).

The `audit_log` traversal index is created speculatively in this slice — even though slice #21 hasn't wired the subscriber yet. Rationale: migrations are forward-only; creating the index pre-emptively avoids a third migration round-trip when slice #21 lands. The index sits empty until then; index maintenance cost on an empty index is zero.

**Write-amplification budget check** (ADR-031 line 192): the existing `audit_log` already has compound + traversal indexes from M2; adding one more partial index on `(payload_after->>'lot_id')` is the 4th-ish, within the documented ~4 WAL entries/row ceiling. Re-measured in this slice's INT EXPLAIN-ANALYZE step.

**Verified via EXPLAIN ANALYZE** in `consumption.int-spec.ts`: seed 100k stock_moves rows + 100k audit_log envelopes spread across two orgs; assert the forward-trace queries on both sides hit the new indexes (no Seq Scan), p95 < 50ms per the NFR-PERF-1 sub-budget.

### ADR-CONSUMPTION-MULTI-TENANT-PAYLOAD — organization_id at payload top-level, not nested

Every emitted `LotConsumedEvent` payload carries `organization_id` as a **top-level** field — duplicated from the envelope.

**Why?** Downstream consumers (recall dossier renderer slice #13, cost-rollup slice #5, AI-obs dashboard widget #7 from ADR-030) consume payloads detached from the envelope (event-bus listeners, JSONB GIN queries, exported audit dumps for inspectors per FR21-FR25). Forcing them to JOIN back to the envelope or trust an external context is fragile and a known source of cross-tenant leakage bugs in the M2 retros (see `m2-cost-rollup-and-audit` post-mortem on the `actor_user_id` mis-attribution incident).

**Pattern**: the multi-tenant predicate on every consumer query is `WHERE organization_id = ?` on the **payload field**, not on the envelope wrapper. The audit-log indexing ADR-031 partial index `idx_audit_log_org_lot_consumption` is keyed on `(organization_id, payload_after->>'lot_id')` precisely because of this convention.

**Trade-off**: ~36 bytes per row of duplication (uuid). Negligible vs. correctness gain.

### ADR-CONSUMPTION-RECIPE-MENU-NULLABLE — at most one of recipe_id / menu_item_id populated

A lot can be consumed in three operational shapes:

1. **Recipe-driven**: chef cooks a recipe; recipe's ingredient list dictates which lots and how much. `recipe_id` populated, `menu_item_id` NULL.
2. **Menu-item-driven**: an agent surface (Hermes) records "served menu-item X" and the system back-resolves the lot consumption via the menu_item → recipe → ingredients chain at the time of serving. `menu_item_id` populated, `recipe_id` NULL (it's derivable but not snapshot here — that's slice #5's cost snapshot concern).
3. **Manual depletion**: chef burns the batch, drops it, etc. No recipe, no menu-item. Both NULL. `reason` field populated with a free-text explanation.

Both columns NULL-able at DB level + payload schema level. **App-side invariant** (enforced in `ConsumptionService.recordConsumption()`): at most one of `recipe_id` / `menu_item_id` is populated per event. Both populated → throws `InvalidConsumptionInputError`. This is the same "open-ended jsonb at DB, strict at app boundary" pattern from M2 ingredients.

**Why allow both NULL (manual depletion)?** Real kitchens drop pans. The system MUST record the loss for traceability + cost rollup; refusing to accept "no recipe attached" depletion would push operators to fake a recipe attribution, polluting the trace tree.

**Why not allow both populated (recipe inside a menu-item)?** The menu_item → recipe traversal is canonical; storing both is denormalisation that drifts under recipe edits. Downstream slice #12 traverses the join chain at query time. The event payload is intentionally one-step-truth: either the recipe driver is the source (raw recipe execution), or the menu-item driver is (agent-surface attribution).

## Risks / Trade-offs

- **[Risk]** Events emitted on the bus but not persisted to audit_log in the gap between this slice and slice #21 means a hypothetical mid-flight production deploy in that window would have *consumption events in StockMove rows but no audit envelope*. **Mitigation**: M3 BCs ship behind `M3_ENABLED=false` until slice #21 lands (architecture-m3.md §Implementation Sequence convention); production traffic never hits the gap. INT tests cover the bus emission.

- **[Risk]** The `audit_log` traversal index is created pre-emptively for slice #21's use; if slice #21 changes the payload shape (e.g., renames `lot_id`), the index becomes stale and needs replacement. **Mitigation**: payload shape is locked here in `packages/contracts/src/m3/consumption.ts` and slice #21's subscriber must consume that shape verbatim. ADR-032 hash-chaining is about envelope columns, not payload field names; safe to commit the index now.

- **[Risk]** Per the Wave 2.1 typing-fix cascade lessons ([[feedback_subagent_apply_typing_fix_cascade]]): cross-package imports from `apps/api` → `packages/contracts/` fail at TS6059 rootDir without per-tsconfig path config. **Mitigation**: the M2 `packages/contracts/` already has the rootDir + path mapping set up (slice #1 used it without issues — the `LotReadModel` + `StockMoveReadModel` exports landed cleanly at 0dab33b). We follow the same import pattern. If a fresh contracts subdirectory is needed, we inline types in `apps/api/src/inventory/consumption/domain/events.ts` instead — but this slice's payload IS cross-app-shared (recall slices import it), so contracts/ is the right home.

- **[Risk]** Zod array validation pitfall (Wave 2.1 lesson): `.nonempty()` produces strict tuple inference that breaks under length pruning. **Mitigation**: there are no array fields in `LotConsumedPayload` for this slice; the lesson is preserved here for future related slices that might add a `consumed_in_batch: lot_id[]` field.

- **[Risk]** SMTP-style adapter error semantics (Wave 2.1 lesson, applies to slice #22 not here): 5xx = permanent, 4xx = transient — inverted vs. HTTP. **Mitigation**: not applicable to this slice (no external email/SMS dispatch). Lesson recorded here for cross-slice memory continuity.

- **[Risk]** CJS-default import breakage without `esModuleInterop` (Wave 2.1 lesson). **Mitigation**: this slice uses only ESM-friendly imports (Zod, NestJS, TypeORM); no CJS-default libraries (`pg`, `nodemailer`) are added. If a future related slice does, use `import * as ns + (ns as any).default ?? ns` pattern.

- **[Trade-off]** Append-only at application layer (no UPDATE/DELETE on `stock_moves` or audit envelopes). Corrections are new `adjustment` rows + new `LOT_ADJUSTED` events (not in this slice). The price: more rows over time. The value: forensic-grade audit trail + Marta's APPCC inspector journey (FR21-FR25) reads cleanly. ADR-029 retention archival handles long-term row counts.

- **[Trade-off]** Synchronous bus emission adds ~1-2ms to every consumption call. Could be made async (`emitAsync` + queue). **Trade-off taken**: synchronous in-process is fine at MVP scale (<5ms total per NFR-PERF target); async migration is a Phase-2 perf concern if `consumption.service.recordConsumption()` ever becomes a hot path. Filed under M3.x as `m3-consumption-async-emission` if needed.

## Migration Plan

1. **Stage 1 — Schema + BC scaffolding** (this PR):
   - Run migration 0037 on staging. No data churn — `stock_moves` already has the generic `(org, lot, created_at DESC)` index from slice #1; this slice adds the partial outbound index alongside it.
   - Add the partial `audit_log` index pre-emptively; sits empty until slice #21.
   - The `consumption/` BC is wired but feature-flag-gated (`M3_ENABLED=true` in dev/staging; `false` in production until slice #21 closes the audit-log gap).
2. **Stage 2 — Downstream integration** (slices #11, #12, #13):
   - Each downstream slice rebases on this slice's merge.
   - First consumer is likely slice #11 (incident search by anchor), which begins reading the `audit_log` traversal index — at which point slice #21 must also be merged (else the audit rows aren't there).
3. **Stage 3 — Procurement-block wiring** (later):
   - Bridge existing M2 `RecipeExecutionService` to call `ConsumptionService.recordConsumption()`. Out of scope for this slice; tracked as a procurement-block follow-up.
4. **Rollback strategy**:
   - Down migration drops both indexes. No data loss (indexes only).
   - The `consumption/` BC remains compileable; feature flag flips it dormant. StockMove rows already persisted via this BC are preserved (they're indistinguishable from any other outbound move).

## Open Questions

- **Should `consumed_at` be the server-side `now()` or the agent-claimed timestamp?** **Proposed answer**: server-side. Agent-claimed timestamps are spoofable + clock-drift-prone; for FR15 forward-trace correctness, the system's own clock is the source of truth. If an operator needs to record a backdated correction, they file an `adjustment` move with explicit `reason='backdated correction'`.

- **Should `LotConsumedEvent` carry the `cost_at_consumption` snapshot?** **Proposed answer**: no — that's slice #5 (`m3-cost-snapshot-persistence`) territory. Coupling cost into this event would pull the cost-resolver into the consumption hot path. Slice #5 emits a separate `COST_SNAPSHOTTED` event keyed on the same `stock_move_id` for join-back.

- **Idempotency of `recordConsumption()` against retries**: if a network blip causes the agent to retry the same MCP call, we get two `stock_moves` rows. **Proposed answer**: the caller passes an idempotency key (UUID v4) in `RecordConsumptionInput`; the service short-circuits if a `stock_moves` row with that key already exists. Implementation detail; INT-tested in this slice but not promoted to ADR — covered by REQ-CE-5 in the spec.

- **Does the `nexandro_tag` field propagate to the StockMove row, or live only in the event payload?** **Proposed answer**: event-only for now. Tag is an AI-obs / cost-attribution concept (ADR-030 widget #7); the StockMove row is the operational ledger and shouldn't grow per-AI-obs requirement. If future cost-by-tag analysis needs to query StockMove directly, we add a `metadata->>'tag'` jsonb path in a follow-up migration.
