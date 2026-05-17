# Tasks — m3.x-review-queue-backend

## §1 BC scaffold

- [x] `apps/api/src/review-queue/review-queue.module.ts` — declarations for the repository + service + controller; imports `EventEmitterModule` (already global) and TypeORM `DataSource` token via `@InjectDataSource`.
- [x] `apps/api/src/review-queue/application/types.ts` — inline `ReviewQueueAggregateType`, `ReviewQueueRow`, `ListFlaggedResult`, `ClearReviewResult` per the proposal.

## §2 Repository

- [x] `apps/api/src/review-queue/application/review-queue.repository.ts`:
  - `listFlagged(organizationId, opts: { aggregateType?, limit })` — UNION of 2 SELECTs, ORDER BY `flagged_at` DESC, LIMIT clamped to [1, 200]. Returns `{ rows, truncated }` where `truncated = rows.length === limit AND fetched limit+1 to check the boundary` (probe one extra and slice).
  - `clearLotReview(organizationId, lotId)` → `Promise<{ cleared: boolean; alreadyClear: boolean; sourcePhotoIngestionId: string | null }>`. UPDATE … SET requires_review = false WHERE id = $1 AND organization_id = $2 RETURNING source_photo_ingestion_id, requires_review (use a CTE checking the prior state).
  - `clearGrReview(organizationId, grId)` — same shape for `goods_receipts`.
  - All methods use the 42703 graceful probe pattern from `DownstreamRevocationRepository` (top-level `code` + nested `driverError.code`).

## §3 Service

- [x] `apps/api/src/review-queue/application/review-queue.service.ts`:
  - `listFlagged(organizationId, opts)` — delegates to repository; returns `ListFlaggedResult`.
  - `clearReview(organizationId, aggregateType, aggregateId, reviewedByUserId)` — delegates to one of `clearLotReview`/`clearGrReview`; on success emits `LOT_REVIEW_CLEARED` or `GR_REVIEW_CLEARED` envelope via `EventEmitter2.emitAsync` (NOT directly — the audit subscriber owns persistence per ADR-AUDIT-WRITER). Idempotent: when `alreadyClear: true`, returns `{ cleared: true, alreadyClear: true }` without emitting.
  - Returns `{ aggregateType, aggregateId, cleared: true, alreadyClear }`.
- [x] Unknown `aggregateType` raises `BadRequestException` BEFORE calling the repository.

## §4 Controller

- [x] `apps/api/src/review-queue/interface/review-queue.controller.ts`:
  - `GET /m3/review-queue` — `@Roles('OWNER', 'MANAGER')`. Query DTO: `organizationId: UUID`, `aggregateType?: 'lot' | 'goods_receipt'`, `limit?: 1..200`. Returns `ListFlaggedResult`.
  - `POST /m3/review-queue/:aggregateType/:aggregateId/clear` — `@Roles('OWNER', 'MANAGER')`. `@HttpCode(200)`. Body DTO: `{ organizationId: UUID }`. Param `aggregateType` validated against `['lot', 'goods_receipt']` enum.
- [x] Cross-org gate: `assertOrgMatch(user, query.organizationId)` / body's `organizationId` mirrors photo-ingestion controller.

## §5 Audit-event types

- [x] `apps/api/src/audit-log/application/types.ts` — add 2 `AuditEventType` const members + extend retention-class map (both `regulatory`).
- [x] `apps/api/src/audit-log/application/types.spec.ts` — append to the regulatory `it.each` list.
- [x] `apps/api/src/audit-log/application/audit-log.subscriber.ts` — add 2 `@OnEvent` handlers calling the same persistence helper as the other event types.

## §6 MCP capabilities

- [x] `packages/mcp-server-nexandro/src/capabilities/read/` — add `inventory.list-flagged-aggregates`. Maps to `GET /m3/review-queue`. Inline schema mirrors the controller's query DTO.
- [x] `packages/mcp-server-nexandro/src/capabilities/write/inventory.ts` — add `inventory.clear-review-flag` to `INVENTORY_WRITE_CAPABILITIES`. Path template `/m3/review-queue/:aggregateType/:aggregateId/clear`. `restPathParams` extracts `aggregateType` + `aggregateId`; `restBodyExtractor` keeps `organizationId` only.
- [x] Smoke spec counts: bumps to existing assertions in `packages/mcp-server-nexandro/test/smoke.spec.ts` + `packages/mcp-server-nexandro/src/capabilities/write/index.spec.ts` (WRITE_CAPABILITIES total + INVENTORY_WRITE_CAPABILITIES length tests).

## §7 Wiring

- [x] `apps/api/src/app.module.ts` — import `ReviewQueueModule` after `PhotoIngestionRevocationModule`.

## §8 Tests

- [x] `apps/api/src/review-queue/application/review-queue.repository.spec.ts` — 6 cases (listFlagged happy/cap, clearLot happy/already-clear, clearGr happy, 42703 graceful probe).
- [x] `apps/api/src/review-queue/application/review-queue.service.spec.ts` — 5 cases (list delegation, clear lot emits envelope, clear gr emits envelope, already-clear is no-op, unknown aggregateType throws BadRequest).
- [x] `apps/api/src/review-queue/interface/review-queue.controller.spec.ts` — 6 cases (GET happy, GET cross-org→403, POST clear-lot happy, POST clear-gr happy, POST cross-org→403, POST bad aggregateType→400, RBAC enum metadata).
- [x] `packages/mcp-server-nexandro/src/capabilities/write/inventory.spec.ts` — count bump + spot-check for `clear-review-flag` (path template, restPathParams, body extractor).
- [x] `packages/mcp-server-nexandro/test/smoke.spec.ts` — count bumps + spot-check for both new capabilities.

## §9 Local gates

- [x] `npx jest --testPathPattern='review-queue'` — green incl. all new specs.
- [x] `npx jest --testPathPattern='audit-log/application/types\\.spec'` — green (regulatory list extended).
- [x] `npx jest --testPathPattern='audit-log/application/audit-log\\.subscriber\\.spec'` — green (2 new handlers reachable).
- [x] `npx jest` in `packages/mcp-server-nexandro` — green incl. count bumps.
- [x] `npx tsc --noEmit -p apps/api/tsconfig.json` — clean.
- [x] `npx tsc --noEmit -p packages/mcp-server-nexandro/tsconfig.json` — clean.
- [x] `npx eslint` on all changed files — clean.

## §10 §4.5.6 AI-reviewer signoff

- [x] Profile: backend-only slice closing the operator-visibility loop opened by the listener slice #157.
- [x] Reviewer self-review:
  - All ADRs honoured (SUBSCRIBER-FAN-OUT, COLUMN-EXISTS-GRACEFUL-PROBE, NEVER-AUTO-CASCADE-DOWNSTREAM, CONTRACTS-INLINE-IN-API)?
  - Idempotent clear returns a distinct shape (no envelope)?
  - Cross-org access gate matches the existing controllers (assertOrgMatch + cross-org → 403)?
  - 200-row cap probed via fetch-one-extra-and-slice, not a separate COUNT roundtrip?

## Deferred / out of scope

- `m3.x-review-queue-ui` — j-screen consuming this backend. Builds on top of this slice.
- `m3.x-lot-gr-requires-review-entity-mapping` — adds `@Column requiresReview` to Lot + GR entities. Not needed for raw-SQL flow; file if downstream code consumes via TypeORM repositories.
- `m3.x-requires-review-clear-cron` — periodic batch sweep (still filed). Complementary to this slice's manual clear.
