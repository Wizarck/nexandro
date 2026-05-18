---
title: Dashboard — Roundtable v2 (2026-05-18)
status: canonical
last-updated: 2026-05-18
parent: docs/
surface: /owner-dashboard ("Panel del propietario")
device: Desktop 1440x900 + Mobile 375x812
baseline: docs/audit-2026-05-18-ux-roundtable.md (v1) + audit-2026-05-18-ux-roundtable-detail.md §1
spec: docs/ux/j3.md + docs/ux/DESIGN.md §4 (MenuItemRanker, MarginPanel)
trigger: |
  Master verbatim — "has mejorado mucho pero estas como al 30% de lo que espero
  antes estabas al 10%". Surface is functional (Spanish, grouped nav, KPI cards,
  empty-state copy) but still feels like a wireframe — no hierarchy, no severity,
  no display typography, vast vertical emptiness.
method: |
  5-persona roundtable (UX/UI · PM · Owner Roberto · Hosteleria operator · Brand
  specialist) reading the two v2 screenshots against j3.md mock + DESIGN.md
  tokens + the v1 audit's deferred flags.
---

# Dashboard — Roundtable v2 (2026-05-18)

## What shipped vs v1 baseline

v1 had a single "Add MenuItems" English placeholder on a flat 8-tab nav. v2 ships in Spanish ("Panel del propietario" + nav grouped into Auditoria / HACCP / Expediente APPCC / Recall / Foto-ingestion / Cola revision / Configuracion / IA: gasto), with 4 KPI cards (Ventas potenciales 7D, Coste 7D, Margen 7D, % Margen) and an empty-state strip below promising the top-5/bottom-5 ranking. **Audit pattern #7 ("vacio vertical masivo") was deferred and is now the dominant feel** — below the KPI strip ~75% of the desktop viewport is cream wall. KPI cards are uniformly weighted, render only "0,00 EUR" on one card and an em-dash on three, no severity colour, no display serif on the H1, no `MenuItemRanker` cards, no venue chip, no time-window chip, no "as-of" stamp, no next-action affordance.

## Top-5 flags

| # | Flag | Severity | Persona |
|---|---|---|---|
| 1 | KPI cards are 4 identical rectangles with no visual hierarchy — Margen and % Margen should be the lead, not co-equal with Ventas/Coste | BLOCKER | UX/UI + Owner Roberto |
| 2 | Page H1 "Panel del propietario" renders in sans-serif at body-ish size — j3.md explicitly anchors the page identity on `Fraunces` serif `--text-2xl` weight 600, the chalkboard wink that says "this is nexandro, not Salesforce" | BLOCKER | Brand specialist + UX/UI |
| 3 | Empty state is a single cream rectangle with one line of copy — no MenuItemRanker placeholder skeleton, no "Anadir tu primer plato" CTA, no "Ver con datos de ejemplo" demo toggle, no link to onboarding | BLOCKER | PM + Owner Roberto |
| 4 | No venue chip, no time-window chip, no "as-of" timestamp — j3.md §1 makes the sticky header `Palafito - Combined` + `Last 7 days` + page title load-bearing for Owner trust ("did this number refresh? which restaurant am I looking at?") | MAJOR | Owner Roberto + Hosteleria operator |
| 5 | Mobile renders KPI cards in 1-column stack with ~80px per card and zero density — Owner on Sunday-night sofa scrolls 4 screens just to clear empty KPIs before reaching the (also empty) ranking strip; j3.md mandates bottom-5 first, top-5 second, no KPI tower above | MAJOR | Owner Roberto + Hosteleria operator |

## Per-persona verbatim

### UX/UI designer

- **BLOCKER — Flat type hierarchy.** Page is one weight, one family, one size band. `Panel del propietario` should be `--font-serif` `--text-2xl` weight 600 (DESIGN.md §3 scale + j3.md §1). Subtitle should drop one step into `--mute` `--text-sm`. KPI numbers should be `--text-2xl` weight 600 with `tabular-nums` so the eye lands on **value**, not on **label**. Today the label `VENTAS POTENCIALES - 7D` reads heavier than the value (because the value is em-dash) — that is type hierarchy inverted.
- **BLOCKER — Equal-weight 4-card grid is the `identical card grids` anti-pattern.** DESIGN.md §9 lists it by name. Margen and % Margen are the Owner's lead numbers per persona JTBD; Ventas and Coste are supporting. The grid should be 2-up: one wide MarginPanel card (left, 60% width on desktop) carrying margen EUR + margen % + delta vs last week + status check, and a stacked Ventas/Coste pair (right, 40%) at smaller emphasis. Same data, ~3x the legibility.
- **MAJOR — `MARGEN - 7D` and `% MARGEN` cards have no helper copy at all.** Even empty-state, the Margen card should say "Disponible cuando registres tu primer plato con coste y precio" — symmetric with Ventas/Coste which DO carry helper copy. The asymmetry reads as broken render, not designed restraint.
- **MINOR — Eyebrow labels `VENTAS POTENCIALES - 7D` use uppercase tracking on body text.** DESIGN.md §3 anti-reflex allows limited tracking on uppercase eyebrows only, and these qualify, but pairing them with em-dash placeholders (no number) makes the whole card read like a Storybook fixture. Either show a number OR drop the eyebrow.

[Suggested change → DESIGN.md §4 `MarginPanel` is the exact component being asked for here — wide left, smaller siblings right. Already in spec.]

### Product manager

- **BLOCKER — Surface answers zero of the Owner JTBD.** Persona §1.1 + j3.md §Goal: "answer 2 questions in 30 seconds — which dishes are losing margin, which are saving the average". Today the surface answers neither even in the *populated* case, because the only output is 4 aggregate KPIs. Aggregate margen is descriptive ("we made X this week"); the persona wants prescriptive ("Risotto de hongos lost you 13 pp, kill it Monday").
- **MAJOR — Empty state is not a next-action.** "Aun no hay platos para clasificar" is true and useless. The next action is "Anadir tu primer plato" (deep-link to recipe builder) OR "Ver con datos de ejemplo" (demo-data toggle from v1 backlog L2-4). Today the Owner reads the message, has no button, closes the tab.
- **MAJOR — No drill-down promise visible.** j3.md §5 has Roberto tap a row, lands on read-only recipe view with `CostDeltaTable`. The current empty state hints "Toca una tarjeta para ver el detalle del margen" — but the tarjetas it refers to are KPI cards, not MenuItemRanker rows. The user model is wrong: tapping `MARGEN - 7D` should NOT open a drill-down, because the drill-down belongs on the per-dish row.
- **MINOR — Time window is hardcoded `7D` in the eyebrow but there is no chip to change it.** Owner persona reviews end-of-month too (`30d`, `esta semana`, `este mes`). j3.md §6 explicitly designs the time-window chip in the sticky header. Today the only signal of the window is text baked into 4 different labels.

[Suggested change → Wire the empty-state "Anadir tu primer plato" CTA + the demo-data toggle BEFORE shipping the populated ranking, because the empty state will be 90% of new-org sessions.]

### Owner Roberto (multi-venue group CEO, persona §1.1)

- **BLOCKER — No venue context.** Roberto runs Palafito Centro + Palafito Playa. He opens this on the sofa and the first question his brain asks is "which restaurant?". The page does not answer. j3.md §1 puts `Palafito - Combined` as the sticky header chip. Today: nothing. He could be looking at his Madrid sales, his Playa sales, or both summed — there is no way to tell.
- **BLOCKER — On mobile this is a 4-screen-tall column of empty cards.** I scroll, scroll, scroll, scroll, get to the empty-state strip at the bottom, give up. I do not want a tower of KPIs. I want the bottom-5 list first (per my JTBD — *spot the bleed*), then top-5. j3.md spec is exactly that.
- **MAJOR — `0,00 EUR` on Coste with em-dash everywhere else feels broken.** If three of four cards have no data, then `Coste 0,00 EUR` is also no-data — they should be visually consistent (all em-dash with the same helper copy) until the seed exists. Today it looks like "Ventas is broken but Coste is working", which makes me distrust everything.
- **MINOR — "Cola revision" in the nav is not Owner vocabulary.** I get Auditoria, HACCP, Recall, Foto-ingestion, Configuracion. I do not know what a "Cola revision" is. Same with "IA: gasto" — I do not own an LLM, I own a restaurant. (Nav is improved from v1 but the engineer-noun residue is still visible.)

[Suggested change → Mobile-first rebuild: drop the KPI tower entirely on mobile (or fold to a 1-line "Esta semana: -- EUR margen, -- % vs semana pasada"); lead with the Bottom-5 ranking, top-5 second. Desktop keeps the MarginPanel-led header but the ranking is still the spine.]

### Hosteleria operator

- **MAJOR — A real restaurant control panel always shows "last sync" or "as-of".** EU restaurant managers learned to distrust software in 2010-2015 when half the cloud POS systems silently went stale. The Owner needs to see `Actualizado hace 12 min` somewhere on the page. Today: nothing. He cannot tell whether the zeros are "no data yet" or "POS connector died Wednesday".
- **MAJOR — No "compare vs last week" delta.** Every hosteleria dashboard from Toast to Lightspeed to TheFork leads with "vs sem. anterior +X% / -X%". v1 audit backlog item L1-8 named this explicitly. The Owner persona thinks in deltas, not absolutes — "we did 2k this week" is meaningless, "we did 2k, down 18% from last week" is actionable.
- **MAJOR — Severity coding absent.** Real restaurant dashboards code margen below target in paprika/red, on-target in olive/green, neutral in ink. DESIGN.md has the tokens (`--destructive`, `--success`, `--ink`) and j3.md §3 explicitly designs the cue ("the eye lands on the margin number in `--destructive` paprika because that is the cue Roberto trained himself on over 20 years"). Today the surface has zero semantic colour — it could be a tax form.
- **MINOR — `Ventas potenciales` is industry-confusing.** "Potenciales" implies forecast or projection. A restaurant operator would expect either `Ventas` (actual) or `Ventas proyectadas` (forecast). The "potenciales" wording is a leftover from M2 internal terminology (potential revenue if all menu items sold at list price). For Owner persona it should just be `Ventas - 7d`.

[Suggested change → Add a "last sync · POS connector status" strip (token: `--text-xs` `--mute`) immediately below the H1. Even zero-state it should say "Sin POS conectado · Conectar". This is the trust spine of the entire surface.]

### Brand specialist / visual designer

- **BLOCKER — Surface does not look like nexandro.** I look at this and I see Tailwind defaults on a beige background. The j3.md anchor was clear: the H1 in Fraunces serif, the live-cost-style 2px `--accent` top rule on the lead margin number, tabular-nums on every digit, the Pulcinella warmth carried by the cream + the one aged-turquoise note. Today: zero serif, zero accent, zero rule, zero typographic identity. It is **wireframe-grade beige**, indistinguishable from any B2B SaaS dashboard with the colour swapped from white to cream.
- **BLOCKER — Zero use of `--accent`.** DESIGN.md §2 says accent <=10% of surface area and lists 4 valid uses: primary CTA, citation hover, focus ring, live-cost top rule. The dashboard has none of these visible. The page is monochrome warm-neutrals. The accent is what makes the brand legible at a glance; without it the surface fails the "is this nexandro or every other tool" test.
- **MAJOR — No iconography system.** The KPI cards have no icon, no glyph, no visual anchor. Every modern B2B dashboard from Linear to Stripe to Notion pairs a small icon (12-16px, `--mute`) with the metric label so the eye can scan visually. nexandro does not need decorative icons but it does need a wayfinding glyph per metric — coins/EUR for Ventas+Coste, a percent or scale for Margen+%.
- **MINOR — Card borders are right but card density is wrong.** Cards are correctly bordered with `--border` 1px (DESIGN.md §6 — depth from luminance + border, not shadow). But the padding inside is uniform `--space-lg` everywhere, which produces the "wireframe" feel — no variety per DESIGN.md §5 "Variety required". The lead Margen card wants `--space-xl`, the sibling cards `--space-md`.

[Suggested change → Apply the j3.md typographic identity NOW: H1 in serif `--text-2xl`, 2px `--accent` top rule on the lead Margen card, `tabular-nums` on every digit (even the em-dashes). One sprint of typography wins back 80% of the "doesn't feel like nexandro" gap.]

## Suggested changes (planning, not impl)

Tagged: [V] visual identity / [I] info architecture / [F] functional behaviour.

### Phase A — Visual identity (1 sprint, no backend changes)

- [V] Render H1 `Panel del propietario` in `--font-serif` `--text-2xl` weight 600 with `text-wrap: balance` (DESIGN.md §3, j3.md §1).
- [V] Apply `tabular-nums lining-nums` to every digit + em-dash placeholder on the page (DESIGN.md §3 numerals rule, no exceptions).
- [V] Promote MarginPanel as the lead card: 2-up grid on desktop (60/40), MarginPanel left with 2px `--accent` top rule + `--text-2xl` margen value + delta line + status check (`✓`/`✗` per DESIGN.md §4); Ventas+Coste right as stacked subordinate cards at `--text-lg`.
- [V] Demote eyebrow labels: drop the uppercase + tracking treatment on the sibling cards, or keep but balance with helper copy on all 4 cards (Margen + % Margen cannot stay naked).
- [V] Add `--mute` `--text-xs` "as-of" strip under H1: `Actualizado hace --` (or "Sin POS conectado · Conectar" when no connector). Trust spine.
- [V] Add 1 line of icon-glyph wayfinding per KPI card label (12-16px `--mute`, not decorative — wayfinding only, DESIGN.md §1 restraint still applies).

### Phase B — Info architecture (1 sprint)

- [I] Add sticky header chips per j3.md §1: venue chip (`Palafito · Combined` for multi-venue, static label for single-venue), time-window chip (`Ultimos 7 dias`, opens bottom-sheet 7d/30d/90d/Personalizado).
- [I] Restructure empty state from "single rectangle with one line" to a proper EmptyStateCard: icon + headline ("Aun no hay platos para clasificar") + 2-line context + primary CTA ("Anadir tu primer plato" → /recipes/new) + secondary CTA ("Ver con datos de ejemplo" → demo-data toggle).
- [I] Mobile: collapse KPI tower to 1-line summary strip ("Esta semana: -- EUR margen · -- % vs sem. pasada") so Bottom-5 ranking appears above the fold per j3.md §2 ("Read the bottom 5 first").
- [I] Add menu-engineering quadrant (Star · Plowhorse · Puzzle · Dog) as secondary section below the ranking, hidden on mobile (matches v1 backlog L1-8).
- [I] Replace "Cola revision" + "IA: gasto" nav labels with Owner-shaped equivalents — already on v1 backlog L0-2/L0-3, surfaces here too.

### Phase C — Functional behaviour (2 sprints)

- [F] Wire `MenuItemRanker` component (DESIGN.md §4) below the KPI strip — 5 winner cards + 5 loser cards with thumbnail, units sold, margen EUR, margen %, delta vs last week. Sub-target rows in `--destructive`, above-target in `--success`, within-band in `--ink` per j3.md §3.
- [F] Wire drill-down: tap any ranker row → read-only recipe view with `CostDeltaTable` per j3.md §5. Suppress edit affordances on Owner path (RBAC per persona §2).
- [F] Wire time-window chip to actual query (7d default, 30d / 90d / custom date-range).
- [F] Wire venue chip to multi-venue switcher (Combined + per-Location).
- [F] Add "last sync" backend ping for POS connector status — feeds the "Actualizado hace --" strip from Phase A.
- [F] Add export action (PDF report for gestor / CSV for spreadsheet) per v1 backlog item.

### Out of scope for Dashboard (file separately)

- Onboarding wizard wiring → L2-3
- Demo-data toggle infra → L2-4
- POS connector ingestion → M3 backlog
- Mobile bottom tab-bar pattern → cross-surface, file under Phase 0 (j3.md §Notes mandates it for Owner mobile)
