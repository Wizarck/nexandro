---
title: UX/UI Roundtable Audit v2 — Onboarding wizard (10/N)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  Master review (v2 audit of PR #200 onboarding skeleton).
  Onboarding did NOT exist in v1 baseline. This is the first impression a
  new Owner has of nexandro — the brand-establishment moment.
method: |
  Playwright screenshots (desktop 1440x900 + iPhone 14 viewport) of /onboarding/negocio
  (step 1 LIVE) and /onboarding/listo (celebration card). Roundtable of 5 personas
  grounded in personas-jtbd.md §3, DESIGN.md, and the v1 baseline audit.
related:
  - docs/personas-jtbd.md (§3 — onboarding spec, 5-step wizard)
  - docs/ux/DESIGN.md
  - docs/audit-2026-05-18-ux-roundtable.md (v1 baseline — said "no onboarding existed")
  - docs/audit-2026-05-18-v2-screenshots/12-onboarding-negocio-desktop.png
  - docs/audit-2026-05-18-v2-screenshots/12-onboarding-negocio-mobile.png
  - docs/audit-2026-05-18-v2-screenshots/13-onboarding-listo-desktop.png
  - docs/audit-2026-05-18-v2-screenshots/13-onboarding-listo-mobile.png
---

# UX/UI Roundtable Audit v2 — Onboarding wizard (10/N)

## Context

PR #200 shipped the first onboarding wizard nexandro has ever had. v1 baseline (`audit-2026-05-18-ux-roundtable.md`) flagged the absence of onboarding as L2-3 in Fase 2. PR #200 closed the structural gap with:

- A 5-step stepper (`Tu negocio` · `Tu primera sede` · `Categorías de ingredientes` · `Tu equipo` · `Primer plato`).
- Step 1 ("Hablemos de tu negocio") wired LIVE: name, language, timezone form.
- Steps 2-5 deliberately left as **honest placeholder stubs** (titles in the stepper, no wired screens behind them).
- A persistent "Saltar por ahora →" link in the top-right of every step.
- `/onboarding/listo` celebration card with three quick-action tiles ("Ver el dashboard", "Registrar una lectura HACCP", "Configurar etiquetas") + "Ir al dashboard →" CTA.

The question this audit answers: **does this shipped slice establish brand and deliver enough Owner value to ship as MVP today, or should it stay behind a flag until steps 2-5 are real?**

---

## Roundtable findings

### 1. First-run Owner Roberto (Persona: "El Dueño" — low tech, mobile-primary, 5-min patience)

Roberto just signed up after a friend told him nexandro replaces the Excel he's been emailing his accountant. He clicks the activation link from his iPhone, in his car, between two venue visits.

**What lands well.**
- The 30-second promise ("Aprox. 30 segundos.") is honest and respectful of his time.
- "Hablemos de tu negocio" is conversational — the right register for a first encounter.
- Three fields only (name, language, timezone) — no password, no plan picker, no card capture. The friction floor is low.
- Defaults are sensible (`Español`, `Europe/Madrid`).

**What breaks the spell.**
- The stepper says **5 pasos** at the top. He can read steps 2-5 in the stepper (`Tu primera sede` · `Categorías de ingredientes` · `Tu equipo` · `Primer plato`) and mentally budgets for them. When step 1 advances and steps 2-5 are empty stubs, he loses trust — he was promised 5 steps, he got 1.
- "Saltar por ahora" sits on every step in the top-right. Roberto, who's running between venues, will tap it on step 1 just to look around. Once he's at the dashboard, he never comes back.
- The wizard never explains *what nexandro is*. He came from "replace my Excel" and gets a form asking for his timezone. There's no value framing ("In 30 seconds you'll see what your worst dish costs you per portion") to keep him invested.
- `Nexandro Demo` is pre-filled as the org name. He doesn't know if he should erase it or if the system will rename itself. (Demo data leak, classic v1 pattern carried forward.)
- The celebration card on `/onboarding/listo` says "🍷 Listo." with a wine-glass emoji. Roberto runs a tapas bar; the emoji is generic. The three tiles he sees there ("Ver el dashboard", "Registrar una lectura HACCP", "Configurar etiquetas") are the operational menu — but no dish has been added, no recipe exists, no team is invited, no sede is created. The "Ver el dashboard" tile will land him on an empty dashboard (he saw it in the v1 audit screenshots).

**Persona verdict.** **Does step 1 hook him? No.** It collects the bare-minimum tenant-config data the backend needs, but it never delivers the "AHA" personas-jtbd.md §3 promised — "see live cost per portion". He'll skip or bounce. The wizard, as shipped, is a tax on the Owner, not a value-handoff.

---

### 2. UX/UI designer (Stripe / Linear / Notion wizard references)

**What the shipped slice gets right (vs zero baseline).**
- A stepper exists. Steps are numbered. Active step is highlighted (turquoise pill). That alone is +1 vs v1.
- The single-card layout with sub-eyebrow "PASO 1 DE 5" matches the wizard convention.
- Mobile collapses the stepper to numbered circles only, which is the correct compression.

**Where the wizard deviates from the conventions of the references.**
- **Stripe** never numbers steps the user can't reach. Their onboarding shows the next 2-3 steps inferred from prior answers; the rest stay invisible until earned. Here, steps 2-5 are visible but unreachable, which reads as "we built half a thing".
- **Linear** doesn't ship a multi-step wizard at all — they ship a single "Create your first issue in 30 seconds" deferred-config flow with sane defaults applied silently. The 5-step stepper here adds ceremony before value.
- **Notion** uses the wizard as a *brand surface* — illustrations, motion, sample-template picker, "what brought you here today?" segmentation. Here the wizard is a config form with no brand surface.
- The card uses `--surface` on `--bg` cream — fine — but there's no horizontal rule, no live-cost preview, no "what you'll see next" teaser. The Pulcinella palette is present (turquoise active pill, cream canvas) but the wizard does not exercise it. There's no Fraunces serif anywhere (DESIGN.md §3 reserves Fraunces for recipe titles — but this is the H1 of the entire product. "Hablemos de tu negocio" set in Fraunces would land as the only display-serif moment in the product and would establish brand instantly).
- **Stepper interactivity.** The 5 step pills are visually buttons but in the screenshots none of them appear pressed or hoverable when ahead of cursor. If they aren't keyboard-focusable + don't show focus rings, this fails DESIGN.md §4 "component states (universal)" — items 3 and 4.
- **The form has no inline validation, no character counter on the name field, no "next available" affordance.** Tab order, Enter-to-advance, and error states are likely missing (impossible to verify from a static screenshot, but the v1 baseline pattern is "form ships without states").
- The "Saltar por ahora" link uses an arrow glyph but isn't visually a destructive action — it's the **highest-stakes choice on this screen** (it ends onboarding) and is styled as the lowest-priority element. That's inverted hierarchy.

**Persona verdict.** **Structurally a stepper; spiritually a form.** The wizard pattern is misused — it's adding ceremony without earning it. The reference brands either skip the wizard (Linear) or make it a brand surface (Notion). This slice does neither.

---

### 3. PM (personas-jtbd.md §3 coverage)

personas-jtbd.md §3 specifies the 5-step wizard:

| Step | Spec | Shipped |
|---|---|---|
| 1 | Create Organization (name, **currency immutable**, language, timezone) | Name ✅ · Language ✅ · Timezone ✅ · **Currency missing** |
| 2 | Create First Location (name, address, type) | Stub only |
| 3 | Choose Category Taxonomy (default · empty · CSV import) | Stub only |
| 4 | Create Admin User (name, email, password — auto-OWNER) | Stub only |
| 5 | Quick Win — First Ingredient + supplier + price → "cost per gram" + celebration | Stub only — and replaced by 3 quick-action tiles in `/onboarding/listo` |

**The currency gap is a BLOCKER, not a polish issue.** personas-jtbd.md §3 marks currency as **"set once, immutable"**. The wizard ships without capturing it. Either the system silently defaults to EUR (which is acceptable for the EU-only Phase 1 brand lock per memory `project_nexandro_eu_only`) **and the screen has to say so**, or it's deferred to Settings, where Owner has to find it before printing the first invoice. Either way, the absence is undocumented in the UI.

**The "Quick Win" loss is the strategic miss.** §3 step 5 is the *whole point* of the wizard — "add 1 ingredient + 1 supplier + 1 price → see auto-calculated cost per gram immediately". That is the AHA moment the spec was designed around. The shipped wizard replaces it with three navigation tiles to features the Owner cannot yet use (no ingredients exist → dashboard is empty; no HACCP setup → reading goes nowhere; no logo uploaded → label config is a chore, not a win). The wizard ends *before* value is delivered.

**Is "honest stub" defensible?** Partially. It's better than fake-functional UI that breaks under interaction. But the stubs are visible in the stepper, which sets the expectation that they'll be reached. **Honest stub is only honest if the user is told they're stubs** — currently the stepper says "5 pasos" and steps 2-5 carry real-looking labels. From the Owner's seat, that's a half-built product, not an MVP.

**Persona verdict.** **Spec coverage 1/5 ✅, 0/5 stubbed honestly with currency leak.** PM cannot ship this as MVP without (a) telling the Owner step 1 *is* the MVP today, (b) capturing currency, and (c) deferring the "Quick Win" step to a follow-up rather than parking it as a stub.

---

### 4. Visual / brand designer (does this feel like nexandro)

**Brand surface budget on screen.**
- Wordmark `nexandro · primera configuración` in the top-left — sentence-case, no logo lockup, no display weight. Reads as a temp header, not a brand mark.
- The Pulcinella palette is present (cream `--bg`, oat `--surface`, turquoise `--accent` on active step + CTA). That's the minimum.
- Fraunces is **absent** from this surface despite "Hablemos de tu negocio" being a perfect display-serif moment (DESIGN.md §3 limits Fraunces to recipe H1s — but the wizard is the *one* place where brand voice should override surface convention). The headline is set in system sans, which makes it indistinguishable from a Google Forms questionnaire.
- No iconography beyond a single wine-glass emoji on `/onboarding/listo` — and per DESIGN.md §1.1 ("No emoji icons") this is a direct violation. Plus per memory `feedback_oklch_canonical`, the visual identity is precise; emojis are font-rendered and vary by OS.
- The quick-action tiles on `/onboarding/listo` use emoji thumbnails (📊 bar chart, 🌡️ thermometer, 🏷️ tag) — same violation, three more times.
- The celebration card has no motion. DESIGN.md §7 forbids confetti, but a 300 ms surface fade-in + serif-headline reveal would be brand-establishing without violating the no-celebration rule.
- The wine-glass emoji also leaks **HORECA-only positioning**. Per memory `project_nexandro_multisector_repositioning`, nexandro is multi-sector ERP (obrador, viñedos, olivos, peluquería, estética). A wine glass tells a peluquería owner this is not for them. Wrong icon for the brand bet.
- The "Saltar por ahora" link sits on `--bg` cream with no underline and no contrast adjustment. It reads as decoration, not interaction.

**Where the wizard could establish brand in three small moves.**
- Set the headline "Hablemos de tu negocio" in Fraunces 28-32 px, weight 500. One display-serif moment per screen, claimed.
- Replace the wine-glass emoji with a 32 px geometric SVG mark — a single accent-turquoise stroke that becomes the nexandro recognition glyph.
- Add a sentence under the headline that names the AHA: "En 30 segundos verás cuánto te cuesta tu plato más vendido". That single sentence carries the brand promise the wordmark doesn't.

**Persona verdict.** **The wizard renders nexandro tokens but does not establish nexandro brand.** The screen could be any open-source admin tool — it doesn't earn the brand registration (memory `project_nexandro_brand`). Three small additions (serif headline, SVG mark, AHA sentence) would close the gap without violating restraint.

---

### 5. Conversion specialist / growth (drop-off risk)

**What the wizard does well from a growth lens.**
- Single-field-per-row layout on mobile — high completion rates.
- Pre-filled defaults — reduces "I don't know what to put" abandonment.
- Honest 30-second time promise — sets expectation, reduces "how long will this take" anxiety.

**Where drop-off risk is acute.**
- **"Saltar por ahora" on every step in the top-right is a leak.** Onboarding wizards either (a) hide the skip link until the user has tried one step, (b) bury it in a confirmation modal ("Are you sure? You'll see an empty dashboard"), or (c) replace it with a deferred "Continue later" that persists progress. The shipped pattern offers the easiest exit on the easiest screen — the worst possible combination. Roberto will tap it.
- **The stepper itself is a drop-off engine.** Five steps visible upfront primes the user for a long flow. Stripe's research (publicly reported across their 2022-2024 onboarding redesigns) showed perceived-effort scales with the number of visible steps, not actual effort. A 1-step "Tell us about your business" with hidden follow-ups would convert better.
- **No value preview between step 1 and step 2.** Even if steps 2-5 were real, the wizard has no "you're about to unlock X" framing between steps. The shipped variant doesn't even have steps 2-5, so the user advances from a form to a celebration card with nothing in between. That's a value void.
- **`/onboarding/listo` ends with "Ir al dashboard →"** — a navigation CTA, not an action CTA. Compare to: "Crear tu primer plato (2 min)" or "Subir tu menú actual (foto)". A navigation CTA hands the user to an empty dashboard, where the conversion funnel terminates.
- **No "Invite your Head Chef" or "Add your accountant"** — both are personas-jtbd.md primary roles. Adding a second user is the strongest retention signal in B2B SaaS (Slack, Notion, Linear all hook on it). The wizard never asks.
- **No email confirmation step, no "we sent you a copy of your config".** The Owner has no anchor to come back to the product 24h later. Drop-off at day 1 is unmeasured (no value-delivered event fires).

**Drop-off risk estimate.** With "Saltar por ahora" visible from screen 1 and the AHA deferred to never, expected step-1-to-activation conversion is **<20%** for low-tech mobile-primary Owners. That's the population this product targets per memory `project_nexandro_lighthouse_network` (obrador + viñedos + olivos owners) and per personas-jtbd.md §1.1.

**Persona verdict.** **The wizard is engineered to lose Roberto.** "Saltar por ahora" + deferred AHA + empty dashboard at the end is a 3-stage funnel where every stage leaks. Either ship the wizard with the funnel closed (hide skip, deliver value, capture a second commitment) or don't ship the wizard yet — the current state is worse than no wizard, because it sets an expectation it doesn't meet.

---

## Top-5 flags

Severity legend: **BLOCKER** (cannot ship) · **MAJOR** (must close before "MVP done") · **MINOR** (polish).

| # | Flag | Severity | Tag |
|---|---|---|---|
| 1 | **Steps 2-5 are visible in the stepper but unreachable**, breaking the "5 pasos" promise. Owner perceives a half-built product, not an MVP. | **BLOCKER** | [F] |
| 2 | **AHA moment from personas-jtbd.md §3 step 5 is missing.** Wizard ends without delivering "cost per gram" — the entire reason the wizard exists per spec. Replaced by 3 nav tiles to empty surfaces. | **BLOCKER** | [F] |
| 3 | **Currency capture missing** despite personas-jtbd.md §3 marking it "set once, immutable". Silent EUR default leaks to invoices/labels with no Owner consent. | **BLOCKER** | [F] |
| 4 | **"Saltar por ahora" is the highest-stakes choice on every screen** (ends onboarding), styled as the lowest-priority element. Hierarchy inverted; drop-off leak. | **BLOCKER** | [V][I] |
| 5 | **No brand surface** — system sans headline, wine-glass emoji (DESIGN.md §1.1 violation + HORECA-only signal vs multi-sector positioning), no Fraunces moment, no AHA sentence. First impression doesn't establish nexandro. | MAJOR | [V] |

Additional MAJOR/MINOR flags (not in top-5 but tracked):

- 6. `Nexandro Demo` pre-fill in the name field is demo-data leak (v1 pattern carried forward). MAJOR [F].
- 7. Emoji icons on `/onboarding/listo` tiles (📊 🌡️ 🏷️) violate DESIGN.md §1.1. MAJOR [V].
- 8. No second-user invite step despite "Invite your Head Chef" being explicit in personas-jtbd.md §3 closing list. MAJOR [F].
- 9. Stepper pills lack visible focus rings / keyboard interactivity (DESIGN.md §4 component states). MAJOR [V].
- 10. `/onboarding/listo` CTA "Ir al dashboard →" is a navigation CTA, not an action CTA — hands the user to an empty dashboard. MAJOR [F].
- 11. No "what is nexandro" or value framing on step 1 — Owner gets a config form with no context. MAJOR [V].
- 12. No inline validation visible on the name field; no character counter; tab/Enter behaviour unverifiable from screenshots. MINOR [I].
- 13. "Hablemos de tu negocio" headline is set in system sans where Fraunces would land as the brand-establishing display-serif moment (one of the few places DESIGN.md §3 anti-reflex should bend for brand). MINOR [V].

---

## Suggested changes

Tagged **[V]** visual, **[I]** interaction, **[F]** functional.

### Immediate (must land before declaring "MVP done")

- **C1 [F][V]** Remove steps 2-5 from the stepper for now. Replace with a single-card "Tell us about your business" flow + a clear "More setup options →" link to Settings after onboarding. The stepper returns when steps 2-5 ship for real.
- **C2 [F]** Add currency picker to step 1 (EUR default for Phase 1 EU lock, with `MXN/USD/GBP/PEN/CLP` available). Mark as immutable in the help text per personas-jtbd.md §3.
- **C3 [F]** Replace `/onboarding/listo` celebration with the **personas-jtbd.md §3 step 5 quick-win flow**: guided "add your first ingredient (e.g. tomate 1.20 €/kg)" → live cost-per-gram reveal → "this is what nexandro will tell you about every plato". That is the AHA. Ship this before declaring the wizard done.
- **C4 [V][I]** Demote "Saltar por ahora" to a `--mute` text-button inside the card footer, paired with copy "Configurar más tarde". If skip is tapped, show a 1-line confirmation toast ("Puedes completar la configuración desde Ajustes en cualquier momento"). Never let skip be the easiest action on the screen.
- **C5 [V][F]** Remove all emoji icons (DESIGN.md §1.1). Replace `/onboarding/listo` wine glass with a 32 px SVG nexandro mark (one accent-turquoise stroke). Replace tile emojis with geometric SVG icons (bar chart, thermometer, tag — all line-art).

### Brand-establishment (small surface, high return)

- **C6 [V]** Set "Hablemos de tu negocio" in Fraunces 28 px, weight 500. Document the exception in DESIGN.md §3 ("display-serif allowed on first-run wizard headline + recipe H1, nowhere else").
- **C7 [V]** Add a single sentence under the headline: "En 30 segundos verás cuánto te cuesta tu plato más vendido." (or sector-aware variant if step 0 captures sector).
- **C8 [V]** Subtle 300 ms surface fade-in on `/onboarding/listo` card mount. Respects `prefers-reduced-motion`. No confetti.
- **C9 [F]** Replace org-name pre-fill `Nexandro Demo` with empty + placeholder text "Ej. Trattoria Palafito".

### Should land soon (next sprint)

- **C10 [F]** Add step 2 "¿Para qué negocio?" sector picker (HORECA · Obrador · Viñedo · Olivar · Estética · Otros). Sector picks downstream seed data (CCPs, default ingredient categories, label template). Per memory `project_nexandro_multisector_repositioning`.
- **C11 [F]** Add step 3 "Invita a tu equipo" — at least the email field for Head Chef / accountant. Even if invite delivery is async, capturing intent is the retention signal.
- **C12 [V][I]** Stepper pills become keyboard-focusable with 3 px `--accent` focus ring per DESIGN.md §4. Completed steps remain clickable to allow back-navigation.
- **C13 [F]** Email digest at T+24h: "You completed onboarding yesterday. Here's how to add your first ingredient (90 seconds)." Captures the day-1 retention signal the current flow loses.

### Stretch (after MVP closure)

- **C14 [V][I]** Inspiration from Notion's "what brought you here today?" segmentation — step 0 (before name) asks "¿Qué te trae a nexandro?" with sector tiles. Personalises the rest of the wizard + AHA copy.
- **C15 [F]** Demo-data toggle on `/onboarding/listo`: "Ver con datos de ejemplo" — populates a sample restaurant so the empty dashboard becomes a populated dashboard the Owner can play with. Mirrors v1 audit recommendation L2-4.
- **C16 [V]** `--accent` 2 px top rule on the step card to match DESIGN.md §2 live-cost rule convention. Quiet brand cue carried into the wizard.

---

## Steps 2-5 stub strategy

Three options, ranked.

### Option A — Hide steps 2-5 until they ship (RECOMMENDED)

Remove the stepper entirely for now. Ship step 1 as a standalone single-card "Tell us about your business" form + a clear "More setup options →" link to Settings. When step 2 (Sede), step 3 (Taxonomy), step 4 (Team), step 5 (First Ingredient) actually exist, restore the stepper.

- **Pro:** No half-built signal. Owner doesn't perceive missing functionality because there's no promise to break.
- **Pro:** Lets us ship the AHA via the post-step-1 quick-win flow (C3) immediately without waiting for sede/taxonomy backend.
- **Pro:** Aligns with Stripe / Linear conventions — single-screen onboarding with deferred config is the modern default.
- **Con:** Loses the "5 pasos completos" milestone framing — but that framing isn't earning anything today.
- **Con:** Requires a slight settings-page polish so "More setup options →" lands somewhere reasonable.

### Option B — Keep honest stubs but label them clearly

Keep the 5-step stepper but mark steps 2-5 with a visible "Próximamente" badge or muted opacity + "Esta sección estará disponible pronto". Step 1 advances to `/onboarding/listo` immediately.

- **Pro:** Communicates the roadmap; signals investment.
- **Pro:** Cheap to ship — only a stepper-pill style change.
- **Con:** Still reads as half-built. "Próximamente" on first-impression product is a trust-debit.
- **Con:** Doesn't solve the AHA gap.

### Option C — Invest in interactive teasers for steps 2-5

Each step renders a screenshot + "this is what you'll be able to do here next sprint" + an email signup ("notify me when this is ready"). Full interactive flow stays gated.

- **Pro:** Maintains the 5-step ceremony.
- **Pro:** Doubles as product marketing — captures intent across all 5 verticals.
- **Con:** Most expensive option, and the screenshots will be wrong by the time the real surfaces ship.
- **Con:** Reads as marketing in the middle of a setup flow — context mismatch.

**Recommendation: Option A.** Ship step 1 standalone, deliver AHA via quick-win flow, restore the stepper when steps 2-5 are real. This treats the onboarding wizard as a *brand surface* (where every shipped pixel must earn its place) rather than as a *coverage chart* (where stubs are honest because they label what's missing).

---

## Verdict

**Do not ship as MVP today** in the current state. Ship the **same shipped slice minus the 4 stub steps + with the C3 quick-win AHA flow on `/onboarding/listo`** as MVP. That is a 1-step wizard that delivers the spec promise; it can grow into the 5-step wizard when steps 2-5 are real.

The biggest brand-establishment opportunity missed is **the headline + AHA sentence + serif moment** (C6 + C7) — three lines of code that would turn the wizard from a Google Forms questionnaire into the first nexandro surface that *says nexandro*. The wine-glass emoji is the cherry on top: it leaks HORECA-only positioning into a multi-sector product, and violates DESIGN.md §1.1, in the very first frame a new Owner sees.
