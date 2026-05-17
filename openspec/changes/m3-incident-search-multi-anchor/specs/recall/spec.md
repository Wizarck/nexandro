## ADDED Requirements

### Requirement: Recall BC scaffold exposes RECALL_TRACE_MAX_DEPTH constant

The system SHALL ship a `recall` bounded context at `apps/api/src/recall/` exporting a domain constant `RECALL_TRACE_MAX_DEPTH = 10` per architecture-m3.md ADR-028. The constant SHALL live in `apps/api/src/recall/domain/constants.ts` and be importable from downstream slices #12 (forward + reverse trace) and #13 (dispatch + dossier) without a circular module dependency.

#### Scenario: Constant exported with value 10
- **WHEN** a caller imports `RECALL_TRACE_MAX_DEPTH` from `apps/api/src/recall/domain/constants.ts`
- **THEN** the imported value is the integer `10` (matches ADR-028 + architecture-m3.md line 397)

#### Scenario: RecallModule wired into AppModule
- **WHEN** the Nest application bootstraps
- **THEN** `RecallModule` is present in `AppModule.imports` and the `IncidentSearchService` is resolvable via the DI container

### Requirement: IncidentSearchService surfaces up to 8 hits ranked by recency then symptom-match

The system SHALL expose `IncidentSearchService.search(organizationId, query, opts?)` that returns at most 8 `IncidentSearchHit` rows ranked by `receivedAt DESC`, then `symptomMatchScore DESC`, then `label ASC` as the stable tiebreaker. Multi-tenant gating is enforced inline per anchor query (`organization_id = :organizationId` in every WHERE clause).

#### Scenario: Search caps at 8 results even when underlying sources return more
- **WHEN** the four anchor sources (lots, suppliers, ingredients, audit-log lot-code) collectively return 32 candidate hits for `search(orgA, 'tomate')`
- **THEN** the service returns exactly 8 hits, ranked by `(receivedAt DESC, symptomMatchScore DESC, label ASC)`, and no hit's `kind` field falls outside the set `('lot' | 'supplier' | 'ingredient' | 'aggregate')`

#### Scenario: Empty query short-circuits without a DB round-trip
- **WHEN** `search(orgA, '')` or `search(orgA, '   ')` is called
- **THEN** the service returns `[]` immediately and runs ZERO database queries (verified via the spy on the injected repositories)

#### Scenario: Type filter restricts to selected anchors
- **WHEN** `search(orgA, 'alborada', { types: ['supplier'] })` is called
- **THEN** every returned hit has `kind === 'supplier'`; no `lot` / `ingredient` / `aggregate` hits appear

#### Scenario: Recency wins over symptom-match
- **WHEN** the candidate pool contains a hit `H1` with `receivedAt = 2026-05-13T18:00Z, symptomMatchScore = 0.0` and a hit `H2` with `receivedAt = 2026-05-01T10:00Z, symptomMatchScore = 1.0`
- **THEN** `H1` is ranked before `H2` in the returned array

#### Scenario: Symptom-match wins among same-day hits
- **WHEN** the candidate pool contains `H1` with `receivedAt = 2026-05-13T18:00Z, symptomMatchScore = 0.0` and `H2` with `receivedAt = 2026-05-13T18:00Z, symptomMatchScore = 0.8`
- **THEN** `H2` is ranked before `H1` in the returned array

#### Scenario: Multi-tenant gating refuses cross-org hits
- **WHEN** orgA's lot `L-001` and orgB's lot `L-002` both match the substring `'001'` for `search(orgA, '001')`
- **THEN** only `L-001` appears in the returned hits; `L-002` is absent (every anchor WHERE clause includes `organization_id = orgA`)

### Requirement: GET /m3/recall/search is Owner/Manager-only

The system SHALL expose `GET /m3/recall/search?q=<text>&types=<csv>&limit=<n>` decorated with `@Roles('OWNER', 'MANAGER')`. The `RolesGuard` (registered as a global `APP_GUARD` in `app.module.ts`) SHALL reject `STAFF` callers with HTTP 403. `organizationId` SHALL be resolved from `req.user.organizationId` and forwarded to the service as its first argument.

#### Scenario: STAFF caller is rejected
- **WHEN** a caller with role `STAFF` invokes `GET /m3/recall/search?q=tomate`
- **THEN** the response status is 403 and the service is NOT invoked

#### Scenario: OWNER caller receives at most 8 hits
- **WHEN** a caller with role `OWNER` invokes `GET /m3/recall/search?q=tomate&limit=8`
- **THEN** the response is `200` with a JSON body `{ hits: IncidentSearchHit[] }` where `hits.length ≤ 8`

#### Scenario: types CSV is parsed into the service options
- **WHEN** the request URL is `GET /m3/recall/search?q=alborada&types=supplier,ingredient`
- **THEN** `IncidentSearchService.search` is invoked with `opts.types = ['supplier', 'ingredient']`

### Requirement: MCP capability `recall.search-incident` proxies the REST endpoint

The system SHALL register an MCP capability `recall.search-incident` in `packages/mcp-server-nexandro/` that forwards `{ query, types?, limit? }` to `GET /m3/recall/search`. The response shape MUST match the REST envelope exactly.

#### Scenario: Capability invocation forwards to REST
- **WHEN** an agent invokes `recall.search-incident` with `{ query: 'tomate', limit: 8 }`
- **THEN** the underlying `OpenTrattosRestClient` issues `GET /m3/recall/search?q=tomate&limit=8` with header `X-Agent-Capability: recall.search-incident`

#### Scenario: Capability is registered as read-only (no idempotency key, no kill-switch env)
- **WHEN** the MCP server `buildServer` is invoked
- **THEN** `server.registerTool('recall.search-incident', ...)` is called once and no entry in the `WRITE_CAPABILITIES` registry references `recall.search-incident`

### Requirement: Migration 0035 creates 3 search indexes idempotently

Migration `0035_add_recall_search_indexes` SHALL create three indexes used by the search service: a compound partial GIN on `audit_log (organization_id, payload_after->>'lot_code')` WHERE `payload_after->>'lot_code' IS NOT NULL`, a trigram GIN on `suppliers (name gin_trgm_ops)`, and a trigram GIN on `ingredients (name gin_trgm_ops)`. The migration MUST be idempotent (`CREATE INDEX IF NOT EXISTS`) and reversible (down drops all three).

#### Scenario: Migration up creates the 3 indexes
- **WHEN** migration 0035 runs against a fresh M3-state database
- **THEN** `pg_indexes` returns rows for `idx_audit_log_org_lot_code`, `idx_suppliers_name_trgm`, and `idx_ingredients_name_trgm`

#### Scenario: Migration down drops the 3 indexes
- **WHEN** migration 0035 down runs after a successful up
- **THEN** `pg_indexes` returns zero rows for the 3 index names listed above

#### Scenario: pg_trgm extension is present
- **WHEN** migration 0035 up runs
- **THEN** the SQL `CREATE EXTENSION IF NOT EXISTS pg_trgm` executes successfully (no-op if the extension was already created by migration 0010)

### Requirement: IncidentSearchField ui-kit component debounces input + supports keyboard nav

The system SHALL ship `IncidentSearchField` in `packages/ui-kit/src/components/IncidentSearchField/` as a combobox-style autocomplete input. The component SHALL debounce `onSearch` by 200ms (per j6.md edge case row), render a listbox dropdown with hits surfaced from props, support ArrowDown/ArrowUp/Enter/Escape keyboard navigation, and fire `onSelect(hit)` when the operator commits a selection (mouse click or Enter on the active item).

#### Scenario: Component renders combobox closed by default
- **WHEN** `<IncidentSearchField hits={[]} onSearch={spy} onSelect={spy} />` is rendered without focus
- **THEN** the input element has `role='combobox'` and `aria-expanded='false'`

#### Scenario: onSearch fires after 200ms debounce
- **WHEN** the operator types `'tom'` into the input and 200ms elapses without further input
- **THEN** `onSearch('tom')` has been called exactly once with the trimmed value

#### Scenario: ArrowDown + Enter commits the active hit
- **WHEN** the dropdown contains 3 hits and the operator presses ArrowDown once then Enter
- **THEN** `onSelect(hits[0])` is invoked exactly once

#### Scenario: Escape closes the listbox
- **WHEN** the dropdown is open and the operator presses Escape
- **THEN** the combobox's `aria-expanded` attribute returns to `'false'`
