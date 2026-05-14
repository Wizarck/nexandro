## Why

FR14 requires the Owner / Manager to surface candidate lots within seconds by typing a free-form anchor (lot code, supplier name, ingredient name, received date phrasing, symptom keyword, or aggregate type) from the J6 crisis surface. The operator is shaking; the search must rank by recency, then by symptom-match, and cap at 8 results so the candidate list fits the viewport without scroll. NFR-PERF-1 caps p95 at 500ms over a working dataset of 100k `audit_log` events.

Architecture-m3.md ADR-028 names the policy: dedicated bounded context at `apps/api/src/recall/` that **leverages existing `lots`, `stock_moves`, `audit_log`, `suppliers`, `ingredients` tables without new infrastructure**. This slice ships the canonical BC scaffold (module, domain constants, types) plus the first capability — multi-anchor search — that the two downstream slices (#12 trace tree, #13 dossier + dispatch) build on top of.

The scaffolded `RECALL_TRACE_MAX_DEPTH = 10` constant per ADR-028 lives in this slice so slice #12 can import it without a chicken-and-egg dependency. The BC's `apps/api/src/recall/` directory and `RecallModule` wiring into `app.module.ts` are likewise foundation surface for #12 and #13.

| Downstream consumer | Reference into recall BC |
|---|---|
| `m3-trace-tree-forward-reverse` (#12) | `IncidentSearchHit.kind='lot'` feeds the recursive CTE root; `RECALL_TRACE_MAX_DEPTH` caps recursion |
| `m3-recall-86-flag-dispatch` (#13) | dossier surface invokes search-then-trace; dispatch wires the email-and-MCP fan-out |
| j6 frontend (this slice + #12 + #13) | `IncidentSearchField` is the single input on the crisis screen |

## What Changes

- **New BC `apps/api/src/recall/`** — scaffold per ADR-028:
  - `recall.module.ts` (NestJS module; imports `LotModule`, `TypeOrmModule.forFeature([AuditLog, Supplier, Ingredient, Lot])`)
  - `domain/constants.ts` (`RECALL_TRACE_MAX_DEPTH = 10` per architecture-m3.md line 397; reserved for slice #12)
  - `types.ts` (inline `IncidentSearchHit` + service contract — NO `packages/contracts` import per Wave 2.1+ rootDir constraint)
  - Wired into `apps/api/src/app.module.ts` next to `PhotoStorageModule`.
- **`IncidentSearchService`** (`apps/api/src/recall/application/incident-search.service.ts`):
  - `search(organizationId, query, opts?) → Promise<IncidentSearchHit[]>`
  - Ranks by `receivedAt DESC` (recency) primary, `symptomMatchScore DESC` secondary, then label asc as tiebreaker.
  - Multi-anchor: queries `lots`, `suppliers`, `ingredients`, and the lot-anchored `audit_log` view in parallel.
  - 8-result hard cap after merge + rank — client receives at most 8 hits regardless of underlying source counts.
  - `opts.types` filters to a subset of `('lot' | 'supplier' | 'ingredient' | 'aggregate')`. Default = all four.
  - Empty-query returns `[]` — the service deliberately does NOT default to "all lots" to keep the p95 invariant in the empty input case.
- **REST controller** `apps/api/src/recall/interface/recall-search.controller.ts`:
  - `GET /m3/recall/search?q=<text>&types=lot,supplier,ingredient,aggregate&limit=8`
  - `@Roles('OWNER', 'MANAGER')` via the shared `Roles` decorator + global `RolesGuard`.
  - `organizationId` resolved from `req.user.organizationId` (multi-tenant gate at repository layer per ADR-LOT-MULTITENANT-AT-REPO).
- **MCP capability** `recall.search-incident` (`packages/mcp-server-opentrattos/src/capabilities/recall.ts`):
  - Read-only typeahead surface for agents (Hermes WhatsApp, AgentChatWidget) per the architecture-m3.md MCP namespace.
  - Forwards to `GET /m3/recall/search`. Returns the same `IncidentSearchHit[]` shape as the REST API.
- **Migration 0035** (`add_recall_search_indexes`) per ADR-031:
  - Compound partial GIN index on `audit_log` keyed by `(organization_id, payload_after->>'lot_code') WHERE payload_after->>'lot_code' IS NOT NULL` — accelerates the lot-anchored search path against the `audit_log` envelope payload.
  - Trigram GIN index `idx_suppliers_name_trgm` on `suppliers.name` using `gin_trgm_ops` (existing `pg_trgm` extension from migration 0010).
  - Trigram GIN index `idx_ingredients_name_trgm` on `ingredients.name` using `gin_trgm_ops`.
  - The `(organization_id, supplier_id, received_at DESC)` index on `lots` is already present from slice #1 migration 0026 (`idx_lots_org_supplier_received`); this migration does NOT re-create it.
- **Frontend**:
  - `packages/ui-kit/src/components/IncidentSearchField/` — autocomplete input + dropdown + keyboard nav + `onSelect(hit)` callback. Mirrors `IngredientPicker` combobox semantics (DEBOUNCE_MS=200 per j6.md edge case row).
  - `apps/web/src/hooks/useIncidentSearch.ts` — TanStack Query hook hitting `GET /m3/recall/search`.
  - `apps/web/src/screens/j6/IncidentSearchFieldScreen.tsx` — partial j6 screen (input + dropdown only; trace tree + CTA wiring deferred to #12 / #13).
- **NO** changes to `packages/contracts` (Wave 2.1+ rootDir constraint). The `IncidentSearchHit` type is inlined in `apps/api/src/recall/types.ts` for the API and re-declared locally in `apps/web/src/api/recall.ts`. The two surfaces are kept in sync by INT test (deferred to followup) and reviewer eyeballs.
- **BREAKING**: none. New BC; no migration drops existing structures.

## Capabilities

### New Capabilities

- `recall`: canonical Recall bounded context (foundation slice). Owns `IncidentSearchService`, `RecallSearchController`, the `recall.search-incident` MCP surface, and `RECALL_TRACE_MAX_DEPTH`. Foundation for FR14 (multi-anchor incident search). Cross-deps (read-only via repository): `lot`, `audit-log` envelope reads, `suppliers` (M2), `ingredients` (M2).

### Modified Capabilities

- None. This slice does NOT touch `audit-log`, `inventory`, `suppliers`, or `ingredients` BCs. It reads via their repositories (already exported).

## Impact

- **Prerequisites**: slice #1 `m3-lot-aggregate` (MERGED, master `c8ed76b`) — provides the `lots` table + `LotRepository`. Slice #21 `m3-audit-log-hash-chain-hardening` (MERGED) — provides `LOT_CREATED` rows in `audit_log` for the lot-code anchored search path. No other M3 prerequisites.
- **Code**:
  - `apps/api/src/recall/` (new BC). ~400 LOC.
  - `apps/api/src/migrations/0035_add_recall_search_indexes.ts`. ~70 LOC.
  - `packages/mcp-server-opentrattos/src/capabilities/recall.ts` (new). ~50 LOC + ~30 LOC registration glue in `index.ts`.
  - `packages/ui-kit/src/components/IncidentSearchField/` (new). ~200 LOC.
  - `apps/web/src/screens/j6/IncidentSearchFieldScreen.tsx` + `apps/web/src/hooks/useIncidentSearch.ts` + `apps/web/src/api/recall.ts`. ~180 LOC.
  - Tests: ~150 LOC unit (service spec) + ~140 LOC unit (component spec).
- **Performance**:
  - 3 indexes prevent table scans across the 4 anchor paths. The `audit_log` partial GIN supports the lot-code path; the two trigram indexes support `ILIKE '%query%'` suppliers/ingredients lookups.
  - At 100k `audit_log` events × 30 orgs, the EXPLAIN ANALYZE plan in ADR-031 names <50ms for the lot-code anchored path. Free-text trigram is also <50ms on suppliers (~thousands of rows) + ingredients (~tens of thousands). 8-result merge + rank in service layer is sub-1ms.
  - Total p95 budget: <100ms backend + ~200ms debounce + ~100ms network round-trip + ~100ms render = ~500ms end-to-end matches NFR-PERF-1.
  - p95 INT load test deferred to followup (per slice prompt + tasks.md §Deferred).
- **Storage growth**: 3 indexes. Trigram GIN on `suppliers.name` (~thousands of rows) ~100KB; on `ingredients.name` (~tens of thousands) ~5MB; partial GIN on `audit_log` payload lot codes ~10MB at 100k events. Negligible.
- **Audit**: this slice does NOT emit any audit events. Search is a read-only surface. The MCP capability `recall.search-incident` invocation IS captured by the existing `AGENT_ACTION_EXECUTED` envelope from `AgentAuditMiddleware` (M2 Wave 1.13) — no per-capability extension needed.
- **Rollback**: drop the 3 indexes via the down migration. Remove `RecallModule` from `app.module.ts`. Remove the MCP capability registration. Frontend is purely additive (new screen, no replacement of existing surface). No data depends on the recall BC yet (slice #12 + #13 not merged).
- **Out of scope** (claimed by other slices, do NOT pre-empt):
  - Forward-trace SQL recursive CTE → slice #12 `m3-trace-tree-forward-reverse`.
  - Reverse-trace (FR16) → slice #12.
  - 86-flag dispatch (FR17) + dossier PDF (FR18) + email dispatch (FR19) → slice #13 `m3-recall-86-flag-dispatch`.
  - `RecallTraceTree` ui-kit component → slice #12.
  - Symptom keyword corpus (FR14 symptom-match) — this slice uses literal substring match on `audit_log.payload_after->>'symptom'` (when present) + a hard-coded synonym table inlined in the service. A richer NLP layer is M3.x.
- **Parallelism**: this slice writes exclusively to `apps/api/src/recall/`, `apps/api/src/migrations/0035_*`, `packages/mcp-server-opentrattos/src/capabilities/recall.ts` + a single-line index registration, `packages/ui-kit/src/components/IncidentSearchField/`, and `apps/web/src/{hooks,api,screens/j6}/`. File-path disjoint from #12 (writes `apps/api/src/recall/application/trace-*.ts` + `apps/api/src/migrations/0036_*` + `packages/ui-kit/src/components/RecallTraceTree/`) and #13 (writes `apps/api/src/recall/application/dispatch-*.ts` + `packages/ui-kit/src/components/RecallActionBar/`). The shared touch point is `apps/api/src/app.module.ts` (this slice adds `RecallModule`; #12 + #13 do not re-touch). The shared touch point in `packages/mcp-server-opentrattos/src/index.ts` is the `registerRecallCapabilities` line — #12 + #13 add capabilities to the same file with concatenable diff; resolve manually if same-day merge.
