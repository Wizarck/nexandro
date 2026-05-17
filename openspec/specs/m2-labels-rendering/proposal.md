## Why

EU 1169/2011 compliant labels are M2's regulatory and commercial differentiator. Without one-click printable labels, the kitchen still hand-writes ingredient lists for Article 18 (descending mass) and Article 21 (allergen emphasis), every time. ADR-019 picks `@react-pdf/renderer` over Puppeteer for CI determinism and npm-ecosystem fit. Pre-launch external legal review is a hard gate.

This slice also closes the `walkRecipeTree` tech-debt entry filed in retros: with labels as the 4th caller, the trigger is met to unify the 3 remaining bespoke walkers (cost.service, recipes-allergens, this slice) into a single shared two-helper module.

## What Changes

- Printable label generation for any Recipe (FR34) using `@react-pdf/renderer` per ADR-019.
- Multi-format renderer: A4 paper + thermal-4x6 + thermal-50x80 (Org-configured `pageSize`).
- EU 1169/2011 Article 18: ingredients ordered by descending mass.
- EU 1169/2011 Article 21: allergens visually emphasised — bold + high contrast, **icon + text always** per NFR Accessibility (never colour-only).
- Kcal/macro panel rendered from Recipe macroRollup (FR24 result).
- Net quantity per portion + org-configured contact info (org name, postal address, brand mark) (FR34, FR37).
- Locale per request param `?locale=`, validated against Org's supported set (FR35) — labels render in `es | en | it`; bilingual layouts not in M2.
- Refusal-on-incomplete (FR36): system refuses to print a label if any mandatory field is missing, naming the gap (chef gets actionable error).
- Owner configures org-level label fields (contact info, address, brand mark, postal address, page size, print adapter) via `PUT /orgs/:id/label-fields` (FR37).
- `LabelPreview` UI component in `packages/ui-kit/` paired with the PDF renderer.
- Print workflow ≤3 clicks per NFR.
- **Print dispatch abstraction**: `PrintAdapter` interface + registry in `packages/label-renderer/`. Ships `IppPrintAdapter` validating the contract. Future printer families (Phomemo/Zebra/SaaS) ship as new adapters via separate slices — endpoint stays stable.
- **Walker unification (Gate D 1b')**: refactor `recipe-tree-walker.ts` to expose two named operations — `walkRecipeTreeLeaves` (visitor, used by allergens + macros + labels) and `foldRecipeTree<T>` (post-order accumulator with built-in memoization, used by cost.service). Eliminates 3 duplicated walkers across BC.
- Pre-launch external legal review per ADR-019 §Risk — gates the prod release of this slice via `NEXANDRO_LABELS_PROD_ENABLED` flag.
- **BREAKING** (none — additive only.)

## Capabilities

### New Capabilities

- `m2-labels-rendering`: EU 1169/2011 multi-format label generation via `@react-pdf/renderer` + Owner-configurable label fields + refusal-on-incomplete validation + `PrintAdapter` abstraction with shipped `IppPrintAdapter`.

### Modified Capabilities

- `m2-recipes-core`: `walkRecipeTree` helper extended with `foldRecipeTree<T>` companion. `cost.service` + `recipes-allergens.service` migrated off bespoke walkers onto the shared module.

## Impact

- **Prerequisites**: `#5 m2-ingredients-extension` (allergens + macros + walkRecipeTreeLeaves), `#7 m2-allergens-article-21` (Recipe-level allergen + diet-flag aggregation), `#3 m2-cost-rollup-and-audit` (cost.service that gets unified).
- **Code**:
  - `packages/label-renderer/` (new package, isolating @react-pdf/renderer + PrintAdapter contract + IppPrintAdapter)
  - `apps/api/src/labels/` (new BC: LabelDataResolver + endpoints + cache)
  - `apps/api/src/recipes/application/recipe-tree-walker.ts` (extended with `foldRecipeTree`)
  - `apps/api/src/cost/application/cost.service.ts` (refactored to use foldRecipeTree)
  - `apps/api/src/recipes/application/recipes-allergens.service.ts` (refactored to use walkRecipeTreeLeaves)
  - `packages/ui-kit/src/components/LabelPreview/`
  - Migration `0015_org_label_fields_recipe_portions.ts`
- **External dependencies**: `@react-pdf/renderer` (npm), `ipp` (npm). Pre-launch external legal review per ADR-019 §Risk.
- **API surface**:
  - `GET /recipes/:id/label?locale=` returning PDF stream
  - `POST /recipes/:id/print` body `{ locale, copies?, printerId? }` dispatching via configured adapter
  - `GET /orgs/:id/label-fields` (Owner+Manager)
  - `PUT /orgs/:id/label-fields` (Owner only)
- **Compliance**: every label PDF carries the org's mandatory fields per Article 9. Refusal mode emits structured error naming missing fields. `NEXANDRO_LABELS_PROD_ENABLED` gates production exposure.
- **Out of scope** (filed as follow-up slices):
  - `m2-labels-print-adapter-phomemo` — Phomemo PM-344-WF "Labelife" protocol adapter (proprietary, requires reverse-engineering)
  - `m2-labels-print-bridge` — cloud-API ↔ kitchen-LAN print job bridge (conditional on deployment topology)
  - `m2-labels-print-config-ui` — Owner UI for adapter selection + per-location printer config
  - Bilingual labels (M2.x)
  - Industrial label-printer integrations beyond IPP (M3)
