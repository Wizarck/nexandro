---
title: Dashboard — Roundtable v3 (2026-05-18 post-Sprint-1)
status: canonical
last-updated: 2026-05-18
parent: docs/
surface: /owner-dashboard ("Panel del propietario")
device: Desktop 1440x900 + Mobile 375x812
baseline: docs/audit-2026-05-18-v2-detail-01-dashboard.md (v2 = 30%)
spec: docs/ux/j3.md + docs/ux/DESIGN.md §4 (MenuItemRanker, MarginPanel)
sprint-1-prs:
  - PR #204 A1+A2 — Fraunces on h1 globally (applied)
  - PR #207 E-1 — "IA: gasto" demoted from top-nav (applied)
  - A4 density pass — NOT applied to Dashboard
  - A5 EmptyStateCard — NOT applied to Dashboard
trigger: |
  Re-run v2 roundtable post Sprint 1 deploy with persona-tightened lens
  ("more food of context"). Each persona evaluates against §1.1 JTBD verbatim,
  not generic SaaS norms. Owner Roberto's Sunday-night journey is the
  measuring stick: does he get his answer in <60s?
---

# Dashboard — Roundtable v3 (2026-05-18 post-Sprint-1)

## v2→v3 delta (what changed, what didn't)

| Pattern | v2 status | v3 status | Verdict |
|---|---|---|---|
| H1 "Panel del propietario" in serif Fraunces 600 (j3.md §1, DESIGN.md §3) | sans-serif body weight | **serif Fraunces visible** | ✅ partial — typography there, but optical size still reads ~20px not 28px (`--text-2xl`) |
| KPI cards 2-up grid 60/40, MarginPanel as lead | 4 identical rectangles | still 4 identical rectangles, now stacked 2×2 | ❌ unchanged — the BLOCKER #1 of v2 |
| `% MARGEN` + `MARGEN · 7D` carry helper copy (symmetric with Ventas/Coste) | asymmetric (Margen naked, Ventas helper) | **partial fix** — Margen now says "Disponible cuando haya platos con margen calculado" but `% MARGEN` still naked em-dash | ⚠ half-done, asymmetry persists |
| Asymmetric data — "Coste 0,00 €" with three em-dashes | broken-feel | **still there** — Coste shows hard zero, three siblings em-dash | ❌ unchanged — still reads "POS connector died Wednesday" |
| Top-nav grouping + "IA: gasto" removal | 8 tabs incl. IA: gasto | **7 tabs, IA: gasto gone** | ✅ E-1 landed clean |
| "Cola revisión" still in top-nav | present | **still present** | ❌ — E-2 ("hide when count=0") not in Sprint 1 |
| Venue chip / time-window chip / "as-of" timestamp | absent | absent | ❌ unchanged — Owner still cannot tell which restaurant or how stale |
| Severity coding on the dominant number (paprika/sage) | absent | absent | ❌ unchanged — page is monochrome warm-neutral |
| MenuItemRanker bottom-5/top-5 (the actual JTBD answer) | placeholder strip | **still placeholder strip** ("Aún no hay platos para clasificar…") | ❌ unchanged — the persona answer is not on the screen |
| Mobile: 4-screen tower of empty KPIs before reaching ranking | 4-screen tower | **still 4-screen tower** | ❌ unchanged — j3.md §2 ("bottom-5 first") not honoured |
| Empty-state CTA ("Añadir tu primer plato" + demo-data toggle) | single rectangle, no CTA | single rectangle, no CTA | ❌ unchanged — A5 EmptyStateCard not applied here |
| `--accent` (aged turquoise) usage on lead margin top-rule | zero | zero | ❌ unchanged — page still reads as monochrome beige |
| Iconography per KPI card (wayfinding glyph) | zero | zero | ❌ unchanged |
| Tabular-nums on `0,00 €` + em-dashes | unverified | likely applied (digits don't dance visually) | ⚠ inconclusive from screenshot |

**Net delta v2→v3**: 2 of ~14 patterns moved (typography H1 partial + IA cleanup). 12 still red. Most of the v2 BLOCKERS untouched.

## Did Sprint 1 close the v2 BLOCKERS for this surface?

The v2 detail flagged **4 BLOCKERS** for Dashboard:

| v2 BLOCKER | Status | Evidence from v3 screenshot |
|---|---|---|
| **BLOCKER #1** — KPI cards 4 identical rectangles, no Margen lead | ❌ **NOT closed** | Desktop screenshot shows 2×2 grid of visually identical cards. Margen card is bottom-left, same size/weight/border/padding as Coste and Ventas. Zero promotion. |
| **BLOCKER #2** — H1 not in Fraunces serif `--text-2xl` weight 600 | ✅ **partially closed** | "Panel del propietario" now renders in serif (Fraunces visible — the `a` and `P` curves are unmistakable). BUT the optical size reads small (~20px desktop, smaller than DESIGN.md `--text-2xl` = 28px). PR #204 set `font-family` on `h1` globally but did not bump the size to `--text-2xl` weight 600 specifically. Half a fix. |
| **BLOCKER #3** — Empty state is one rectangle with one line, no CTA, no demo-data toggle, no link to onboarding | ❌ **NOT closed** | The bottom strip still says "Aún no hay platos para clasificar. Cuando registres tus primeros platos, verás aquí los 5 con mejor margen y los 5 que necesitan atención." Zero buttons. Zero "Añadir tu primer plato" deep-link. Zero "Ver con datos de ejemplo". A5 EmptyStateCard was scoped out of Sprint 1 for this surface. |
| **MAJOR #4** — No venue chip, no time-window chip, no "as-of" timestamp | ❌ **NOT closed** | Header has page title + subtitle only. No `Palafito · Combined`. No `Últimos 7 días` chip. No `Actualizado hace --`. Owner still cannot answer "which restaurant?" or "is this number stale?". |
| **MAJOR #5** — Mobile is a 4-screen tower of empty KPIs | ❌ **NOT closed** | Mobile screenshot confirms 4 stacked KPI cards above the placeholder strip. Roberto on mobile still scrolls through 4 empty cards to reach the ranking placeholder. j3.md §2 ("read bottom-5 first") not honoured. |

**Score**: 1 of 5 BLOCKERS partially closed (typography H1). 4 of 5 untouched. The IA win (PR #207 demoting "IA: gasto") was a cross-cutting fix not a Dashboard-specific BLOCKER.

## v3 top-5 flags

| # | Flag | Severity | Persona | New vs carried-over |
|---|---|---|---|---|
| 1 | KPI cards remain 4 identical rectangles — Margen still NOT the lead. The Owner's primary number (margen %) sits in the bottom-right with zero visual promotion. j3.md spec for MarginPanel 60/40 promotion unbuilt. | BLOCKER | UX/UI + Owner Roberto + CFO | **Carried-over** from v2 BLOCKER #1 |
| 2 | Page answers ZERO of the §1.1 JTBD even in spirit. The JTBD is "see which dishes lost money this week". The page shows 4 aggregate KPIs and an empty-state line. No dish-level signal whatsoever. The MenuItemRanker (the actual answer) is unbuilt. | BLOCKER | PM + Owner Roberto | **Carried-over** from v2 PM BLOCKER |
| 3 | Asymmetric data display ("Coste 0,00 €" hard zero, three siblings em-dash) reads as broken. v2 flagged this; v3 has not fixed it. In Roberto's eye this is "Coste connector works, the rest is broken" — kills trust before the page renders fully. | BLOCKER | Owner Roberto + Hostelería operator | **Carried-over** from v2 |
| 4 | No venue context, no time window, no last-sync. Roberto cannot answer "which restaurant?" or "is this number fresh?". The "Sunday-night triage in <60s" journey requires these as wayfinding; their absence forces him to ask his head chef on WhatsApp, defeating the page. | BLOCKER | Owner Roberto + Hostelería operator | **Carried-over** from v2 MAJOR #4 — promoted to BLOCKER in v3 because journey-grounded |
| 5 | Mobile (the persona's primary device per §1.1) renders 4 empty KPI cards stacked vertically before the empty ranking strip. On the Sunday-night sofa Roberto scrolls 4 screens and gives up. Mobile-first persona, desktop-tower layout — backwards. | BLOCKER | Owner Roberto | **Carried-over** from v2 MAJOR #5 — promoted to BLOCKER in v3 because mobile is the canonical device |

**Pattern**: every BLOCKER from v2 that was Dashboard-specific is still BLOCKER in v3. Sprint 1 spent its budget on cross-cutting typography (good base) but the Dashboard-specific work didn't land.

## Per-persona verbatim

### 1. Owner Roberto (Sunday 21:30, sofa, mobile)

> I unlock the phone. Pizza in one hand, mobile in the other. I open nexandro. I see "Panel del propietario" in a nice serif — okay, the app remembered it has a brand. Subtitle says "Los 5 platos con mejor y peor margen de los últimos 7 días. Toca una tarjeta para ver el detalle del margen." Good copy, sets the promise.
>
> Then I scroll. **Ventas potenciales · 7D — em-dash.** Okay, no data yet. **Coste · 7D — 0,00 €.** Wait, why does this one have a number and the others don't? Is the cost zero or is it loading? I tap — nothing happens. **Margen · 7D — em-dash.** **% Margen — em-dash.** I scroll past 4 empty cards on my phone. Finally I reach a tan box that says "Aún no hay platos para clasificar". 
>
> So… what do I do? There's no button. No "add your first dish". No "see with sample data". No link to anything. The page is telling me to wait. **But I don't know what I'm waiting for.** Should I call Iker? Should I go to "Auditoría"? What does "Cola revisión" even mean?
>
> **Score against my JTBD: 0/100.** The JTBD says "see at a glance which dishes lost money this week". I see zero dishes. I see four aggregate counters that are empty. The screen doesn't even tell me which restaurant — I run two (Centro + Playa). For all I know this is showing me both summed, or only one, or neither.
>
> **What I expected**: open the app → see one big number ("Margen Centro -3 pp vs sem. pasada") in paprika red → see Pizza Pomodoro at the top of a list with "margin dropped 4 pp" → tap it → "ingredient X cost went up 18%" → forward to Iker on WhatsApp → close phone. **Total: 45 seconds.** What I get: 4 empty boxes and an empty-state line. **Total to decide what to do: I don't decide, I close the app and ask Iker tomorrow morning.**
>
> The serif H1 is nice. Everything else is the same as last week.

**Verdict: surface fails the §1.1 JTBD. Not 30% — closer to 25%. The +5 from typography is offset by the unchanged asymmetric data (Coste 0,00€ vs em-dashes) which actively erodes trust.**

---

### 2. Product Manager

> Sprint 1 brief said "apply Fraunces H1 globally + demote AI obs". That landed. PR #204 + PR #207, both clean. But neither was on the Dashboard-specific BLOCKER path.
>
> Let me re-anchor against the JTBD. **§1.1 verbatim**: "When I open the app on Sunday night, I want to see at a glance which dishes lost money this week, so I can decide what to remove from the menu on Monday."
>
> Four predicates: (1) "at a glance" → ≤5 seconds to value, (2) "which dishes" → dish-granularity, (3) "lost money this week" → 7d window + severity coding for losers, (4) "decide what to remove" → next-action affordance.
>
> What the surface delivers against each:
> - **(1) at a glance**: the H1 is serif now, that helps perception of "something landed". But the value is em-dash. No glance produces value.
> - **(2) which dishes**: ZERO. Surface is 100% aggregate. The MenuItemRanker (the dish-granular component) is unbuilt.
> - **(3) lost money this week**: 7D is in eyebrow labels, but no severity, no losers list, no delta vs last week. The persona thinks in deltas, surface shows absolutes (and the absolutes are em-dashes).
> - **(4) decide what to remove**: no actions anywhere. No "see why" drill-down. No "flag for Monday meeting". No WhatsApp/share affordance.
>
> **4/4 predicates fail.** Sprint 1 moved the typography aesthetic (which is real and matters for brand) but did nothing for the JTBD itself.
>
> **What I'd put in Sprint 2 brief**, ranked by JTBD-impact:
> 1. Ship `MenuItemRanker` with seed/demo data so the empty-state stops being a dead end. Even 5 fake dishes with fake margin deltas would make the page demonstrably answer the JTBD on first contact.
> 2. Promote MarginPanel to lead card (60/40 grid). One sprint, no backend.
> 3. Wire venue chip + time-window chip + last-sync. Owner trust spine.
> 4. Apply A5 EmptyStateCard pattern here (it shipped, just not adopted on this surface).
> 5. Severity coding on the lead margin number (paprika/sage tokens already in DESIGN.md).
>
> One sentence: **Sprint 1 made the page prettier; the page still answers the wrong question.**

**Verdict: 30% → 32%. Typography wins 2 pp. The four JTBD predicates remain at 0.**

---

### 3. UX/UI Designer

> Walking the surface with the j3.md mock and DESIGN.md tokens open in another tab.
>
> **Fraunces wink — visible? Yes, partial.** "Panel del propietario" renders in Fraunces serif. The `P` has the transitional contrast, the `r` has the calligraphic curl. PR #204 landed. But size and weight are wrong: DESIGN.md §3 calls for `--text-2xl` = 28px on H1 with weight 600; the rendered H1 reads ~20-22px and weight ~500. The font swap took, the scale did not. Likely the CSS bumped `font-family` but left `font-size` at the global H1 default. Half a fix — and on a small H1 the Fraunces wink is muted because the optical size axis (`opsz`) is doing its small-text work, which is the *opposite* of the "chalkboard menu" feeling the brand wanted.
>
> **KPI hierarchy fixed? No.** Four identical rectangles in a 2×2 grid on desktop. Margen card is bottom-left — bottom-left is the *worst* slot in F-pattern scanning, the exact opposite of "promote the persona's lead metric". Per DESIGN.md §9 anti-patterns this is `identical card grids` named verbatim as forbidden. v2 flagged it; v3 still has it.
>
> **Helper-copy symmetry**: half-fixed. The Margen card now has helper text ("Disponible cuando haya platos con margen calculado"). The `% MARGEN` card still has no helper copy — just eyebrow + em-dash. The asymmetry that read as "render broke on one card" is now slightly better but still present. A5 EmptyStateCard if applied uniformly would normalise this.
>
> **Severity coding**: zero. Page is one tonal band of warm neutrals. The Margen number (when populated) needs to be the visual climax — in `--ink` weight 600 with a 2px `--accent` top rule per DESIGN.md §4 MarginPanel spec. Currently every digit on the page is the same weight, the same size, the same colour. Wireframe.
>
> **Density**: A4 pass not applied. Card padding looks like `--space-md` (16px) uniformly, where DESIGN.md §5 "Variety required" + j3.md MarginPanel-as-lead call for `--space-xl` on the lead and `--space-md` on the supporting. Same wireframe-feel as v2.
>
> **Iconography**: zero. No lucide/phosphor wayfinding glyph per KPI label. Stripe, Linear, Notion all pair an icon with the metric label for visual scanning. nexandro has the budget (1 icon × 4 KPIs = 4 small SVGs) and the spec (A3 in v2 roundtable). Untouched.
>
> **Tabular-nums**: probably applied (the `0,00 €` doesn't show kerning weirdness against the em-dashes). DESIGN.md §3 requires it on every digit; impossible to verify from screenshot without populated data.
>
> **Border + cream surface**: correct. The `--border` hairline + `--surface` panel are consistent with DESIGN.md §6 (depth from luminance + border, not shadow). The card *primitives* are clean. The *composition* of those primitives into a hierarchy is what's missing.

**Verdict: 30% → 33%. PR #204 typography lands at half scale (font yes, size no). Everything else from v2 still open.**

---

### 4. Visual / Brand Designer

> "Does this feel like nexandro now, or still generic?" — the question Master keeps asking.
>
> **Closer, but not yet.** The serif on "Panel del propietario" is the first real brand cue this page has ever had. Before PR #204 the dashboard looked like every Tailwind starter on a beige background. The Fraunces wink — even at the under-scaled size we ended up shipping — is the difference between "B2B SaaS with cream chrome" and "the trattoria-soul brand". I'll grant Sprint 1 +5pp on the vibe scale just for that.
>
> **But the rest of the visual language is unchanged.**
>
> - **`--accent` usage**: zero. DESIGN.md §2 budgets accent at ≤10% surface area with 4 named uses (CTA, citation hover, focus ring, live-cost top rule). The Dashboard has none of these. The aged-turquoise note that is supposed to be the only cool colour in an otherwise warm field — the thing that makes the brand legible at a glance — is absent. The page is monochrome warm-neutral. It could be a tax form rendered with `bg-amber-50`.
> - **No iconography system**. KPI cards have no glyph anchor. Modern B2B dashboards from Linear to Stripe to Notion pair a 12-16px `--mute` icon with each metric label. nexandro doesn't need decorative iconography but it does need wayfinding. Without it the eye has no scan-anchors.
> - **Card density uniform**. Cards correctly use `--border` 1px and `--surface` (good per DESIGN.md §6). But padding is uniform inside every card — same `--space-lg` everywhere. DESIGN.md §5 says variety is required; uniformity is the wireframe-feel.
> - **No display moment**. j3.md §1 anchors the page identity on the MarginPanel as the visual centrepiece: lead card, wide, 2px `--accent` top rule, margen number in `--text-2xl` weight 600, sage-olive `✓` or paprika `✗`. Today the dashboard has no centrepiece. Just 4 boxes and an empty strip.
> - **Asymmetric data still kills brand polish**. "Coste 0,00 €" next to three em-dash siblings reads as "QA forgot to seed test data". A brand-conscious surface either shows all numbers or all em-dashes — never the mixed state.
>
> **Verdict**: Sprint 1 cracked the door open on identity. The serif H1 is a real brand cue. But the door isn't open yet — accent token, iconography, severity coding, MarginPanel lead, all still unbuilt. The page reads "B2B SaaS with a nice serif H1" not yet "nexandro".

**Verdict: 30% → 35%. The H1 serif is the first identity moment. Everything below it is still generic.**

---

### 5. CFO / Accountant

> I'm being asked "is this a defensible margin reading I can take to my finance committee on Monday?". Let me walk it.
>
> - **What's the period?** Eyebrows say "7D". Okay, last 7 days. But — last 7 from when? The screen has no "as-of" timestamp. Is this Sunday 21:30 today, or did the last sync run Thursday at 03:00 and I'm looking at stale numbers? **In finance the moment you can't answer "as of when" the number is non-defensible.** First red flag.
> - **Which entity?** I have to consolidate margin across Centro + Playa for the board pack, but show entity-level margin for my divisional reporting. The page has no venue chip. No way to know if "Coste 0,00 €" is consolidated or single-entity. **Second red flag.**
> - **Currency unit explicit?** Coste shows "€". Good. But no FX context, no per-period base. If the org operates in multi-currency (some Palafito groups do post-Brexit) there's no surface signal for which currency this `€` is. Probably fine for a single-EUR org, but no audit-trail surface.
> - **Margen vs % Margen as separate KPIs**: this is actually correct accounting practice — absolute and ratio are different decisions ("is the bleeding big in EUR" vs "is the ratio off-target"). I like that they're split. But they should be paired side-by-side as twin lead metrics, not buried at bottom-left/bottom-right of a 2×2 grid. The most important number for an Owner-level audience is **margen %**. Today it's the lowest-priority visual slot on the page.
> - **Delta vs prior period absent**. Finance reads everything as a delta. "Margen 32%" is meaningless without "vs 36% last week, vs 35% trailing 4-week avg". The page shows 0 deltas. The j3.md spec calls for delta-pp in the MarginPanel. Today: nothing.
> - **No trend strip**. Even a 7-day sparkline would let me eyeball "deteriorating" vs "stable". Today: 4 numbers (3 of which are em-dashes), zero historical context.
> - **No source / connector status**. "Where do these numbers come from?" → POS connector? Manual entry? AI-extracted from photos? The Hostelería operator persona in v2 flagged this and finance flags it harder — for a defensible reading I need provenance. The new Foto-ingestión surface implies AI-extracted; without a chip telling me "Sales: POS connector (last sync 12 min)" + "Cost: AI from photos (87% confidence)" I cannot sign off the number.
>
> **Sprint 1 changes specific to my concerns**:
> - PR #204 (Fraunces): brand fluff, zero finance impact.
> - PR #207 ("IA: gasto" removed from top-nav): mildly positive (less dev-noise) but the AI spend signal was relevant — I want to know if AI cost is eating margin. Demoting it to Settings → Avanzado means I'll never see it. **This concerns me; finance needs to see total cost-of-goods including AI extraction cost.**
>
> **Defensibility score**: cannot sign off. Numbers might be right when populated, but the surface gives me zero of the trust spine (as-of, venue, currency, provenance, delta, trend). I would take this to the board pack only as a screenshot caption with footnotes I write myself. **The page is not yet finance-grade.**

**Verdict: 30% → 30%. Sprint 1 was orthogonal to finance defensibility. The trust spine (as-of, venue, delta, provenance, trend) is still entirely missing.**

---

## Sprint 2 backlog for this surface

Tagged: [V] visual / [I] info architecture / [F] functional. Sequenced by JTBD-impact per PM lens above.

### Highest JTBD-impact (do first)

- [F] **Ship `MenuItemRanker` with seed/demo data fallback.** This is THE answer to §1.1 JTBD. Even fake 5-winner + 5-loser rows under a "Datos de ejemplo · Conecta tu POS para ver tus platos" banner would make the page demonstrably do its job. Spec: j3.md + DESIGN.md §4 MenuItemRanker. Estimated 1-2 sprints with backend ranking query.
- [V] **Promote MarginPanel to lead card via 2-up grid 60/40.** MarginPanel left (60% desktop, full-width mobile, top of stack), Ventas+Coste right (40%, stacked subordinate). Margen number `--text-2xl` weight 600, 2px `--accent` top rule, delta-pp line below, `✓`/`✗` sage/paprika status. Spec already in DESIGN.md §4 — implementation only.
- [I] **Apply A5 EmptyStateCard to this surface.** Icon + headline + 2-line context + primary CTA "Añadir tu primer plato" (→ /recipes/new) + secondary CTA "Ver con datos de ejemplo" (toggle demo data). Replaces the current "Aún no hay platos para clasificar" single rectangle. Component already shipped in Sprint 1 — adoption only.

### Owner trust spine (do alongside ranker)

- [I] **Sticky header chips per j3.md §1.** Venue chip (`Palafito · Combined` for multi-venue, static label for single-venue, opens bottom-sheet venue switcher). Time-window chip (`Últimos 7 días`, opens 7d/30d/90d/custom).
- [V] **"As-of" strip under H1.** `--mute` `--text-xs`: `Actualizado hace 12 min` populated, or `Sin POS conectado · Conectar` empty-state. **This is the load-bearing trust signal — without it finance + Hostelería personas can't sign off.**
- [V] **Severity coding on the lead margin number.** When populated: `--destructive` paprika if below target, `--success` sage if above, `--ink` warm-charcoal if within band. Tokens already in DESIGN.md §2.
- [I] **Vs-prior-period delta on every KPI.** "Margen 32% (-4 pp vs sem. pasada)". Hostelería operator + CFO personas both flagged. Even em-dash placeholders should reserve the delta line so the layout is stable on populate.

### Polish to close v2 BLOCKERS fully

- [V] **Bump H1 size to `--text-2xl` weight 600** to complete the PR #204 typography fix. Today the font swapped but size+weight defaulted to global H1. One CSS line.
- [V] **Normalise asymmetric data**: `Coste 0,00 €` should render em-dash like its siblings until *all* connectors are seeded. The mixed state ("one number, three em-dashes") reads as broken render.
- [V] **Add helper copy to `% MARGEN` card** to complete the symmetric-helper-copy fix started in v3 ("Disponible cuando haya platos con margen y precio").
- [V] **Wayfinding glyph per KPI card.** 12-16px `--mute` lucide-react icon paired with each label. Wayfinding only, not decorative — DESIGN.md §1 restraint still applies.

### Mobile-first rebuild

- [I] **Drop KPI tower on mobile.** Replace with 1-line summary strip: `Esta semana: 32% margen · -4 pp vs sem. pasada` (or em-dashed empty equivalent). Bottom-5 ranker appears above the fold per j3.md §2. Same data, infinitely better information density on the persona's primary device.
- [I] **Mobile primary tab: Bottom-5 first, Top-5 second.** Persona is in triage mode, not celebration mode. j3.md §2 spec.

### IA cleanup still pending

- [I] **E-2: Hide "Cola revisión" from top-nav when count=0.** Surface as badge on Foto-ingestión + filterable view in Auditoría. v2 backlog item, not landed in Sprint 1.
- [I] **AI-gasto signal in Dashboard.** Per E-1 v2 commitment, surface one "Gasto IA este mes" line inside Dashboard now that the standalone tab is gone. CFO persona flagged this as a concern — demoting AI obs is fine *if* the cost is still visible somewhere relevant.

### Functional (later sprints)

- [F] Wire venue chip to multi-venue switcher (Combined + per-Location).
- [F] Wire time-window chip to actual query (7d / 30d / 90d / custom date-range).
- [F] Drill-down on `MenuItemRanker` row → read-only recipe view with `CostDeltaTable` per j3.md §5.
- [F] "Last sync" backend ping for POS connector status — feeds the "Actualizado hace --" strip.
- [F] Export action (PDF report for gestor / CSV for spreadsheet).

### Out of scope for Dashboard

- Onboarding wizard wiring → Onboarding surface backlog
- Demo-data toggle infra (cross-cutting) → file under shared "demo seed" workstream
- POS connector ingestion → M3+ backlog
- Mobile bottom-tab pattern → cross-surface, native app phase per v2 out-of-scope

---

## Executive summary

**v2 → v3 movement: 30% → 32%.** Sprint 1 shipped two PRs touching this surface (PR #204 Fraunces H1 globally, PR #207 IA-gasto demoted from top-nav). Only #204 is Dashboard-visible, and only partially: the font swap landed but the size+weight defaulted, so the brand wink that was supposed to read at `--text-2xl` 28px weight 600 reads at ~20px instead. The IA demotion was a clean cross-cutting win but orthogonal to the Dashboard JTBD.

**Top-3 remaining BLOCKERS** (all carried-over from v2, all still open):
1. **MarginPanel not promoted to lead** — KPI cards remain 4 identical rectangles. Margen sits bottom-left, the worst F-scan slot. Persona's primary number has the lowest visual rank. DESIGN.md §9 anti-pattern `identical card grids` still present.
2. **MenuItemRanker (the actual JTBD answer) still unbuilt** — page has zero dish-level signal. Roberto's "which dishes lost money this week" cannot be answered by 4 aggregate KPIs. Without a ranker (even on demo data) the surface fails the §1.1 JTBD at 0%.
3. **Trust spine entirely missing** — no venue chip, no time-window chip, no as-of timestamp, no delta vs prior period, no severity coding. Owner can't tell which restaurant / how stale / direction-of-travel. CFO can't sign off without provenance + delta. Hostelería operator can't trust without last-sync.

**Did Sprint 1's typography+IA changes meaningfully move the JTBD needle? No.** PR #204 is a genuine identity unlock — the page no longer looks like a Tailwind starter — but it's a brand win, not a JTBD win. The §1.1 JTBD ("see at a glance which dishes lost money this week") needs dish-granularity and severity, neither shipped. PR #207 is orthogonal. **Sprint 2 must lead with MarginPanel promotion + MenuItemRanker (even on demo data) + the trust spine** to move the needle past 50%. Recommend Sprint 2 brief lock these three as non-negotiable.
