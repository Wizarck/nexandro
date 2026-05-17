---
title: nexandro Design System
status: canonical
last-updated: 2026-04-27
parent: docs/ux/
supersedes:
  - docs/ux/variants/_archive/* (exploration round)
  - docs/prd-module-1-ingredients.md §4.11 (allergens — see ADR-017)
related:
  - docs/architecture-decisions.md (esp. ADR-013 Agent-Ready, ADR-017 Allergens, ADR-019 Label generation)
  - docs/prd-module-2-recipes.md
  - docs/personas-jtbd.md
---

# nexandro Design System

The single source of truth for nexandro visual language, components, and design rules. Per-journey mocks (`docs/ux/j1.md` … `j5.md`) and the components catalogue (`docs/ux/components.md`) reference this document; they do not redefine its tokens.

## 1. Principles

1. **Restraint as discipline.** The screen exists for chefs to read in 2-second glances during service. Every ornament that is not earning its place is a distraction. No decorative gradients, no glassmorphism, no illustrative graphics, no emoji icons.
2. **Trattoria soul without trattoria cliché.** Warmth is carried by the colour temperature and one typographic wink, not by checkered tablecloths, Italian flag stripes, or chef-hat icons. Trust the palette.
3. **Tablet-first, kitchen-real.** The primary device is a 10″ landscape tablet on slow Wi-Fi, used by people with oily fingers who glance every 30 seconds. Touch targets, contrast, and load time are not negotiable.
4. **Citations as trust mechanism.** AI-suggested numbers (yields, waste factors, macros, allergens) carry visible provenance — `[USDA]`, `[CIA]`, `[ICN]`, `[OFF]` — readable inline, full source on hover. Without citation the chef has no reason to trust the suggestion.
5. **Allergen as legal duty.** Per EU 1169/2011 Article 21 (and the nexandro supersede in [ADR-017](../architecture-decisions.md)), allergen presence must be emphasised — bold + sufficient contrast + icon + text. Never colour-only. Never optional.
6. **Live cost is the spine.** Every recipe surface shows the live cost recomputing as the chef edits. The number is the most weighted element on the screen after the recipe title. Recalculation latency budget is 200 ms (NFR).
7. **Agent-ready, agent-optional.** The same surfaces must be renderable by AI agents (Hermes via MCP) and by human-driven UI. The contract is the API; the visual layer here is the human consumption channel. See [ADR-013](../architecture-decisions.md).
8. **Boring before clever.** Conventions exist because they reduce cognitive load. Reach for novelty only when the conventional pattern fails the persona — and document why.

## 2. Colors

Aged-turquoise on warm cream — Pulcinella palette. Tinted-neutral discipline (warm hue bias, low chroma) keeps every neutral feeling continuous; the accent is the only cool note in an otherwise warm field, which is what makes it pull the eye.

### Tokens

| Token             | Hex       | OKLCH (canonical)         | Where used                                                          |
|-------------------|-----------|---------------------------|---------------------------------------------------------------------|
| `--bg`            | `#F4EFE6` | `oklch(94.5% 0.012 70)`   | Page canvas. The cream wall.                                        |
| `--surface`       | `#ECE4D6` | `oklch(91.5% 0.014 70)`   | Cards, panels, raised data domains.                                 |
| `--surface-2`     | `#E4DAC8` | `oklch(88.5% 0.014 70)`   | Slightly deeper for sticky strips, banners.                         |
| `--ink`           | `#1B1916` | `oklch(20% 0.010 60)`     | Body text, headings. Warm charcoal — never `#000`.                  |
| `--mute`          | `#6B6557` | `oklch(48% 0.012 70)`     | Source text, secondary copy, eyebrows.                              |
| `--border`        | `#D9CFBF` | `oklch(83% 0.018 70)`     | Hairline 1px borders. Reads as dry parchment edge.                  |
| `--border-strong` | `#C5B89F` | `oklch(73% 0.020 70)`     | Table head rule, emphasised separators.                             |
| `--accent`        | `#2E8B85` | `oklch(54% 0.072 190)`    | Primary CTA bg, citation hover, focus ring, live-cost top rule.     |
| `--accent-press`  | `#246E69` | `oklch(46% 0.072 190)`    | Darker press state on primary CTA.                                  |
| `--accent-fg`     | `#FAFCFB` | `oklch(99% 0.003 190)`    | Text on `--accent`. Off-white, never `#fff`.                        |
| `--accent-soft`   | `#DDEAE7` | `oklch(91% 0.025 190)`    | Hover bg for citation badge, chip selected.                         |
| `--success`       | `#5F7A4A` | `oklch(53% 0.080 130)`    | Margin-met checks. Sage olive — semantic, not decorative.           |
| `--destructive`   | `#A8392F` | `oklch(48% 0.150 32)`     | Allergen badge text + border. Paprika, NOT Heinz red.               |
| `--warn-bg`       | `#F2E3C8` | `oklch(91% 0.045 80)`     | Allergen / warning surface tint. Soft sand, continuous with cream.  |

### CSS variables

OKLCH is the canonical form — declare colours in OKLCH for perceptual uniformity across displays. The hex values in the comments are derivation references, not the runtime values; copy the OKLCH lines into mocks and components.

```css
:root {
  /* Pulcinella palette — OKLCH canonical, hex shown as derivation reference only */
  --bg:           oklch(94.5% 0.012 70);    /* #F4EFE6 warm cream */
  --surface:      oklch(91.5% 0.014 70);    /* #ECE4D6 oat */
  --surface-2:    oklch(88.5% 0.014 70);    /* slightly deeper for sticky strips, banners */
  --border:       oklch(83%   0.018 70);    /* #D9CFBF sand parchment edge */
  --border-strong: oklch(73%  0.020 70);    /* table head rule, emphasised separators */
  --ink:          oklch(20%   0.010 60);    /* #1B1916 warm charcoal — never #000 */
  --mute:         oklch(48%   0.012 70);    /* #6B6557 warm mid-grey */
  --accent:       oklch(54%   0.072 190);   /* #2E8B85 aged turquoise */
  --accent-press: oklch(46%   0.072 190);   /* darker press state */
  --accent-fg:    oklch(99%   0.003 190);   /* #FAFCFB off-white on accent — never #fff */
  --accent-soft:  oklch(91%   0.025 190);   /* hover bg for citation badge, chip-selected */
  --success:      oklch(53%   0.080 130);   /* #5F7A4A sage olive */
  --warn-bg:      oklch(91%   0.045 80);    /* #F2E3C8 soft sand for warning surface */
  --destructive:  oklch(48%   0.150 32);    /* #A8392F paprika */
}
```

**Why OKLCH, not hex.** OKLCH is perceptually uniform — a 5 % L step looks like a 5 % L step everywhere on the colour wheel, which hex does not guarantee. On wide-gamut displays (P3 / Rec.2020) the OKLCH form preserves saturation; the equivalent hex (clamped to sRGB) renders flatter. All nexandro mocks must declare colours in OKLCH so the surfaces match each other on every device.

### Contrast (WCAG-AA verified)

| Pair                                       | Ratio    | Status         |
|--------------------------------------------|----------|----------------|
| `--ink` on `--bg`                          | ~14:1    | AA+ body       |
| `--mute` on `--bg`                         | ~5.0:1   | AA body        |
| `--mute` on `--surface`                    | ~4.6:1   | AA body        |
| `--accent-fg` on `--accent`                | ~5.1:1   | AA button      |
| `--success` on `--bg`                      | ~4.6:1   | AA semantic    |
| `--destructive` on `--bg`                  | ~5.6:1   | AA badge       |
| `--destructive` on `--warn-bg`             | ~5.4:1   | AA badge       |

### Usage rules

- **Accent ≤ 10 % surface area.** Used only on: primary CTA background, citation badge hover, focus ring, the 2 px live-cost top rule. Anywhere else is over-budget.
- **Live-cost number is `--ink`, not `--accent`.** Accent on cream measures ~3.6:1, fine for UI but below AA body. The eye lands via the top rule + size, not via colour-on-text.
- **No `#000`, no `#fff`.** Use `--ink` and `--accent-fg`. Pure black/white reads as cold and synthetic.
- **No pure greys.** Tinted neutrals only — every grey carries ~0.008–0.014 chroma toward warm hues.
- **Allergen badges:** `--destructive` text + `--destructive` border on `--warn-bg`. Icon + text always.
- **Cool/warm rule:** the only cool note in the field is `--accent`. Anything else trending cool (e.g. a stray `#888` grey) is a bug.

## 3. Typography

### Stack

```css
:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-serif: "Fraunces", ui-serif, Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", monospace;
}
```

- **UI chrome → `--font-sans`.** System stack. Loads instantly, performs at < 1 s on slow Wi-Fi, costs no web-font weight. A technical / utilitarian brief does not need a serif for warmth.
- **Recipe titles (H1) → `--font-serif`.** One transitional serif at display size only. The chalkboard-menu wink. Fraunces is picked for the optical-size (`opsz`) axis, which keeps the same family warm at display sizes without thickening at small ones.
- **Numerals → `--font-mono` *or* `font-variant-numeric: tabular-nums lining-nums`.** Either path; what matters is digits don't dance when values recalculate.

### Loading discipline

```css
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap; /* render system fallback first; swap when web font arrives */
}
```

`font-display: swap` is mandatory — it keeps the slow-Wi-Fi NFR reachable. The system fallback (`ui-serif, Georgia`) must be visually compatible enough that the swap is not jarring.

### Scale (5-step modular, ratio 1.25)

| Step          | Size    | Use                                  |
|---------------|---------|--------------------------------------|
| `--text-xs`   | 12 px   | Citations, eyebrow, footnotes        |
| `--text-sm`   | 13 px   | Source text, secondary metadata      |
| `--text-md`   | 14 px   | Body, table cells (default)          |
| `--text-lg`   | 18 px   | Live-cost number, panel titles       |
| `--text-xl`   | 22 px   | Sub-recipe nouns, MarginPanel total  |
| `--text-2xl`  | 28 px   | Recipe title (H1, serif)             |

- Minimum body size: **13 px**. Anything smaller fails on a 10″ tablet at arm's length.
- `text-wrap: balance` on H1 and H2.
- `line-height` 1.5 on body, 1.2 on H1.

### Numerals

Always `font-variant-numeric: tabular-nums lining-nums` on every digit. Quantities, costs, yields, the live-cost banner, the MarginPanel totals. No exceptions.

### Anti-reflexes

- Do not reach for Inter or Geist. The system stack is the deliberate choice.
- No font-weight above 600 unless display-size and serif (Fraunces title may go to 700 at H1; UI chrome stays ≤ 600).
- No `letter-spacing` adjustment on body text. Limited tracking on uppercase eyebrows only.
- No all-caps body text.

## 4. Components

The named components from the M2 PRD with intent + token usage. Full Storybook stories live in [`components.md`](components.md); this section sets the contract.

### `RecipePicker`

Picks an existing recipe to slot in as a sub-recipe. Search-as-you-type against the recipe catalogue.
States: default · focus · loading · empty (no matches) · error (server).
Tokens: `--surface` panel, `--border` 1 px, `--accent` focus ring.

### `IngredientPicker`

Search ingredients by name / brand / barcode against the local OFF mirror with REST API fallback. Auto-suggest with citation `[OFF]` on AI-pre-filled rows.
States: default · focus · loading · empty · error · offline (mirror only).
Highlights: brand tag (`Heinz`) inline as `--mute` text — distinguish from generic ingredient.

### `SourceOverridePicker`

"Edit source" UX. M2: lists `SupplierItems` sorted preferred → cheapest. M3: extends to batches sorted by expiry (FIFO).
States: default · focus · empty · error.
Visual: small inline editor on the source cell; click-out commits.

### `YieldEditor`

Yield % per ingredient with AI suggestion, citation popover, and chef override.
Tokens: AI-suggested value displayed in `--ink` with a faint citation badge `[USDA]` / `[CIA]` to its right; on chef override, the citation badge replaces with a small "edited by Lourdes" mute label.
States: default · focus · ai-suggested · overridden · invalid (out of 0–100).

### `WasteFactorEditor`

Recipe-level waste % with AI suggestion + citation. Same visual contract as `YieldEditor` but applied to the recipe summary strip, not a row.

### `MacroPanel`

Calories + macros. Compact (sidebar) and expanded (modal) views.
Compact: 4-cell grid (kcal · carbs · fat · protein) per 100 g.
Expanded: per portion + per 100 g side-by-side.
Tokens: numbers in `--ink` with `--font-mono` or `tabular-nums`; labels in `--mute` `--text-xs`.

### `AllergenBadge` (Article 21)

The legally-bound component. Per EU 1169/2011 Article 21 + [ADR-017](../architecture-decisions.md):
- **Always icon + text + border.** Never colour-only.
- Icon: geometric SVG triangle with internal `!`. Not an emoji.
- Text: bold, allergen name in the venue's primary locale.
- Border: 1.5 px `--destructive`.
- Surface: `--warn-bg`.
- Required gluten variant: `⚠ Gluten` (icon + word, both `--destructive`).

This component does not have a "decorative" mode. If it appears, it appears at full emphasis.

### `DietFlagsPanel`

Vegan, vegetarian, gluten-free, halal, kosher, keto. AI-derived from ingredients with chef override.
Tokens: `--mute` text on `--surface` when not applicable; `--success` border on chip when affirmed.

### `CostDeltaTable`

Per-component "what changed?" view (Journey 2 — cost-spike audit).
Visual: same row layout as the ingredient table, with an extra delta column. Negative deltas in `--destructive`, positive in `--success`. Sorted by absolute delta descending.

### `MarginPanel`

Cost / sale price / margin % / vs target with status.
Tokens: margin number in `--ink` `--text-2xl` weight 600; status check (`✓` / `✗`) in `--success` / `--destructive`. The accent never appears here — this is a margin domain, not a brand-CTA domain.

### `MenuItemRanker`

Top / bottom 5 dashboard for the Owner persona on mobile (Journey 3).
Mobile-first: each rank is a stack-row card, swipe to expand. Heavy reliance on `tabular-nums` because the Owner is comparing numbers across rows in 2-second glances on a sofa.

### `LabelPreview`

EU 1169/2011 label live preview. Paired with `@react-pdf/renderer` in `packages/label-renderer` per [ADR-019](../architecture-decisions.md).
Visual: WYSIWYG of the printable label. Allergens emphasised per Article 21 (the `AllergenBadge` rule applies here too — bold + border + icon).
States: default · loading (PDF compile) · error · ready-to-print.

### `AgentChatWidget`

Feature-flagged web chat. Renders only when `NEXANDRO_AGENT_ENABLED=true`. Per [ADR-013](../architecture-decisions.md), the widget is a separate consumer of the same API contract — visually it is a sidesheet, not the primary surface.
Tokens: `--surface` background, `--accent` for the user input ring, no celebration animations on response (motion budget applies).

### Component states (universal)

Every interactive component must implement the following states explicitly. Anything unstated is a bug:
1. **default** — resting visual.
2. **hover** — `pointer:fine` only; never the only affordance for an action.
3. **focus / `:focus-visible`** — 3 px `--accent` ring, 2 px offset, ≥ 3:1 contrast against adjacent.
4. **active** — pressed feedback, ≤ 100 ms transition.
5. **disabled** — `--mute` text, no border, `cursor: not-allowed`, `opacity: 0.55`.
6. **loading** — skeleton or spinner per surface; no layout shift.
7. **error** — `--destructive` border + icon + text; never red-only.
8. **success** — `--success` border or `✓` icon + text; never green-only.

## 5. Spacing

4 pt base scale. Semantic names so changes propagate.

```css
:root {
  --space-2xs: 4px;   /* tight stacks (icon + text, label + value) */
  --space-xs:  8px;   /* row gutters */
  --space-sm: 12px;   /* small sections */
  --space-md: 16px;   /* default panel padding */
  --space-lg: 24px;   /* card padding, section gutters */
  --space-xl: 32px;   /* page-level rhythm */
  --space-2xl: 48px;  /* page-level breaks, major separators */
}
```

### Use rules

- **Tight stacks (4–8 px):** icon-and-text pairs, label-and-value pairs.
- **List rows (12–16 px):** ingredient rows, table cells.
- **Sectional (24–32 px):** between cards in a sidebar, between page sections.
- **Page-level (48 px):** above the page footer, between distinct epoch areas.
- **Touch targets:** **48 px minimum** hit area on every interactive control. Use padding + `::before` expansion if the visual size is smaller.
- **Variety required.** Same padding everywhere is monotony. Different rhythms reinforce hierarchy.

## 6. Depth

Depth comes from luminance-stepping and bordered surfaces, not from drop shadows.

- **Hierarchy:** `--bg` (canvas) → `--surface` (panel) → border-only emphasis on the focused element.
- **Borders feel like dry parchment edges.** `--border` (1 px) is used for: ingredient table row dividers, panel outer outlines, the live-cost summary top rule (which uses `--accent` instead).
- **Cards are reserved for distinct data domains.** The ingredient table is **not** in a card. The sidebar uses three flat full-bordered panels (allergens, macros, margin) — three distinct domains.
- **Forbidden:**
  - Drop shadows for elevation (use luminance + border instead).
  - Glassmorphism / `backdrop-filter` on primary surfaces (sticky header may use a subtle blur if the kitchen reality demands it; document it inline).
  - Nested cards.
  - Side-stripe accent borders (the "border-accent-on-rounded" pattern is forbidden).
  - Outer glow / dark-glow.

## 7. Guidelines

### Accessibility

- **WCAG-AA on every critical screen** — recipe view, label preview, Owner dashboard.
- **Allergen icon + text + border, never colour-only.** Article 21 is a legal hard rule.
- **Touch targets ≥ 48 px** on every interactive control.
- **`:focus-visible` ring** on every focusable element. 3 px outline, 2 px offset, ≥ 3:1 contrast against adjacent.
- **No `outline: none` without a replacement.**
- **Screen-reader-friendly errors.** Error messages name what failed and how to fix it; they don't say "Invalid".

### Motion

- **Duration scale: 100 / 300 / 500 ms only.** No values in between.
  - 100 ms: button press feedback, focus ring fade-in.
  - 300 ms: panel reveals, sidesheet open / close.
  - 500 ms: page-level transitions (rare; prefer instant for app surfaces).
- **`@media (prefers-reduced-motion: reduce)`** disables all transitions globally.
- **Only `opacity` and `transform` animated.** Animating `width` / `height` / layout properties is forbidden.
- **No bounce, no elastic, no overshoot.** `cubic-bezier(0.16, 1, 0.3, 1)` for normal eases; `ease-out-quart` for press feedback.
- **No celebration animations** on save, on AI response, on margin-met. The chef glanced for 2 seconds; spend none of those on confetti.

### Performance

- **Recipe view < 1 s on slow Wi-Fi** (NFR). The system-font choice + single variable web font with `swap` fallback exists to honour this.
- **Live cost recalculation < 200 ms** (NFR).
- **Label PDF generation in < 3 clicks** from any recipe.

### Copy

- **Verb + object on every button label.** "Save recipe" not "Save". "Generate label" not "Submit". "Discard" not "Cancel".
- **Tone is matter-of-fact, kitchen-professional.** Not cute, not cheerful. The chef is concentrating.
- **No em dashes.** Use commas, periods, or middle-dot (`·`).
- **One term per concept.** Source / Yield % / Cost. Don't drift to synonyms.
- **No redundant copy.** No intro paragraph saying "this is a recipe".
- **Citations are full-form on hover.** `[USDA]` becomes "United States Department of Agriculture, FoodData Central, accessed 2026-04-15" via `title` attribute (translation-friendly).

### Destructive actions

- **"Discard" is a ghost button**, not a red destructive modal. The principle is that confirmation dialogs are usually design failures — undo beats confirm.
- Where confirmation is unavoidable (e.g. deleting a published Recipe used by N MenuItems), the modal carries impact context: "This recipe is used by 4 menu items at 2 locations. Deleting will…". The modal does not lead with red.

## 8. Responsive patterns

### Breakpoints

| Token            | Min width  | Surface                              |
|------------------|------------|--------------------------------------|
| `--bp-mobile`    | 0          | Phone, single column                 |
| `--bp-tablet`    | 720 px     | Compact tablet, table → cards        |
| `--bp-tablet-l`  | 1024 px    | **Primary** (10″ kitchen tablet)     |
| `--bp-desktop`   | 1280 px    | Office / lookback                    |

- **Tablet-first.** Layout designed for 1024 × 768 first; phone is a fallback, desktop is a bonus.
- **Sidebar collapses below the table at < 1024 px** (single column, sidebar after main).
- **Tables → cards at < 720 px** via `display: block` + `data-label` row pattern.
- **`pointer: coarse`** branch: padding 14 px 20 px, `min-height: 48px` on every control, no hover-only affordances.

### Per-persona device locks

| Persona            | Primary device                                    |
|--------------------|---------------------------------------------------|
| Head Chef (Manager)| Kitchen tablet 10″ landscape (slow Wi-Fi)         |
| Owner              | Mobile (Sunday-night sofa) for read-only dashboards |
| Line Cook (Staff)  | Shared wall-mounted tablet, read-only             |

The Head Chef tablet is the reference device. Designs that don't read clearly there are wrong, even if they look great on desktop.

## 9. Agent prompts

Guidance for AI agents (Hermes via MCP, future LLM-driven UI generators) producing new components in this system. This section is load-bearing for the **Agent-Ready Foundation** pillar in [ADR-013](../architecture-decisions.md).

### Hard rules an agent must follow

1. **Always start from semantic tokens, never raw hex.** `var(--accent)` not `#2E8B85`. Tokens propagate; hex doesn't.
2. **If a number, wrap in `font-variant-numeric: tabular-nums lining-nums`.** No exceptions for prices, yields, weights, percentages, or counts.
3. **If an allergen, the badge MUST be icon + text + border** (per Article 21). Never colour-only. Never an emoji. Use the `AllergenBadge` component; do not re-implement.
4. **If a cost, default decimal precision 2 for display, 4 for internal rollup.** Maintain the 0.01 % rollup tolerance budget per the M2 NFR.
5. **If a button is destructive, default to ghost not red.** Confirmation dialogs are usually design failures — prefer undo.
6. **Respect `prefers-reduced-motion`.** Wrap any transition rule in `@media not (prefers-reduced-motion: reduce)`.
7. **Verify WCAG-AA on every text pair you introduce.** Mute on surface, accent-fg on accent, and any new pair you create. ≥ 4.5:1 for body, ≥ 3:1 for large text and UI components.
8. **Citations are non-optional** when the value comes from an AI suggestion. `[USDA]`, `[CIA]`, `[ICN]`, `[OFF]` — pick the right source, set the `title` attribute to the full reference, never silently use AI-derived data.
9. **Cards reserved for distinct data domains.** If you find yourself nesting a card inside a card, you are in error.
10. **Touch targets ≥ 48 px on every interactive control.** Use padding + `::before` expansion if the visual is smaller.

### Anti-patterns an agent must avoid

`side-tab` (border-accent-on-rounded), `nested-cards`, `monotonous-spacing`, `everything-centered`, `bounce-easing`, `dark-glow`, `icon-tile-stack` (rounded-square icon tiles above headings), `pure-black-white`, `gray-on-color`, `ai-color-palette` (tech-blue / teal / purple reflex), `glassmorphism`, `gradient-text`, `flat-type-hierarchy`, `tiny-text` (< 13 px), `all-caps-body`, `wide-tracking` on body, `justified-text`, `tight-leading`, `cramped-padding`, `layout-transition` (animating `width` / `height`), `hero-metric` template, `identical card grids`, `modal-as-first-thought`, em dashes.

### Prompt template for new component generation

When asking an agent to produce a new component for this system, frame as:

> Produce a `<ComponentName>` for nexandro following `docs/ux/DESIGN.md`.
> - Persona: `<persona>`. Device: `<device>`.
> - Data shape: `<schema or example>`.
> - States required: default / hover / focus / active / disabled / loading / error / success.
> - Use only semantic tokens from §2 Colors and §5 Spacing.
> - Verify WCAG-AA on every text pair you introduce.
> - List the design choices you made (token selections, anti-patterns avoided) in a short head comment.

Agents should fail loudly (return a clarification request) if any of: persona unspecified, allergen-adjacent without Article 21 treatment, cost displayed without precision rule, motion designed without `prefers-reduced-motion` branch.

---

**Stewardship.** Changes to this design system land in this file via PR. Mocks and per-journey docs reference its tokens; they never redefine them. When the PRD adds a new component, add it to §4 here first, then to `components.md`, then implement.
