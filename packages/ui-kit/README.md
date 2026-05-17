# `@nexandro/ui-kit` — shared UI components

Tailwind 4 + shadcn primitives + Storybook 8. Design tokens consumed from `docs/ux/DESIGN.md` (OKLCH-canonical per ai-playbook §10).

## Storybook

```bash
# from repo root
npm run storybook --workspace=packages/ui-kit
# opens http://localhost:6006
```

Storybook is published to GitHub Pages on every push to `master`:
**https://wizarck.github.io/nexandro/storybook/**

## File-layout convention

One folder per component:

```
packages/ui-kit/src/components/<ComponentName>/
├── <ComponentName>.tsx           # the component
├── <ComponentName>.stories.tsx   # Storybook stories (≥3 states per ai-playbook §13)
├── <ComponentName>.test.tsx      # Vitest + Testing Library
├── <ComponentName>.types.ts      # public types (re-exported from index.ts)
└── index.ts                      # barrel
```

When implementing a new component for an OpenSpec slice, copy this layout. The `index.ts` barrel must re-export both the component and its types; the top-level `src/index.ts` re-exports from there.

## Design tokens

`src/tokens.css` is the canonical token file. Generated from `docs/ux/DESIGN.md` YAML frontmatter (the OKLCH form is source of truth; hex in the YAML is a derivation snapshot per ai-playbook §11.7).

```css
@import "@nexandro/ui-kit/globals.css";
```

`globals.css` includes `tokens.css` + base resets + `prefers-reduced-motion` honour. Both `apps/web/` and Storybook's `.storybook/preview.ts` import it.

## Components shipped

| Component | Storybook section | Slice |
|---|---|---|
| `AllergenBadge` | Compliance | `m2-ui-foundation` (here) |
| `MarginPanel` | Cost | `m2-ui-foundation` (here) |

Future components ship with their owning OpenSpec slice per ai-playbook §13. See `docs/openspec-slice-module-2.md` rows #5, #6, #9, #10, #11, #13 for the upcoming additions.

## Tailwind 4

`tokens.css` declares OKLCH variables in `:root` and exposes them in the `@theme` block, so Tailwind utilities like `bg-(--color-accent)` and `text-(--color-ink)` resolve to the OKLCH form at runtime.

## Testing

```bash
npm run test --workspace=packages/ui-kit
```

Vitest + Testing Library + jsdom. Each component has ≥10 unit tests covering: render, accessible name, variants, edge cases, screen-reader semantics.

## Related

- `docs/ux/DESIGN.md` — design system (tokens + principles)
- `docs/ux/components.md` — component contracts (per-component data shape, states, behaviour)
- `.ai-playbook/specs/ux-track.md` — the canonical spec this package implements
- `docs/architecture-decisions.md` ADR-020 — Vite + React + Tailwind 4 + Storybook 8 rationale
