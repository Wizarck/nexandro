---
title: UX/UI Roundtable Audit v3 — Onboarding wizard (10/N)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  Sprint 1 deploy review (PR #204 A1 Fraunces serif + PR #205 A3 lucide
  iconography on /listo + PR #207 E-4 "pronto" amber pills on stepper
  steps 2-5). v2 baseline scored the surface at 20 % ship-ready. v3
  re-runs the 5-persona roundtable against the same two surfaces
  (/onboarding/negocio step 1 + /onboarding/listo) on desktop 1440x900
  and mobile to measure delta.
method: |
  Playwright screenshots from the 2026-05-18 v3 capture set
  (audit-2026-05-18-v3-screenshots/12-* and 13-*). Roundtable grounded
  in personas-jtbd.md §3, DESIGN.md, and the v2 baseline audit
  (audit-2026-05-18-v2-detail-10-onboarding.md). Same 5 personas, same
  scoring rubric, deltas vs v2 called out explicitly.
related:
  - docs/personas-jtbd.md (§3 — onboarding spec, 5-step wizard)
  - docs/ux/DESIGN.md
  - docs/audit-2026-05-18-v2-detail-10-onboarding.md (v2 baseline — 20 % ship-ready)
  - docs/audit-2026-05-18-v3-screenshots/12-onboarding-negocio-desktop.png
  - docs/audit-2026-05-18-v3-screenshots/12-onboarding-negocio-mobile.png
  - docs/audit-2026-05-18-v3-screenshots/13-onboarding-listo-desktop.png
  - docs/audit-2026-05-18-v3-screenshots/13-onboarding-listo-mobile.png
---

# UX/UI Roundtable Audit v3 — Onboarding wizard (10/N)

## Context

Sprint 1 closed three v2 flags on this surface:

- **PR #204 A1** — Fraunces serif landed on (a) the wizard shell wordmark `nexandro · primera configuración`, (b) step 1 H2 `Hablemos de tu negocio`, (c) `/listo` H2 `Listo. nexandro ya está configurado.`, and (d) the placeholder-step H2. The serif moment v2 said was missing now exists on all four headline slots.
- **PR #205 A3** — The wine-glass emoji that violated DESIGN.md §1.1 and leaked HORECA-only positioning on `/listo` is replaced by a Sparkles glyph in an `--accent-soft` circle. The three QuickAction tiles now use lucide line icons (LineChart for dashboard, Thermometer for HACCP, Tag for etiquetas). The CTA carries an ArrowRight glyph.
- **PR #207 E-4** — Master picked the "honest stub" path. Stepper steps 2-5 now carry amber `PRONTO` pill badges + `opacity-70` + `aria-disabled`. The 5-step layout is preserved but signals the roadmap honestly.

What did not land in Sprint 1:

- AHA quick-win flow (v2 C3) — still deferred.
- Currency picker (v2 C2) — still absent.
- "Saltar por ahora" demotion (v2 C4) — link still sits unstyled in the top-right of every step.
- `Nexandro Demo` org-name pre-fill (v2 C9) — still leaks.
- "Invite Head Chef" capture (v2 C11) — still absent.
- Action-CTA on `/listo` (v2 implied in flag 10) — still "Ir al dashboard →" navigation only.

The question this audit answers: **did Sprint 1's three landed PRs lift the surface past the ship-readiness bar for new self-hosted installs, or is the wizard still gated by the deferred AHA?** And separately: **was Master's pick (E-4 honest stubs, not Option A hide-the-stepper) the right call now that we can see it rendered?**

---

## Roundtable findings

### 1. First-run Owner Roberto (Persona: "El Dueño" — low tech, mobile-primary, 5-min patience)

Roberto installs nexandro for the second time, this time on his iPhone in his car between two venue visits. The serif headline lands first — `nexandro · primera configuración` in Fraunces — and he registers, for the first time, that this is *a product*, not a Google Form. The Fraunces moment on `Hablemos de tu negocio` reads as warmth, not ceremony. v2 said this surface "could be any open-source admin tool"; v3 reads as the first nexandro surface that *says nexandro*. **This is the Sprint 1 win.**

But within 90 seconds the v2 funnel leaks re-open.

**What lands well in v3 (delta vs v2).**
- The serif headline on step 1 + the serif `Listo.` on the celebration card together form a one-product voice. Roberto, who's never met a serif headline in an admin tool, registers it as "this brand cares".
- The amber `PRONTO` pills on steps 2-4 finally tell him the truth — "estos pasos están al caer, pero no aún". v2 silently lied about the 5-step promise; v3 says "we'll get there".
- The Sparkles glyph on `/listo` works as a generic celebration mark — it does not signal HORECA, obrador, viñedo, or peluquería, which is correct for the multi-sector brand bet. Roberto (tapas-bar Owner) doesn't see a wine glass anymore.
- The lucide line icons on the three QuickAction tiles look like product affordances, not emoji decoration. He can tell at a glance that one is "stats", one is "temperature", one is "label".

**What still breaks the spell.**
- **Step 5 is clipped on desktop.** The stepper overflows the card width — `5 Primer plato` is cut off at the right edge of the viewport (the `4 Tu equipo PRONTO` pill is the last fully visible item, with a fragment of step 5 trailing past the container). On mobile, the stepper compresses to five numbered circles **but the `PRONTO` badges disappear entirely** — the honest-roadmap signal that Sprint 1 paid for ships only on desktop. That's an information-loss regression for mobile-primary Roberto, who is the target persona for this surface.
- **"Saltar por ahora →" still floats in the top-right of every step with no styling change.** It is still the easiest action on the screen and still the highest-stakes choice (it ends onboarding). v2 flag 4 untouched. He will still tap it on step 1 just to look around.
- **`Nexandro Demo` pre-fill still occupies the org-name field.** v2 flag 6 untouched. He still doesn't know whether to erase it.
- **No currency capture.** v2 flag 3 untouched. Roberto in Spain is fine with the silent EUR default, but Roberto in Tijuana (if/when Phase 5 LatAm ships) would land on EUR-denominated invoices without consent. Today's EU-only lock makes this a latent BLOCKER, not a live one — but the field is still missing from the form.
- **The AHA is still deferred.** Step 1 advances directly to the `/listo` celebration. The "cost per gram" reveal personas-jtbd.md §3 step 5 was designed around does not happen. The three QuickAction tiles on `/listo` are nav links to empty surfaces — Roberto taps "Ver el dashboard" and lands on the empty dashboard (v1 audit pattern). The wizard ends *before* value is delivered, exactly as v2 flagged. Sprint 1 closed brand flags; it did not close the value flag.
- **The 30-second promise is now accurate (since steps 2-4 are honestly stubbed).** That's a quiet win — but it also exposes how thin the actual flow is. 30 seconds is honest; 30 seconds is also "I gave you my timezone and you gave me three tiles".

**Persona verdict.** **Sprint 1 hooked Roberto's *attention* (serif + Sparkles + line icons land as brand) but did not hook his *commitment*.** He'll complete step 1 because it's 30 seconds; he won't return tomorrow because nothing happened. **v2→v3 movement: 20 % → 45 %.** The brand surface is now nexandro; the funnel is still leaky.

---

### 2. UX/UI designer (Stripe / Linear / Notion wizard references)

**What Sprint 1 got right (vs v2).**
- Fraunces on the H1 is the single biggest visual delta. v2 called it out as the "one place DESIGN.md §3 anti-reflex should bend for brand". Sprint 1 bent it. The wizard no longer reads as a Google Forms questionnaire — it reads as a deliberate display moment, which is what Notion does and Linear opts out of entirely.
- The lucide line icons on `/listo` tiles match the DESIGN.md §1.1 "no emoji icons" rule for the first time. The Sparkles in the `--accent-soft` circle is also the first compositional use of the accent-soft token on this surface (DESIGN.md §2 names it for citation-hover and chip-selected; using it as a celebration-glyph surround is an acceptable extension of the same warm-cool composition rule).
- The `PRONTO` pills are visually well-handled — amber on the muted step pill carries the right semantic weight ("not error, just not yet"). The `opacity-70` + `aria-disabled` combo respects DESIGN.md §4 disabled-state convention. From an a11y lens, the pills are the first place this wizard has tried to encode state semantically.

**Where the wizard still deviates from convention.**
- **Stripe / Linear / Notion all hide the stepper itself when the steps don't earn it.** v2 recommended Option A (hide steps 2-5). Sprint 1 picked Option B (honest stubs with pills). Visually, Option B works in *desktop isolation* — the pills carry the message. But **the stepper still overflows the container on desktop** (step 5 is clipped) and **the PRONTO badges vanish on mobile** (the message is lost on the primary persona's primary device). Option B only works if it works on both surfaces; today it half-works on desktop and not at all on mobile.
- **Stepper interactivity remains unverifiable.** v2 flag 9 (focus rings, keyboard nav) cannot be confirmed from static screenshots; nothing in the Sprint 1 PR descriptions mentions it landed. Likely still missing.
- **`/listo` celebration card has no motion.** v2 C8 (300 ms surface fade-in + serif-reveal) did not land. The card mounts instantly. Notion fades; Stripe slides; Linear cross-fades. Nexandro hard-cuts. Inside the no-confetti budget DESIGN.md §7 allows a 300 ms fade and Sprint 1 didn't take it.
- **The three QuickAction tiles read as flat cards with no hover affordance shown.** They're navigation tiles in a celebration context. The right pattern is one strong primary CTA + two secondary affordances; instead we get three peer tiles + a fourth "Ir al dashboard" CTA below — that's four equal-weight choices on the moment of truth. Stripe / Linear / Notion all reduce to one primary "Try the thing" CTA on the celebration screen.
- **The Sparkles glyph is generic — it could be any AI / celebration surface.** It's correctly not a wine glass, but it's also not a nexandro mark. v2 C5 recommended a 32 px nexandro SVG mark; Sprint 1 substituted Sparkles. Acceptable as a defer; not equivalent to the recommendation.

**Persona verdict.** **The wizard is now structurally a stepper *and* spiritually a stepper** (Sprint 1's win) **but still has two convention breaks: a clipped desktop stepper and a degraded mobile stepper.** The Fraunces + Sparkles + lucide combo lifts the surface from "Google Forms" to "deliberate product"; the overflow + mobile-degraded states drag it back to "needs another sprint". **v2→v3 movement: 20 % → 50 % from a pure-craft lens.**

---

### 3. PM (personas-jtbd.md §3 coverage)

The spec coverage table from v2, re-scored against v3:

| Step | Spec | v2 | v3 |
|---|---|---|---|
| 1 | Create Organization (name, **currency immutable**, language, timezone) | Name ✅ · Language ✅ · Timezone ✅ · **Currency missing** | Same — no movement. Currency still missing. |
| 2 | Create First Location (name, address, type) | Stub only | Stub with `PRONTO` pill on desktop, no pill on mobile. |
| 3 | Choose Category Taxonomy (default · empty · CSV import) | Stub only | Stub with `PRONTO` pill on desktop, no pill on mobile. |
| 4 | Create Admin User (name, email, password — auto-OWNER) | Stub only | Stub with `PRONTO` pill on desktop, no pill on mobile. |
| 5 | Quick Win — First Ingredient → "cost per gram" + celebration | Stub only, replaced by 3 nav tiles on /listo | Same — replaced by 3 nav tiles on /listo. Step 5 *also clipped* on the desktop stepper. |

**The honest-stub pivot (E-4) is the right *signal* but the wrong *vehicle* for mobile.** v2 ranked Option A (hide stepper) > Option B (honest stubs). Master picked Option B. From a pure-PM lens, Option B is defensible *if and only if* the stub badges ship on every viewport. They don't. The mobile stepper degrades to five numbered circles with no `PRONTO` badge — which is **worse than v2** because v2's stepper was at least visually-honest-by-being-empty; v3's mobile stepper looks like five live steps with a working `1` and four non-working numbered circles, with no explanation.

**Currency gap is still a BLOCKER on paper.** Today's EU-only Phase 1 lock makes the silent EUR default operationally safe — but the field's absence is still undocumented in the UI, and any LatAm pilot (memory `project_nexandro_eu_only` says explicitly "NO LatAm", so this is dormant, not active). The PM call: this stays a BLOCKER on the spec checklist until the field exists, but it does not gate ship-to-self-hosted-EU today.

**The "Quick Win" loss is still the strategic miss.** Sprint 1 added brand (Fraunces, Sparkles, line icons) without adding *function*. The AHA moment personas-jtbd.md §3 step 5 designed the wizard around — "add 1 ingredient + 1 supplier + 1 price → see cost per gram immediately" — is still not delivered. The three QuickAction tiles on `/listo` still lead to empty surfaces. v2 said "the wizard ends before value is delivered"; v3 says the same with a prettier ending.

**Is the wizard now honest?** Yes for steps 2-4 on desktop (the `PRONTO` pills say what they need to say). No for step 5 (still labelled `Primer plato` with no badge in the visible portion of the stepper, then clipped). No for mobile (no badges at all). And no for the AHA — there is still no surface that says "your first cost-per-gram lives here, we just haven't built it yet". An honest wizard would say so; this one ships a celebration card before earning it.

**Persona verdict.** **Spec coverage moved from 1/5 ✅ (with silent stubs) to 1/5 ✅ (with honest stubs *on desktop*, degraded stubs on mobile, and a brand surface that earns brand but not function).** The wizard is closer to MVP than v2; it is not MVP. **v2→v3 movement: 20 % → 40 % from a PM-spec-coverage lens.**

---

### 4. Visual / brand designer (does this feel like nexandro)

**Brand surface budget on screen — v3 vs v2.**

- **Fraunces on the wordmark + H1 + /listo H1 = brand established.** This is the single biggest delta on the whole audit. v2 said "the wizard renders nexandro tokens but does not establish nexandro brand"; v3 establishes it. The Fraunces on `Hablemos de tu negocio` is the moment a new Owner thinks "this is a thing someone designed, not a thing someone configured". The serif also appears on the `nexandro · primera configuración` shell header, which means the brand voice carries across the entire wizard, not just one screen.
- **Sparkles in accent-soft circle on /listo = correct multi-sector framing.** The wine-glass leak is closed. Sparkles does not signal HORECA, obrador, viñedo, peluquería, or estética — it signals "something good just happened", which is the correct multi-sector celebration mark. Per memory `project_nexandro_multisector_repositioning`, this surface no longer pre-judges the Owner's vertical. Brand win.
- **Lucide line icons on tiles = DESIGN.md §1.1 compliance.** The emoji violations are closed. The icons are geometric, single-stroke, consistent in weight — they read as a system, not a sticker pack. The ArrowRight on the CTA is a quiet brand cue.

**What is still un-nexandro.**

- **The clipped stepper on desktop is a brand bug, not just a layout bug.** A stepper that overflows its container says "we didn't QA this size". On the first screen a new Owner sees, that is the most expensive impression you can leave. Sprint 1's Fraunces upgrade lifts the surface; the overflow drops it back.
- **The mobile stepper losing PRONTO badges drops the brand voice on the primary device.** v3 desktop says "we're being honest about the roadmap"; v3 mobile says nothing. The brand voice is inconsistent across viewports.
- **No AHA sentence under the headline.** v2 C7 recommended a single line: "En 30 segundos verás cuánto te cuesta tu plato más vendido." Sprint 1 didn't take it. The headline now has serif weight but no functional promise. The sub-copy that exists — "Estos datos aparecen en etiquetas, exportes APPCC y comunicaciones. Puedes cambiarlos después en Configuración → Negocio." — is administrative, not aspirational. The brand voice is "we built this carefully", which is true. The brand voice that's missing is "and we built it so you can see what you're spending in 30 seconds", which is the bet.
- **The three QuickAction tiles read as a generic empty-state grid, not a nexandro recognition moment.** The icons + labels work; the *composition* (three equal-weight cards + a fourth CTA) flattens the celebration. Visually it's correct (line icons, ink+mute hierarchy, no decoration) but emotionally it's "here are some next steps", not "here is what you just unlocked".
- **The Saltar por ahora link is still unstyled in the top-right.** Brand-wise, the highest-stakes choice on the screen still looks like an afterthought. v2 flag 4 untouched.

**Persona verdict.** **The wizard now *feels* like nexandro on first impression.** That sentence was not true in v2 and is true in v3 — Sprint 1 paid the brand-establishment bill. **But the brand is not yet consistent across viewports** (mobile stepper degrades) **and the brand-voice copy is still administrative** (sub-headline reads as legal disclaimer). **v2→v3 movement: 20 % → 60 % from a brand lens.**

---

### 5. Conversion specialist / growth (drop-off risk)

**What Sprint 1 did and did not move on the funnel.**

| v2 funnel leak | v3 status |
|---|---|
| "Saltar por ahora" easiest action on screen 1 | **Unchanged.** Link still in top-right with no demotion, no confirmation toast, no copy change. |
| 5-step stepper primes high perceived effort | **Marginally improved.** `PRONTO` pills on desktop tell the user "you're really only doing step 1 today", which lowers perceived effort. Mobile loses this signal entirely. |
| No value preview between step 1 and step 2 | **Unchanged.** Step 1 still advances directly to `/listo`. |
| `/listo` ends with navigation CTA, not action CTA | **Unchanged.** "Ir al dashboard →" still leads to the empty dashboard. The ArrowRight glyph is brand polish, not funnel repair. |
| No "Invite Head Chef" capture | **Unchanged.** Wizard still never asks for a second user — the strongest B2B retention signal in the SaaS playbook. |
| No T+24h email digest anchor | **Unchanged.** |
| AHA deferred to never | **Unchanged.** No quick-win flow, no live cost-per-gram reveal. |

**The `PRONTO` pill experiment is interesting but mixed.** From a pure-conversion lens, telling the user "steps 2-5 are coming soon" does two contradictory things: (a) lowers perceived effort *today* (good for completion of step 1) and (b) primes the user that the product is incomplete (bad for return-on-day-2). The pill copy "PRONTO" is short, ambiguous, and amber — semantically it reads as "warning", not "roadmap". A label like "PRÓXIMAMENTE" or "EN BREVE" would carry the same information with a friendlier tone; a tooltip on hover saying "Estará disponible en la próxima actualización" would close the trust gap. Sprint 1 shipped the pill but didn't ship the tooltip.

**The mobile stepper regression is a measurable conversion risk.** On the primary persona's primary device, the stepper now shows five numbered circles with the first one active and four greyed out. Without the `PRONTO` badge, the user reads "four broken steps". v2's empty stub at least said `Tu primera sede` next to step 2 — v3 mobile says just `2`. That's strictly worse for mobile completion.

**The "Saltar por ahora" leak is the single biggest unfixed drop-off vector.** Until that link is demoted (v2 C4), every conversion improvement upstream is gated by the easiest-exit problem. Sprint 1 spent budget on brand polish; it did not spend budget on funnel closure.

**The wizard still ends at an empty dashboard.** "Ver el dashboard" → empty dashboard → user closes tab. The QuickAction tiles are visually better than v2 but the destinations are unchanged. The funnel still terminates in a void.

**Drop-off risk estimate (v3).** With "Saltar por ahora" untouched, AHA still deferred, and empty dashboard at the end, expected step-1-to-activation conversion for low-tech mobile-primary Owners moves from v2's <20 % to maybe **25-30 %** — the lift comes from the friendlier first impression (Fraunces + Sparkles reduce the "what is this thing" abandonment), not from any funnel repair. **The funnel is still engineered to lose Roberto.**

**Persona verdict.** **Sprint 1 was a brand sprint, not a funnel sprint.** Every v2 conversion flag is still open. The wizard now *looks* good enough to ship and *converts* about as badly as v2 did. **v2→v3 movement: 20 % → 30 % from a conversion lens.** Until "Saltar por ahora" is demoted and the AHA quick-win flow ships, the wizard remains a tax on the Owner that ends in a void.

---

## Top-5 flags (v3)

Severity legend: **BLOCKER** (cannot ship) · **MAJOR** (must close before "MVP done") · **MINOR** (polish).

| # | Flag | Severity | Tag | Status vs v2 |
|---|---|---|---|---|
| 1 | **AHA moment from personas-jtbd.md §3 step 5 still missing.** Wizard ends without delivering "cost per gram" — the entire reason the wizard exists per spec. Replaced by 3 nav tiles to empty surfaces. | **BLOCKER** | [F] | Unchanged from v2 #2. |
| 2 | **Step 5 clipped on desktop stepper + mobile stepper loses all PRONTO badges.** The honest-stub signal Sprint 1 paid for ships only on desktop and only for steps 2-4. Mobile-primary Roberto sees four broken-looking steps with no explanation. Information-loss regression on the primary device. | **BLOCKER** | [V][I] | NEW in v3 — introduced by E-4 + Fraunces width changes. |
| 3 | **"Saltar por ahora" still the easiest action on every screen** (ends onboarding), styled as the lowest-priority element. Hierarchy inverted; drop-off leak. | **BLOCKER** | [V][I] | Unchanged from v2 #4. |
| 4 | **Currency capture still missing** despite personas-jtbd.md §3 marking it "set once, immutable". Latent BLOCKER — dormant under EU-only Phase 1 lock, live the moment Phase 5 LatAm ships. | **BLOCKER** | [F] | Unchanged from v2 #3. EU-only lock makes it dormant, not closed. |
| 5 | **`/listo` ends with "Ir al dashboard →" navigation CTA leading to empty dashboard.** Funnel terminates in a void. ArrowRight glyph is brand polish, not funnel repair. | MAJOR | [F] | Unchanged from v2 #10. |

Additional MAJOR/MINOR flags (not in top-5 but tracked):

- 6. `Nexandro Demo` org-name pre-fill still leaks (v2 #6 unchanged). MAJOR [F].
- 7. No T+24h email digest, no return anchor for day-1 retention (v2 #13/C13 unchanged). MAJOR [F].
- 8. No second-user invite (v2 #8/C11 unchanged) — strongest B2B retention signal missing. MAJOR [F].
- 9. Stepper pills still lack visible focus rings / keyboard interactivity (v2 #9/C12 unchanged). MAJOR [V][I].
- 10. AHA sentence under headline still missing (v2 C7 unchanged). Sub-headline reads as legal disclaimer ("Estos datos aparecen en etiquetas..."), not as brand voice. MAJOR [V].
- 11. `/listo` celebration card mounts instantly with no 300 ms fade-in (v2 C8 unchanged). MINOR [V].
- 12. `PRONTO` pill copy is ambiguous — reads as "warning" amber rather than "roadmap" amber. A friendlier copy ("PRÓXIMAMENTE" or "EN BREVE") + a tooltip ("Estará disponible en la próxima actualización") would close the trust gap. MINOR [V].
- 13. Three QuickAction tiles + ArrowRight CTA = four equal-weight choices on the celebration moment. Stripe/Linear/Notion reduce to one primary CTA on celebration screens. MINOR [V].

**v2 flags closed by Sprint 1:**

- v2 #5 (no brand surface, system-sans headline, wine-glass emoji): **CLOSED** by PR #204 (Fraunces) + PR #205 (Sparkles + lucide).
- v2 #7 (emoji icons on /listo tiles): **CLOSED** by PR #205 (lucide line icons).
- v2 #13/C6 (Fraunces on H1): **CLOSED** by PR #204.
- v2 #1 (steps 2-5 visible but unreachable, perceived half-built): **PARTIALLY CLOSED** by PR #207 E-4 — closed on desktop via PRONTO pills, *re-opened on mobile* by badge omission (now flag #2 in v3).

---

## Suggested changes (v3)

Tagged **[V]** visual, **[I]** interaction, **[F]** functional. Carry-forward from v2 marked.

### Immediate (must land before declaring "MVP done" for self-hosted EU)

- **D1 [V][I]** **Fix the stepper overflow on desktop + restore PRONTO badges on mobile.** Two sub-fixes: (a) shrink the stepper pills or add horizontal-scroll containment so step 5 is fully visible at 1440x900; (b) show a compact `PRONTO` micro-pill (or a dot indicator + screen-reader text) below the numbered circle on mobile so the honest-roadmap signal carries to the primary device. Without this, E-4's investment is half-shipped.
- **D2 [F]** **Ship the AHA quick-win flow on `/listo`** (v2 C3 carry-forward). Add a single "Crea tu primer ingrediente (2 min) →" affordance above the three navigation tiles. Guided flow: ingredient name + supplier + price → live cost-per-gram reveal in the same card. This is the AHA personas-jtbd.md §3 step 5 was designed around. Until this lands, the wizard ends before value is delivered, full stop.
- **D3 [V][I]** **Demote "Saltar por ahora"** (v2 C4 carry-forward). Move into card footer as `--mute` text-button paired with "Configurar más tarde". On tap, show a 1-line toast: "Puedes completar la configuración desde Ajustes en cualquier momento." Never let skip be the easiest action on the screen.
- **D4 [F]** **Add currency picker to step 1** (v2 C2 carry-forward). EUR default for Phase 1 EU lock, with `MXN/USD/GBP/PEN/CLP` available behind a feature flag for the eventual LatAm phase. Mark as immutable in help text. Dormant BLOCKER becomes closed.
- **D5 [F]** **Remove `Nexandro Demo` pre-fill** (v2 C9 carry-forward). Replace with empty field + placeholder text "Ej. Trattoria Palafito" or sector-aware variant if D8 lands.

### Brand-voice closure (small surface, high return)

- **D6 [V]** **Add AHA sentence under H1** (v2 C7 carry-forward): "En 30 segundos verás cuánto te cuesta tu plato más vendido." Or sector-aware variant. Brand voice currently administrative; this line makes it aspirational.
- **D7 [V]** **300 ms surface fade-in on `/listo` card mount** (v2 C8 carry-forward). Respects `prefers-reduced-motion`. No confetti. The celebration card mounting instantly reads as a hard cut on a moment that deserves a beat.
- **D8 [F]** **Sector picker as step 0 or sub-step** (v2 C10 carry-forward) — HORECA · Obrador · Viñedo · Olivar · Estética · Otros. Sector picks downstream seed data and AHA copy variant. Per memory `project_nexandro_multisector_repositioning`. The wizard cannot stay multi-sector-blind forever.

### Funnel repair (next sprint)

- **D9 [F]** **Replace `/listo` 3-tile + CTA composition with a one-primary-CTA layout.** Primary CTA: "Crear tu primer ingrediente →" (the AHA from D2). Secondary affordances: smaller link-style "Ver dashboard" + "Configurar etiquetas más tarde". Reduces four equal-weight choices to one primary + two demoted secondaries.
- **D10 [F]** **Add "Invita a tu equipo" capture** (v2 C11 carry-forward). At least an email field for Head Chef. Strongest B2B retention signal in the SaaS playbook. Even async invite delivery is acceptable; capturing intent is the signal.
- **D11 [F]** **T+24h email digest** (v2 C13 carry-forward): "You completed onboarding yesterday. Here's how to add your first ingredient (90 seconds)." Captures the day-1 retention signal the current flow loses.
- **D12 [V][I]** **Stepper pills keyboard-focusable with 3 px `--accent` focus ring** (v2 C12 carry-forward). DESIGN.md §4 compliance.
- **D13 [V]** **Tooltip on `PRONTO` pill**: "Disponible en la próxima actualización." Closes the "is this product abandoned" trust gap.

### Stretch (after MVP closure)

- **D14 [V][I]** Notion-style step 0 segmentation: "¿Qué te trae a nexandro?" with sector tiles (v2 C14 carry-forward). Personalises rest of wizard + AHA copy.
- **D15 [F]** "Ver con datos de ejemplo" toggle on `/listo` (v2 C15 carry-forward). Populates sample restaurant so empty dashboard becomes populated dashboard.
- **D16 [V]** `--accent` 2 px top rule on step card to match DESIGN.md §2 live-cost rule convention (v2 C16 carry-forward).

---

## Was Master's E-4 pick the right call?

v2 audit explicitly ranked **Option A (hide stepper, ship 1-step) > Option B (honest stubs with badges)**. Master picked Option B (E-4 — `PRONTO` pills on steps 2-5). Now that v3 is rendered, was that the right call?

**Verdict: defensible but incomplete.** Option B works on desktop and breaks on mobile. The honest-stub signal Sprint 1 paid for ships only at one viewport; the primary persona's primary device degrades to "four broken steps with no explanation". That degradation is *worse* than v2 (which at least carried the stub labels alongside the numbers), not better.

The reason Option A was ranked higher in v2 was specifically to avoid this asymmetry — a 1-step wizard works identically on desktop and mobile because there is no stepper to compress. By keeping the 5-step layout, Option B inherited the "what happens when the viewport doesn't fit 5 steps" problem. Sprint 1 did not solve it.

**Two paths forward:**

1. **Stay with Option B and close the gap** (recommended for sprint speed). Ship D1 (fix overflow + restore mobile badges) + D6 (AHA sentence) + D13 (PRONTO tooltip). With those three, Option B converges with what Option A would have delivered, with the bonus of telling the Owner what's coming. Cost: ~1 day of UX work.

2. **Pivot to Option A for GA launch** (recommended if we want a strictly modern feel). Hide steps 2-5 entirely, ship step 1 as a standalone single-card flow, defer the stepper restoration to when steps 2-5 are real. Cost: ~2 days of UX + minor stepper-component refactor. Pro: matches Stripe/Linear convention exactly; mobile and desktop are identical. Con: loses the "we're building 5 steps" roadmap framing E-4 just paid for.

**My recommendation: stay with Option B for this sprint, close the gap (D1), and revisit the A-vs-B question at GA launch readiness review** when we know whether steps 2-5 are actually 4-8 weeks out or 12-16 weeks out. If 4-8, the stepper is worth keeping (Option B converges fast); if 12-16, hide the stepper (Option A) so the "5 pasos" promise doesn't sit on the landing pad for a full quarter.

The specific question "was E-4 right" — yes, *given* a sprint budget that allowed only one of the v2 options. The downstream cost of E-4 is D1 + D13, which were not estimated when the pick was made. Sprint 1 should not have closed without D1 (the desktop overflow is a regression visible in the first 5 seconds of QA).

---

## Verdict

**Sprint 1 delivered the brand surface that v2 said was missing.** The Fraunces serif, Sparkles glyph, and lucide line icons together turn the wizard from a Google Forms questionnaire into a deliberate product. The visual / brand designer score moves from 20 % to 60 %. That is the largest single-sprint brand delta this audit has scored on any surface.

**Sprint 1 did not deliver the functional surface that v2 said was missing.** The AHA quick-win flow, currency capture, and "Saltar por ahora" demotion are all carry-forward. The funnel is still engineered to lose Roberto, just from a prettier starting frame. The conversion specialist score moves only from 20 % to 30 %.

**Sprint 1 also introduced a regression**: the desktop stepper overflow + mobile PRONTO-badge omission means E-4's honest-stub investment ships at one viewport only. This is the first new BLOCKER created by a v2→v3 closure — and it would not exist if Option A (hide stepper) had been picked.

**Do not ship as MVP today for new self-hosted installs.** The brand surface is ready; the funnel is not. Specifically, the wizard still ends before delivering the value personas-jtbd.md §3 was designed around, and the easiest action on every screen is the one that ends onboarding. Ship the **D1 + D2 + D3 + D5** quartet (fix stepper, ship AHA, demote skip, kill demo pre-fill) before declaring the wizard ready for the first 100 self-hosted lighthouse installs. With those four, the surface converges to ~75 % ship-ready; without them, Sprint 1's brand investment lands on a still-leaky funnel and the lift will not be measurable in week-1 retention.

---

## v3 summary (200 words)

**v2→v3 movement: 20 % → ~45 % weighted across personas** (Owner Roberto 45 %, UX/UI designer 50 %, PM 40 %, brand designer 60 %, conversion specialist 30 %). The brand-establishment investment landed cleanly — Fraunces on the H1, Sparkles in accent-soft, lucide line icons on `/listo` tiles. The wizard now *feels* like nexandro for the first time. That was the single biggest gap in v2 and Sprint 1 closed it.

**Top-3 remaining BLOCKERS:** (1) AHA quick-win flow still deferred — wizard ends before delivering "cost per gram" value, the entire reason §3 step 5 exists; (2) E-4 honest-stub investment ships only on desktop — mobile stepper loses PRONTO badges + step 5 clips on desktop, both information-loss regressions on the primary persona's primary device; (3) "Saltar por ahora" still the easiest action on every screen.

**Ship-ready for new self-hosted installs?** No. Brand surface is ready; funnel is not. Ship D1 + D2 + D3 + D5 (fix stepper, ship AHA, demote skip, kill `Nexandro Demo` pre-fill) before declaring MVP for the first 100 lighthouse installs.

**Did Sparkles + serif + badges actually establish nexandro brand on first run?** Yes — confirmed by brand designer (60 %) and Owner Roberto (45 %). This is now the first nexandro surface that *says nexandro*. But brand established is not funnel closed, and Sprint 1 was a brand sprint, not a funnel sprint.
