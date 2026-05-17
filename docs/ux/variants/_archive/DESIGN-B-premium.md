# DESIGN.md — Variant B: Premium hospitality

> Luxe, restauración alta. The product an Owner of a Michelin group introduces with pride on her iPad. Confident typography, cálido warmth, micro-elegance.

## 1. Principles

1. **Confidence without ostentation.** Like a tasting menu — restraint is the luxury.
2. **Cálido, no clinical.** A kitchen is a warm place. The UI should feel like the dining room, not the operating room.
3. **Hierarchical typography.** Serif titles + sans body create rhythm; the eye knows where to land.
4. **Micro-elegance over micro-interaction.** Subtle hover lifts, soft shadow transitions — never pop, slide, or bounce.
5. **Voice = warm + precise.** Microcopy reads like a sommelier's note: short, considered. *"This recipe uses 'Salsa de tomate'. Adding it as a sub-recipe of itself would create a cycle."*

## 2. Colors

| Role | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `#fdfcf9` | `#1a1814` | Cream-white app canvas |
| `--surface` | `#f7f5ef` | `#23201a` | Cards, panels |
| `--surface-elevated` | `#efeae0` | `#2d2a23` | Modals, popovers |
| `--border` | `#e4ddc8` | `#3a352b` | Dividers, input outlines |
| `--text` | `#2a2620` | `#f7f5ef` | Body — soft charcoal, not pure black |
| `--text-muted` | `#7a7468` | `#a8a294` | Secondary, captions |
| `--accent` | `#1f4a3d` | `#4a8a76` | Deep emerald — primary action, links |
| `--accent-soft` | `#e8f0eb` | `#2a3d35` | Selected state, hover backgrounds |
| `--success` | `#1f4a3d` | `#4a8a76` | Same as accent — emerald = positive in this voice |
| `--warning` | `#946400` | `#cc9a3d` | Burnt amber — cost attention |
| `--danger` | `#7d2828` | `#c87a7a` | Wine-burgundy — never bright red |

**Allergen badge** = `--danger` border + serif italic label + icon. Solemn, not alarming.

## 3. Typography

```
Display:    Fraunces 600 / 32-40px / 1.1 line-height (use sparingly)
Heading 1:  Fraunces 500 / 24px / 1.2
Heading 2:  Fraunces 500 / 18px / 1.3
Body:       Inter 400 / 14px / 1.55
Body small: Inter 400 / 12px / 1.55
Numerics:   Inter 500 / 14px / 1.3 (sans, NOT mono — premium feel)
Code:       JetBrains Mono 400 / 12px / 1.5 (only for citation snippets)
```

Serif (Fraunces) for titles is the brand signature. Body in Inter for legibility. Numerics in sans (not mono) — luxury looks.

## 4. Components

Built on **shadcn/ui** + Tailwind, but heavier customization for warmth:

- **Button**: `default` is filled emerald, 6px radius, 200ms transition. Hover = lift 1px + shadow soften. `secondary` is outline. `ghost` is text-only with hover-bg.
- **Card**: 1px subtle border + `box-shadow: 0 1px 3px rgba(0,0,0,0.04)`. 12px radius.
- **Table**: 16px row padding, hover = `--surface-elevated` with 200ms fade. Numerics in sans 500.
- **Input**: 40px height, 8px radius, soft inset. Focus = 2px emerald glow.
- **Badge**: pill (8px radius), 12px font, 500 weight. Variants kept minimal.
- **Toast**: top-center, 6s dismiss with cubic-bezier ease-out. Has a manual close.
- **Dialog/Modal**: centered, scale-fade-in 250ms with cubic-bezier(0.16, 1, 0.3, 1). Backdrop blur 8px.

Custom components (in `packages/ui-kit/`):

| Component | Description |
|---|---|
| `RecipePicker` | Combobox with serif title for the result section, soft hover |
| `IngredientPicker` | Result rows show brand name in serif italic; macros tooltip with elegant fade |
| `SourceOverridePicker` | Bordered table, hover-emerald-soft on row |
| `YieldEditor` | Inline number with citation as a small "from USDA" italic note |
| `WasteFactorEditor` | Same warmth, recipe-level |
| `MacroPanel` | 2x2 grid with serif kcal display; subtle dividers |
| `AllergenBadge` | Pill with wine-burgundy border, italic serif label, icon-left |
| `DietFlagsPanel` | Inline emerald pills with serif label |
| `CostDeltaTable` | Diff rows with green/burgundy left-border accents |
| `MarginPanel` | 3 stacked rows; primary margin% in Fraunces 500 18px |
| `MenuItemRanker` | Top/bottom-5 with subtle gold dividers |
| `LabelPreview` | Live preview in a paper-textured frame |
| `AgentChatWidget` | Bottom-right with rounded 16px corners; soft shadow |

## 5. Spacing

8px base grid. Tokens:

```
xs:  4px   (icon ↔ label)
sm:  8px   (input internal)
md:  16px  (card section gap — wider than Variant A)
lg:  24px  (card padding)
xl:  32px  (page section gap)
2xl: 48px  (between major panels)
3xl: 64px  (rare, page top)
```

More breath than Variant A. Whitespace = luxury.

## 6. Depth

| Layer | Treatment |
|---|---|
| Background | Flat cream fill |
| Card | 1px border + `0 1px 3px rgba(0,0,0,0.04)` |
| Modal/Popover | `0 8px 24px rgba(0,0,0,0.08)` + 8px backdrop blur |
| Toast | Same as modal, with subtle elevation accent |
| Hover lift | 1px translateY + shadow soften 200ms |

Soft, considered shadows. NO glassmorphism, NO neumorphism. Just elegance.

## 7. Guidelines

**Do:**
- Use serif for any title that's a name (Recipe name, Menu name, Owner name).
- Use cálido language: *"Esta receta..."* not *"Recipe with id..."*.
- Surface positive states with emerald, never bright green.
- Use italic serif for citation provenance ("from USDA FoodData Central").
- Cushion error states — wine-burgundy, italic, with a soft surface, not a red bar.

**Don't:**
- Use bright red anywhere. The danger color is wine-burgundy.
- Animate longer than 300ms — pace, not theatrics.
- Mix sans serif weights aggressively (don't go from 400 to 700 in the same line).
- Use ALL CAPS — the voice is hospitality, not retail.
- Use emoji in critical paths. Maybe in onboarding success only.

## 8. Responsive patterns

| Breakpoint | Width | Primary persona | Layout strategy |
|---|---|---|---|
| `mobile` | <768px | Owner (J3) | Mobile-first dashboard with serif titles, generous padding |
| `tablet` | 768-1279px | Head Chef (J1, J2, J4) | 2-col on landscape; 3-col only on widest tablets |
| `desktop` | 1280px+ | Office views, demo screens | 3-col with sidebar; serif hero on dashboard |

Owner's mobile experience is a flagship demo. Investiamo más en mobile que en Variant A.

## 9. Agent prompts (how to describe screens to LLMs)

```
You are designing a screen for nexandro, a kitchen-operations SaaS.
Visual language: Variant B "Premium hospitality" — luxe restauración alta,
cream/charcoal/emerald palette, Fraunces serif titles + Inter body,
sans 500 numerics (NO mono). Soft shadows, 200-300ms transitions, hover lifts.
Allergen badges = wine-burgundy + italic + icon (never bright red, never color-alone).
Voice is sommelier-precise: short, warm, considered.
Premium feel without ostentation; whitespace is the luxury.
Tablet-first (10" landscape) for chefs; mobile-first dashboard for the Owner.
NO ALL CAPS, NO bright red, NO emoji on critical paths, NO retail vibe.
```
