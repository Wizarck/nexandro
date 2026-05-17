# DESIGN.md — Variant C: Playful AGPL community vibe

> Software with personality. Notion-en-cocina pero con identidad propia. Open-source pride visible in the pixels — not corporate, not luxury, but distinctive.

## 1. Principles

1. **Identity is a feature.** The chef should recognize "this is nexandro" within 2 seconds of seeing a screenshot.
2. **Opinionated micro-interactions.** Save success has a tiny nod. Cycle detection has a *clear* but not theatrical bounce. No celebration confetti — but there IS character.
3. **Confident sans, no serif.** A modern sans (Geist or Satoshi) carries the brand alone.
4. **Color tells the food story.** A green-to-amber bridge in the brand palette echoes kitchen produce — fresh greens, warm spice. NOT corporate blue.
5. **Voice = friendly + competent.** Microcopy is helpful, not formal. *"Heads up — Ragù already uses Salsa de tomate. Adding it as a sub-recipe creates a loop. Pick a different sub-recipe?"*

## 2. Colors

| Role | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `#fdfdfb` | `#0c0c0a` | App canvas, slight cream tint |
| `--surface` | `#f6f7f4` | `#171816` | Cards, panels |
| `--surface-elevated` | `#eceee8` | `#23241f` | Modals, popovers |
| `--border` | `#dedfd6` | `#33342d` | Dividers, input outlines |
| `--text` | `#1c1d18` | `#f6f7f4` | Body — earthy charcoal |
| `--text-muted` | `#6b6c63` | `#a4a59c` | Secondary, captions |
| `--brand-green` | `#2d8859` | `#5dbb88` | Primary action, "fresh" semantic |
| `--brand-amber` | `#c47a14` | `#f5b95c` | Secondary accent, "spice" semantic |
| `--brand-gradient` | `linear-gradient(135deg, #2d8859 0%, #c47a14 100%)` | inverted | Logo, hero CTAs only — used sparingly |
| `--success` | `#2d8859` | `#5dbb88` | Same as brand-green |
| `--warning` | `#c47a14` | `#f5b95c` | Same as brand-amber |
| `--danger` | `#c54040` | `#e87474` | Tomato-red, food-themed not corporate-red |

**Allergen badge** = `--danger` border + bold sans + icon — friendly outline, not bright fill.

## 3. Typography

```
Display:    Geist 600 / 32-48px / 1.0 line-height (variable weight emphasis)
Heading 1:  Geist 600 / 24px / 1.15
Heading 2:  Geist 500 / 18px / 1.25
Body:       Geist 400 / 14px / 1.5
Body small: Geist 400 / 12px / 1.5
Numerics:   Geist Mono 500 / 14px / 1.3 (mono variant, brand-consistent)
Code:       Geist Mono 400 / 13px / 1.5
```

**Single family**: Geist (Vercel's open-source sans + mono). Confident, modern, distinctive without being trendy. Variable weight (400/500/600) carries hierarchy.

## 4. Components

Built on **shadcn/ui** + Tailwind. Customizations for character:

- **Button**: `default` filled brand-green, 8px radius, hover = `--brand-green` 95%, 150ms ease. `secondary` outline. `ghost` text-only with brand-green underline on hover.
- **Card**: 1px border + tiny `box-shadow: 0 1px 2px rgba(45,136,89,0.05)` (greenish hint). 10px radius.
- **Table**: 14px row padding, hover = `--surface-elevated` with 150ms fade. Active row = brand-green 4px left-border.
- **Input**: 40px height, 8px radius. Focus = 2px brand-green ring.
- **Badge**: pill (12px radius — softer than A), 11px font, 600 weight. Variants tinted.
- **Toast**: bottom-right (less intrusive than top), 5s dismiss, slide-up 200ms with subtle bounce.
- **Dialog/Modal**: centered, scale-in 200ms with `cubic-bezier(0.34, 1.4, 0.64, 1)` (slight overshoot). Backdrop blur 4px.
- **Save success**: 200ms checkmark icon morph in the button itself — character moment.

Custom components (in `packages/ui-kit/`):

| Component | Description |
|---|---|
| `RecipePicker` | Combobox with brand-green selected accent; shows ingredient count as small mono number |
| `IngredientPicker` | Brand-amber dot when from OFF (provenance signal); brand-green when manual |
| `SourceOverridePicker` | Brand-green left-border on preferred row |
| `YieldEditor` | Inline number with citation as a chip with mini logo of source (USDA, CIA…) |
| `WasteFactorEditor` | Same chip pattern, recipe-level |
| `MacroPanel` | 4-col grid with brand-green sub-bars showing % of daily intake (visual hint, optional) |
| `AllergenBadge` | Pill with tomato-red outline, bold label, food icon (🥛 lactose, 🌾 gluten variants) |
| `DietFlagsPanel` | Inline brand-green pills, food-themed icons |
| `CostDeltaTable` | Diff rows with brand-green/red left-border accents (delta direction) |
| `MarginPanel` | 3 stacked rows; margin% large with subtle brand-gradient backing on positive |
| `MenuItemRanker` | Top-5 with brand-green; bottom-5 with tomato-red; ranks shown as mono numerics |
| `LabelPreview` | Paper preview with subtle brand watermark (corner, faded) |
| `AgentChatWidget` | Bottom-right, brand-green pulse on new message; minimizable to brand-green dot |

## 5. Spacing

8px base grid. Tokens:

```
xs:  4px   (icon ↔ label)
sm:  8px   (input internal)
md:  12px  (card section gap)
lg:  20px  (card padding — slightly looser than A)
xl:  28px  (page section gap)
2xl: 40px  (between major panels)
3xl: 56px  (page top, hero gaps)
```

Slightly more breath than A (cool), tighter than B (luxe). Goldilocks.

## 6. Depth

| Layer | Treatment |
|---|---|
| Background | Flat with optional 2% brand-green noise texture for character (opt-in via theme) |
| Card | 1px border + tinted shadow `0 1px 2px rgba(45,136,89,0.05)` |
| Modal/Popover | `0 4px 16px rgba(0,0,0,0.10)` + 4px backdrop blur |
| Toast | Slide-up shadow `0 4px 12px rgba(0,0,0,0.08)` |
| Hover lift | 1px translateY on cards, no lift on buttons (color-only feedback) |

Subtle character via tinted shadows. NO glassmorphism, NO heavy gradients except the brand-mark-only gradient.

## 7. Guidelines

**Do:**
- Use brand-green for "fresh" / positive / save-success.
- Use brand-amber for "warm" / hover / secondary attention.
- Use the brand-gradient only on logo + onboarding hero CTA. Never on body buttons.
- Add tiny character moments: save checkmark morph, brand-green pulse on agent message.
- Use food emoji in NON-critical paths (allergen badges, diet flags) — adds personality safely.

**Don't:**
- Use the brand-gradient as a body fill (kills legibility, screams "demo").
- Use blue anywhere — corporate vibe is the anti-pattern.
- Animate longer than 250ms (still kitchen-fast).
- Mix Geist with another sans — single family is part of the identity.
- Use stock illustrations. Custom or none.

## 8. Responsive patterns

| Breakpoint | Width | Primary persona | Layout strategy |
|---|---|---|---|
| `mobile` | <768px | Owner (J3) | Single column, brand-green CTA card, large tap targets |
| `tablet` | 768-1279px | Head Chef (J1, J2, J4) | 2-3 col on landscape, density with character |
| `desktop` | 1280px+ | Office, demo screens | 3-col with sidebar, brand-gradient logo header |

Tablet is canonical. Mobile gets brand-prominent treatment for the Owner experience (this is where they "fall in love" with the product on a Sunday night).

## 9. Agent prompts (how to describe screens to LLMs)

```
You are designing a screen for nexandro, a kitchen-operations SaaS.
Visual language: Variant C "Playful AGPL community vibe" — distinctive open-source.
Palette: brand-green (#2d8859) + brand-amber (#c47a14), tomato-red for danger.
Single sans family Geist (no serif anywhere). Geist Mono for numerics.
Character moments: save checkmark morph, brand-green pulse on agent messages,
food emoji on allergen/diet badges (NON-critical paths only).
Brand gradient (green-to-amber) ONLY on logo + onboarding hero CTA — never body.
NO blue (corporate anti-pattern). NO stock illustrations.
Tablet-first (10" landscape, slow Wi-Fi). Friendly + competent voice in microcopy.
Identity is a feature: the chef should recognize "this is nexandro" within 2s.
```
