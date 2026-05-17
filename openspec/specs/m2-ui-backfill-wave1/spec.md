## ADDED Requirements

### Requirement: RecipePicker component renders typeahead recipe search

The system SHALL provide a `RecipePicker` component at `packages/ui-kit/src/components/RecipePicker/RecipePicker.tsx` that renders an ARIA-combobox typeahead returning Recipe selections via `onSelect(item: RecipeListItem)`.

#### Scenario: Default rendering shows empty input + closed listbox
- **WHEN** `<RecipePicker recipes={[]} onSelect={fn} />` is rendered with no value
- **THEN** an `<input role="combobox" aria-expanded="false">` is in the DOM, the listbox is hidden, and the placeholder text is visible

#### Scenario: Typing triggers debounced search and opens listbox
- **WHEN** the user types "tagliatelle" in the input
- **THEN** after 250 ms the `onSearch` callback fires once with "tagliatelle", the listbox renders matching items, and `aria-expanded="true"` on the combobox

#### Scenario: Keyboard navigation selects an item
- **WHEN** the user presses ArrowDown to highlight an item then presses Enter
- **THEN** `onSelect` fires with the highlighted item, the listbox closes, and the input value updates to the item's `displayLabel`

#### Scenario: Empty results show empty-state copy
- **WHEN** the search returns 0 results
- **THEN** the listbox renders the `emptyStateCopy` prop (default "No recipes match")

### Requirement: IngredientPicker component supports OFF-enriched + local-only modes

The system SHALL provide an `IngredientPicker` component at `packages/ui-kit/src/components/IngredientPicker/IngredientPicker.tsx` that renders multi-line ingredient cards (name + brand + barcode) when OFF-enriched data is present and degrades to single-line when not.

#### Scenario: Local-only mode renders name only
- **WHEN** the result has `{name: "Tomato", brandName: null, barcode: null}`
- **THEN** the card renders only the name; the brand and barcode rows are absent (NOT empty placeholders)

#### Scenario: OFF-enriched mode renders 3 lines
- **WHEN** the result has `{name: "Mutti Polpa", brandName: "Mutti", barcode: "8005110001234"}`
- **THEN** the card renders 3 visible lines; brand row uses `--color-fg-muted`; barcode row uses monospace font

#### Scenario: Search by brand returns OFF-enriched results
- **WHEN** the user types "Mutti" and the backend returns brand-matched results
- **THEN** the matched substring is highlighted (bold or `<mark>`) within the brand line

### Requirement: SourceOverridePicker shows preferred-first ordering

The system SHALL provide a `SourceOverridePicker` component at `packages/ui-kit/src/components/SourceOverridePicker/SourceOverridePicker.tsx` that renders a radio-list of SupplierItem options ordered preferred-first then by price ascending, with "Use preferred" + "Apply" + "Clear override" actions.

#### Scenario: Preferred renders first
- **WHEN** options contain one preferred + 3 non-preferred
- **THEN** the preferred option is the first radio in the DOM order, with a visible "Preferred" badge

#### Scenario: Price ordering tiebreaker
- **WHEN** options contain 0 preferred + 3 with prices [4.50, 3.20, 5.00]
- **THEN** the radio order is [3.20, 4.50, 5.00]

#### Scenario: Apply fires onApply with selected id
- **WHEN** the user selects a non-default option and clicks "Apply"
- **THEN** `onApply` fires with `{supplierItemId: <selectedId>}`

#### Scenario: Clear override resets to preferred
- **WHEN** the user clicks "Clear override"
- **THEN** `onClear` fires; the selected radio resets to the preferred option

#### Scenario: Currency formatting per locale
- **WHEN** the locale is "es-ES" and the price is `3.20`
- **THEN** the rendered text is `3,20 €` per `Intl.NumberFormat`

### Requirement: CostDeltaTable colour-codes rows by direction

The system SHALL provide a `CostDeltaTable` component at `packages/ui-kit/src/components/CostDeltaTable/CostDeltaTable.tsx` that renders cost-delta rows colour-coded per direction (increase / decrease / unchanged) with accompanying arrow icons for deuteranopia safety.

#### Scenario: Increase row uses at-risk colour + ↑ icon
- **WHEN** a row has `direction: 'increase'`
- **THEN** the row's delta cells apply the `--color-status-at-risk` token AND a `↑` Lucide icon (or character) is rendered inside the row with `aria-hidden="true"`

#### Scenario: Decrease row uses on-target colour + ↓ icon
- **WHEN** a row has `direction: 'decrease'`
- **THEN** the row's delta cells apply the `--color-status-on-target` token AND a `↓` icon is present

#### Scenario: Unchanged row uses muted colour + — icon
- **WHEN** a row has `direction: 'unchanged'`
- **THEN** the row's delta cells apply the `--color-fg-muted` token AND a `—` icon is present

#### Scenario: Empty history renders empty-state copy
- **WHEN** the rows array is empty
- **THEN** the table renders the `emptyStateCopy` prop (default "No cost changes in this window") and no `<tr>` data rows

#### Scenario: Currency + percent formatting
- **WHEN** a row has `oldCost: 4.50`, `newCost: 5.20`, `deltaAbsolute: 0.70`, `deltaPercent: 0.1556`
- **THEN** the cells render `4,50 €`, `5,20 €`, `+0,70 €`, `+15,6 %` (locale es-ES)

### Requirement: DietFlagsPanel renders flags + Manager+ override modal

The system SHALL provide a `DietFlagsPanel` component at `packages/ui-kit/src/components/DietFlagsPanel/DietFlagsPanel.tsx` that renders the asserted diet flags + an override-modal flow gated by `canOverride` prop.

#### Scenario: Default rendering shows asserted flags + warnings
- **WHEN** the state has `asserted: ['vegetarian']`, `warnings: ['vegan candidate contradicted by milk in butter']`
- **THEN** a single `<AllergenBadge>`-style chip is rendered for "vegetarian" and the warning text is visible below the chip row, with `role="note"`

#### Scenario: Override button hidden when canOverride is false
- **WHEN** `canOverride={false}` (Staff role)
- **THEN** the "Override" button is not in the DOM

#### Scenario: Override button visible for Manager+ opens modal
- **WHEN** `canOverride={true}` and the user clicks "Override"
- **THEN** a `<dialog>` with `role="dialog"`, `aria-labelledby`, focus-trap is rendered, containing flag checkboxes + a `<textarea>` for `reason` + Apply + Cancel buttons

#### Scenario: Reason validation enforces ≥10 chars
- **WHEN** the user types "short" (5 chars) in the reason textarea and clicks Apply
- **THEN** the form rejects submission, the Apply button stays enabled but shows an inline error "Reason must be at least 10 characters", and `onApplyOverride` does NOT fire

#### Scenario: Optimistic update on apply + rollback on error
- **WHEN** the user submits a valid override (≥10-char reason + flag changes) via Apply
- **THEN** the panel's visible flags update IMMEDIATELY (optimistic), `onApplyOverride` is invoked, and if it rejects (e.g., 403), the panel reverts to the previous state and renders the rejection message via `role="alert"`

### Requirement: Journey-screen stubs wire components against backend

The system SHALL provide 2 stub journey screens at `/poc/recipe-builder-j1` and `/poc/cost-investigation-j2` that wire the 5 components against the existing backend endpoints.

#### Scenario: J1 stub fetches and renders all 4 J1 components
- **WHEN** the user navigates to `/poc/recipe-builder-j1?organizationId=<id>&recipeId=<id>` against a running `apps/api/`
- **THEN** the screen renders RecipePicker (sub-recipe), IngredientPicker (line items), SourceOverridePicker (per line item), and DietFlagsPanel (per recipe), all populated with real backend data

#### Scenario: J2 stub fetches cost-delta and renders CostDeltaTable
- **WHEN** the user navigates to `/poc/cost-investigation-j2?recipeId=<id>&from=<isoDate>` against a running `apps/api/`
- **THEN** TanStack Query fires `GET /recipes/:id/cost-delta?from=<isoDate>` and CostDeltaTable renders the resulting rows colour-coded per direction

### Requirement: ui-kit barrel re-exports the 5 new components

The system SHALL re-export the 5 new components and their TypeScript types from `packages/ui-kit/src/index.ts`.

#### Scenario: Barrel import works in apps/web
- **WHEN** an `apps/web/` file imports `import { RecipePicker, IngredientPicker, SourceOverridePicker, CostDeltaTable, DietFlagsPanel } from '@nexandro/ui-kit'`
- **THEN** TypeScript compilation succeeds and runtime resolution finds each component
