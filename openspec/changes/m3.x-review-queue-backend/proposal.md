# m3.x-review-queue-backend

## Problem

The listener slice (PR #157) ships `DownstreamRevocationSubscriber` flipping `requires_review=true` on Lot + GR rows when their source photo-ingestion item is retro-corrected. Migration 0041 brings the partial indexes (`idx_lots_requires_review`, `idx_goods_receipts_requires_review`) sized for the typical near-zero result set. **No backend surface exposes the flagged rows for operator consumption**, and **no surface clears the flag** — once set, the only way out is a hand-crafted SQL UPDATE.

Result: the listener is correct end-to-end but the operator-facing loop is half-built. The Hermes MCP surfaces + the future operator review-queue UI both need a stable read + clear API.

## Proposal

New BC `apps/api/src/review-queue/`. Pure raw-SQL repository (no entity coupling to inventory + procurement), narrow service layer, REST controller, 2 MCP write capabilities, 2 new regulatory audit-event types. The slice is read-only-plus-clear — no other mutation surface lives in this BC.

### Aggregate shape (inline contracts per ADR-CONTRACTS-INLINE-IN-API)

```ts
type ReviewQueueAggregateType = 'lot' | 'goods_receipt';

interface ReviewQueueRow {
  aggregateType: ReviewQueueAggregateType;
  aggregateId: string;
  organizationId: string;
  /** UUID of the photo-ingestion item that caused the flag. */
  sourcePhotoIngestionId: string | null;
  /**
   * Discriminated sub-payload — joined columns vary per aggregate type so
   * the operator UI surfaces meaningful context without a second roundtrip.
   */
  details:
    | { aggregateType: 'lot'; receivedAt: string; locationId: string; supplierId: string | null; unit: string }
    | { aggregateType: 'goods_receipt'; receivedAt: string; supplierId: string; supplierInvoiceRef: string | null; receivedAtLocationId: string };
  /** Time the row was flagged — derived from the source ingestion item's most-recent retro-correction `correctedAt` if available, else from the row's `created_at`. */
  flaggedAt: string;
}

interface ListFlaggedResult {
  /** Sorted newest-first by `flaggedAt`. Capped at 200 rows per request. */
  rows: ReviewQueueRow[];
  /** `true` if the matching set strictly exceeded the 200-row cap. */
  truncated: boolean;
}
```

### Endpoints

| Method | Path | Roles | Operation |
|---|---|---|---|
| `GET` | `/m3/review-queue` | OWNER + MANAGER | List flagged aggregates for the caller's tenant. Newest-first; capped at 200 per response. Optional query: `?aggregateType=lot\|goods_receipt`, `?limit=<≤200>`. |
| `POST` | `/m3/review-queue/:aggregateType/:aggregateId/clear` | OWNER + MANAGER | Flip `requires_review = false` on the row. Idempotent (clearing a row that is already false returns `{ cleared: true, alreadyClear: true }` without an envelope). Emits `LOT_REVIEW_CLEARED` or `GR_REVIEW_CLEARED` envelope (regulatory) with `payloadAfter = { reviewedByUserId, reviewedAt, sourcePhotoIngestionId }`. |

`aggregateType` in the path is `'lot'` or `'goods_receipt'`. Any other value returns 400 BEFORE hitting the service.

### Audit envelopes

Two new `AuditEventType` values, both `retention_class='regulatory'`:

- `LOT_REVIEW_CLEARED` — operator marked the Lot as reviewed.
- `GR_REVIEW_CLEARED` — operator marked the GR as reviewed.

Both wire into the single `AuditLogSubscriber` per ADR-SUBSCRIBER-FAN-OUT.

### MCP capabilities

- `inventory.list-flagged-aggregates` (read; proxies the GET).
- `inventory.clear-review-flag` (write; proxies the POST; `idempotencyKey` honoured at the controller layer like every other write capability).

Both go in `INVENTORY_WRITE_CAPABILITIES` / read-capability list of the MCP server. Plus smoke-spec count bumps.

## Why a new BC instead of extending Inventory / Procurement

- The query joins Lot + GR — would create cross-BC import coupling if hosted inside either.
- Same rationale as the sibling `photo-ingestion-revocation` BC: cross-cutting concern over multiple aggregates → its own BC keeps each producer BC clean.
- Raw-SQL queries with 42703 graceful probe match the existing revocation BC pattern.

## What's NOT in this slice

- **UI** — separate `m3.x-review-queue-ui` slice consumes this backend (operator j-screen).
- **Auto-clear cron** — `m3.x-requires-review-clear-cron` followup remains filed; this slice gives operators a manual path which is the priority surface.
- **Entity-side `requiresReview` mapping on Lot + GR TS entities** — the raw-SQL approach doesn't need it. Filed `m3.x-lot-gr-requires-review-entity-mapping` if future code consuming the entities needs the field typed.
- **Domain events from clear actions** — the operator UI is the only consumer today; if downstream BCs need to react, file a separate slice with explicit event contracts.

## FR mapping

Closes the operator-visibility loop opened by the listener slice #157. Surfaces FR31's downstream effect for operator action.

## Migration

None. The columns + indexes ship with migration 0041 already in master. The raw-SQL probe handles tenants on older deployments via the 42703 graceful path (mirrors the revocation BC's pattern).
