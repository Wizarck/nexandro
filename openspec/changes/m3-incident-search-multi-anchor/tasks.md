## 1. Migration 0035 — search indexes

- [ ] 1.1 `apps/api/src/migrations/0035_add_recall_search_indexes.ts` — class `AddRecallSearchIndexes1700000035000` implements `MigrationInterface`
- [ ] 1.2 Up: defensive `CREATE EXTENSION IF NOT EXISTS pg_trgm` (no-op; already enabled by 0010)
- [ ] 1.3 Up: `CREATE INDEX IF NOT EXISTS idx_audit_log_org_lot_code ON audit_log (organization_id, (payload_after->>'lot_code')) WHERE payload_after->>'lot_code' IS NOT NULL`
- [ ] 1.4 Up: `CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm ON suppliers USING gin (name gin_trgm_ops)`
- [ ] 1.5 Up: `CREATE INDEX IF NOT EXISTS idx_ingredients_name_trgm ON ingredients USING gin (name gin_trgm_ops)`
- [ ] 1.6 Up: docstring cites `idx_lots_org_supplier_received` (already present from slice #1 migration 0026) — NOT re-created here
- [ ] 1.7 Down: drop the 3 indexes in reverse order; do NOT drop `pg_trgm` (shared with migration 0010)

## 2. Domain layer — constants

- [ ] 2.1 `apps/api/src/recall/domain/constants.ts` — export `RECALL_TRACE_MAX_DEPTH = 10` per ADR-028 + architecture-m3.md line 397; docstring cites reservation for slice #12

## 3. Types — inline contract (no `packages/contracts` import)

- [ ] 3.1 `apps/api/src/recall/types.ts`:
  - `export type IncidentSearchKind = 'lot' | 'supplier' | 'ingredient' | 'aggregate'`
  - `export interface IncidentSearchHit { kind: IncidentSearchKind; id: string; label: string; supportingText: string; receivedAt: string | null; symptomMatchScore: number; }`
  - `export interface IncidentSearchOpts { types?: readonly IncidentSearchKind[]; limit?: number; }`
  - Docstring cites SYNC contract with `apps/web/src/api/recall.ts`
- [ ] 3.2 Mirror in `apps/web/src/api/recall.ts` — same field names + types

## 4. Application — IncidentSearchService

- [ ] 4.1 `apps/api/src/recall/application/incident-search.service.ts`:
  - Inject `LotRepository`, `@InjectRepository(AuditLog) auditLogRepo`, `@InjectRepository(Supplier) supplierRepo`, `@InjectRepository(Ingredient) ingredientRepo`
  - `search(organizationId, query, opts?)` — empty-input short-circuits to `[]`
  - Parallel `Promise.all` across 4 anchor sources (each with `LIMIT 8`)
  - Hard-coded Spanish synonym table per ADR-RECALL-SYMPTOM-CORPUS
  - JS-side rank: `(receivedAt DESC NULLS LAST, symptomMatchScore DESC, label ASC)`
  - 8-result cap applied after merge + rank
- [ ] 4.2 Per-anchor query builders (private methods):
  - `searchLots(organizationId, query)` — ILIKE on `metadata->>'supplier_lot_code'` + lot id prefix
  - `searchSuppliers(organizationId, query)` — `name ILIKE '%query%'` (uses trigram GIN)
  - `searchIngredients(organizationId, query)` — `name ILIKE '%query%'` (uses trigram GIN)
  - `searchAuditLogLotCodes(organizationId, query)` — `payload_after->>'lot_code' ILIKE '%query%'` (uses partial GIN)
- [ ] 4.3 `computeSymptomMatchScore(query, hitPayload)` — pure function; ∈ [0, 1]

## 5. Interface — REST controller

- [ ] 5.1 `apps/api/src/recall/interface/recall-search.controller.ts`:
  - `@Controller('m3/recall')`
  - `@Get('search')` decorated with `@Roles('OWNER', 'MANAGER')`
  - DTO `IncidentSearchQueryDto` with class-validator decorators (q ≤ 200 chars, types is CSV → array, limit 1..8)
  - Resolves `organizationId` from `req.user.organizationId`
  - Returns `{ hits: IncidentSearchHit[] }`

## 6. Interface — MCP capability `recall.search-incident`

- [ ] 6.1 `packages/mcp-server-opentrattos/src/capabilities/recall.ts`:
  - `registerRecallCapabilities(server, rest)` — registers `recall.search-incident` with zod input schema (query string, optional types string[], optional limit number 1..8)
  - Forwards to `GET /m3/recall/search` with `X-Agent-Capability: recall.search-incident`
  - Read-only (no `WRITE_CAPABILITIES` entry; no kill-switch env)
- [ ] 6.2 `packages/mcp-server-opentrattos/src/index.ts` — register the capability in `buildServer`

## 7. Module wiring (NestJS)

- [ ] 7.1 `apps/api/src/recall/recall.module.ts`:
  - `imports: [TypeOrmModule.forFeature([AuditLog, Supplier, Ingredient]), LotModule]`
  - `providers: [IncidentSearchService]`
  - `controllers: [RecallSearchController]`
  - `exports: [IncidentSearchService]` (for slices #12 + #13)
- [ ] 7.2 `apps/api/src/app.module.ts` — import `RecallModule` after `PhotoStorageModule` with M3 Wave 2.5 docstring; remove the `// RecallModule, // M3 — Recall (slices #11-13)` placeholder line

## 8. Frontend — ui-kit `IncidentSearchField`

- [ ] 8.1 `packages/ui-kit/src/components/IncidentSearchField/IncidentSearchField.types.ts`:
  - `IncidentSearchHit` mirror (local), `IncidentSearchFieldProps { hits, onSearch, onSelect, loading?, placeholder?, value?, className?, 'aria-label'? }`
- [ ] 8.2 `packages/ui-kit/src/components/IncidentSearchField/IncidentSearchField.tsx`:
  - Combobox + listbox semantics matching `IngredientPicker`
  - 200ms debounce on `onSearch`
  - Keyboard nav (ArrowDown/Up/Enter/Escape)
  - Row layout: `label` (Fraunces serif), `supportingText` mute, `receivedAt` formatted via `Intl.RelativeTimeFormat` (`el martes 09:30` style)
- [ ] 8.3 `packages/ui-kit/src/components/IncidentSearchField/index.ts` — barrel
- [ ] 8.4 `packages/ui-kit/src/index.ts` — re-export
- [ ] 8.5 `packages/ui-kit/src/components/IncidentSearchField/IncidentSearchField.stories.tsx` — Storybook entry (3 stories: empty, populated, loading)

## 9. Frontend — apps/web hook + screen + api glue

- [ ] 9.1 `apps/web/src/api/recall.ts` — `getRecallSearch(organizationId, query, opts?)` builds the URL + dispatches via `api<T>` from `client.ts`
- [ ] 9.2 `apps/web/src/hooks/useIncidentSearch.ts` — TanStack Query wrapper; `staleTime: 30_000`; keyed on `(orgId, debouncedQuery, types, limit)`
- [ ] 9.3 `apps/web/src/screens/j6/IncidentSearchFieldScreen.tsx` — partial j6 screen; input + dropdown only; `onSelect(hit)` logs to console (slice #12 wires the trace tree)
- [ ] 9.4 `apps/web/src/main.tsx` — add route `recall/investigate` → `IncidentSearchFieldScreen`
- [ ] 9.5 `apps/web/src/App.tsx` — add nav `<Link>` "Recall" gated to OWNER + MANAGER

## 10. Unit tests

- [ ] 10.1 `apps/api/src/recall/application/incident-search.service.spec.ts`:
  - 8-result cap (32-hit input)
  - Recency-then-symptom-match ranking (recency wins)
  - Symptom-match-among-same-day ranking
  - Type filter restricts results
  - Empty query short-circuits (no DB round-trip)
  - Multi-tenant gating (cross-org refusal)
- [ ] 10.2 `apps/api/src/recall/interface/recall-search.controller.spec.ts`:
  - RBAC metadata: `@Roles('OWNER', 'MANAGER')` present on the `search` method (NestJS stores on `descriptor.value` — access via `Reflect.getMetadata(ROLES_METADATA_KEY, fn)`)
  - Service invoked with `organizationId` resolved from `req.user`
  - `types` CSV parsed into array
- [ ] 10.3 `packages/ui-kit/src/components/IncidentSearchField/IncidentSearchField.test.tsx`:
  - Combobox closed by default
  - 200ms debounce on `onSearch`
  - ArrowDown + Enter selects
  - Escape closes
  - Mouse click selects
  - Empty hits → empty-state copy
  - Controlled `value` prop syncs
- [ ] 10.4 `packages/mcp-server-opentrattos/src/capabilities/recall.spec.ts`:
  - `registerRecallCapabilities` registers `recall.search-incident` (assert via `server.listTools()`-style spy)
  - Capability invocation forwards `query` + `types` + `limit` to `OpenTrattosRestClient` with capability header

## 11. Module + DI wiring smoke

- [ ] 11.1 `IncidentSearchService` resolvable in a NestJS testing module
- [ ] 11.2 `RecallSearchController` resolvable in a NestJS testing module

## 12. CI + PR hygiene

- [ ] 12.1 `pnpm -w typecheck` passes
- [ ] 12.2 `pnpm -w lint --max-warnings=0` passes
- [ ] 12.3 `pnpm -w test` passes (unit only; INT deferred)
- [ ] 12.4 `openspec validate m3-incident-search-multi-anchor` returns 0

## §Deferred

- INT p95 load test against Postgres + 100k-event synthetic dataset — followup slice `m3-recall-search-perf-load`. EXPLAIN ANALYZE evidence in ADR-031 + the indexes are CREATE-time deterministic.
- INT testcontainer fixture seeding suppliers + ingredients + audit_log lot codes + lots and asserting cross-tenant + ranking invariants end-to-end.
- INT shape-parity assertion between `apps/api/src/recall/types.ts` and `apps/web/src/api/recall.ts` — reviewer eyeballs + this slice's docstring cross-reference is the MVP gate.
- `payload_after->>'symptom'` field emission from a `LOT_FLAGGED` event — slice #13 (`m3-recall-86-flag-dispatch`) emits the first such envelope when the operator commits the 86-flag.
- Richer symptom synonym corpus (org-configurable; multi-locale) — M3.x roadmap.
- Reverse-trace search (FR16) — slice #12.
- `RecallTraceTree` + `RecallActionBar` + `RecallConfirmationStrip` ui-kit components — slices #12 + #13.
