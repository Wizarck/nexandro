# Recall BC

M3 bounded context for recall investigation + traceability surface.

## What lives here

| File / dir | Purpose | Owning slice |
|---|---|---|
| `domain/constants.ts` | `RECALL_TRACE_MAX_DEPTH` + hard cap | slice #12 (this slice) |
| `types.ts` | Inline `TraceNode` + anchor shapes | slice #12 |
| `application/trace.service.ts` | Forward + reverse recursive-CTE traversal | slice #12 |
| `application/trace.errors.ts` | Domain errors → HTTP at controller | slice #12 |
| `interface/trace.controller.ts` | `GET /m3/recall/trace/{forward,reverse}` | slice #12 |
| `interface/dto/trace.dto.ts` | Query DTOs | slice #12 |
| `recall.module.ts` | NestJS module | slice #12 (also touched by slice #11) |

## Public surface

The module exports `TraceService` for downstream slices to consume:
- slice #13 `m3-recall-86-flag-dispatch` — dossier "lots affected" section reuses the forward + reverse tree shapes.
- slice #14 `m3-recall-pdf-export` — operator-facing PDF embeds the forward tree.
- slice #15 `m3-appcc-export-multilingual` — APPCC regulatory PDF embeds the trace.

## What is NOT here

- Search-by-anchor (symptom-text → anchor list) — owned by slice #11 `m3-incident-search-multi-anchor` (parallel).
- Operator action (86-flag dispatch, kitchen alerts) — owned by slice #13.
- PDF / APPCC export — owned by slices #14 + #15.

## Depth cap

Traversal recursion is capped per ADR-028:
- Default: `RECALL_TRACE_MAX_DEPTH = 10` from `domain/constants.ts`.
- Per-org override: `organizations.recall_max_depth INT NULL` (added by migration 0036; CHECK `BETWEEN 1 AND 30`).
- Hard cap: `RECALL_TRACE_MAX_DEPTH_HARD_CAP = 30`.

`TraceService.resolveMaxDepth(orgId, opts?)` clamps to `min(opts, org_override ?? CONSTANT, HARD_CAP)`.

## Traversal indexes (migration 0036)

Three partial B-tree expression indexes on `audit_log`:
- `idx_audit_log_payload_lot_id` ON `(organization_id, payload_after->>'lot_id')` WHERE non-null.
- `idx_audit_log_payload_recipe_id` ON `(organization_id, payload_after->>'recipe_id')` WHERE non-null.
- `idx_audit_log_payload_menu_item_id` ON `(organization_id, payload_after->>'menu_item_id')` WHERE non-null.

Each is partial so it stays narrow — only event types that populate the field appear in the index.

## RBAC

`@Roles('OWNER', 'MANAGER')` on every controller method. STAFF rejected at 403 by the global `RolesGuard`. Multi-tenant gate uses `organizationId` from the query (mirrors `audit-log-browse.controller.ts`).

## Deferred

- INT testcontainer test at `apps/api/test/int/recall-traversal-depth.int-spec.ts` (placeholder file present; body deferred per slice #12 `tasks.md §Deferred D1`).
- Per-org `recall_max_depth` admin UX — slice's migration provisions the column; an admin form is M3.x.
- Label-join enrichment for recipe / menu-item nodes — slice #12 renders placeholder labels; M3.x wires M2 i18n hooks.
- `TraceNode` promotion to `@nexandro/contracts` — blocked on the workspace `rootDir` cascade resolution; until then the shape is duplicated between `apps/api/src/recall/types.ts` and `packages/ui-kit/src/components/RecallTraceTree/types.ts`.
