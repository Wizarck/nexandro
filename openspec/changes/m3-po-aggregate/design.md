## Context

M3's procurement track (block 3 of the slice list) opens with the buyer cycle: a manager drafts a PurchaseOrder, sends it to a supplier, then receives goods over one or more deliveries. Each delivery confirms PO lines and creates `lots` rows (foundation already shipped by slice #1).

Today there is no `purchase_orders` entity. Slices #7 (GR reconciliation) and #8 (procurement UI) both FK / depend on it. Without a PO aggregate, those slices have no parent record to reconcile against and operators have no draft surface to edit.

This slice is **foundation-only**: it ships the entity, the state machine, the per-org PO-number counter, the multi-tenant-gated repository, and the typed event envelopes. GR reconciliation, UI, and audit-log emission are claimed by downstream slices.

The slice follows the Wave 2.1 BC scaffold pattern proven by slice #1 (`m3-lot-aggregate`): migration + entities + factory + repo + read-only public surface + Zod contracts + event-types-registered-but-not-emitted. The lessons codified in [[feedback_subagent_apply_typing_fix_cascade]] are pre-applied: numericTransformer hoisted above class declarations, inline types in `types.ts`, `.min(1)` over `.nonempty()`.

## Goals / Non-Goals

**Goals:**

- Stable `PurchaseOrder` + `PurchaseOrderLine` entity contracts for downstream M3 slices (#7 GR, #8 UI) to FK / consume.
- Migration 0030 (`create_purchase_orders`) numbered in the architecture-canonical sequence after the slice #1 lot tables (0026 + 0027) and the audit hash-chain migrations (0023 + 0024) reserved for slice #21.
- Six-state machine encoded as a pure function (no NestJS / TypeORM dependency in the transition module); exhaustive transition-matrix unit test.
- Per-org monotonic PO numbering via row-locked `po_counters` table; INT test asserts no deadlock + no number collision under concurrent inserts.
- Three indexes on `purchase_orders` per ADR-PO-INDEXES, each anchored to a downstream query pattern — no speculative indexing.
- Multi-tenant invariant: every `PurchaseOrderRepository` query gates on `organizationId` at the repository layer.
- Six PO event envelopes typed in contracts but NOT registered with `AuditLogSubscriber` (claimed by slice #21).

**Non-Goals:**

- GR confirmation flow (creating `lots` rows from confirmed PO lines). Reserved for `m3-gr-aggregate-reconciliation` (#7).
- Operator UI for procurement (j11 procurement table, draft editor, send button). Reserved for `m3-procurement-ui` (#8).
- Audit-log emission for PO events. Reserved for `m3-audit-log-hash-chain-hardening` (#21).
- PO line price re-negotiation, supplier counter-offers, multi-currency conversion.
- PO archival / soft-delete. M3.x followup if ever needed.
- Bulk import of historical POs. Out of MVP scope.

## Decisions

### ADR-PO-STATE-MACHINE — six states, pure-function transitions, explicit matrix

The PO lifecycle is encoded as **six discrete states** with a fixed transition table:

| State | Meaning | Reachable from |
|---|---|---|
| `draft` | Mutable draft, not yet sent to supplier | initial |
| `sent` | Sent to supplier, awaiting first delivery | `draft` |
| `partially_received` | At least one but not all lines fully received | `sent`, `partially_received` (idempotent on additional partial GRs) |
| `received` | All lines fully received | `sent`, `partially_received` |
| `closed` | Manually closed (paid, archived) | `received` |
| `cancelled` | Cancelled — terminal | `draft`, `sent`, `partially_received` (never from `received` or `closed`) |

**Transition matrix** (rows = from, cols = to; ✅ legal, ❌ illegal):

| from \ to | draft | sent | partially_received | received | closed | cancelled |
|---|---|---|---|---|---|---|
| draft | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| sent | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| partially_received | ❌ | ❌ | ✅ (additional partial) | ✅ | ❌ | ✅ |
| received | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| closed | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| cancelled | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

The state-machine module exports `canTransition(from, to): boolean` and `assertTransition(from, to): void` (throws `IllegalStateTransitionError`). Pure functions, no DB or DI; trivial to unit-test exhaustively (6 × 6 = 36 pairs).

**Alternatives considered:**

1. **State pattern / class hierarchy per state.** Rejected: over-engineered for six states; pure function + enum is clearer and reads top-to-bottom.
2. **Workflow engine (e.g., XState).** Rejected: 2nd-party dependency cost not justified; transitions don't carry side effects in this slice.

### ADR-PO-LINE-IMMUTABILITY — lines become immutable once state ≥ sent

While `state = 'draft'`, all PO line fields are mutable (`quantity_ordered`, `unit_price`, `vat_rate`, etc.). Once the PO transitions to `sent`, lines are **frozen**: the repository refuses UPDATE/DELETE on `purchase_order_lines` rows whose parent PO is not `draft`. Corrections after send require either (a) a new PO or (b) cancellation + recreation.

**Why?** Once a supplier has committed to a price + quantity, mutating the line silently breaks reconciliation and audit. GR slice #7 reconciles against the committed line snapshot; if the line drifted, the comparison is meaningless.

**Rejected alternative**: per-line `version` column. Rejected for MVP: adds complexity (which version to reconcile against?) for a low-volume edge case (operators report this is rare in pilot interviews).

### ADR-PO-SUPPLIER-FK — hard FK, NO ACTION on delete

`purchase_orders.supplier_id` is `NOT NULL` with `FOREIGN KEY ... ON DELETE NO ACTION` against `suppliers.id`. Attempting to delete a supplier that has any PO row raises a referential-integrity error at the database, blocking the delete.

**Why NO ACTION over CASCADE?** A supplier with PO history is a real business relationship; cascading delete would silently wipe procurement records. M2's supplier surface already uses soft-delete (`isActive=false`) for "discontinued" suppliers — that pattern continues to work without touching PO rows.

**Why NOT NULL?** A PO without a supplier is meaningless. The legacy nullable pattern in `lots.supplier_id` was for M3.x backfill; PO never has a backfill case (POs are born going forward).

### ADR-PO-VAT-MONEY-FIELDS — numeric(18,4) + ISO 4217 currency + per-line VAT-inclusive flag

All money columns are `numeric(18,4)`: `unit_price`, `vat_rate` (stored as `numeric(5,4)`, e.g. `0.2100`), `line_subtotal`, `line_vat`, `line_total`, plus PO-header `subtotal`, `vat_total`, `total`. **Never `float` / `real` / `double precision`.** This matches M2's `numeric(18,4)` convention on `ingredient.quantity_per_unit` and slice #1's `lots.quantity_received`.

`currency` is `text NOT NULL CHECK (length(currency) = 3)` (ISO 4217 alpha-3, e.g. `EUR`, `USD`). Stored on the PO header (not per-line) — a PO is single-currency in MVP.

`vat_inclusive` is a per-line boolean: `false` means `unit_price` is net (line_subtotal = qty × unit_price; line_vat = line_subtotal × vat_rate); `true` means `unit_price` is gross (line_total = qty × unit_price; line_subtotal = line_total / (1 + vat_rate); line_vat = line_total - line_subtotal). Factory enforces the math; spec covers both paths.

**Why per-line VAT-inclusive rather than per-PO?** Spanish + Italian suppliers mix conventions within a single invoice (perishables net, packaging gross). M2 PRD §3.4 already documents this on `supplier_items.price_inclusive` — extending the pattern keeps the cognitive model consistent.

### ADR-PO-EVENT-TYPES-REGISTERED — six event types in contracts, NOT emitted here

This slice DEFINES the event shapes in `packages/contracts/src/m3/po.ts`:

- `PO_CREATED` (payload: full PO read model + initial lines)
- `PO_SENT` (payload: PO id + sent_at + actor user id)
- `PO_RECEIVED_PARTIAL` (payload: PO id + line ids received in this delivery + remaining quantities)
- `PO_RECEIVED_FULL` (payload: PO id + final delivery summary)
- `PO_CANCELLED` (payload: PO id + reason + actor user id)
- `PO_CLOSED` (payload: PO id + closed_at + actor user id)

It does NOT register an `@OnEvent` subscriber in `apps/api/src/audit-log/audit-log.subscriber.ts`. Slice #21 (`m3-audit-log-hash-chain-hardening`) adds the event types to the subscriber's `KNOWN_EVENTS` set in a single batch update once every M3 BC has shipped. This pattern is established by slice #1 (lot-aggregate) and slice #16 (vision-LLM-provider-DI).

**Why not emit-and-discard now?** Risk of double-write when slice #21 wires it later, plus the audit envelope hash-chain shape is not finalized until ADR-032 migration 0023+0024 lands.

### ADR-PO-INDEXES — three indexes per migration 0030, each justified

| Index | Cols | Query pattern | Owning slice |
|---|---|---|---|
| `idx_po_org_supplier_created` | `(organization_id, supplier_id, created_at DESC)` | "show last N POs for supplier X" — buyer history view | slice #8 (procurement UI), slice #11+ (recall supplier trace) |
| `idx_po_org_state_expected_delivery` | `(organization_id, state, expected_delivery_date) WHERE state IN ('sent','partially_received')` | "show open POs sorted by expected delivery for the ops dashboard" | slice #8 (j11 active-POs table) |
| `idx_po_org_number_unique` | UNIQUE `(organization_id, po_number)` | enforces per-org PO-number uniqueness; supports `findByNumber` lookups | slice #8 (PO detail navigation) |

The `(organization_id, state, expected_delivery_date)` partial index uses `WHERE state IN ('sent','partially_received')` because that's where 95% of the read traffic concentrates (operator dashboard); excluding `draft` + terminal states keeps the index size small.

The compound index on `(organization_id, supplier_id, created_at DESC)` doubles as the index for slice #11 (recall) supplier-anchored queries — same shape as slice #1's `idx_lots_org_supplier_received`.

`UNIQUE (organization_id, po_number)` is enforced via a real `UNIQUE` index (not just a CHECK), so concurrent allocations contending for the same number fail at the DB even if the counter logic ever has a bug.

**No index on `purchase_order_lines` columns beyond the FK index implicitly created on `purchase_order_id`** — line queries are always parent-scoped via `JOIN purchase_orders` for the org gate, which uses the parent's indexes. The `UNIQUE (purchase_order_id, line_number)` constraint creates a covering index for `findByLineNumber`.

### ADR-PO-NUMBER-FORMAT — `PO-{YYYY}-{nnnn}` per org, row-locked counter

PO numbers are human-readable and per-org monotonic within a calendar year: `PO-2026-0001`, `PO-2026-0002`, ... resetting to `PO-2027-0001` on new year rollover. Pad to 4 digits minimum; widen to 5 if any org breaks 10000/year.

Allocation flow (within a DB transaction):
1. `SELECT next_value FROM po_counters WHERE organization_id = $1 AND year = $2 FOR UPDATE` (row lock).
2. If no row, INSERT with `next_value = 2` (claiming 1) and return 1; otherwise UPDATE `next_value = next_value + 1` and return the old value.
3. Format as `PO-{year}-{pad(value, 4)}`.

**Why row-lock not DB sequence?** Per-org sequences would require dynamic sequence creation per tenant (smelly DDL pressure); row-lock on a counters table is a well-known pattern (M2's `agent_idempotency_keys` uses the same approach).

**Why `FOR UPDATE` not `SKIP LOCKED`?** Contention is bounded (a couple POs/day per org); blocking is acceptable; `SKIP LOCKED` would skip rows and either (a) require retry or (b) leave gaps in numbering. Gap-free numbering is a soft requirement (auditors expect it).

**Rejected alternative**: client-generated UUIDs displayed in the UI. Rejected: operators in pilot interviews universally referenced "PO-2025-0142"-style numbers in WhatsApp conversations; UUIDs fail the human-readable test.

### ADR-PO-NO-AUDIT-EMIT-HERE — defer subscriber wiring to slice #21

Per the Wave 2.1 pattern (codified in slice #1 lot-aggregate's ADR-LOT-NO-EVENT-EMIT-HERE), this slice DECLARES event types but does NOT emit them or register an audit subscriber. Slice #21 batches the registration across all M3 BCs once the hash-chain migrations land.

A smoke test asserts the absence of `audit_log` rows when `PoFactory.create()` is called in the INT suite. This catches accidental emission.

## Risks / Trade-offs

- **[Risk]** Row-locked counter creates a hot row per (org, year). **Mitigation**: bounded by realistic PO volume (~10/day/org). INT test runs 8 concurrent factory creates and asserts no deadlock + all numbers unique.
- **[Risk]** State-machine purity is broken if a future contributor adds a side effect inside `canTransition`. **Mitigation**: ESLint rule + spec scenario "state-machine module imports only pure dependencies"; the file lives under `apps/api/src/procurement/po/domain/state-machine.ts` with no `@Injectable()`.
- **[Risk]** VAT calculation drift if `vat_inclusive=true` rounding differs across operations (e.g. PO total vs invoice match). **Mitigation**: ADR-PO-VAT-MONEY-FIELDS pins `numeric(18,4)`; factory computes via half-even rounding to match M2 ADR-015. Spec covers both inclusive + exclusive paths with worked examples.
- **[Risk]** PO line immutability after send blocks legitimate small corrections (typo in quantity). **Mitigation**: documented escape hatch — cancel + recreate. In pilot we expect < 1 such case per month per org; the UI surface (slice #8) shows a clear "cancel + recreate" affordance.
- **[Risk]** Index on `(organization_id, state, expected_delivery_date) WHERE state IN ('sent','partially_received')` becomes stale if more "active" states are added. **Mitigation**: the partial WHERE list is documented in code comment + a spec scenario asserts the exact list; future state additions are forced to revisit this index.
- **[Trade-off]** Per-PO single currency (not per-line) simplifies math at the cost of multi-currency-PO flexibility. **Trade-off accepted**: M2 pilot interviews show 100% of POs are single-currency in pilot orgs; multi-currency is a M3.x consideration if EU multi-jurisdiction operators sign on.
- **[Trade-off]** PO number gap-free within a year is a soft contract — a transaction rollback after counter increment WILL leave a gap. **Trade-off accepted**: documented; auditors accept gaps with a documented rationale.

## Migration Plan

1. **Stage 1 — Schema only** (this PR):
   - Run migration 0030 on staging.
   - No data; no behavior change in M2.
   - Smoke test: `PoFactory.create(...)` writes a PO + lines, reads them back; multi-tenant leakage test passes; PO number `PO-2026-0001` allocated.
2. **Stage 2 — Downstream integration** (slices #7, #8, #21):
   - Slice #7 rebases atop this slice's merge; wires GR confirmation to drive `partially_received` → `received` transitions and create `lots` rows.
   - Slice #8 rebases atop merge; ships j11 procurement UI.
   - Slice #21 batches PO event types into the audit subscriber.
3. **Rollback strategy**:
   - Down migration drops `purchase_order_lines` → `purchase_orders` → `po_counters` (dependency order).
   - No M2 data depends on these tables; M2 functionality unaffected.
   - Worst-case rollback during M3 implementation: any downstream slice that already FK'd in must roll back first (its own down migration).

## Open Questions

- **PO line ordering**: should `line_number` be operator-editable (drag-to-reorder in draft state) or strictly insertion-order? **Proposed answer**: insertion-order at creation; reorder deferred to slice #8 UI design. UNIQUE `(po_id, line_number)` makes either path work.
- **Cancelled PO retention**: do cancelled POs stay in the active-POs view? **Proposed answer**: no; the partial index excludes them. Cancelled-PO history surface deferred to slice #8.
- **Currency override per-line**: confirmed no in MVP (per ADR-PO-VAT-MONEY-FIELDS). Revisit in M3.x if multi-currency operators sign on.
