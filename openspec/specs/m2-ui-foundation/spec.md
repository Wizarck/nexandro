## ADDED Requirements

### Requirement: Web app shell exists and routes a journey screen

The system SHALL provide an `apps/web/` Vite + React 18 SPA that mounts at `localhost:5173` (dev) and serves the proof-of-concept Owner-dashboard screen at `/poc/owner-dashboard`.

#### Scenario: Dev server starts cleanly
- **WHEN** a developer runs `npm run dev --workspace=apps/web` from a fresh checkout
- **THEN** Vite starts on port 5173, no compile errors are reported, and the browser renders the React shell

#### Scenario: J3 proof-of-concept screen fetches real backend data
- **WHEN** the dev server is running, `apps/api/` is also running, an Organization with at least one active MenuItem exists, and the user navigates to `/poc/owner-dashboard?organizationId=<orgId>`
- **THEN** TanStack Query fires `GET /menu-items?organizationId=<orgId>&isActive=true`, then per-row `GET /menu-items/:id/margin` and `GET /recipes/:id/allergens`, and renders a `<MarginPanel/>` and a list of `<AllergenBadge/>` per row

#### Scenario: Mobile-first layout per Journey 3
- **WHEN** the screen is rendered on a viewport ≤390px wide (mobile)
- **THEN** rows stack vertically, touch targets are ≥48px, and the page renders in <1s on a simulated slow Wi-Fi connection (per PRD M2 §NFR Performance)

### Requirement: packages/ui-kit/ surfaces design tokens from DESIGN.md

The system SHALL provide `packages/ui-kit/src/tokens.css` as the canonical bridge between `docs/ux/DESIGN.md` and runtime CSS — emitting OKLCH-canonical CSS variables that both `apps/web/` and Storybook import.

#### Scenario: Tokens are OKLCH-canonical
- **WHEN** `packages/ui-kit/src/tokens.css` is opened
- **THEN** every colour token in the `:root { ... }` block declares `oklch(...)`, NOT a hex literal (hex appears only as a derivation comment per ai-playbook §10)

#### Scenario: Tailwind 4 @theme block consumes the tokens
- **WHEN** Tailwind 4 compiles a Storybook story or an `apps/web/` page
- **THEN** classes like `bg-(--color-accent)` resolve to the OKLCH value from tokens.css, not to a hex constant

#### Scenario: Updating DESIGN.md regenerates tokens.css
- **WHEN** a token value changes in `docs/ux/DESIGN.md` YAML frontmatter (e.g., `colors.accent` updates) AND the regeneration script runs (per design.md §11.7's "regenerate hex via the conversion formula")
- **THEN** `packages/ui-kit/src/tokens.css` reflects the new OKLCH value as the source of truth, and the YAML hex field is updated as the derivation snapshot

### Requirement: AllergenBadge renders Article 21-compliant allergen markup

The system SHALL provide an `AllergenBadge` component at `packages/ui-kit/src/components/AllergenBadge/AllergenBadge.tsx` that renders an EU 1169/2011 Article 21-compliant allergen indicator: icon + bold text, paired with high-contrast emphasis when `emphasised={true}`.

#### Scenario: Default rendering shows icon + text
- **WHEN** `<AllergenBadge allergen="gluten" />` is rendered
- **THEN** the DOM contains both a Lucide icon and the visible text "gluten" (or its localised equivalent), with bold font weight and accessible name

#### Scenario: Emphasised variant satisfies Article 21
- **WHEN** `<AllergenBadge allergen="milk" emphasised />` is rendered
- **THEN** the badge applies the `--color-allergen-emphasis` token for foreground + a stronger background contrast that achieves WCAG-AA ≥5:1 against the surface, with the text rendered in `font-weight: 700` or higher

#### Scenario: Colour-blind robustness
- **WHEN** the badge is viewed with deuteranopia simulation (red-green colour blindness)
- **THEN** the icon + text remain identifiable as an allergen indicator without relying on colour as the sole differentiator (per NFR Accessibility)

### Requirement: MarginPanel renders MenuItem margin status per ADR-016

The system SHALL provide a `MarginPanel` component at `packages/ui-kit/src/components/MarginPanel/MarginPanel.tsx` that consumes a `MarginReportDto`-shaped prop and renders cost / sellingPrice / margin / status, with status colour ALWAYS paired with a text label per ADR-016.

#### Scenario: On-target margin renders green + "On target" label
- **WHEN** the prop has `status: 'on_target'`, `marginPercent: 0.7`, `targetMargin: 0.6`
- **THEN** the panel renders the `--color-status-on-target` token + the visible text "On target", with the text matching `props.statusLabel` ("On target" by default)

#### Scenario: Below-target margin within 5pp renders amber + "Below target"
- **WHEN** the prop has `status: 'below_target'`, `marginVsTargetPp: -0.02`
- **THEN** the panel renders the `--color-status-below-target` token + the text "Below target"

#### Scenario: At-risk margin (>5pp below target) renders red + "At risk"
- **WHEN** the prop has `status: 'at_risk'`, `marginVsTargetPp: -0.1`
- **THEN** the panel renders the `--color-status-at-risk` token + the text "At risk"

#### Scenario: Unknown status surfaces warning
- **WHEN** the prop has `status: 'unknown'`, `cost: null`, `warnings: ['cost_unresolved: …']`
- **THEN** the panel renders the `--color-status-unknown` token + the text "Cost unknown" + the first warning message visible below

#### Scenario: Loading state shows skeleton
- **WHEN** the data is in flight (TanStack Query `isLoading === true`)
- **THEN** the panel renders a skeleton placeholder of the same dimensions as the loaded panel; `aria-busy="true"` is set on the container

### Requirement: Storybook builds + publishes per ai-playbook §13

The system SHALL run a Storybook 8 build via `@storybook/react-vite` framework, producing a static `storybook-static/` directory that includes every component story; the static build SHALL deploy to GitHub Pages on every merge to `master`.

#### Scenario: PR build uploads artifact
- **WHEN** a pull request is opened against `master` and the Storybook workflow runs
- **THEN** `npm run build-storybook --workspace=packages/ui-kit` succeeds, the static directory is uploaded as a GitHub Actions artifact, but no Pages deploy fires

#### Scenario: master push deploys to Pages
- **WHEN** a commit is pushed to `master` (or a PR is merged to `master`)
- **THEN** the workflow builds Storybook AND deploys to `https://wizarck.github.io/nexandro/storybook/`, with the PR's components visible at the public URL

#### Scenario: a11y violations are reported
- **WHEN** Storybook runs the `@storybook/addon-a11y` checks on a story that violates WCAG-AA (e.g., contrast ratio <4.5:1)
- **THEN** the addon surfaces the violation in the Storybook UI; the build does NOT fail at v0 (warning threshold), but the violation count is printed to the build log for visibility

### Requirement: Slicing artefact reflects the corrective contract

The slicing artefact `docs/openspec-slice-module-2.md` SHALL list `m2-ui-foundation` as row #12 and SHALL list `m2-ui-backfill-wave1` as row #13 (filed, scope in its own proposal). The Track-structure section SHALL acknowledge the prior defer pattern and state explicitly that each remaining M2 slice ships its own UI components per ai-playbook §13.

#### Scenario: Slicing file lists both new rows
- **WHEN** an agent reads `docs/openspec-slice-module-2.md`'s "Approved change list"
- **THEN** rows #12 and #13 are present with their bounded contexts, FRs, journey usage, components, and dependencies populated

#### Scenario: Track-structure paragraph cites retros
- **WHEN** an agent reads the "Track structure" section
- **THEN** a paragraph references `retros/m2-recipes-core.md`, `retros/m2-cost-rollup-and-audit.md`, `retros/m2-menus-margins.md`, `retros/m2-allergens-article-21.md` as the four slices that previously deferred §UI-components — and states that the contract is now corrected.
