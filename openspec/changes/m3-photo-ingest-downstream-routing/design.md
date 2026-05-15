# Design — m3-photo-ingest-downstream-routing (M3 hardening H1a)

## Context

Slice #17a (`m3-photo-ingest-backend`, Wave 2.8) terminated the photo-ingestion BC at the `PHOTO_INGESTION_SIGNED` audit envelope. The original tasks.md §Deferred entry called out the gap explicitly:

> Downstream routing chain (`PHOTO_INGESTION_AUTO_FILLED` → GR draft for invoice / Lot creation for product) — followup `m3.x-photo-ingest-downstream-routing` (slice #8 m3-procurement-ui owns GR-draft surface; Lot creation seam exists in slice #7 m3-gr-aggregate-reconciliation).

This slice ships the wiring. Note the deferred entry references both `AUTO_FILLED` and `SIGNED` as triggers — we choose `SIGNED` only for v1 because the auto-fill path still represents an LLM-only assertion (no operator on the audit trail). Routing only on `SIGNED` keeps the operator-as-author invariant intact. Auto-fill routing is a candidate follow-up if M3 operations later decide it is acceptable.

## ADRs

### ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY — Unique partial index is the canonical guarantee

**Context.** `EventEmitter2` delivery is at-least-once under failure (NestJS retries on certain transient errors; cluster-mode restart can replay an event from a buffered queue). Without idempotency, a re-fire creates a duplicate `Lot` / duplicate `GoodsReceipt` draft, which then poisons the downstream `LotCreated` chain (slice #5 cost snapshot writes twice; GR draft surface lists twice).

**Decision.** Two layers of defense, both required:

1. **DB-level guarantee** — `UNIQUE INDEX … WHERE source_photo_ingestion_id IS NOT NULL` on each of `lots` and `goods_receipts`. The partial predicate is important: legitimate `source_photo_ingestion_id IS NULL` rows (the bulk of M3 traffic — Lots created via GR confirmation, GRs created manually) MUST NOT participate in the uniqueness constraint.
2. **Application-level short-circuit** — `findBySourcePhotoIngestionId(orgId, itemId)` runs before insert. If found, return the existing row's id in the `PHOTO_INGESTION_DOWNSTREAM_ROUTED` envelope (`alreadyRouted: true` flag in payload). This gives us a friendly error path: the second emit does NOT throw, it logs + emits a routed envelope pointing at the original aggregate.

Why two layers: app-layer alone misses races (two simultaneous emits both pass the lookup, both attempt insert, one wins, one panics with the bare PG unique-violation). DB-layer alone gives the panicked emit a `23505` error which the subscriber catches but cannot translate to "already routed" cleanly. With both: app layer covers happy idempotency, DB layer is the race backstop. On `23505` from the insert path, the subscriber re-runs `findBySourcePhotoIngestionId` and emits the routed envelope.

**Consequences.**
- Two unique partial indexes on hot-path tables. Negligible cost since the cardinality of `source_photo_ingestion_id IS NOT NULL` rows is much smaller than the table total.
- The subscriber is robust to bus replay without manual operator intervention.

**Alternatives rejected.**
- **Single application-layer lock (Redis SETNX, advisory lock).** Adds infrastructure dependency for a problem the DB already solves.
- **Per-org row counter / aggregate sequencer.** Overkill for a 1:1 mapping.

### ADR-FIELD-MAPPING-FAIL-OPEN — Missing critical field emits skip envelope, never throws

**Context.** The LLM extraction is the source of truth for downstream field values. But the LLM may have failed to extract `gtin` from a smudged barcode, or the operator may have signed without supplying enough corrections to satisfy `Lot.create()`'s invariants (e.g. positive `quantityReceived`).

**Decision.** Validate field availability BEFORE calling `Lot.create()` / `GoodsReceipt` constructor. If a critical field is missing:

1. Emit `PHOTO_INGESTION_ROUTING_SKIPPED` with `payload_after.reason = ['missing:gtin', 'missing:quantity']` (lowercased, prefixed). Retention class `'regulatory'` — the skip decision IS part of the EU AI Act chain.
2. Return `{ routed: false, skipReason: [...] }` from the service.
3. Subscriber logs at WARN level but does NOT throw.

The signing transaction has already committed. The signed envelope is already on the audit log. Throwing from the routing handler would either (a) be silently swallowed by the bus, or (b) trigger NestJS retry logic on the same envelope, which is wasteful when the failure is deterministic (the same fields are missing on every retry).

**Critical fields** per kind:

- `product` → `gtin` (str, non-empty) AND `quantity` (number > 0). `expiryDate` is recommended but not required (operator may fill it later). `unit` defaults to `'un'` if absent. `locationId` falls back to the operator's default location — TODO note: the FK gate requires location resolution; v1 reads `payload_after.operatorCorrection.fields[]` for an operator-supplied `location_id` field; if absent we skip with reason `'missing:locationId'`.
- `invoice` → `supplier_invoice_ref` (str, non-empty) AND `received_at_location_id` (resolvable from operator's default OR from the `location_id` field) AND `supplier_id` (resolvable) AND at least 1 line item with `qty > 0`. Without `line_items`, the GR draft would be empty and cannot transition through `confirm()` — skipping is safer than creating a junk draft.

**Consequences.**
- Operator can re-sign the same item after correcting more fields. But re-signing is currently blocked by `IngestionAlreadySignedError` (slice #17a). A follow-up slice (`m3.x-photo-ingest-retroactive-correction`) ships the correction path; until then a skipped routing decision is terminal for that item. We document this in §Deferred. The `PHOTO_INGESTION_ROUTING_SKIPPED` envelope tells operations what went wrong so they can manually create the downstream row.

**Alternatives rejected.**
- **Throw + retry.** Fails for deterministic missing-field cases.
- **Create a placeholder Lot / GR with sentinel values.** Pollutes downstream surfaces with garbage rows that operators must clean up.
- **Quarantine list table.** New table = new migration + new read surface. Audit envelope already provides the queryable record.

### ADR-SOURCE-PROVENANCE-COLUMN — `source_photo_ingestion_id` on the downstream aggregate

**Context.** The provenance link from a `Lot` / `GoodsReceipt` row back to the photo extraction that materialized it must be queryable for: (1) idempotency lookup (this slice); (2) AI Suspicion Score backfill (M3.x — does the operator-corrected value diverge from what the LLM said? cross-reference via `audit_log` envelopes anchored to the ingestion item); (3) EU AI Act forensic trace (regulator asks "show me the audit chain from photo to lot").

**Decision.** Add `source_photo_ingestion_id UUID NULL` to both `lots` and `goods_receipts`. NOT a separate join table. Reasons:

- 1:1 mapping (one signed ingestion item → at most one downstream row). A join table would be over-engineered.
- The column is the natural place for the unique partial index (ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY).
- Queries against this column are rare (operator-side dashboards + regulator queries); no need to optimize beyond the unique index.
- FK to `photo_ingestion_items(id)` with `ON DELETE SET NULL` — if a `photo_ingestion_items` row is ever hard-deleted (rare; soft-delete is the default), the downstream aggregate stays valid but loses the back-reference.

**Consequences.**
- Two tables grow by one nullable UUID + FK overhead. Negligible.
- The `Lot.create()` factory accepts an optional `sourcePhotoIngestionId` arg. Existing call sites (GR confirmation in slice #7, etc.) pass `null` implicitly. Test discipline: every existing `Lot.create()` test still passes; only the new routing-service tests pass a non-null value.

**Alternatives rejected.**
- **Store provenance only in `metadata` JSONB.** Cannot enforce uniqueness at DB level. Cannot index efficiently without GIN + functional expression, both more expensive than a typed column.
- **Separate `lot_provenance` table.** Over-engineered for 1:1. Adds a foreign-key write per Lot insert.

### ADR-ROUTING-AUDIT-EVENT-NAMING — Two envelopes, both regulatory

**Context.** The routing decision needs to be auditable for EU AI Act forensic compliance. Two distinct outcomes (routed vs. skipped) need distinct envelopes so the auditor can grep by event type.

**Decision.** Introduce two new event types:

1. `PHOTO_INGESTION_DOWNSTREAM_ROUTED` ↔ `m3.photo-ingestion.downstream-routed`. Emitted on every successful route (including idempotent re-fires that return the existing row — `payload_after.alreadyRouted: true`).
2. `PHOTO_INGESTION_ROUTING_SKIPPED` ↔ `m3.photo-ingestion.routing-skipped`. Emitted when field-mapping validation fails; carries `payload_after.reason: string[]` listing the missing fields.

Both are `retention_class='regulatory'` — they are part of the AI-Act-relevant chain.

**Envelope shape** (both):

```ts
{
  organizationId: <orgId from signed envelope>,
  aggregateType: 'photo_ingestion_item',
  aggregateId: <ingestionItemId>,
  actorUserId: null,            // the routing decision is system-made
  actorKind: 'system',
  payloadBefore: null,
  payloadAfter: {
    ingestionItemId,
    kind: 'product' | 'invoice',
    // For ROUTED:
    downstreamAggregateType?: 'lot' | 'goods_receipt',
    downstreamAggregateId?: <uuid>,
    alreadyRouted?: true,       // only on idempotent re-fire
    // For SKIPPED:
    reason?: string[],          // e.g. ['missing:gtin', 'missing:quantity']
  },
}
```

The `aggregateType` is pinned to `'photo_ingestion_item'` on BOTH envelopes (NOT `'lot'` / `'goods_receipt'`), because the envelope describes a decision ABOUT the ingestion item, not a state change on the downstream aggregate. The downstream aggregate has its own `LOT_CREATED` / `GR_DRAFT_CREATED` envelopes (well, `LOT_CREATED` exists at slice #21; `GR_DRAFT_CREATED` does not — slice #7 only emits `GR_CONFIRMED`. The slice #7 design intentionally treats the `draft` state as ephemeral and only audits the confirmed state. We follow that pattern here — no new `GR_DRAFT_CREATED` envelope).

**Consequences.**
- The audit log carries a clean chain: `PHOTO_INGESTION_SIGNED` (regulatory, operator-anchored) → `PHOTO_INGESTION_DOWNSTREAM_ROUTED` (regulatory, system-anchored) → `LOT_CREATED` (regulatory, system-anchored, slice #21 emit path).
- For invoice path: no envelope between routing and operator GR confirmation. The audit chain pauses at `PHOTO_INGESTION_DOWNSTREAM_ROUTED` until operator runs `GrConfirmationService.confirm()`, at which point `GR_CONFIRMED` resumes the chain.

**Alternatives rejected.**
- **Single `PHOTO_INGESTION_ROUTING_DECIDED` envelope with `outcome: 'routed' | 'skipped'`.** Forces the auditor to inspect payload to filter; the event-type column is more selective for grep / SIEM rules.
- **Reuse `PHOTO_INGESTION_RECLASSIFIED`.** Semantically wrong — reclassification is operator-initiated.

## Cross-cutting concerns

- **Multi-tenant.** Every `LotRepository` / `GoodsReceiptRepository` method takes `organizationId` first. The subscriber gates on the envelope's `organizationId` field, which slice #17a guarantees is populated (it comes from `IngestionItem.organizationId`).
- **No `packages/contracts` import.** Inline `PhotoIngestionRoutingResult`, `ProductPhotoFieldMap`, `InvoicePhotoFieldMap` per the rootDir TS6059 hygiene rule.
- **Single audit subscriber.** The 2 new `@OnEvent` handlers go on `AuditLogSubscriber` (extending the single canonical subscriber per ADR-CROSS-BC-SUBSCRIBER-LOCATION / slice #21's ADR-SUBSCRIBER-FAN-OUT). The routing logic itself lives in a NEW subscriber `PhotoIngestionRoutingSubscriber` in the new module — different concern (the routing service is not an audit writer; it's a domain service).
- **Field-mapping resolution.** The LLM extraction returns fields as `{ name, value, confidence }`. The routing service extracts well-known field names (`gtin`, `expiry_date`, `quantity`, `unit`, `supplier_id`, `location_id`, `supplier_invoice_ref`, `received_at`, `received_at_location_id`, `receiving_user_id`, `line_items`) preferring `operator_correction` over `llm_extraction` when both are present. Field-name conventions are documented inline in the service; future field expansions land via the same lookup pattern.
- **Lot factory invariants.** `Lot.create()` already validates `quantityReceived > 0`, UUID shapes, and `expiresAt > receivedAt`. The routing service catches `InvalidLotQuantityError` / `InvalidLotExpiryError` / `InvalidUnitError` and converts them to `PHOTO_INGESTION_ROUTING_SKIPPED` with reason `'invariant:<error name>'`. We do not surface the raw error message because it may contain PII.
- **GR draft shape.** The routing service builds a `GoodsReceipt` row in `state='draft'` directly via `GoodsReceiptRepository.save()` — it does NOT call `GrConfirmationService.confirm()`. The draft row carries `supplierId`, `receivedAt` (defaulting to the signed-at timestamp if the LLM didn't extract it), `receivedAtLocationId`, `receivingUserId` (defaulting to the signer's user id), `supplierInvoiceRef`. GR lines are NOT created in this slice — the operator confirms the draft through the j7 procurement UI, where they review the LLM-extracted `line_items` and supply final corrections. The `line_items` field-mapping is recorded in the routing envelope's `payload_after.lineItemsHint` for the UI to pre-populate.

## Test plan

### Unit (apps/api)

- `photo-ingestion-routing.service.spec.ts`:
  - **AC-ROUTE-1** — product happy path: signed envelope with `kind='product'` + full field map → service creates Lot row + emits `PHOTO_INGESTION_DOWNSTREAM_ROUTED` with `downstreamAggregateType='lot'`.
  - **AC-ROUTE-2** — invoice happy path: signed envelope with `kind='invoice'` + full field map → service creates GR draft row + emits `PHOTO_INGESTION_DOWNSTREAM_ROUTED` with `downstreamAggregateType='goods_receipt'`.
  - **AC-ROUTE-3** — idempotent re-fire: pre-populate Lot with `sourcePhotoIngestionId=X`; re-fire envelope for X → service returns existing row + emits envelope with `alreadyRouted: true`, NO duplicate insert.
  - **AC-ROUTE-4** — missing critical field: signed envelope missing `gtin` → service emits `PHOTO_INGESTION_ROUTING_SKIPPED` with reason listing `missing:gtin`. No Lot row created.
  - **AC-ROUTE-5** — multi-tenant isolation: org A signs item; envelope's `organizationId='A'` → all repository calls gated on `'A'`; querying org B with same `sourcePhotoIngestionId` returns no row (proves the org gate is in every read).
  - **AC-ROUTE-6** — envelope shape: routed envelope carries `actorKind='system'`, `actorUserId=null`, `aggregateType='photo_ingestion_item'`, `payloadAfter` carries the routing decision.
- `photo-ingestion-routing.subscriber.spec.ts`:
  - Subscriber wired on `AuditEventType.PHOTO_INGESTION_SIGNED` → calls `service.routeSigned(envelope)` exactly once with the envelope.
  - Subscriber catches thrown errors → logs at ERROR level, does not propagate.
- `audit-log/application/types.spec.ts` — extended with 2 new entries in the regulatory parametric test list.

### INT (optional, deferred)

`apps/api/test/int/photo-ingest-routing.int.spec.ts` exercising the end-to-end fire → Lot row pattern against a testcontainers Postgres. Deferred to keep the slice in scope; tracked in §Deferred of tasks.md.

## Open questions (resolved)

- **Q: Should auto-fill route too?** A: No, v1. Auto-fill represents LLM-only assertion; routing on `SIGNED` preserves the operator-as-author invariant. Auto-fill routing is a candidate follow-up.
- **Q: Should the routing service create GR lines or only the header?** A: Only the header (`draft` state). GR lines + Lots-from-lines are created at `GrConfirmationService.confirm()` time. The routing service records `line_items` as a hint in the envelope `payload_after.lineItemsHint` for the j7 UI to consume.
- **Q: What if `Lot.create()` validation throws?** A: Catch + emit `PHOTO_INGESTION_ROUTING_SKIPPED` with reason `'invariant:<error name>'`. Do not propagate.
- **Q: How is `location_id` resolved when the LLM didn't extract one?** A: v1 reads operator correction or skips with `'missing:locationId'`. Default-location resolution from the signer's user profile is deferred to a follow-up (`m3.x-photo-ingest-default-location`).
