## Context

EU 1169/2011 compliant labels are M2's regulatory + commercial differentiator. Without one-click printable labels, the kitchen still hand-writes ingredient lists per Article 18 (descending mass) and Article 21 (allergen emphasis). ADR-019 picks `@react-pdf/renderer` over Puppeteer for CI determinism + npm-ecosystem fit. Pre-launch external legal review is a hard gate.

Foundation: `#5 m2-ingredients-extension` provides allergens + macros + the first version of `walkRecipeTreeLeaves`; `#7 m2-allergens-article-21` provides Recipe-level aggregation. This slice is the 4th `walkRecipeTree` caller — the trigger condition filed in retros — and unifies the remaining bespoke walkers.

## Goals / Non-Goals

**Goals:**
- Multi-format label generation (A4 + thermal-4x6 + thermal-50x80) for any Recipe (FR34) using `@react-pdf/renderer`.
- Article 18: ingredients ordered by descending mass.
- Article 21: allergens emphasised — bold + high contrast, **icon + text always** (NFR Accessibility, never colour-only).
- Kcal/macro panel from Recipe macroRollup.
- Net quantity per portion + org-configured contact info.
- Locale `?locale=es|en|it`, validated against supported set.
- Refusal-on-incomplete (FR36): refuse to print if any mandatory field missing, naming the gap.
- Owner configures org-level label fields (FR37) + page size + print adapter id + adapter config.
- `LabelPreview` UI paired with the PDF renderer.
- ≤3 clicks to print per NFR.
- `PrintAdapter` abstraction validated by shipping `IppPrintAdapter`. Endpoint stable for future adapter additions.
- **Walker unification**: single `recipe-tree-walker.ts` exports `walkRecipeTreeLeaves` + `foldRecipeTree<T>`, sharing primitives. All 4 callers consume one module.
- Pre-launch external legal review per ADR-019 §Risk.

**Non-Goals (filed as follow-up slices):**
- Phomemo/Zebra/PrintNode-SaaS adapters (`m2-labels-print-adapter-*` slices).
- Cloud→LAN print bridge (`m2-labels-print-bridge`).
- Owner UI for adapter selection (`m2-labels-print-config-ui` — JSON config via API for now).
- Bilingual labels (M2.x).
- Recipe-level allergen aggregation logic (already in `#7`).

## Decisions

- **`@react-pdf/renderer` over Puppeteer**. **Rationale**: ADR-019 — react-pdf renders deterministically in CI without browser dependency; Puppeteer needs Chromium in test runner + occasionally produces flaky pixel diffs. react-pdf's React API also makes the label structure component-based and inspectable.
- **Label-renderer in its own package** `packages/label-renderer/`. **Rationale**: isolates @react-pdf/renderer + ipp dependencies; consumed by `apps/api/` (server-side render + dispatch) only — `apps/web` consumes the PDF stream over HTTP, not the package.
- **Server-only render + iframe preview** (Gate D fork 4a). **Rationale**: labels are regulatory artifacts that need single-source-of-truth rendering. Browser sandbox forbids direct printer access regardless, so server-side dispatch is mandatory for auto-print. Bundle stays slim; legal review covers one artifact.
- **`PrintAdapter` driver abstraction** (Gate D fork 4 final). **Rationale**: user has Phomemo PM-344-WF today, but expects to support other printers tomorrow. Endpoint `POST /recipes/:id/print` is stable; new printer = new adapter = new slice. Ship `IppPrintAdapter` here to validate the contract; Phomemo-specific adapter waits on protocol RE.
- **Walker unification two-helper module** (Gate D fork 1b'). **Rationale**: `walkRecipeTreeLeaves` (visitor, void) and `foldRecipeTree<T>` (post-order, returns accumulator, memoizes) are legitimately different shapes — forcing one is Frankenstein. Two named operations sharing primitives is the only zero-tech-debt answer.
- **Ingredient ordering by descending mass** computed at render time via `walkRecipeTreeLeaves` from the resolver. **Rationale**: mass = `quantity × yield × (1 − waste)` per leaf, summed at root level — same path as cost rollup; one tree walk produces both.
- **Refusal-on-incomplete**: explicit list of mandatory fields per Article 9 (food name, ingredient list with allergens, net quantity, mandatory particulars, allergens emphasised, business name + address). The renderer validates pre-emit and returns `{code: "MISSING_MANDATORY_FIELDS", missing: [...]}` rather than emitting an incomplete PDF.
- **Page size = Org config** (`a4 | thermal-4x6 | thermal-50x80`). **Rationale**: thermal label printers (PM-344-WF) need 4x6"; office printers need A4. Same renderer, different page geometry. Stored in `Organization.labelFields.pageSize`.
- **`Recipe.portions integer`** new column for "net quantity per portion" derivation. Total mass / portions = per-portion. Default 1 (single-portion). Filed migration as part of this slice (no separate migration slice needed).
- **`NEXANDRO_LABELS_PROD_ENABLED` flag** is a deploy gate, not a code gate. CI runs everything; production deploy of `/recipes/:id/label` + `/print` requires the legal sign-off, recorded in the change retro.
- **Locale set ES + EN + IT** (Gate D fork 5a). String bundles cheap; legal review covers all three at once.
- **Cache: 5-min TTL in-memory** keyed `(recipeId, locale, recipeUpdatedAt, orgUpdatedAt)`, `@OnEvent` invalidation on Recipe/Org changes (Gate D fork 3a, mirrors `DashboardService` pattern).

## Risks / Trade-offs

- [Risk] @react-pdf/renderer doesn't support arbitrary CSS — limited to its component primitives. **Mitigation**: design the label as a fixed structure (header / ingredient list / allergen panel / macro panel / footer) that maps to react-pdf primitives. Storybook visually validates.
- [Risk] EU 1169 compliance has nuances per member state (e.g. Germany requires QR codes in certain contexts). **Mitigation**: M2 ships ES + EN + IT defaults; pre-launch legal review extends to per-country variants if required. M3 may parameterise.
- [Risk] PDF generation latency. **Mitigation**: react-pdf renders ~200-500ms for typical recipe; cache identical inputs (recipe + locale + page-size) for 5 min server-side; client preview is cached via HTTP cache headers.
- [Risk] Walker refactor regresses cost.service perf-spec. **Mitigation**: `cost.service.perf.spec.ts` runs on every CI; refactor preserves semantics (same memoization, same currency aggregation, same `unresolved` fallback path) — fold helper is the same recursive shape.
- [Risk] `IppPrintAdapter` doesn't cover Phomemo PM-344-WF. **Mitigation**: explicit — that's the exact reason the abstraction exists. PM-344-WF gets its own slice. This slice doesn't claim to print on PM-344-WF; it claims to render the PDF + dispatch via abstraction + ship one validated adapter.
- [Risk] `NEXANDRO_LABELS_PROD_ENABLED` flag drift. **Mitigation**: dev/CI mode flag-on by default; prod mode flag-off until legal sign-off recorded in retro. ADR-013 pattern (same as `NEXANDRO_AGENT_ENABLED`).

## Migration Plan

Steps:

**Phase 1 — Walker unification (zero functional change):**
1. Extract internal `loadRecipe(em, orgId, id)` + cycle/depth primitives in `recipe-tree-walker.ts`.
2. Add `foldRecipeTree<T>(em, orgId, recipeId, fold, options)` helper with built-in memoization on `recipeId`.
3. Convert `cost.service.ts` private `walk` to use `foldRecipeTree<CostBreakdown>` — fold callback returns `CostBreakdown`, memoization moves into helper.
4. Convert `recipes-allergens.service.ts` private `walk` to use `walkRecipeTreeLeaves`.
5. Verify all existing specs (cost unit + int + perf, allergens unit + int) green.

**Phase 2 — Data model + label-renderer package:**
6. Migration 0015: `organizations.label_fields jsonb` + `recipes.portions int`.
7. New package `packages/label-renderer/` with `@react-pdf/renderer` + `ipp` deps.
8. `LabelDocument` React component composing 5 sections; multi-format page styles.
9. i18n bundle for `es | en | it`.
10. `renderLabelToPdf(data): Buffer` server-side render.
11. `PrintAdapter` interface + registry + `IppPrintAdapter`.
12. Unit tests for renderer + adapter.

**Phase 3 — Backend BC:**
13. `apps/api/src/labels/` BC: `LabelsModule`, `LabelDataResolver`, `LabelsService`, controllers.
14. Endpoints: `GET /recipes/:id/label`, `POST /recipes/:id/print`, `GET/PUT /orgs/:id/label-fields`.
15. Cache + event-bus invalidation.
16. Mandatory-field validation per Article 9 with `MissingMandatoryFieldsError`.

**Phase 4 — UI:**
17. `LabelPreview` in ui-kit (iframe + Print + Download buttons + ARIA).
18. Storybook stories.
19. `apps/web` hooks + RecipeBuilderJ1Screen integration.

**Phase 5 — Verification + landing:**
20. All workspaces tests green; lint clean; build green.
21. Manual smoke: PDF renders correctly in viewer.
22. Legal review filing.

Rollback: feature flag off; remove the controllers + Org config endpoint; UI degrades to "labels coming soon"; walker refactor stays (no functional change). No data loss.

## Open Questions

1. **QR-code embedding** (some country variants): defer to M2.x or per-customer? **Pending**: legal review will inform.
2. **Net quantity unit**: kg vs g vs ml vs l. Auto-derive from leaf units? Or Org-configured `defaultMassUnit`? **Tentative**: auto-derive — if all leaves are mass, show g; if mixed, fall back to "see ingredient list".
3. **Brand mark image format**: PNG vs SVG. `@react-pdf/renderer` supports both; SVG renders cleaner at thermal print resolution. **Tentative**: support both; document recommendation.
