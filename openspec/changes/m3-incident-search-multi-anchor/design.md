## Context

M3 ships a crisis-mode recall investigation surface (J6 — `mock-j6-recall-investigate.html`) whose primary affordance is a single full-width search field that the Owner / Manager types into during a live food-safety incident. FR14 names the multi-anchor capability: the field must match against lot codes, supplier names, ingredient names, received-date phrasing, symptom keywords, and aggregate types — surfacing up to 8 candidates ranked by recency then symptom-match. NFR-PERF-1 caps p95 latency at 500ms over a 100k `audit_log` event working set per organization.

Slices #12 (forward + reverse trace tree) and #13 (86-flag dispatch + dossier) build on top. Each consumes the `IncidentSearchHit` shape and the `RECALL_TRACE_MAX_DEPTH = 10` constant locked in this slice. ADR-028 mandates the dedicated `apps/api/src/recall/` BC; ADR-031 mandates the index strategy used here.

This slice is the **foundation** for the Recall track. No new infrastructure beyond 3 indexes; the search reads existing M1+M2+M3 tables.

## Goals / Non-Goals

**Goals:**

- Multi-anchor search service surfaces candidate lots / suppliers / ingredients / audit aggregates within p95 < 500ms backend at 100k events / org.
- Search ranks by recency then symptom-match, caps at 8, type-filterable.
- `IncidentSearchHit` shape inlined in `apps/api/src/recall/types.ts` — NO `packages/contracts` import (Wave 2.1+ rootDir constraint).
- `RECALL_TRACE_MAX_DEPTH = 10` exported from `apps/api/src/recall/domain/constants.ts` for slices #12 to consume.
- REST endpoint `GET /m3/recall/search` gated by `@Roles('OWNER', 'MANAGER')`; multi-tenant gate at repository layer.
- MCP capability `recall.search-incident` for agent surfaces (Hermes WhatsApp, AgentChatWidget).
- `IncidentSearchField` ui-kit component + TanStack Query hook + partial j6 screen (input + dropdown only).

**Non-Goals:**

- Forward + reverse trace tree — slice #12.
- 86-flag dispatch + dossier PDF + email — slice #13.
- p95 INT load test (deferred to followup; this slice ships unit tests + EXPLAIN ANALYZE evidence in ADR-031).
- Symptom synonym NLP — this slice ships a hard-coded 6-row Spanish synonym table; richer corpus is M3.x.
- Cross-org recall search — multi-tenant gate is invariant; an Owner with multiple orgs sees only their currently-scoped org per the IAM context.
- Reverse-trace search (FR16 — given a sick customer, find the lot) — surface lives in #12 trace tree.
- Sparkline / BadgeChip wiring into the candidate-list row — those land in slice #12 alongside the trace tree because each row needs the depth + consumed-quantity badge to be meaningful.

## Decisions

### ADR-RECALL-BC-LOCATION — `apps/api/src/recall/`

The recall BC SHALL live at `apps/api/src/recall/` per ADR-028 + architecture-m3.md line 487. The BC owns search (this slice), trace (#12), dispatch + dossier (#13). The directory structure follows the M3 convention (`domain/`, `application/`, `interface/`, `interface/mcp/`):

```
apps/api/src/recall/
├── domain/
│   └── constants.ts             # RECALL_TRACE_MAX_DEPTH = 10
├── application/
│   └── incident-search.service.ts
├── interface/
│   └── recall-search.controller.ts
├── types.ts                      # IncidentSearchHit + service contract (inlined; no contracts import)
└── recall.module.ts
```

**Rationale**: matches every other M3 BC (`inventory/`, `procurement/`, `photo-storage/`, `ai-observability/`). NestJS module + TypeORM repository pattern inherited from M2 + M3 prior slices.

**Rejected alternative**: nest under `inventory/recall/`. Rejected: recall reads from inventory + audit-log + suppliers + ingredients; the cross-BC read surface is wider than inventory and the FR catalogue treats Recall as a first-class capability area.

### ADR-RECALL-SEARCH-RANKING — recency first, symptom-match second, label tiebreaker

Search results SHALL be ranked by `(receivedAt DESC, symptomMatchScore DESC, label ASC)`. The 8-result cap is applied AFTER ranking the merged result set from all four anchor sources.

**Rationale**: j6.md §3 names "recency then symptom-match" explicitly. Recency is the dominant operator signal — the customer's complaint is "I ate at your restaurant on Tuesday and got sick"; lots received today are not what the customer ate. Symptom-match is secondary because the symptom corpus is narrow (Spanish; six synonyms) and a literal match on `payload_after->>'symptom'` is sparse in practice. Label-asc tiebreaker keeps result order stable for the same dataset (avoids flicker on repeat keystrokes that return the same 8 hits in a different DB order).

**Implementation**: each per-anchor source returns its hits with `receivedAt` populated (or `null` for non-temporal aggregates like suppliers' canonical row). Service merges, sorts in JavaScript (8-result cap means sort cost is trivial), slices.

**Rejected alternatives**:
1. **Database-level UNION + ORDER BY**. Rejected: each anchor is a different relation with a different rank score; a single UNION-then-rank query is harder to read and the per-anchor SQL is independently optimised by its own index. JS merge is sub-1ms on 32 hits (4 × 8 cap per source).
2. **Symptom-match first**. Rejected: the symptom corpus is too narrow to dominate ranking. Operators read "Tuesday's fish" before "vomiting"; matching the receive date first matches the operator's cognitive model.

### ADR-RECALL-SEARCH-CAP — 8 results hard cap

The service SHALL return at most 8 results regardless of underlying hit counts. The cap is applied at the service layer after merge + rank.

**Rationale**: j6.md §3 mandates 8. The crisis-mode operator scans the candidate list visually; more than 8 forces scroll on a typical 400px-tall mobile viewport, which contradicts the design goal of "the operator never has to decide where to look" (j6.md §8). Each per-anchor source queries with `LIMIT 8` to keep the merge bounded.

### ADR-RECALL-SEARCH-EMPTY-INPUT — empty query returns `[]`

When `query.trim() === ''`, the service SHALL return `[]` without running any DB query.

**Rationale**: NFR-PERF-1 is a budget; an empty query running 4 unbounded reads at p95 100k events × 30 orgs is the cheap path to violating the SLO. The frontend renders no dropdown for empty input; the service mirrors that semantic. Saves both a DB round-trip and the 200ms client debounce window from accidentally firing on focus.

### ADR-RECALL-SYMPTOM-CORPUS — hard-coded Spanish synonym map (MVP-narrow)

Symptom keywords map to a 6-row inlined synonym table in `incident-search.service.ts`:

```typescript
const SYMPTOM_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  diarrea: ['diarrea', 'gastroenteritis', 'estomago suelto'],
  vomito: ['vomito', 'vómito', 'nausea', 'náusea'],
  fiebre: ['fiebre', 'temperatura'],
  intoxicacion: ['intoxicacion', 'intoxicación', 'envenenamiento'],
  alergia: ['alergia', 'reaccion alergica', 'reacción alérgica'],
  salmonella: ['salmonella', 'salmonelosis'],
};
```

Service computes `symptomMatchScore ∈ [0,1]` by tokenising the query, looking up each token in the synonym map, and counting overlaps against the lot's `audit_log.payload_after->>'symptom'` field (when present from an upstream `LOT_FLAGGED` event — not emitted yet; reserved for #13).

**Rationale**: a richer NLP corpus (e.g., spaCy ES, FastText) is M3.x scope; the table satisfies FR14's "symptom keyword" path for the MVP without a new dependency. Spanish-only because the MVP customer base is ES-resident. M3.x will swap the table for an org-configurable corpus.

**Rejected alternatives**:
1. **Postgres `pg_trgm` similarity on a symptom field**. Rejected: the field is not yet populated; the existing `audit_log.payload_after` schema is open.
2. **External NLP service (e.g., OpenAI embeddings)**. Rejected: adds latency budget + cost; out of scope at MVP.

### ADR-RECALL-MULTI-ANCHOR-PARALLEL — four sources queried in parallel via `Promise.all`

The four anchor sources (lots, suppliers, ingredients, audit-log lot-code) SHALL be queried in parallel via `Promise.all`. Each query has `LIMIT 8` so the merged pool is at most 32 hits before service-layer rank-and-cap.

**Rationale**: serialising the four reads would multiply the latency budget (4 × ~25ms = 100ms vs ~30ms parallel). Postgres connection pool handles the concurrency without contention (pool sized for ~50 concurrent app-level fetches).

**Failure mode**: if any one source throws, `Promise.all` rejects. The controller catches and returns 500. There is NO partial-result fallback at MVP — a failing index path is a P0 alert, not a soft-degradation surface.

### ADR-RECALL-INDEX-STRATEGY — 1 partial GIN + 2 trigram GIN

Migration 0035 SHALL create the following indexes:

1. **Compound partial GIN on `audit_log` keyed by `(organization_id, payload_after->>'lot_code')`** WHERE `payload_after->>'lot_code' IS NOT NULL`:
   ```sql
   CREATE INDEX idx_audit_log_org_lot_code
     ON audit_log (organization_id, (payload_after->>'lot_code'))
     WHERE payload_after->>'lot_code' IS NOT NULL;
   ```
   Accelerates the lot-code anchored search path. The partial WHERE keeps the index narrow even at 1M `audit_log` rows (NFR-SCALE-1) because only LOT_* event types populate `lot_code`.
2. **Trigram GIN on `suppliers.name`** using `gin_trgm_ops`:
   ```sql
   CREATE INDEX idx_suppliers_name_trgm
     ON suppliers USING gin (name gin_trgm_ops);
   ```
3. **Trigram GIN on `ingredients.name`** using `gin_trgm_ops`:
   ```sql
   CREATE INDEX idx_ingredients_name_trgm
     ON ingredients USING gin (name gin_trgm_ops);
   ```
4. The `(organization_id, supplier_id, received_at DESC)` index on `lots` is ALREADY present from slice #1 migration 0026 (`idx_lots_org_supplier_received`). Migration 0035 does NOT re-create it; the migration includes a verification comment citing the slot.

**`pg_trgm` extension**: already enabled by migration 0010 (`CREATE EXTENSION IF NOT EXISTS pg_trgm`). Migration 0035 includes a defensive `CREATE EXTENSION IF NOT EXISTS pg_trgm` no-op for self-contained replay.

**Rationale**: matches ADR-031 strategy. The partial GIN on `audit_log` is the dominant write-amplification surface; the partial WHERE caps the write cost to ~1 WAL entry per LOT_* event (a tiny fraction of audit write traffic). Trigram indexes are read-heavy and cheap to maintain on the relatively-static `suppliers` + `ingredients` tables.

**Rejected alternatives**:
1. **B-tree on `audit_log.payload_after->>'lot_code'` without partial WHERE**. Rejected: indexes every audit row's empty/NULL extraction, ~4x larger than partial.
2. **B-tree prefix-only on `suppliers.name`**. Rejected: operator types `"alborada"` mid-word; trigram supports `%alborada%`, B-tree only supports `alborada%`.

### ADR-RECALL-REPO-ENCAPSULATION — service queries via existing repositories

`IncidentSearchService` SHALL inject `LotRepository`, `@InjectRepository(AuditLog)`, `@InjectRepository(Supplier)`, `@InjectRepository(Ingredient)` and run search via the TypeORM `Repository<T>` API. Cross-tenant gating is enforced inline per query (every WHERE includes `organization_id = :organizationId`).

**Rationale**: the search is a cross-BC read; promoting one-off `findForRecall` methods onto every consumed repository pollutes their public surface for a single caller. Inline queries keep the consumer-side complexity in the consumer.

**Multi-tenant invariant**: every public method on `IncidentSearchService` takes `organizationId` as the FIRST parameter. The controller derives it from `req.user.organizationId` (the global guard populates it).

### ADR-RECALL-CONTRACT-INLINE — no `packages/contracts` import

The `IncidentSearchHit` type SHALL be declared inline in `apps/api/src/recall/types.ts` (the apps/api source of truth) AND re-declared locally in `apps/web/src/api/recall.ts`. There is NO `packages/contracts` import.

**Rationale**: Wave 2.1+ hard constraint (TS6059 rootDir; project rebuild semantics inside the monorepo). Past slices have burned on `import { ... } from '@opentrattos/contracts'` in `apps/api/` — the cost of duplication is one ~15-line interface in two files; the cost of the rootDir error cascade is hours of CI fix rounds.

**Synchronisation contract**: the two files declare identical fields and types. A `// SYNC` comment in each cites the other. A followup INT spec that asserts shape parity is filed in tasks.md §Deferred.

### ADR-RECALL-MCP-CAPABILITY — `recall.search-incident` read-only

The MCP server SHALL register a `recall.search-incident` capability that proxies `GET /m3/recall/search`. Agents call it as a typeahead-style read; the response is the same `IncidentSearchHit[]` shape as REST.

**Capability metadata**:
- `name: 'recall.search-incident'`
- `inputSchema`: `{ query: string, types?: string[], limit?: number }` (zod-validated).
- No idempotency key (read-only).
- No env-flag kill-switch at this slice (read-only is low-risk; if M3.x adds rate-limiting per agent, the registration grows an env flag).

**Audit**: the existing `AgentAuditMiddleware` emits `AGENT_ACTION_EXECUTED` on the upstream REST hop; this slice does NOT emit a separate envelope.

**Rationale**: matches the M2 read-only MCP pattern (`ingredients.search`, `recipes.search`) — registered via `server.registerTool(...)`, NOT via the `WRITE_CAPABILITIES` registry (that registry is for mutations).

## Risks / Trade-offs

- **[Risk]** Trigram indexes on `suppliers.name` + `ingredients.name` add ~5MB of GIN. **Mitigation**: monitored via standard Postgres bloat queries; bloat at the cutover scale (<100MB) is negligible.
- **[Risk]** The `audit_log` partial GIN index increases write amplification on every `audit_log` INSERT (one extra WAL entry per LOT_* event). **Mitigation**: ADR-031 names a 4-WAL-entry budget per row; this slice adds one to the LOT_* event path (~5% of audit volume per the M3 slice flow). Under budget.
- **[Risk]** The 8-result cap is opinionated; if a real incident has 12 candidate lots, the operator might miss the right one. **Mitigation**: j6.md §3 + DESIGN.md §6 codify the cap — the crisis surface is single-screen-no-scroll by design. Followup observability hook on `audit_log` SEARCH events can flag orgs that consistently return 8 hits as a candidate for UX revision.
- **[Risk]** Symptom synonym corpus is hard-coded Spanish-only. **Mitigation**: documented as MVP-narrow; M3.x will replace with org-configurable corpus. The synonym table is single-file so the swap is low-friction.
- **[Trade-off]** Inline cross-BC queries (vs custom repo methods on suppliers / ingredients). **Trade-off**: keeps the consumer-side complexity in the consumer at the cost of duplicating WHERE clauses. The single consumer + the multi-tenant invariant being inline-visible at the query site is worth more than DRY at this volume.
- **[Trade-off]** No INT testcontainer p95 test in this slice. **Trade-off**: documented deferred. Risk: a slow query path lands without a regression gate. Counter-mitigation: EXPLAIN ANALYZE evidence in ADR-031 + the indexes are CREATE-time deterministic; an INT spec can be retrofitted without breaking the API.

## Migration Plan

1. **Stage 1 — Schema only** (this PR):
   - Run migration 0035 on staging.
   - 3 indexes created. No data change. No behaviour change in earlier slices.
   - Smoke test: `IncidentSearchService.search(orgA, 'tomate')` returns at most 8 hits with `kind` field populated.
2. **Stage 2 — Slice #12 consumes** (trace tree):
   - `IncidentSearchHit.kind='lot'` feeds the recursive CTE root.
3. **Stage 3 — Slice #13 consumes** (dispatch + dossier):
   - Search → trace → dispatch flow ships end-to-end.
4. **Rollback strategy**:
   - Down migration drops the 3 indexes.
   - Remove `RecallModule` from `app.module.ts`.
   - Frontend route removal is additive (no replacement of existing surface).
   - No data depends on the recall BC yet.

## Open Questions

- **MCP capability kill-switch env flag**: should `recall.search-incident` ship with `OPENTRATTOS_AGENT_RECALL_SEARCH_INCIDENT_ENABLED` even as read-only? **Proposed answer**: no. Read-only capabilities (`ingredients.search`, `recipes.search`) do NOT ship kill-switches in M2; the pattern is for mutations. M3.x rate-limit per-agent will introduce per-cap throttling; that's the right hook, not a binary flag.
- **8-result cap configurability**: should orgs configure a higher limit? **Proposed answer**: no for MVP. The 8 cap is a UX invariant (j6.md mandates no-scroll). M3.x telemetry will surface orgs that consistently hit the cap; the operator can then refine the query (which is the design intent).
- **`payload_after->>'symptom'` not yet emitted**: should this slice add a `LOT_FLAGGED` emitter so the symptom-match path has anything to bind to? **Proposed answer**: no. The slice ships the SCORE primitive against a hypothetical field. The first emitter is slice #13's manual-flag dispatch path. Until then, `symptomMatchScore = 0` for every hit and ranking falls back to recency, which is the desired MVP behaviour.
- **`receivedAt` for non-temporal hits** (suppliers, ingredients): how do they rank against lot hits? **Proposed answer**: `receivedAt = null` ranks last (NULLS LAST in the JS sort). Supplier / ingredient hits show up at the bottom of the list as discovery aides; the lot hits dominate because the operator's anchor is almost always a lot.
- **Auth context for the controller**: how does `req.user.organizationId` populate in the demo build (no JWT layer yet)? **Proposed answer**: same as the existing audit-log controller — the global `OrganizationGuard` (or its M3 successor) reads from the configured demo claim. This slice does NOT introduce a new auth surface.
