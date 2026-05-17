## 1. Walker unification (Gate D 1b' — eliminate tech debt)

- [ ] 1.1 Refactor `apps/api/src/recipes/application/recipe-tree-walker.ts` to expose two named operations:
  - `walkRecipeTreeLeaves(em, orgId, recipeId, onLeaf, options)` — current visitor (no API change for existing callers)
  - `foldRecipeTree<T>(em, orgId, recipeId, fold, options)` — post-order accumulator with built-in memoization + per-node return
- [ ] 1.2 Both operations share primitives: `DEFAULT_TREE_DEPTH_CAP`, `RecipeTreeRecipeNotFoundError`, `RecipeTreeCycleError`, `RecipeTreeDepthLimitError`, internal `loadRecipe(em, orgId, id)` helper
- [ ] 1.3 Convert `apps/api/src/recipes/application/recipes-allergens.service.ts` private `walk` → consume `walkRecipeTreeLeaves`. Net ~−40 LOC
- [ ] 1.4 Convert `apps/api/src/cost/application/cost.service.ts` private `walk` → consume `foldRecipeTree<CostBreakdown>`. Memoization moves into helper. Net ~−65 LOC
- [ ] 1.5 Verify `cost.service.spec.ts`, `cost.service.int.spec.ts`, `cost.service.perf.spec.ts`, `recipes-allergens.service.spec.ts`, `recipes-allergens.service.int.spec.ts` all green post-refactor
- [ ] 1.6 Add unit tests for `foldRecipeTree`: memoization (sub-recipe visited once), accumulator chain, depth cap, cycle detection, recipe-not-found
- [ ] 1.7 Update memory project_m1_state.md tech-debt entry to reflect closure

## 2. Migrations + data model

- [ ] 2.1 Migration `0015_org_label_fields_recipe_portions.ts`:
  - `ALTER TABLE organizations ADD COLUMN label_fields jsonb NOT NULL DEFAULT '{}'::jsonb`
  - `ALTER TABLE recipes ADD COLUMN portions integer NOT NULL DEFAULT 1 CHECK (portions >= 1)`
- [ ] 2.2 Extend `Organization.entity.ts` with `labelFields: OrganizationLabelFields = {}` typed map
- [ ] 2.3 Extend `Recipe.entity.ts` with `portions: number = 1`
- [ ] 2.4 Define `OrganizationLabelFields` shape: `businessName?, contactInfo?, postalAddress?, brandMarkUrl?, pageSize: 'a4'|'thermal-4x6'|'thermal-50x80', printAdapter?: { id, config }`

## 3. label-renderer package (`packages/label-renderer/`)

- [ ] 3.1 Scaffold package: TypeScript, `@react-pdf/renderer` pinned, `noEmit: false`, separate `tsconfig.test.json` for ts-jest CJS
- [ ] 3.2 Define `LabelData` shape: `{ recipe: { name, portions, ingredientList, totalNetMassG, allergens, macros }, org: { businessName, contactInfo, postalAddress, brandMarkUrl }, locale, pageSize }`
- [ ] 3.3 `LabelDocument.tsx` React component composing header + ingredient list (descending mass per Article 18) + allergen panel (bold + icon per Article 21) + macro panel + footer
- [ ] 3.4 Multi-format support: `'a4' | 'thermal-4x6' | 'thermal-50x80'` page styles
- [ ] 3.5 i18n bundle: `es`, `en`, `it` (heading strings, allergen labels, macro labels)
- [ ] 3.6 `renderLabelToPdf(data: LabelData): Promise<Buffer>` — server-side render via `@react-pdf/renderer`
- [ ] 3.7 Unit tests: ingredient ordering by descending mass, allergen icon+text always present, locale switching, page-size switching
- [ ] 3.8 README with rendering pipeline + supported formats

## 4. PrintAdapter interface + IPP adapter

- [ ] 4.1 `packages/label-renderer/src/print/adapter.ts`: `PrintAdapter` interface — `{ id, accepts: ('pdf'|'zpl'|'raw')[], print(job): Promise<PrintResult> }`
- [ ] 4.2 `PrintJob` shape: `{ pdf?: Buffer, zpl?: string, raw?: Buffer, meta: { recipeId, locale, copies, pageSize } }`
- [ ] 4.3 `PrintResult` shape: `{ ok: boolean, jobId?: string, error?: { code, message } }`
- [ ] 4.4 `PrintAdapterRegistry` — register/lookup adapters by `id`
- [ ] 4.5 `IppPrintAdapter` — uses `ipp` npm client; accepts PDF; submits to printer URL with optional API key
- [ ] 4.6 Unit tests: registry lookup, IPP adapter mocked-fetch happy path + error path
- [ ] 4.7 Document adapter contract + extension points in README

## 5. apps/api labels BC (`apps/api/src/labels/`)

- [ ] 5.1 `labels.module.ts` with `LabelsService`, `LabelsController`, `OrgLabelFieldsController`
- [ ] 5.2 `LabelDataResolver` (in `application/`) — walks Recipe + Org context, populates `LabelData`. Uses `walkRecipeTreeLeaves` to compute totalNetMassG + ingredient list ordered by descending mass. Reuses `RecipesAllergensService.computeForRecipe` for allergens. Reuses `IngredientsService.getMacroRollup` for macros
- [ ] 5.3 Mandatory-fields validation per EU 1169/2011 Article 9: `MissingMandatoryFieldsError` listing missing fields
- [ ] 5.4 `GET /recipes/:id/label?locale=` — streams PDF with `Content-Type: application/pdf`
- [ ] 5.5 Server-side cache: 5-min TTL keyed `(recipeId, locale, recipeUpdatedAt, orgUpdatedAt)`. `@OnEvent(SUPPLIER_PRICE_UPDATED|RECIPE_ALLERGENS_OVERRIDE_CHANGED|INGREDIENT_OVERRIDE_CHANGED)` invalidate
- [ ] 5.6 `POST /recipes/:id/print` body `{ locale, copies?, printerId? }`. Resolves Org's `printAdapter`, generates payload (PDF in MVP), invokes adapter
- [ ] 5.7 `PUT /orgs/:id/label-fields` (Owner role) — validates + persists Org.labelFields jsonb
- [ ] 5.8 `GET /orgs/:id/label-fields` — Owner+Manager
- [ ] 5.9 422 on missing fields with structured error: `{ code: 'MISSING_MANDATORY_FIELDS', missing: [...] }`
- [ ] 5.10 422 on unsupported locale with `{ code: 'UNSUPPORTED_LOCALE', locale, supported: [...] }`
- [ ] 5.11 422 on missing printAdapter when /print called: `{ code: 'PRINT_ADAPTER_NOT_CONFIGURED' }`

## 6. UI: LabelPreview + Owner config

- [ ] 6.1 `packages/ui-kit/src/components/LabelPreview/{LabelPreview.tsx, .types.ts, .stories.tsx, .test.tsx, index.ts}` — embeds streamed PDF in `<iframe>` from `GET /recipes/:id/label?locale=`. Print + Download buttons. ARIA labelled
- [ ] 6.2 3-click flow: "Print Label" trigger → preview opens → "Confirm print" calls `POST /recipes/:id/print`
- [ ] 6.3 Storybook stories: simple recipe, sub-recipe nested, all-allergens, no-allergens, missing-fields error state, print-success state
- [ ] 6.4 `apps/web/src/hooks/useLabelPreview.ts` (renders iframe URL) + `useLabelPrint.ts` (mutation hitting POST /print)
- [ ] 6.5 Wire LabelPreview into `apps/web/src/screens/RecipeBuilderJ1Screen.tsx`

## 7. Tests

- [ ] 7.1 Walker fold helper unit tests (1.6 above)
- [ ] 7.2 LabelDataResolver: missing org.businessName → 422 with named missing field
- [ ] 7.3 LabelDataResolver: missing org.postalAddress → 422
- [ ] 7.4 LabelDataResolver: empty recipe ingredients → 422
- [ ] 7.5 LabelDataResolver: ingredients ordered by descending mass (single-level + nested sub-recipe)
- [ ] 7.6 GET /recipes/:id/label happy path returns PDF stream with correct content-type
- [ ] 7.7 GET cache hit returns same response without re-rendering
- [ ] 7.8 Cache invalidation on SUPPLIER_PRICE_UPDATED event
- [ ] 7.9 POST /recipes/:id/print routes to configured adapter; mocked IppPrintAdapter receives PDF
- [ ] 7.10 POST /print without configured adapter → 422 PRINT_ADAPTER_NOT_CONFIGURED
- [ ] 7.11 PUT /orgs/:id/label-fields (Owner) persists; non-Owner → 403
- [ ] 7.12 LabelPreview renders iframe + handles 422 missing-fields error gracefully
- [ ] 7.13 Storybook stories (snapshot via Vitest if pattern allows)

## 8. Compliance + legal review

- [ ] 8.1 `docs/labels/article-9-fields.md` documenting EU 1169/2011 mandatory fields list + which Recipe/Org fields back each
- [ ] 8.2 Allergen emphasis verified per Article 21 (bold + icon + text always present in rendered PDF)
- [ ] 8.3 Pre-launch external legal review per ADR-019 §Risk — written report attached to retro before production deploy
- [ ] 8.4 Production feature flag: `NEXANDRO_LABELS_PROD_ENABLED=false` gates user-visible label endpoints in prod until legal sign-off; CI + dev unaffected

## 9. Verification

- [ ] 9.1 Run `openspec validate m2-labels-rendering` — must pass
- [ ] 9.2 `npm run build --workspace=packages/label-renderer` emits dist/ cleanly
- [ ] 9.3 `npm test --workspace=packages/label-renderer` green
- [ ] 9.4 `npm test --workspace=apps/api` — all backend tests green; cost + allergens specs unaffected by walker refactor
- [ ] 9.5 `npm test --workspace=packages/ui-kit` green incl new LabelPreview tests
- [ ] 9.6 Lint clean across workspaces
- [ ] 9.7 apps/web type-check + build clean
- [ ] 9.8 Manual smoke: `GET /recipes/:id/label?locale=es` returns valid PDF (open in viewer)

## 10. CI + landing

- [ ] 10.1 Implementation pushed (Gate D approved in chat: 1b' / 2a / 3a / 4a / 5a)
- [ ] 10.2 All CI checks green; admin-merge once required checks pass
- [ ] 10.3 Archive `openspec/changes/m2-labels-rendering/` → `openspec/specs/m2-labels-rendering/`
- [ ] 10.4 Write `retros/m2-labels-rendering.md`
- [ ] 10.5 Update auto-memory `project_m1_state.md` (close walker tech-debt entry; mark M2 backlog at 1)
- [ ] 10.6 File follow-up slices:
  - `m2-labels-print-adapter-phomemo` — Phomemo PM-344-WF "Labelife" protocol RE + adapter implementation
  - `m2-labels-print-bridge` — kitchen-LAN ↔ cloud bridge service (conditional on deployment topology)
  - `m2-labels-print-config-ui` — Owner UI to select adapter + per-location printer config
