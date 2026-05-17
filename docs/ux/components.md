---
title: nexandro Components Catalogue
status: canonical (M2 MVP) + design-intent (M2.x deferred)
last-updated: 2026-04-27
parent: docs/ux/
related:
  - DESIGN.md
  - j1.md, j2.md, j3.md, j4.md, j5.md
  - ../prd-module-2-recipes.md
  - ../architecture-decisions.md
---

# nexandro Components Catalogue

Per-component contracts: purpose, data shape, states, visual treatment, interactions, edge cases, Storybook stories, cross-references. **Visual tokens come from [DESIGN.md](DESIGN.md); this file does not redefine them.** Storybook stories listed here are the canonical visual surfaces — when implementing, build the stories first and verify them against the per-journey mocks.

## Index

| # | Component                                              | Tier | Used by               |
|---|--------------------------------------------------------|------|-----------------------|
| 1 | [`RecipePicker`](#recipepicker)                        | M2   | J1, J4                |
| 2 | [`IngredientPicker`](#ingredientpicker)                | M2   | J1                    |
| 3 | [`SourceOverridePicker`](#sourceoverridepicker)        | M2   | J1, J2                |
| 4 | [`YieldEditor`](#yieldeditor)                          | M2   | J1                    |
| 5 | [`WasteFactorEditor`](#wastefactoreditor)              | M2   | J1                    |
| 6 | [`MacroPanel`](#macropanel)                            | M2   | J1                    |
| 7 | [`AllergenBadge`](#allergenbadge)                      | M2   | J1, all label surfaces|
| 8 | [`DietFlagsPanel`](#dietflagspanel)                    | M2   | J1                    |
| 9 | [`CostDeltaTable`](#costdeltatable)                    | M2   | J2                    |
|10 | [`MarginPanel`](#marginpanel)                          | M2   | J1, J2                |
|11 | [`MenuItemRanker`](#menuitemranker)                    | M2   | J3                    |
|12 | [`LabelPreview`](#labelpreview)                        | M2   | J1                    |
|13 | [`AgentChatWidget`](#agentchatwidget)                  | M2†  | feature-flagged       |
|14 | [`InboxItem`](#inboxitem)                              | M2.x | J5 (deferred)         |
|15 | [`AgentDraftReviewBanner`](#agentdraftreviewbanner)    | M2.x | J5 (deferred)         |
|16 | [`ChannelTrace`](#channeltrace)                        | M2.x | J5 (deferred)         |

† `AgentChatWidget` is M2 canonical but mounted only when `NEXANDRO_AGENT_ENABLED=true` ([ADR-013](../architecture-decisions.md)).

## Conventions

Every component below must honour these defaults; entries only call out departures.

- **Tokens by name, never hex.** `var(--accent)`, never `#2E8B85`. See DESIGN.md §2 (OKLCH canonical).
- **Universal states**: `default` / `hover` / `focus` (`:focus-visible` 3 px `--accent` ring, 2 px offset) / `active` / `disabled` (`opacity: 0.55`, `cursor: not-allowed`, `--mute` text) / `loading` / `error` (`--destructive` border + icon + text — never red-only) / `success` (`--success` border + `✓` icon + text — never green-only).
- **Touch targets ≥ 48 px** on every interactive control.
- **`prefers-reduced-motion`** respected globally — wrap every transition.
- **WCAG-AA** on every text pair introduced; verify and document the ratio.
- **Numerals**: `font-variant-numeric: tabular-nums lining-nums` on every digit displayed.
- **Citations**: AI-derived values carry visible `[USDA]` / `[CIA]` / `[ICN]` / `[OFF]` badge; full source on `title` attribute (translation-friendly).
- **Verb + object** on every button label. "Save recipe" not "Save".

---

## Tier 1 — M2 MVP canonical

### `RecipePicker`

**Purpose.** Pick an existing recipe to slot in as a sub-recipe in the editor table.

**Used by.** [J1](j1.md) (composability — adding `Salsa de tomate` as sub-recipe) · [J4](j4.md) (the cycle-detection trigger originates here).

**Capability.** FR1, FR2, FR3, FR4 (composability), FR6 (cycle detection on save — picker itself doesn't pre-check).

**Data shape.**
```ts
type RecipePickerProps = {
  organizationId: string;     // multi-tenant scope
  excludeIds?: string[];      // current recipe + already-added sub-recipes
  onPick: (recipeId: string) => void;
  query?: string;             // controlled input, optional
};
```

**Component-specific states.** `searching` (debounced fetch in flight) · `empty` (no matches for current query) · `offline` (recipe catalogue cache only).

**Tokens.** `--surface` panel · 1 px `--border` · `--accent` focus ring · `--mute` for "no matches" empty state.

**Behaviour.** Search-as-you-type, 250 ms debounce. ↑ / ↓ to traverse results, ↵ to pick, `Esc` to cancel. Screen reader: results region marked `role="listbox"`, each row `role="option"` with `aria-selected`.

**Edge cases.**
- **Self-reference attempt**: if `query` resolves to the recipe currently being edited, the row renders with `disabled` state and a `--mute` "this is the current recipe" hint.
- **Cycle implications**: not pre-checked here (server checks on save — see [J4](j4.md)). Picker stays naive.
- **Offline**: only locally-cached recipes searchable; `offline` chip in `--mute` next to the search input.

**Storybook stories.**
- Default empty / Default with results
- Loading skeleton
- Empty state ("no recipes match")
- With one excluded result (current recipe)
- Offline mode (cache only)
- Long recipe-name truncation
- RTL (Spanish locale)

---

### `IngredientPicker`

**Purpose.** Search ingredients by name, brand, or barcode against the local OFF mirror, with REST API fallback.

**Used by.** [J1](j1.md) (every ingredient row).

**Capability.** FR16, FR17, FR18, FR19 (OFF integration — local mirror + REST fallback), FR20 (supplier preselection).

**Data shape.**
```ts
type IngredientPickerProps = {
  organizationId: string;
  onPick: (result: IngredientPick) => void;
};

type IngredientPick = {
  ingredientId: string;       // resolved or newly created
  brandName?: string;         // OFF "brands" field, optional chip
  externalSourceRef?: string; // OFF product code if matched
  defaultSupplierId?: string; // preferred-supplier preselection
};
```

**Component-specific states.** `mirror-only` (REST API unreachable, fallback chip rendered) · `barcode-scanning` (mobile / camera path).

**Tokens.** Brand chip in `--mute` `--text-xs`, citation badge `[OFF]` when AI-pre-fill is in play.

**Behaviour.** Same keyboard model as `RecipePicker`. On match with a brand, the brand chip renders inline as `--mute` text after the ingredient name (e.g. `Crushed tomato · Heinz`). On no-match, "Create new ingredient" appears as the last row — picking it opens the create-ingredient subsheet.

**Edge cases.**
- **Multilingual queries**: search in venue's primary locale + English fallback. The Spanish chef searches `cebolla`, OFF mirror has `onion` indexed — matched via locale alias table.
- **Barcode scan**: mobile-only entry point for M2.x; M2 supports text query only.
- **OFF mirror stale**: weekly cron refreshes the mirror; if the cron has failed, an Owner-visible banner surfaces in the Settings area (not in the picker itself).

**Storybook stories.**
- Default empty
- With brand-name match (Heinz)
- Mirror-only fallback (OFF API down)
- Loading skeleton
- "Create new ingredient" row
- Locale alias match (`cebolla` → `onion`)

---

### `SourceOverridePicker`

**Purpose.** Override the source (supplier / supplier item) for an ingredient row in a recipe. M2 lists `SupplierItems` sorted preferred → cheapest. M3 extends to batches sorted by FIFO expiry.

**Used by.** [J1](j1.md) (override during edit) · [J2](j2.md) (drill-in from spike row to swap supplier).

**Capability.** FR20 (preferred-supplier preselection), FR15 (drill-in from cost audit).

**Data shape.**
```ts
type SourceOverridePickerProps = {
  ingredientId: string;
  organizationId: string;
  currentSupplierId?: string;
  onPick: (supplierId: string, supplierItemId: string) => void;
};
```

**Component-specific states.** `single-source` (only one SupplierItem exists; no list, just the row) · `cheaper-available` (primary supplier is not the cheapest — flag with a `--mute` hint).

**Tokens.** Inline-editor pattern: cell becomes editable on click, click-out commits. `--accent` focus ring on the active editor.

**Behaviour.** Click-out commits the change; `Esc` cancels and reverts. Each row shows: supplier name, unit price, last-purchased date, `[preferred]` chip (if set). Sort: `preferred` → ascending by unit price → descending by recency.

**Edge cases.**
- **No SupplierItems**: render "No suppliers configured for this ingredient" with link to ingredient detail.
- **Currency mismatch**: if a SupplierItem has a different currency, render the price in the original + converted (using the org's base currency rate). Document the conversion source.
- **M3 forward-compat**: data shape already accepts `batchId` field (nullable in M2) so M3 batch-aware override is additive.

**Storybook stories.**
- Default with 3 suppliers (preferred + 2 alternatives)
- Single-source (no list, just row)
- Cheaper-available hint
- No suppliers configured (empty state with link)
- Currency-mismatch row

---

### `YieldEditor`

**Purpose.** Edit the yield % per ingredient row, with AI suggestion + citation popover + chef override.

**Used by.** [J1](j1.md) (every ingredient row).

**Capability.** FR21, FR22, FR23 (AI yield with citations), FR24 (chef override).

**Data shape.**
```ts
type YieldEditorProps = {
  ingredientId: string;
  value: number;                    // 0-100, AI-suggested initially
  citation?: { source: 'USDA' | 'CIA' | 'ICN' | 'OFF'; full: string };
  isOverridden?: boolean;
  onChange: (value: number, overridden: boolean) => void;
};
```

**Component-specific states.** `ai-suggested` (default — citation badge visible) · `overridden` (citation badge replaced with `--mute` "edited by `<userName>`") · `invalid` (out of 0-100 range).

**Tokens.** Number in `--ink` `font-variant-numeric: tabular-nums`. Citation badge: `--surface` background, `--mute` text, `--text-xs`. On override: badge swaps to `--mute` italic "edited by Lourdes".

**Behaviour.** Click number to edit inline. ↑ / ↓ steps by 1 %, `shift` ↑ / ↓ steps by 5 %. Validation on blur — out-of-range turns the cell border `--destructive`, error message below: "Yield must be between 0 % and 100 %." Citation badge: hover or focus reveals full source via `title` attribute (e.g. "Culinary Institute of America, ProChef II yield tables, 4th ed., accessed 2026-04-15").

**Edge cases.**
- **AI returns no citation**: render the value but with no badge — chef cannot accept blind. Surface "no citation available — verify before saving" in `--mute` `--text-xs`.
- **Value of 100 %** (no waste): citation still shown if AI-derived (some sources explicitly state 100 %).
- **Audit trail**: both AI suggestion and override are persisted — history viewable in the row's audit detail (M2.x feature, but data model supports it now).

**Storybook stories.**
- AI-suggested (default)
- Overridden
- Invalid (out of range)
- No citation available
- 100 % yield (no waste expected)
- Long citation full-text (truncation handling)

---

### `WasteFactorEditor`

**Purpose.** Recipe-level waste % with AI suggestion + citation. Same visual contract as `YieldEditor` but applied to the recipe summary strip, not a row.

**Used by.** [J1](j1.md) (recipe summary strip below the ingredient table).

**Capability.** FR25 (recipe-level waste with citation).

**Data shape.** Identical to `YieldEditor`, scoped to the recipe instead of the ingredient.

**Tokens.** Same as `YieldEditor`. Placement: in the summary strip, left side, sibling to the live cost on the right.

**Behaviour.** Same as `YieldEditor`. The single difference is scope — this is a property of the recipe, not a row.

**Edge cases.**
- **AI suggests by recipe-type bucket** (e.g. `stew avg = 18 %`). The citation full text names the bucket, not a specific recipe match.
- **Recipe with no AI suggestion** (rare — bucket fallback usually applies): chef enters manually; no citation badge; "verify" hint.

**Storybook stories.**
- AI-suggested with bucket citation
- Overridden
- No bucket match (rare)

---

### `MacroPanel`

**Purpose.** Show calories + macros per portion + per 100 g.

**Used by.** [J1](j1.md) (sidebar, compact view).

**Capability.** FR26 (macros computed from ingredients via OFF data).

**Data shape.**
```ts
type MacroPanelProps = {
  recipeId: string;
  perPortion: { kcal: number; carbs: number; fat: number; protein: number };
  per100g:    { kcal: number; carbs: number; fat: number; protein: number };
  view?: 'compact' | 'expanded';
};
```

**Component-specific states.** `compact` (sidebar 4-cell grid, per 100 g default) · `expanded` (modal — per portion + per 100 g side-by-side, plus saturated fat / fibre / sugar / salt details).

**Tokens.** Number in `--ink` `tabular-nums`, label in `--mute` `--text-xs`. Compact: 2×2 grid. Expanded: 4×2 grid + secondary details below.

**Behaviour.** Tap "Expand" link in the panel header to open the modal. Modal close: `Esc` or backdrop click.

**Edge cases.**
- **Recipe with sub-recipes**: macros roll up via the same composition path as cost — including unit conversions. Tolerance budget 0.5 % to absorb floating-point.
- **OFF data missing for an ingredient**: surface a `--mute` "?" in the macro line plus a panel-level hint "macros may be incomplete — N ingredients missing data". Chef can still publish; the label generation will warn separately.
- **Per-portion calculation**: portion size is a Recipe property (default 1 serving). Editing it recomputes per-portion live.

**Storybook stories.**
- Compact (default sidebar)
- Expanded (modal)
- With incomplete OFF data (warning state)
- High-fibre recipe (saturated-fat / fibre breakdown)
- Empty (recipe with no ingredients yet)

---

### `AllergenBadge`

**Purpose.** Render a single EU 1169/2011 Article 21 allergen with the legally-mandated emphasis: **bold + sufficient contrast + icon + text**, never colour-only.

**Used by.** [J1](j1.md) (sidebar) · [`LabelPreview`](#labelpreview) (the printable label) · any future surface that exposes allergen data.

**Capability.** FR27 (allergen detection + display per Article 21). Locked by [ADR-017](../architecture-decisions.md) (supersedes PRD-1 §4.11).

**Data shape.**
```ts
type AllergenBadgeProps = {
  allergen: AllergenCode;       // 'gluten' | 'crustaceans' | 'eggs' | 'fish' | 'peanuts' | 'soy' | 'milk' | 'tree-nuts' | 'celery' | 'mustard' | 'sesame' | 'sulphites' | 'lupin' | 'molluscs'
  locale: string;               // 'es-ES' | 'en-GB' | etc — for the displayed text
  variant?: 'inline' | 'label'; // sidebar inline vs printed-label format
};
```

**Component-specific states.** This component does **not** have a "decorative" or "muted" mode. If it appears, it appears at full emphasis. (See DESIGN.md §4.)

**Tokens (locked).**
- Border: 1.5 px `var(--destructive)` (paprika).
- Background: `var(--warn-bg)` (soft sand).
- Icon: geometric SVG triangle with internal `!`. Fill `var(--destructive)`. **Not** an emoji. **Not** a coloured circle.
- Text: bold, weight ≥ 600, allergen name in the venue's primary locale, `var(--destructive)` colour. WCAG-AA verified at 5.4 : 1 on the warn-bg.

**Behaviour.** Static badge — no interaction, no hover. Screen reader: `aria-label` reads "Contains <allergen name>" so it's announced explicitly, not just the icon.

**Edge cases.**
- **"May contain" trace allergens** (cross-contamination): a separate `<TraceAllergenBadge>` is needed in M2.1; M2 surfaces only confirmed allergens. Document the gap in PRD M2.1.
- **Locale fallback**: if the allergen name in the requested locale is missing, fall back to English. Never render the allergen code (e.g. `gluten`) instead of the noun.
- **Multiple allergens**: render N badges, one per allergen. Do not concatenate ("Contains gluten, eggs, milk") — each is a discrete badge so the chef can verify each at a glance.

**Storybook stories.**
- Single allergen — gluten, Spanish locale
- Single allergen — milk, English locale
- Multiple allergens — render of 4 badges in row
- Label-variant (printable) — different padding / sizing for print
- RTL locale (Arabic — `aria-label` direction check)

---

### `DietFlagsPanel`

**Purpose.** Show vegan / vegetarian / gluten-free / halal / kosher / keto status, AI-derived from ingredients, with chef override.

**Used by.** [J1](j1.md) (sidebar).

**Capability.** FR28 (diet flags from ingredients).

**Data shape.**
```ts
type DietFlagsPanelProps = {
  recipeId: string;
  flags: Array<{
    flag: 'vegan' | 'vegetarian' | 'gluten-free' | 'halal' | 'kosher' | 'keto';
    status: 'applies' | 'does-not-apply' | 'unknown';
    reason?: string;            // "contains beef" / "contains gluten" — surface inline
  }>;
};
```

**Component-specific states.** `none-apply` (the `Tagliatelle Bolognesa` case — all 6 flags fail because of beef + gluten + alcohol) — render a single `--mute` line "— None applicable (contains beef, gluten, alcohol)" instead of 6 negated chips. `partial` (some apply, some don't) — render the affirmed ones as `--success`-bordered chips and skip the rest.

**Tokens.** Affirmed chip: `--success` border + `✓` icon + flag name. Disqualifying reasons in `--mute` `--text-xs`.

**Behaviour.** Tap a flag to override (in case the AI is wrong, e.g. a vegan label on an ingredient with a hidden honey trace). Override surfaces a confirmation: "Override AI suggestion? Reason will be logged for audit."

**Edge cases.**
- **Conflict with allergen**: gluten-free flag and gluten allergen are mutually exclusive — UI rejects the override with a `--destructive` inline error.
- **Custom org-level flags**: M2.x. M2 uses the 6 fixed flags above.

**Storybook stories.**
- Affirmed multiple (vegan + vegetarian + gluten-free)
- None apply (disqualifying reason)
- Partial (one affirmed, rest skipped)
- Override conflict (gluten-free + gluten allergen)

---

### `CostDeltaTable`

**Purpose.** Surface per-component cost deltas between two time windows so the chef can find the spike's origin in 2-second glances.

**Used by.** [J2](j2.md) (the cost-spike audit surface).

**Capability.** FR13 (cost history per component, configurable window), FR14 (recompute dependent costs when SupplierItem prices change), FR15 ("what changed?" view with attribution).

**Data shape.**
```ts
type CostDeltaTableProps = {
  recipeId: string;
  window: '7d' | '30d' | '90d' | { from: Date; to: Date };
  rows: Array<{
    component: string;
    source: string;
    qty: { value: number; unit: string };
    costThen: number;      // start of window
    costNow: number;       // end of window
    citation?: string;
  }>;
  onSwitchSupplier?: (component: string) => void;  // drill-in
};
```

**Component-specific states.** `loading` (skeleton table while history fetches) · `no-change` (the entire window has zero delta — render banner "no change in this window"). Per-row: `spike` (this row drives the bulk of the delta — tinted `var(--warn-bg)`).

**Tokens.** Negative cost delta (cost going down — good): `--success`. Positive cost delta (cost going up — bad): `--destructive`. No-change rows: `--mute` with `—` glyph instead of `+€0.00`. Spike row: `--warn-bg` row tint, `--destructive` delta text. **The colour rule is independent of the sign**: a positive Δ that means "cost up" is `--destructive`. Be careful here.

**Behaviour.** Sort: by absolute Δ descending (default — the spike floats to the top). Window toggle as a chip group: 7 d (default) / 30 d / 90 d / custom. Per-row "Switch supplier →" inline action revealed on hover (`pointer:fine`); on `pointer:coarse` reachable via the sticky action bar after row tap.

**Edge cases.**
- **Sub-recipe in row**: rolls up its own delta from its own ingredient changes. Row shows the rolled-up Δ; tap to expand the sub-recipe's CostDeltaTable inline.
- **New ingredient added mid-window**: `costThen` is N/A; render "added in window" in `--mute` instead of a number.
- **Removed ingredient mid-window**: `costNow` is N/A; render "removed in window" with the `costThen` showing as historical cost.
- **Currency change mid-window** (rare): document the conversion timestamp; flag with a `--mute` hint.

**Storybook stories.**
- Default — 7 components, one spike row, sorted by |Δ|
- All zero (no-change banner)
- Window toggle interaction (chip group)
- Sub-recipe row with inline expand
- Added / removed mid-window rows
- Currency change in window (rare)
- Mobile (`<540 px`) — table → row layout via `data-label`

---

### `MarginPanel`

**Purpose.** Show cost / sale price / margin % / vs target with status — for one MenuItem on one channel.

**Used by.** [J1](j1.md) (sidebar — happy path) · [J2](j2.md) (right column — shows margin compression as cost spikes).

**Capability.** FR29 (MenuItem cost rollup), FR30 (sale price), FR31 (margin computation), FR32 (margin vs target with status).

**Data shape.**
```ts
type MarginPanelProps = {
  menuItemId: string;
  cost: number;
  salePrice: number;
  targetMarginPct: number;        // org-level setting, default 70
  costPrev?: number;              // J2 audit mode — old cost for strikethrough
  marginPrev?: number;            // J2 audit mode — old margin %
  channel?: string;               // 'Dine-in' | 'Takeaway' | 'Delivery'
};
```

**Component-specific states.** `target-met` (margin ≥ target — `--success` `✓`) · `target-missed` (margin < target — `--destructive` `✗`) · `audit` (J2 mode — old → new strikethrough comparison).

**Tokens.** Margin number in `--ink` `--text-2xl` weight 600; status check / cross in `--success` / `--destructive`. **Accent never appears here** — this is the margin domain, not a brand-CTA domain. (DESIGN.md §4 lockss `--accent` away from this surface.)

**Behaviour.** Inline editor on `salePrice` for the canonical edit surface (J1). In audit mode (J2), read-only — old value `--mute` strikethrough on the left, new value in `--ink` on the right.

**Edge cases.**
- **Negative margin**: render as `--destructive` with no `✗` (the negative number is loud enough). Add an inline action "Adjust price" linking to the sale-price editor.
- **Multi-channel MenuItems**: render one `MarginPanel` per channel in the parent layout; this component is single-channel.
- **Sale price < cost**: "your sale price is below cost" inline error.

**Storybook stories.**
- Target met (canonical happy path — 80.8 % vs 70 %)
- Target missed
- Negative margin (sale price below cost)
- Audit mode (old → new strikethrough)
- Editing sale price inline
- Multi-channel example (3 panels in parent)

---

### `MenuItemRanker`

**Purpose.** Top / bottom 5 dashboard for the Owner persona on mobile — "which dishes lost or kept margin this week?"

**Used by.** [J3](j3.md) (the Owner-mobile dashboard surface).

**Capability.** FR33 (top / bottom MenuItem ranking), FR38 (Owner dashboard with top-5 / bottom-5), FR39 (drill-down to recipe cost-history). Adjacent: FR32 (margin vs target), FR46 (RBAC — Owner read-only on the recipe drill-down).

**Data shape.**
```ts
type MenuItemRankerProps = {
  organizationId: string;
  locationFilter: string[] | 'all';     // multi-location operator
  window: '7d' | '30d' | '90d' | custom;
  topN?: number;                         // default 5
  onDrillDown: (menuItemId: string) => void;  // read-only recipe view
};

type RankerRow = {
  rank: 1 | 2 | 3 | 4 | 5;
  menuItemId: string;
  dishName: string;
  salePrice: number;
  cost: number;
  marginPct: number;
  marginDeltaVsTargetPp: number;        // +/- percentage points
  volume: number;                       // sold count in window
};
```

**Component-specific states.** `no-data` (location has no MenuItems with sales in window — surface "Add MenuItems to see margin watch"). `tied-rank` (multiple items at exact same margin — render same rank number, document order).

**Tokens.** Rank circle: `--surface` background, `--ink` numeral inside. Dish name: `--font-serif` (Fraunces) — the chalkboard-menu wink applies because the dish name is a "menu noun", same logical role as the recipe title. Margin number large, in `--destructive` if below target / `--success` if above. Delta vs target: `--mute` `--text-sm`. Volume: `--mute` `--text-sm`. Right-edge chevron `›` indicating tap-to-drill.

**Behaviour.** Tap anywhere on row → drill-down (read-only recipe view). The whole row is the hit area — chevron is ornamental. Each row is a stack-card on mobile (375 px). Touch target 48 px minimum (the row is ~88 px tall in the canonical mock — well above floor). On larger viewports, can render in a 2-column grid (top 5 / bottom 5 side by side).

**Edge cases.**
- **One-handed reach**: the 5 rows of bottom 5 must be in the thumb arc on a 375 × 812 phone. Filter chips in the sticky header are outside the arc — that's acceptable because filters are non-default operations.
- **Combined-locations vs single**: combined view sums the volume + margins across; single-location filter scopes both. The header chip controls this.
- **No MenuItems below target**: render "All dishes met margin target this week" in `--success` instead of an empty bottom-5.

**Storybook stories.**
- Bottom 5 + Top 5 with realistic data (the J3 canonical numbers)
- All above target (no bottom-5 — celebration message)
- Tied ranks
- Multi-location combined vs single
- 30-day window vs 7-day
- Mobile 375 px portrait (canonical)
- Tablet landscape (the 2-col layout)

---

### `LabelPreview`

**Purpose.** Live preview of the EU 1169/2011 printable label, paired with `@react-pdf/renderer` in `packages/label-renderer` per [ADR-019](../architecture-decisions.md).

**Used by.** [J1](j1.md) (`Generate label` action — opens this preview) · any future label-printing surface.

**Capability.** FR34 (label generation), FR35 (Article 21 emphasis on labels), FR36 (< 3 clicks recipe → printable).

**Data shape.**
```ts
type LabelPreviewProps = {
  recipeId: string;
  portionUnits: number;
  legalLocale: string;            // 'es-ES' | 'en-GB' | etc — drives mandatory text
  template?: 'shelf' | 'package'; // default 'shelf'
};
```

**Component-specific states.** `loading` (PDF compile in flight — skeleton of the label) · `error` (generation failed — render error with retry action) · `ready` (preview rendered, `Print` available).

**Tokens.** The label itself uses tokens but with one important deviation: **printable labels have no `--accent` colour** — labels print on white paper in B/W often. Use `--ink` and `--destructive` (the only "loud" colour allowed because Article 21 requires it). The preview frame around the label uses `--surface` with 1 px `--border`.

**Behaviour.** Render the WYSIWYG preview as actual PDF-as-PNG (or canvas). `Print` is one tap from preview-ready. `Download PDF` is the secondary action. `Esc` or backdrop close.

**Edge cases.**
- **Missing required field** for the legal locale (e.g. mandatory ingredients statement is incomplete because OFF data missing): block `Print`, surface error "Label cannot be printed: missing <field>. Resolve in recipe edit."
- **Allergens layout**: per Article 21, allergens within the ingredient list must be **emphasised** (bold + sufficient contrast). The `AllergenBadge` rule applies — the same icon + text + border treatment.
- **Multi-language labels**: M2.1 — M2 supports single legal locale. PRD M2.1 covers stack labels.

**Storybook stories.**
- Default — Tagliatelle Bolognesa shelf label (es-ES)
- Loading skeleton
- Error state with retry
- Missing-field block
- Multiple allergens emphasised on label
- Print-ready B/W rendering vs colour preview

---

### `AgentChatWidget`

**Purpose.** Web chat sidesheet for the agent path, mounted only when `NEXANDRO_AGENT_ENABLED=true`. Lets a user converse with Hermes from inside the nexandro app instead of via WhatsApp / external channel.

**Status.** Canonical M2 contract; **feature-flagged**. Does not render unless the env flag is set. Per [ADR-013](../architecture-decisions.md), the widget consumes the same MCP contract as any other agent client — it's a *visual surface*, not a privileged client.

**Used by.** Any authenticated user with the agent flag enabled.

**Capability.** Implementation of the Agent-Ready Foundation pillar — same API contract as Hermes-via-WhatsApp.

**Data shape.**
```ts
type AgentChatWidgetProps = {
  organizationId: string;
  userId: string;
  initialContext?: 'recipe' | 'menu' | 'none';   // surface-aware launch
};
```

**Component-specific states.** `closed` (collapsed FAB-style entry point) · `open` (sidesheet) · `streaming` (model is responding — token-by-token render with no celebration animation) · `tool-calling` (agent is invoking an MCP tool — surface the tool name and a brief progress note).

**Tokens.** Sidesheet background: `--surface`. User bubble: `--bg`, 1 px `--border`. Agent bubble: `--surface-2` (slightly deeper), 1 px `--border`. Input ring: `--accent` focus. **No celebration animations on response.** The user is concentrating; spend zero motion budget on confetti.

**Behaviour.** Right-side sidesheet, ~400 px wide on tablet+, full-width on mobile. `Esc` closes (returns focus to launch FAB). Streaming responses render incrementally. Tool calls surface as inline `--mute` notes ("Looking up ingredient supplier prices…") — don't hide the agent's work behind a spinner.

**Edge cases.**
- **Flag disabled**: component does not mount. No FAB, no sidesheet, no listener. The whole feature is invisible.
- **Multimodal**: M2 supports text only. Image / voice deferred to M2.x ([J5](j5.md)).
- **Long conversations**: scroll the message log; sidesheet height is the available viewport minus header.

**Storybook stories.**
- Closed (FAB-only)
- Open empty (welcome message)
- Open mid-conversation
- Streaming response (token-by-token)
- Tool-calling state (inline progress note)
- Long conversation (scroll behaviour)
- Flag-disabled (component returns null — Storybook test that nothing renders)

---

## Tier 2 — M2.x deferred (design intent only)

These are recorded so the components catalogue tracks them as `status: deferred`, not gaps. M2 implementation must not foreclose them. See [j5.md](j5.md) for the full design intent.

### `InboxItem`

**Status.** M2.x deferred.

**Purpose.** Render a single agent-drafted recipe in the review inbox — dish name, channel chip (`WhatsApp`, `Telegram`, `Web`, etc.), originating user, timestamp, `Review draft` CTA.

**Used by.** M2.x review surface — top-nav badge ("3 drafts pending review") opens the inbox sidesheet, each draft is an `InboxItem`.

**Why deferred.** Requires the `pending_review` Recipe state and `created_via_channel` column — both must be **kept open** by M2 architecture but are not implemented in M2 MVP.

**Tokens (intent).** `--surface` card · 1 px `--border` · channel chip in `--mute` text on `--bg`. Same density as `MenuItemRanker` rows so the inbox visually rhymes with the dashboard.

**Storybook stories (planned).** Default · multiple drafts (list of 3) · empty (no drafts) · expanded with reviewer name on hover.

---

### `AgentDraftReviewBanner`

**Status.** M2.x deferred.

**Purpose.** When entering the J1 recipe-edit screen on a draft created by an agent (channel = WhatsApp, Telegram, etc.), render a banner above the recipe title naming the channel + originator + timestamp + a `Channel trace →` audit link.

**Used by.** M2.x — the J1 mock pre-populated with agent-drafted content.

**Why deferred.** Requires the inbox flow that surfaces drafts for review; not relevant in M2 because no draft can yet originate outside the web UI.

**Tokens (intent).** `--warn-bg` background tint · 1 px `--accent` left border · `--ink` body text. **Not** a destructive banner — this is informational, not error. Distinct from the J4 cycle-detection banner (which uses `--destructive`).

**Storybook stories (planned).** WhatsApp draft · Telegram draft · CLI draft (engineer-originated) · expired draft (older than 7 d, surfaces "this draft is stale, verify before publishing").

---

### `ChannelTrace`

**Status.** M2.x deferred.

**Purpose.** Read-only audit view of the source conversation that produced an agent-drafted recipe. Opens in a sidesheet from the `Channel trace →` audit link.

**Used by.** M2.x — referenced from `AgentDraftReviewBanner` and the inbox detail view.

**Why deferred.** Requires the channel-trace persistence layer (full conversation log per draft) which is not in M2.

**Tokens (intent).** Same chat-bubble pattern as `AgentChatWidget` but **read-only** — no input, no streaming, just the historical conversation. Each turn carries the timestamp and originating identity (Lourdes via WhatsApp, Hermes via MCP).

**Storybook stories (planned).** WhatsApp conversation · multimodal (text + photo) conversation · long conversation (15+ turns).

---

## Stewardship

When the M2 PRD adds a new component:
1. Add it to DESIGN.md §4 first (intent + tokens).
2. Add it here with a stub entry (purpose, status, capability, intended tokens).
3. Implement: build the Storybook stories before the live mount; verify stories against any per-journey mocks that depend on the component.

When a component is implemented in `packages/ui-kit/`, the entry here gets a `status` upgrade from `M2 design intent` to `M2 canonical implemented`, and a link to the Storybook story files. M2.x deferred components stay deferred until their PRD lands.

The components catalogue is the contract between design and engineering. If a story in Storybook does not match the doc here, the doc is wrong — fix it.
