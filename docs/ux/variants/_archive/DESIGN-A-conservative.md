# DESIGN.md — Variant A: Conservative kitchen-functional

> "Notion meets Linear, dialed for tablet kitchens." Tool, not toy. Datos densos, alto contraste, motion mínimo. The chef should never wait, and never wonder where to click.

## 1. Principles

1. **Speed over delight.** Every interaction completes in <200ms perceived; no celebration animations, no pull-to-refresh confetti.
2. **Information density at tablet scale.** A 10" landscape tablet should show enough recipe data to read at a glance — sub-recipes, costs, allergens, margin — without scrolling for the common case.
3. **Numbers are the protagonist.** Costs, yields, macros, margins. Tabular alignment. Monospace for numerics so columns line up.
4. **Boring is a feature.** Visual noise is friction in a kitchen-greasy environment. Stick to system-feel; let the user's mental model be the UI.
5. **Voice = neutral, factual.** Microcopy reads like a technical doc, not marketing. *"Cycle detected. Ragù already uses Salsa de tomate."* — name nodes + direction; no apologetic prose.

## 2. Colors

| Role | Light | Dark | Usage |
|---|---|---|---|
| `--background` | `#ffffff` | `#0a0a0a` | App canvas |
| `--surface` | `#fafafa` | `#171717` | Cards, panels |
| `--surface-elevated` | `#f4f4f5` | `#262626` | Modals, popovers |
| `--border` | `#e4e4e7` | `#27272a` | Dividers, input outlines |
| `--text` | `#18181b` | `#fafafa` | Body |
| `--text-muted` | `#71717a` | `#a1a1aa` | Secondary, captions |
| `--accent` | `#0f172a` | `#f8fafc` | Primary buttons, links (slate, near-black) |
| `--success` | `#15803d` | `#22c55e` | Margin-positive, save success |
| `--warning` | `#a16207` | `#eab308` | Cost spike, vs-target underperformance |
| `--danger` | `#b91c1c` | `#ef4444` | Cycle errors, allergen flags, validation fails |

**Allergen badge** = `--danger` border + 600 weight text + icon — never color-only (NFR Accessibility).
**Diet flag** = `--success` border for compliant (vegan, GF) + icon + text. Non-compliant = no badge, never red — absence of signal is signal.

## 3. Typography

```
Display:    none — no hero text
Heading 1:  Inter 600 / 24px / 1.2 line-height
Heading 2:  Inter 600 / 18px / 1.3
Body:       Inter 400 / 14px / 1.5
Body small: Inter 400 / 12px / 1.5
Numerics:   JetBrains Mono 500 / 14px / 1.3 (for prices, qtys, %)
Code:       JetBrains Mono 400 / 13px / 1.5 (for citation snippets, error refs)
```

Single sans family + single mono. No serifs. Variable weight for hierarchy, not size escalation.

## 4. Components

Built on **shadcn/ui** + Tailwind. Customizations:

- **Button**: `default`, `secondary`, `ghost`, `destructive`. No icon-only on critical paths (Save, Print). Hover = 2% darker fill, 100ms.
- **Card**: 1px border, no shadow, 8px radius. Used for Recipe / MenuItem / Ingredient panels.
- **Table**: borderless, 12px row padding, hover = `--surface-elevated`. Numerics right-aligned, monospace.
- **Input**: 36px height, 1px border, 6px radius. Focus = 2px `--accent` ring (no glow).
- **Badge**: rectangular (NOT pill), 4px radius, 11px font, 600 weight. Variants: `default`, `success`, `warning`, `danger`, `outline`.
- **Toast**: top-right, 4s dismiss. Single-line. No close button (auto-dismiss only).
- **Dialog/Modal**: 80% viewport on tablet, fade-in 100ms, no scale animation.

Custom components (in `packages/ui-kit/`):

| Component | Description |
|---|---|
| `RecipePicker` | Combobox; recent + search; sub-recipe selection |
| `IngredientPicker` | Combobox with brand+barcode search against OFF mirror; macros preview on hover |
| `SourceOverridePicker` | Table modal: source name / cost / (M3: expiry) |
| `YieldEditor` | Inline number input + AI suggestion popover with citation chip |
| `WasteFactorEditor` | Same pattern as YieldEditor, recipe-level |
| `MacroPanel` | 4-col grid: kcal / carbs / fat / protein; collapsible "show details" for fiber/sugars/salt |
| `AllergenBadge` | Bordered rectangle, icon-left, label-right, never color-alone |
| `DietFlagsPanel` | Horizontal flex of small icon+label badges; only positive flags shown |
| `CostDeltaTable` | Per-component diff table for "What changed?" view |
| `MarginPanel` | 3-row stacked: cost | price | margin% (with vs-target dot indicator) |
| `MenuItemRanker` | Top-5 / bottom-5 list; mobile-optimized |
| `LabelPreview` | A6 paper proxy at 1:1 scale; renders the @react-pdf component live |
| `AgentChatWidget` | Bottom-right docked panel, feature-flag gated; minimizable |

## 5. Spacing

8px base grid. Tokens:

```
xs:  4px   (icon ↔ label gaps)
sm:  8px   (input padding, badge padding)
md:  12px  (card section gap)
lg:  16px  (card padding, button gap)
xl:  24px  (page section gap)
2xl: 32px  (page top/bottom)
3xl: 48px  (rare — only between major sections)
```

No `5xl`+ tokens. Density wins over breath.

## 6. Depth

| Layer | Treatment |
|---|---|
| Background | Flat fill |
| Card | 1px border (`--border`); no shadow |
| Modal/Popover | 1px border + `box-shadow: 0 4px 12px rgba(0,0,0,0.08)` |
| Toast | Same as modal |
| Hover lift | None — only fill darken 2% |

No glassmorphism, no gradients, no neumorphism. Borders carry hierarchy.

## 7. Guidelines

**Do:**
- Right-align numerics in tables.
- Show units inline (`€0.42 / kg` not `€0.42`).
- Surface delete/discard as `destructive` button on the right of action bars.
- Use `--text-muted` for captions and helper text; never `--accent`.
- Inline error messages directly under the offending input — no toast for validation.

**Don't:**
- Use color alone for state (allergens, diet flags, margin status — always icon + text).
- Animate state transitions longer than 150ms.
- Use serif fonts anywhere.
- Show empty-state hero illustrations on data-dense screens; a plain "No results" line is enough.
- Use modal-on-modal patterns; if you need a wizard, use a side panel with steps.

## 8. Responsive patterns

| Breakpoint | Width | Primary persona | Layout strategy |
|---|---|---|---|
| `mobile` | <768px | Owner (J3) | Single column, dashboard-first, large tap targets |
| `tablet` | 768-1279px | Head Chef (J1, J2, J4) | 2-3 column on landscape, density-optimized |
| `desktop` | 1280px+ | Manager / Owner office | 3-col with sidebar; expanded data tables |

Tablet is the **canonical design target**. Mobile and desktop are adaptations. No "mobile-first" because the primary user is on a 10" tablet in landscape.

## 9. Agent prompts (how to describe screens to LLMs)

When an LLM needs to generate a screen consistent with this DESIGN.md, the prompt should include:

```
You are designing a screen for nexandro, a kitchen-operations SaaS.
Visual language: Variant A "Conservative kitchen-functional" — Notion/Linear feel,
high information density, slate palette, Inter sans + JetBrains Mono numerics,
motion <150ms only. Allergen and diet badges always icon + text (never color-only).
Tablet-first (10" landscape, slow Wi-Fi). NO illustrations, NO gradients, NO serifs,
NO celebration animations. Numbers are the protagonist; align right, monospace.
The chef is busy and greasy-handed; tap targets ≥44px; clarity > beauty.
```
