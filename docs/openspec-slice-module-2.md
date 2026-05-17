---
title: Module 2 (Recipes / Escandallo / Nutritional Intelligence / Auto-Labels) — OpenSpec slicing
date: 2026-04-27
approver: Master
prereq_gates:
  - Gate A — 2026-04-27
  - Gate B — 2026-04-27
status: approved
runbook: .ai-playbook/specs/runbook-bmad-openspec.md §2.4
related:
  - docs/prd-module-2-recipes.md
  - docs/architecture-decisions.md
  - docs/data-model.md
  - docs/ux/DESIGN.md
  - docs/ux/components.md
  - _bmad-output/planning-artifacts/gate-c-approval-2026-04-27.md
---

# Module 2 — OpenSpec slicing

PRD-M2 (831 lines, 48 FRs across 8 capability families, 5 user journeys) is sliced into **11 OpenSpec changes** following the runbook heuristics — 1 bounded context per change, ≤10 acceptance scenarios per change, write_paths bounded, name ≤6 words. The slicing crosses 6 bounded contexts: Recipes, Ingredients (extension), Nutrition catalogue (OFF mirror), Menus, Labels, MCP. The shared kernel (`m2-data-model`) is the absolute foundation; everything else fans out from it. Independent of M2 in flight: the OFF mirror infra (`m2-off-mirror`), which can land in parallel from day one. After the data model + recipes core + ingredients extension land, six changes can run in parallel.

## Approved change list

| # | Change ID | Bounded context | FRs | Journeys | Components | Depends on |
|---|---|---|---|---|---|---|
| 1 | `m2-data-model` | shared kernel | (foundation) | — | — | — |
| 2 | `m2-recipes-core` | Recipes | FR1–8 | J1, J4 | RecipePicker | #1 |
| 3 | `m2-cost-rollup-and-audit` | Recipes | FR9–15 | J1, J2 | CostDeltaTable, MarginPanel | #1, #2 |
| 4 | `m2-off-mirror` | Nutrition catalogue | FR17–19 | (infra) | — | — |
| 5 | `m2-ingredients-extension` | Ingredients | FR16, FR20–24 | J1 | IngredientPicker, SourceOverridePicker, MacroPanel | #1, #4 |
| 6 | `m2-ai-yield-suggestions` | Recipes | FR16–19 (AI side) | J1 | YieldEditor, WasteFactorEditor | #1, #2 |
| 7 | `m2-allergens-article-21` | Ingredients | FR25–28 | J1 | AllergenBadge, DietFlagsPanel | #1, #5 |
| 8 | `m2-menus-margins` | Menus | FR29–32 | J1, J3 | MarginPanel | #1, #2 |
| 9 | `m2-owner-dashboard` | Menus | FR33, FR38–40 | J3 | MenuItemRanker | #8 |
| 10 | `m2-labels-rendering` | Labels | FR34–37 | J1 | LabelPreview | #5, #7 |
| 11 | `m2-mcp-server` | MCP | FR41–45 | (Agent-Ready) | AgentChatWidget | #2 |
| 12 | `m2-ui-foundation` | UI infrastructure | (NFR Performance, Accessibility) | J3 (proof-of-concept) | AllergenBadge, MarginPanel | #3, #7, #8 |
| 13 | `m2-ui-backfill-wave1` | UI components (retroactive) | (NFR Accessibility) | J1, J2 | RecipePicker, IngredientPicker, SourceOverridePicker, CostDeltaTable, DietFlagsPanel | #12 |

Heuristic check per row: each change targets exactly one bounded context, FR coverage is contiguous within a capability family (or explicitly cross-family for the AI-suggestions row, which intentionally cuts across Recipe-Authoring + Nutrition), and component touchpoints stay ≤3 except the foundation row (which touches none), the ingredients-extension row (which touches the three pickers shared by FR1 + FR21 + FR16), and the UI-backfill row #13 (which retroactively picks up 5 components from already-shipped backend slices that erroneously deferred their §UI-components work — see "Track structure" note below).

## Track structure (parallelism opportunities)

```
Track A:  #1 → #2 → ┬→ #3
                    ├→ #6
                    ├→ #8 → #9
                    └→ #11
Track B:  #4 → #5 → ┬→ #7
                    └→ #10  (also depends on #7)
```

`#1 m2-data-model` is the absolute blocker. `#4 m2-off-mirror` is independent infra and can start in parallel from day one. After `#2` and `#5` both land, six changes can run in parallel (#3, #6, #7, #8, #10, #11). `#9` waits on `#8`. `#10` waits on both `#5` and `#7`.

### Contract correction (added 2026-05-05): UI work belongs to the slice that owns the component

The first 4 backend slices (`#2 m2-recipes-core`, `#3 m2-cost-rollup-and-audit`, `#7 m2-allergens-article-21`, `#8 m2-menus-margins`) shipped backend-only and deferred their §UI-components in every retro under the heading "DEFERRED to UX track". That defer was a misread of ai-playbook's UX track, which terminates at Gate B (DESIGN.md + journey docs + components catalogue, all done) — component **implementation** belongs in each slice per `.ai-playbook/specs/ux-track.md` §13: *"Components are developed in Storybook with stories before they appear on a screen… Storybook is published in CI for static review on every PR."* See retros: [m2-recipes-core.md](../retros/m2-recipes-core.md), [m2-cost-rollup-and-audit.md](../retros/m2-cost-rollup-and-audit.md), [m2-menus-margins.md](../retros/m2-menus-margins.md), [m2-allergens-article-21.md](../retros/m2-allergens-article-21.md).

The corrective contract:

- **Row #12 `m2-ui-foundation`** bootstraps `apps/web/` + `packages/ui-kit/` + Storybook (publishing in CI per ai-playbook §13) + 2 components (`AllergenBadge`, `MarginPanel`) as proof of the chain end-to-end. Lands FIRST among the UI-related work.
- **Row #13 `m2-ui-backfill-wave1`** ships the 5 components owed by the four already-merged backend slices: `RecipePicker`, `IngredientPicker`, `SourceOverridePicker`, `CostDeltaTable`, `DietFlagsPanel`. (`IngredientPicker` + `SourceOverridePicker` straddle #2 + #5; both are in this row.) Each component lands with its own Storybook stories + test suite per the file-layout convention defined in `m2-ui-foundation`'s design.md §7.
- **The 5 remaining unshipped slices** (`#5 m2-ingredients-extension`, `#6 m2-ai-yield-suggestions`, `#9 m2-owner-dashboard`, `#10 m2-labels-rendering`, `#11 m2-mcp-server`) ship backend + UI components + Storybook stories + journey screens **within their own slice**, per the original spec.

Going forward: a slice's `tasks.md` §UI-components items are **canonical**, not optional. A retro that says "DEFERRED to UX track" without a follow-up slice ID is a goal-drift failure per `.ai-playbook/specs/agentic-failures.md`.

## Volume estimate

13 changes × ~5–10 acceptance scenarios each ≈ 90–130 scenarios total in M2. Equivalent to ~7–11 sprints of implementation work depending on cadence and team size. (Updated 2026-05-05 to reflect the contract correction: rows #12 + #13 added.)

---

## Scope notes

(One paragraph per change. Copy-paste-quality — `openspec-propose` echoes these into the scaffolded proposal as the initial framing. No `<TBD>` placeholders.)

### 1. `m2-data-model` — foundation (shared kernel)

In scope: introduce the four new entities (`Recipe`, `RecipeIngredient`, `MenuItem`) plus `Ingredient` extensions (`nutrition` jsonb, `allergens` text[], `dietFlags` text[], `brandName`, `externalSourceRef`) per docs/data-model.md §M2. Add `phoneNumber` retrofit on `User` (E.164 nullable, M2.x WhatsApp compatibility). Multi-tenant invariant via `organizationId` on every new table; cascade rules per ADR-010 (data model). Audit fields (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`) on every entity. Out of scope: any service / endpoint / UI — strictly schema migrations + entity definitions. This change unblocks everything else and must land first.

### 2. `m2-recipes-core` — recipe CRUD + cycle detection (Recipes BC)

In scope: Recipes endpoints + service for FR1–8 — create / read / update / soft-delete a Recipe with its RecipeIngredient lines, including sub-recipe composition. Cycle detection on save with a graph-walk algorithm capped at depth 10 (NFR Scalability) that emits an error naming both nodes and the direction of the cycle (Journey 4). Soft-delete UX: deleted Recipes appear in dependent MenuItem refs with a "Discontinued" badge and are not selectable as new sub-recipes. Audit fields populated automatically. Out of scope: cost computation (#3), AI suggestions (#6), label generation (#10). UI: the `RecipePicker` component for sub-recipe selection.

### 3. `m2-cost-rollup-and-audit` — live cost engine + change-history (Recipes BC)

In scope: the `InventoryCostResolver` interface contract (the architectural seam to M3 batch-aware sources, ADR-014) plus M2's implementation that resolves cost-per-base-unit from the `isPreferred=true` SupplierItem (FR10–11). Live food-cost computation walking the sub-recipe tree (FR9). Per-component cost-history with configurable window (default 14d, FR13). Recompute dependent recipes when an underlying SupplierItem price changes (FR14). "What changed?" view per Journey 2 — per-component delta between two timestamps with attribution (FR15). Manager can override the cost source per RecipeIngredient line (FR12). Out of scope: AI-driven yield/waste suggestions (#6), batch-aware cost (M3). UI: `CostDeltaTable`, `MarginPanel`. Precision: 4 decimal internal, 2 display, 0.01% rollup tolerance per ADR.

### 4. `m2-off-mirror` — Open Food Facts local catalogue (Nutrition catalogue BC)

In scope: a hybrid local mirror + REST API fallback architecture for Open Food Facts (ADR-015). Postgres `external_food_catalog` table holding the OFF subset relevant for restaurant ingredients (~50k–200k SKUs). Weekly cron sync with a stable cursor and a small admin endpoint to force a refresh. ODbL compliance: attribution embedded in DB rows + surfaced on UI components that consume them. API-fallback path when the cache misses. Out of scope: any UI consumer of this mirror — that's #5. This change is independent of `m2-data-model` (separate schema, separate context) and CAN start in parallel from day one.

### 5. `m2-ingredients-extension` — OFF-backed Ingredients UX (Ingredients BC)

In scope: Ingredient creation + edit augmented with OFF-backed pre-fill (FR21–24). Search by name / brand / barcode against the local mirror with API fallback (FR21). On match, pre-fill `nutrition`, `allergens`, `dietFlags`, `brandName`, record `externalSourceRef` (FR22). Manager can override any OFF-pulled field with attribution + reason (FR23). The `MacroPanel` component renders kcal/macros per portion + per 100g for an Ingredient (FR24 read-side); the same component is reused at the Recipe level in #3 once cost-rollup needs nutritional rollup. The `IngredientPicker` and `SourceOverridePicker` cover the M2 picker UX (preferred SupplierItem + optional override). Out of scope: Recipe-level allergen aggregation (#7), label rendering (#10).

### 6. `m2-ai-yield-suggestions` — AI yield + waste suggestions with citations (Recipes BC)

In scope: AI-Assisted Authoring per FR16–19. AI suggestion of `yieldPercent` for each Ingredient at first use, with a citation URL + a captured snippet ≤500 chars (FR16). AI suggestion of recipe-level `wasteFactor` classified by recipe pattern (stew/sauté/grill/raw, FR17). Manager can accept / accept-then-tweak / reject; override is recorded with attribution + (if rejected) reason (FR18). Iron rule: never produce a suggestion without a citation URL — if the model cannot cite, no suggestion is offered, manual entry only (FR19). Model selection per ADR-013 (`gpt-oss-20b-rag` via internal RAG endpoint in M2; pluggable for `claude-haiku-hermes` etc.). UI: `YieldEditor` and `WasteFactorEditor` with citation popover + chef override. Out of scope: any nutritional inference (that's the OFF path, #5 + #7).

### 7. `m2-allergens-article-21` — allergen aggregation + diet flags + Article 21 emphasis (Ingredients BC)

In scope: Recipe-level allergen + diet flag computation (FR25–28). Conservative aggregation: ANY allergen in ANY ingredient bubbles up to the Recipe; never auto-clear (FR25). Manager can add a Recipe-level "may contain traces of [allergen]" cross-contamination note, free-text, audit-trailed (FR26). Conservative diet-flag inference: a flag is true only if all ingredients carry it AND no contradicting allergen is present (FR27). Manager+ role can override aggregated allergens or inferred dietFlags with attribution + reason (FR28). UI: `AllergenBadge` (Article 21 emphasis: bold + high contrast, icon + text always per NFR Accessibility — never colour-only) + `DietFlagsPanel` (vegan / vegetarian / gluten-free / halal / kosher / keto). Out of scope: how labels render these — that's #10.

### 8. `m2-menus-margins` — MenuItem CRUD + margin computation (Menus BC)

In scope: MenuItem entity wiring (FR29–32). Manager creates a MenuItem linking exactly one Recipe × one Location × one Channel (FR29). `sellingPrice` in org currency + `targetMargin` per MenuItem (FR30). Read-time computation of actual margin (`sellingPrice − liveRecipeCost`) and percent vs `targetMargin`, with status colour per ADR-016 (FR31). Margin report per MenuItem showing cost / sellingPrice / margin abs+% / target status (FR32). UI: `MarginPanel` (shared component, also used in #3 for "what changed" attribution). Out of scope: top/bottom-5 ranking (#9). Multi-tenant invariant + cascade rules per ADR.

### 9. `m2-owner-dashboard` — Owner top/bottom-5 view (Menus BC)

In scope: Owner-facing dashboard endpoints + UI for FR33 + FR38–40 (Journey 3). Top/bottom-5 MenuItem ranking by margin across all Locations and Channels for a configurable window (default 7d, FR33 + FR38). Drill-down from any MenuItem to the recipe cost-history + per-component delta wired into #3's "what changed?" view (FR39). Staff (read-only) can view any Recipe's ingredient list / allergens / dietFlags / finished-portion macros (FR40). UI: `MenuItemRanker`, mobile-first per Journey 3 (Owner on sofa, mobile, Sunday night). Out of scope: anything Manager-only; this is the Owner read-side. Performance: page load <1s on slow Wi-Fi per NFR.

### 10. `m2-labels-rendering` — EU 1169/2011 labels via @react-pdf/renderer (Labels BC)

In scope: printable label generation per FR34–37, EU 1169/2011 compliant. Engine: `@react-pdf/renderer` per ADR-019 (chosen over Puppeteer for CI determinism + npm-ecosystem fit). Ingredients ordered by descending mass per Article 18; allergens visually emphasised per Article 21 (bold + contrast, never colour-only); kcal/macro panel; net quantity; org-configured contact info (FR34). Locale per org `defaultLocale` (FR35). Refusal-on-incomplete: system refuses to print if any mandatory field is missing, naming the gap (FR36). Owner configures org-level label fields — contact info, address, brand mark, postal address (FR37). UI: `LabelPreview` paired with the PDF renderer. Pre-launch external legal review per ADR-019 §Risk. Print workflow ≤3 clicks per NFR.

### 11. `m2-mcp-server` — MCP server `nexandro` + Agent-Ready surface (MCP BC)

In scope: Agent-Ready Foundation per FR41–45. Public API parity audit — every Recipe / MenuItem / Ingredient capability is reachable via API, no UI-only actions (FR41). API responses include `missingFields` and `nextRequired` so a conversational caller can determine what's needed (FR42). Standalone-mode vs agent-integrated-mode toggle via configuration only — no code change required to switch (FR43, ADR-013). MCP server `nexandro` exposing the M2 capabilities to any MCP-compatible client (Hermes / OpenCode / Claude Desktop / custom, FR44). Audit fields on agent actions: `executedBy=<human>, viaAgent=true, agentName=<…>` per the hybrid identity model (FR45). UI: optional `AgentChatWidget` behind feature flag `NEXANDRO_AGENT_ENABLED`. MCP layer is separable per ADR-013: zero compile-time dependency from `apps/api/` on agent vendors; lint rule blocks `import` violations.

### 12. `m2-ui-foundation` — apps/web shell + ui-kit + Storybook (UI infrastructure)

In scope: bootstrap `apps/web/` (Vite + React 18 + TanStack Query + React Router) + `packages/ui-kit/` (Tailwind 4 with `@theme` block, shadcn primitives, Storybook 8). Generate `packages/ui-kit/src/tokens.css` from `docs/ux/DESIGN.md` YAML frontmatter — OKLCH-canonical CSS variables. Ship 2 components as proof of contract: `AllergenBadge` (regulatory-significant, smallest data shape) and `MarginPanel` (consumes 2 endpoints, validates the data-fetching pattern). Ship 1 J3 proof-of-concept screen at `/poc/owner-dashboard` (NOT the canonical M2 owner dashboard — `#9` ships that). New CI workflow `.github/workflows/storybook.yml` builds on every PR + deploys to GitHub Pages on `master`. Out of scope: the other 11 components from `docs/ux/components.md` (split between `#13 m2-ui-backfill-wave1` and the 5 unshipped backend slices). Out of scope: authentication, i18n runtime, E2E tests on canonical journey screens, server-side rendering. Tech-stack rationale: ADR-019 already locks React + Storybook + shadcn-ish; this slice locks Vite + TanStack Query + Tailwind 4 (a new ADR-020 ships in §10 of the slice's tasks).

### 13. `m2-ui-backfill-wave1` — retroactive UI for already-merged backend slices (UI components)

In scope: ship the 5 components owed by the four already-merged backend slices that incorrectly deferred their §UI-components work (`#2 m2-recipes-core`, `#3 m2-cost-rollup-and-audit`, `#7 m2-allergens-article-21`, `#8 m2-menus-margins`). Components: `RecipePicker` (#2, J1, J4), `IngredientPicker` (#5 partly, J1 — covered here because #5 hasn't shipped yet and the picker is a foundational pattern), `SourceOverridePicker` (#5 partly, J1, J2), `CostDeltaTable` (#3, J2), `DietFlagsPanel` (#7, J1). Each ships with ≥3 Storybook stories + ≥10 unit tests + journey-screen integration in the relevant `apps/web/src/screens/<journey>.tsx`. Out of scope: components owned by unshipped backend slices (`MacroPanel` ships with #5; `YieldEditor`+`WasteFactorEditor` with #6; `MenuItemRanker` with #9 — replacing the J3 proof-of-concept screen from #12; `LabelPreview` with #10; `AgentChatWidget` with #11). Filed as a sibling to #12; scope is mostly defined here, full proposal lands after #12 merges.

---

## Cross-references

- [PRD-M2](prd-module-2-recipes.md) — the source of FRs.
- [Architecture decisions](architecture-decisions.md) — particularly ADR-010 (data model), ADR-013 (Agent-Ready), ADR-014 (InventoryCostResolver), ADR-015 (OFF mirror), ADR-016 (margin computation), ADR-017 (allergens / Article 21), ADR-019 (label engine).
- [Data model](data-model.md) — entity definitions extended for M2.
- [DESIGN.md](ux/DESIGN.md) — design system contract (colours / typography / WCAG).
- [components.md](ux/components.md) — the 16-component catalogue each slice touches.
- [Gate C approval record](_bmad-output/planning-artifacts/gate-c-approval-2026-04-27.md) — workflow audit trail.

## Stewardship

This file is approved at Gate C. Re-slicing (a change splits, merges, or is added) is a new revision: `git mv docs/openspec-slice-module-2.md docs/_archive/openspec-slice-module-2-2026-04-27.md` and write the new one. Never edit silently mid-implementation.

Multi-module convention (per [bmad-openspec-bridge.md §3.4](../.ai-playbook/specs/bmad-openspec-bridge.md)): one slicing file per Module (M1/M2/M3/M4). M1 lives at `docs/openspec-slice-module-1.md`.

`openspec-propose <change-id>` reads this file at start. Multi-module repos disambiguate via `--slice-file <path>` or mtime fallback (most-recent-first). If the requested change-id is not in any active slice file, the propose command refuses (or run with `--no-slice` for ad-hoc changes that bypass the slice contract).
