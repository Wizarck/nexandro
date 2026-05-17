# DESIGN.md — Variant D: Neutral baseline (defer brand voice)

> shadcn/ui defaults verbatim. Slate. Inter. Minimal motion. Brand identity emerges in M2.1+ when we have signal from real users about what resonates.

## 1. Principles

1. **Velocity over identity.** MVP ships with shadcn defaults; brand investment waits for tracción signals.
2. **Don't pre-decide brand.** The first customer (Palafito) is already convinced; don't waste cycles seducing pixels.
3. **shadcn baseline = good enough.** It's accessible, performant, and devs know it cold. The cost of "boring" is zero.
4. **Re-skin path always open.** Theme tokens (`--background`, `--accent`, etc.) are CSS variables; M2.1 brand pivot is a token swap, not a refactor.
5. **Voice = neutral, helpful.** Microcopy uses standard shadcn templates. *"This action will create a cycle. Try a different sub-recipe."*

## 2. Colors

**shadcn/ui default palette** ("slate" theme). No customization in M2 MVP.

| Role | Light | Dark | Source |
|---|---|---|---|
| `--background` | `hsl(0 0% 100%)` | `hsl(222.2 84% 4.9%)` | shadcn default |
| `--foreground` | `hsl(222.2 84% 4.9%)` | `hsl(210 40% 98%)` | shadcn default |
| `--card` | `hsl(0 0% 100%)` | `hsl(222.2 84% 4.9%)` | shadcn default |
| `--popover` | `hsl(0 0% 100%)` | `hsl(222.2 84% 4.9%)` | shadcn default |
| `--primary` | `hsl(222.2 47.4% 11.2%)` | `hsl(210 40% 98%)` | shadcn default |
| `--secondary` | `hsl(210 40% 96.1%)` | `hsl(217.2 32.6% 17.5%)` | shadcn default |
| `--muted` | `hsl(210 40% 96.1%)` | `hsl(217.2 32.6% 17.5%)` | shadcn default |
| `--accent` | `hsl(210 40% 96.1%)` | `hsl(217.2 32.6% 17.5%)` | shadcn default |
| `--destructive` | `hsl(0 84.2% 60.2%)` | `hsl(0 62.8% 30.6%)` | shadcn default |
| `--border` | `hsl(214.3 31.8% 91.4%)` | `hsl(217.2 32.6% 17.5%)` | shadcn default |
| `--ring` | `hsl(222.2 84% 4.9%)` | `hsl(212.7 26.8% 83.9%)` | shadcn default |

**Allergen badge** = `--destructive` border + 600 weight + icon — same pattern across variants (NFR Accessibility non-negotiable).

## 3. Typography

```
Heading 1:  Inter 600 / 24px / 1.2 — shadcn default
Heading 2:  Inter 600 / 18px / 1.3
Body:       Inter 400 / 14px / 1.5
Body small: Inter 400 / 12px / 1.5
Numerics:   Inter 500 / 14px / 1.3 (NOT mono — shadcn default)
Code:       JetBrains Mono 400 / 13px / 1.5 (only in code blocks)
```

Inter everywhere (shadcn convention). No mono for numerics in M2 MVP — adopt later if Palafito chefs say "I can't read prices" in feedback.

## 4. Components

**100% shadcn/ui** with zero customization in M2 MVP. Only the Custom-component layer below adds new pieces; primitives are imported as-is from shadcn.

Custom components (in `packages/ui-kit/`):

| Component | Description |
|---|---|
| `RecipePicker` | shadcn `Combobox` + custom result row (recipe name + ingredient count) |
| `IngredientPicker` | shadcn `Combobox` + brand-name suffix + barcode field |
| `SourceOverridePicker` | shadcn `Dialog` + `Table` |
| `YieldEditor` | shadcn `Input` (number) + `Popover` for citation |
| `WasteFactorEditor` | Same pattern as YieldEditor, recipe-level |
| `MacroPanel` | shadcn `Card` + 4-col grid |
| `AllergenBadge` | shadcn `Badge` variant `destructive` + lucide icon |
| `DietFlagsPanel` | shadcn `Badge` variant `outline` + lucide food icons |
| `CostDeltaTable` | shadcn `Table` with custom diff column |
| `MarginPanel` | shadcn `Card` with primary/muted text hierarchy |
| `MenuItemRanker` | shadcn `Card` x2 (top, bottom) |
| `LabelPreview` | iframe of @react-pdf rendered label |
| `AgentChatWidget` | shadcn `Sheet` (right-side drawer), feature-flagged |

## 5. Spacing

shadcn/ui default 4px base scale: `0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64`. Use Tailwind classes verbatim (`p-4`, `gap-6`, `mt-2`).

No custom spacing tokens until brand voice is decided.

## 6. Depth

shadcn defaults:
- Card: 1px border, no shadow
- Popover/Dialog: `shadow-lg` Tailwind utility
- Toast: `shadow-md`

No custom shadows. No glassmorphism, no neumorphism.

## 7. Guidelines

**Do:**
- Use shadcn primitives directly. Don't fork or wrap unless you need new functionality.
- Use Tailwind utilities verbatim. No custom CSS files in M2.
- Use lucide-react icons (shadcn convention).
- Mark this DESIGN.md as **provisional**: any "I want X different" in feedback triggers a brand-voice decision in M2.1.

**Don't:**
- Add custom CSS variables beyond shadcn's set.
- Wrap shadcn components without a clear reason (composition > wrapping).
- Pre-decide brand colors / fonts before M2 ships and feedback comes back.
- Animate beyond shadcn's default transitions.

## 8. Responsive patterns

shadcn/ui default breakpoints (`sm`, `md`, `lg`, `xl`, `2xl`):

| Breakpoint | Width | Primary persona | Layout strategy |
|---|---|---|---|
| `mobile` | <640px | Owner (J3) | Single column, shadcn `Card` stack |
| `tablet` | 640-1023px | Head Chef (J1, J2, J4) | 2-col grid for recipes, 1-col for forms |
| `desktop` | 1024px+ | Office views | 3-col with sidebar (shadcn `Sheet` for navigation) |

Tablet still primary, but adaptations follow shadcn defaults.

## 9. Agent prompts (how to describe screens to LLMs)

```
You are designing a screen for nexandro, a kitchen-operations SaaS.
Visual language: Variant D "Neutral baseline" — shadcn/ui defaults verbatim,
slate palette, Inter sans everywhere, lucide icons. NO custom colors,
NO custom fonts, NO custom motion. Use Tailwind utilities directly
(p-4, gap-6, etc.). Allergen badges always icon + text never color-only
(NFR Accessibility). Tablet-first (10" landscape, slow Wi-Fi).
This is provisional — brand voice will be decided in M2.1+ based on user feedback.
```

---

## ⚠️ Provisional notice

This DESIGN.md is **provisional** by design. The expectation is that after M2 ships and we collect feedback from Palafito (and any external testers), the brand voice fork will be revisited in M2.1 with concrete signal:

- Does the chef find the UI hard to scan? → adopt monospace numerics (Variant A pattern)
- Does the Owner want the dashboard to feel "premium"? → consider Variant B
- Is GitHub adoption soft? → invest in distinctive identity (Variant C)
- Is everyone happy? → keep Variant D

The component skeleton (`packages/ui-kit/`) and theme-token wiring stay stable across pivots; only color/font tokens swap. Pivot cost: low.
