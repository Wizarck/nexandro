# retros/m2-audit-log-ui.md

> **Slice**: `m2-audit-log-ui` · **PR**: [#112](https://github.com/Wizarck/nexandro/pull/112) · **Merged**: 2026-05-08 · **Squash SHA**: `a3b1cb6`
> **Cadence**: post-archive (per `runbook-bmad-openspec.md` §4)
> **Notable**: **Wave 1.19 — final slice (#4/4) of the user's backend tech-debt batch**. Closes the 4-slice arc that started with `m2-mcp-bench-ci`. Owner+Manager browse UI for the canonical audit_log; 3 new ui-kit components + apps/web screen + route + nav. **Frontend-only slice** — backend endpoints (Wave 1.9 query / 1.11 FTS / 1.12 export) all already shipped. **Single CI iteration** (ui-kit lint warning).

## What we shipped

**3 new ui-kit components:**

- **`<AuditLogTable>` (~110 LOC)** — presentational 6-column table (timestamp / event_type / aggregate / actor / reason / expand). Click-to-expand inline drill-down via the existing-row's expanded slot. Empty state ("No hay eventos…"), loading skeleton (5 placeholder rows with shimmer), and expanded states. Capability/aggregate/actor truncation with title attributes for full text.
- **`<AuditLogRowDetail>` (~95 LOC)** — side-by-side payload_before/payload_after viewer; each panel has a copy-to-clipboard button (graceful fallback when `navigator.clipboard` is unavailable; logs `console.warn`). max-h-96 overflow-auto bounds large payloads. Below the JSON panels: reason / citationUrl (external link with `rel="noopener noreferrer"`) / snippet block, all conditional.
- **`<AuditLogFilters>` (~150 LOC)** — controlled filter form: 10-checkbox known-event-type multi-select, aggregate-type select, actor-kind select, since/until date inputs, FTS text input. Apply / Reset / Exportar CSV buttons. The "applying" state disables Apply and changes its label to "Aplicando…".

**apps/web wiring:**

- `src/screens/AuditLogScreen.tsx` — composes RoleGuard + 3 components + Load-more pagination + Export CSV. Form-state-vs-applied-state separation: form is local; Apply commits into applied state which the hook reads; Reset clears the form AND resets `accumulated` rows + `offset`.
- `src/hooks/useAuditLog.ts` — `useAuditLogQuery(filter)` with 30s stale time + `placeholderData: prev => prev` for smooth pagination + 300ms FTS debounce.
- `src/hooks/useDebouncedValue.ts` — generic util.
- `src/api/auditLog.ts` — typed `getAuditLog(filter)` + `buildExportUrl(filter)`. URL builder drops empty / null values for clean URLs; passes `eventType` as comma-joined string.
- `src/main.tsx` — `/audit-log` route registered.
- `src/App.tsx` — Owner+Manager-gated "Auditoría" nav link via `<RoleGuard role={['OWNER', 'MANAGER']}>`.

**Test deltas:**
- ui-kit: 167 → 197 vitest verde (+30): AuditLogTable 5, AuditLogRowDetail 4, AuditLogFilters 7, plus shared infrastructure adapters in the test setup.
- apps/web: 4 → 9 vitest verde (+5): Owner sees rows / Manager sees rows / Staff sees access-denied (zero fetches) / Apply refetches with new filter / Export CSV opens window.open with the export URL.
- 7 new Storybook stories (4 AuditLogTable + 3 AuditLogRowDetail + 3 AuditLogFilters minus deduplication).

## What surprised us

- **CI lint stricter than apps/web local lint.** My local verification ran `npm run lint --workspace=apps/web` which passed. CI runs `turbo run lint` across all 6 workspaces; ui-kit's lint flagged an `// eslint-disable-next-line no-console` directive as "Unused" because the underlying `console.warn` call doesn't trigger the no-console rule under ui-kit's eslint.config.js (apparently ui-kit doesn't enable the rule, so the disable directive is gratuitous → flagged with `--max-warnings=0`). Local-only-apps/web lint missed it. **Lesson codified**: always run `npm run lint` at the **root** (which fans out to all workspaces via turbo) before pushing, not just the workspace whose files you touched. Adding a CI-equivalent local check at the no-skeleton verification step would have caught this.
- **`getByText('AGENT_ACTION_FORENSIC')` matched the filter checkbox label, not the table cell.** First version of the screen test asserted `screen.getByText('AGENT_ACTION_FORENSIC')` to confirm a row rendered — but the same string also appears in the filter form's checkbox list. The waitFor matcher succeeded on the checkbox label long before the row data arrived; the next assertion (`'1 de 1 eventos'`) then failed because the table was still in skeleton state. **Fix**: assert on the timestamp cell text (`'2026-05-08 12:34:56'`) instead, which is unique to the rendered row. **Lesson**: when test fixtures share strings between filter forms and table rows (a common UI shape), use a discriminator unique to the row (timestamp, id) not a string the form also renders.
- **JSX text-node splitting bites the count footer.** I initially wrote `<span>{accumulated.length} de {total} eventos</span>` — JSX renders this as 4 separate text nodes (number / " de " / number / " eventos"). `getByText('1 de 1 eventos')` failed because testing-library's default exact matcher walks element textContent which is the concat, but the matcher's whitespace normalisation can interfere when text fragments span Reactnode boundaries. Switched to a single template literal: `<span>{`${accumulated.length} de ${total} eventos`}</span>`. **Lesson**: when you want `getByText` to match a string that interleaves multiple bound values, use a template literal so React renders ONE text node, not several.
- **`placeholderData: (prev) => prev` is essential for smooth Load-more pagination.** Without it, every offset increment puts the query into pending state with `data === undefined`; the table would clear to skeleton between pages. With placeholderData, the previous page stays visible while the next page loads. Codified as the right default for any offset-paginated UI.

## Patterns reinforced or discovered

- **Form-state vs applied-state separation for filter UIs.** Editing checkboxes / inputs updates form state; Apply commits into applied state; the hook reads applied state. Avoids fetch-storm-on-every-keystroke + makes "Reset" a one-line state setter. Replicate for any future filter-heavy view.
- **`accumulated: AuditLogRow[]` for cursor-style pagination.** Naive append-with-dedup-by-id (using a Set) is fine at the slice's expected scale (≤1000 rows accumulated). Past that, virtualisation is filed. **Generalising**: cursor pagination + accumulator is the right shape for "growing list of immutable rows" UIs; offset pagination with a Map keyed by id is the alternative when the underlying data can shift between pages.
- **Inline drill-down beats modal/sidesheet for adjacency-comparison views.** Audit log rows are usually compared against neighbouring rows ("did this change cause that one?"). Inline expansion preserves spatial context. Modals add focus-trap UX overhead for power-user views like this. Codified.
- **Export CSV via `window.open(buildExportUrl(filter))` is the right shape for downloadable CSV.** Browser handles `Content-Disposition: attachment; filename=…` natively without buffering the response in JS memory. The button passes the same applied filters as the table fetch, so what you see is what you export. Beats fetch + Blob + URL.createObjectURL for any non-trivial size.
- **Single template literal for interpolated text in `getByText`-targeted UI.** When tests will look for a string that interleaves bound values, use a template literal at the JSX level so React renders one text node. Documented for future contributors writing testable text-rendering.

## Things to file as follow-ups

(All filed in proposal.md; reproduced here for the retro audit trail.)

- **`m2-audit-log-ui-aggregate-deeplink`** — clickable aggregate_id → source entity page (recipe, ingredient, …).
- **`m2-audit-log-ui-fts-highlight`** — `ts_headline()` integration when backend's `m2-audit-log-fts-highlight` ships.
- **`m2-audit-log-ui-realtime`** — WebSocket / SSE for live row append.
- **`m2-audit-log-ui-saved-views`** — named filter sets.
- **`m2-audit-log-ui-url-sync`** — query params reflect filter state for bookmarking.
- **`m2-audit-log-ui-large-payload-fold`** — collapse-by-default for >5KB payloads.
- **`m2-audit-log-ui-actor-name-resolution`** — resolve actor_user_id UUIDs to display names via a join.
- **`m2-audit-log-ui-dynamic-types`** — auto-discover event_types / aggregate_types from the API rather than hardcoded constants.
- **`m2-audit-log-ui-virtualisation`** — react-virtual / TanStack Virtual when accumulated > 1000 rows.

## Process notes

- **2 stage commits + 1 fix-commit before merge.** Pattern:
  1. `proposal(...)` — openspec artifacts.
  2. `feat(audit-log-ui): Owner+Manager browse UI for audit_log` — 23-file implementation.
  3. `fix(ui-kit): remove unused eslint-disable-next-line directive on console.warn` — 1-line CI lint fix.
- **Slice ran the longest of the 4-slice batch** (~1334 LOC across 23 files). Frontend-only but with 3 new components + new screen + new hooks + new tests + Storybook coverage + nav wiring. The size-of-day was warranted; no premature decomposition into sub-slices because the components compose tightly with the screen.
- **Worktree leftover after merge.** Same Windows file-lock pattern as the other 3 slices in this batch. Final cleanup at end of session.
- ui-kit suite: 167 → 197 (+30). apps/web suite: 4 → 9 (+5). Storybook: +7 stories. Build clean, lint clean (post-fix), CodeRabbit pending at merge time, Gitleaks clean.

## 4-slice batch summary

| # | Slice                              | PR  | Squash    | Iterations | Notable                                                                                                       |
|---|---|---|---|---|---|
| 1 | `m2-mcp-bench-ci`                  | #109| `772080e` | 0 (first-pass) | GH Actions workflow + regression-check.ts; bonus fix of broken-since-3c eslint config.                       |
| 2 | `m2-agent-credential-rotation`     | #110| `a5c2ce9` | 1 (`@HttpCode(200)`) | POST /agent-credentials/:id/rotate atomic Ed25519 swap; refuse-on-revoked.                                   |
| 3 | `m2-audit-log-emitter-migration`   | #111| `3b94d15` | 0 (first-pass) | 5 cost.* legacy translators → envelope; 12-file atomic refactor across 5 BCs; subscriber translators deleted. |
| 4 | `m2-audit-log-ui` (this)           | #112| `a3b1cb6` | 1 (ui-kit lint warning) | Owner+Manager browse UI; 3 ui-kit components; frontend-only.                                                 |

**Batch totals**: 4 PRs merged, 4 Gate F retros + memory updates committed. Wave 1.16 → 1.19 inclusive. apps/api 795 → 801 unit (+6 from rotation slice), 108 → 110 INT. ui-kit 156 → 197 (+41 across 4 slices: RoleGuard +5, LabelFieldsForm +10, AuditLog* +30 — wait, those are from the prior frontend slice + this one; m2-mcp-bench-ci and m2-audit-log-emitter-migration were apps/api / tools / ui-kit-untouched). apps/web 0 → 9 vitest (first apps/web tests ever; m2-labels-print-config-ui added the first 4, this slice added 5).

The user's "all" pick translated into 4 sequential slices over a single autonomous session. Each slice landed end-to-end (Gate D → openspec → impl → CI → Gate F → memory) without intermediate user input beyond the picks confirmation. Cadence A (single PR, single commit per stage, atomic refactors) is the established shape.
