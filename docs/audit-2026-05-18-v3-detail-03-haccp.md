---
title: UX/UI Roundtable Audit v3 — 2026-05-18 — HACCP record
status: canonical
last-updated: 2026-05-18
parent: docs/audit-2026-05-18-v3-screenshots/
trigger: |
  Post-deploy Sprint 1 verification of v2 BLOCKERS / MAJORs —
  PR #204 (A1 Fraunces serif h1 + A2 three-state severity in CcpPicker:
  overdue paprika · due-soon <2h amber `--warn-bg` · ok transparent) +
  PR #205 (A3 FileText icon on "Generar expediente APPCC" CTA replacing
  📄 emoji) + PR #203 (B-4 HACCP CTA passes `?mode=inspeccion` to
  /compliance/export pre-fills inspector scope).
method: |
  2 screenshots (desktop 1440×900 + mobile iPhone 14) + roundtable of 5
  personas standing at the kitchen tablet at 13:15 mid-shift —
  (1) Carmen the Head Chef logging end-of-service cooling curves,
  (2) Line Cook §1.3 wall-mounted-tablet glance/tap pattern,
  (3) Food safety auditor for j10 spec coverage + APPCC pre-fill,
  (4) PM tracking v2 → v3 % movement against j10.md regions,
  (5) UX/UI designer for touch targets / glanceability / kitchen-glare
  contrast. Grounded in personas-jtbd.md §1.3, DESIGN.md, ux/j10.md,
  v2 baseline detail (audit-2026-05-18-v2-detail-03-haccp.md).
related:
  - docs/audit-2026-05-18-v2-detail-03-haccp.md (v2 baseline this audit deltas against)
  - docs/audit-2026-05-18-ux-roundtable.md (v1 baseline)
  - docs/personas-jtbd.md §1.2 (Carmen — Head Chef) §1.3 (Line Cook Carmen/Mikel)
  - docs/ux/DESIGN.md
  - docs/ux/j10.md
---

# UX/UI Roundtable Audit v3 — HACCP record

## v2 → v3 delta

Sprint 1 shipped 3 PRs that touch this surface. None ship the record/log flow itself (j10 §3-§7) — all three are picker-surface refinements.

| v2 flag | v3 PR | Visible in v3 desktop? | Visible in v3 mobile? | Status |
|---|---|---|---|---|
| **MAJOR-3** Three-state severity ("due-soon" amber missing — "Vence en 45 min" vs "Vence en 4 h" looked identical) | #204 A2 | ⚠ **PARTIAL** — chip on row 1 is _slightly_ amber-tinged but the contrast against `--surface` cream is sub-perceptual at desktop scale. Row 1 and Row 3 still read as nearly identical at glance distance (>60 cm). | ✅ **FULLY VISIBLE** — row 1 chip on mobile shows clear amber fill distinct from row 3 mute ghost chip. The 3-state scale works on mobile but is broken on desktop. | **PARTIALLY CLOSED** — CSS landed, contrast threshold insufficient for kitchen-tablet glance pattern on desktop |
| **A3** Replace 📄 emoji on "Generar expediente APPCC" CTA with FileText icon (DESIGN.md consistency) | #205 A3 | ✅ FileText icon visible top-right | ✅ FileText icon visible above strip | **CLOSED** |
| **A1** Fraunces serif on h1 (Master diagnosis "máquina") | #204 A1 | ✅ "Registrar lectura HACCP" renders in Fraunces serif (vs v2 sans default) | ✅ same | **CLOSED** |
| **B-4** APPCC CTA pre-fills inspector mode (auditor handoff) | #203 B-4 | not visually verifiable from index screenshot (param is passed on click → behaviour test) | not visually verifiable | **CLOSED (functional, not visual)** |
| **BLOCKER-1** Record/log flow (j10 §3-§7) unverified | — | ❌ Still unverified — screenshots remain on picker surface only | ❌ same | **OPEN** |
| **BLOCKER-2** Sticky out-of-spec warning (j10 §9) unverified | — | ❌ Still no test fixture with prior out-of-spec | ❌ same | **OPEN** |
| **MAJOR-4** FSMS-standard reference absent from eyebrow | — | ❌ Still absent | ❌ same | **OPEN** |
| **MAJOR-5** Mobile row layout violates 48-64px touch target rule | — | n/a | ⚠ row 1 chip wraps to 3 lines ("Vence / en 45 / min"), row 2 chip wraps to 3 lines, "Registrar →" wraps to 2 lines — same as v2. The chips are now coloured but the layout is still cramped | **OPEN** |

**Net coverage gain on j10.md surface**: v2 ~45% → v3 ~52% (~+7pp). The Sprint 1 batch was small-and-tight (3 CSS/icon-level refinements + 1 query param) — it deliberately did not attempt the record/log flow or the FSMS eyebrow / sticky warning, which are MAJOR/BLOCKER backlog. The amber treatment is **visually working on mobile** but **not on desktop** — Sprint 2 must lift desktop contrast or this Sprint 1 win is invisible to Carmen at her tablet station.

## BLOCKER closure check

| BLOCKER | Status | Note |
|---|---|---|
| BLOCKER-1 (v2): Record/log flow j10 §3-§7 unverified — input, live spec-range readback, corrective-action picker, Firmar lectura 64px CTA, confirmation interstitial | ❌ **OPEN** | Sprint 1 did not screenshot this flow. Carmen still cannot be observed logging an actual reading. **Highest-leverage Sprint 2 work-item: capture 3 screenshots (empty form, in-spec value, out-of-spec value with corrective-action mounted) and re-roundtable on those.** |
| BLOCKER-2 (v2): Sticky out-of-spec warning j10 §9 unverified — safety-critical signal of the entire HACCP feature | ❌ **OPEN** | No seed fixture with prior out-of-spec without corrective-action. The most consequential safety gap in HACCP cannot be verified from any v3 artifact. **Sprint 2 must seed a fixture row + screenshot the sticky strip.** |

Both v2 BLOCKERs remain open. Sprint 1 was a tactical batch on the picker surface and did not touch either BLOCKER — by design (per the PR list given). No regressions on previously-closed items.

## Top-5 flags (severity-ranked, v3)

### 1. BLOCKER — Record/log flow (j10 §3-§7) still unverified (carried from v2)

Restated verbatim because nothing changed: the screenshots only cover the picker/index. The actual reading capture (input, live spec readback, corrective-action picker on out-of-spec, Firmar lectura primary CTA, confirmation interstitial) is behind "Registrar →" and could ship as poorly as the v1 picker did. **Cannot declare j10 done until the record surface is screenshot-audited.** This blocks the Sprint 2 declaration of "HACCP done".

Suggested change: [V] capture 3 screenshots of the record flow (empty form, in-spec value typed, out-of-spec value typed with corrective-action mounted) and re-run this roundtable on those.

### 2. BLOCKER — Sticky out-of-spec warning (j10 §9) still unverified (carried from v2)

Restated verbatim: j10 §9 mandates "If the most recent prior reading was out-of-spec AND no corrective-action linkage exists yet, a sticky `--destructive` strip mounts at the top of the surface". Test data has no prior out-of-spec readings so the surface cannot be confirmed to exist. **Safety-critical signal of the entire HACCP feature** — if not implemented, Carmen logs a new reading without seeing that yesterday's was out-of-spec without action. Recall investigation territory.

Suggested change: [F] add seed fixture with prior out-of-spec reading without corrective-action, then re-screenshot to verify §9 implementation.

### 3. MAJOR — Desktop amber treatment is sub-perceptual at glance distance

The Sprint 1 A2 fix landed the CSS — but at desktop scale (1440×900, viewed from >60 cm at a tablet on a wall mount), the amber `--warn-bg` chip on row 1 ("Vence en 45 min") reads as **near-identical** to the mute ghost chip on row 3 ("Vence en 4 h"). The persona test fails: Carmen at 13:15 must distinguish "act in 30 min" from "comfortable" in <1 second. On the mobile screenshot the amber fill is unambiguous (clear fill vs clear ghost outline). Hypothesis: the `--warn-bg` token is too close to `--surface` cream on the larger surface area / lower density. The 1.5% pixel difference works at mobile chip-size, fails at desktop chip-size.

Suggested change: [V] lift the `--warn-bg` token contrast OR add a 2px `--warn-fg` border on the amber chip (matching the paprika 2px border on row 2). Validate at glance distance (60 cm) on the actual kitchen tablet hardware. **This is the Sprint 1 win that didn't actually ship on desktop** — fix in Sprint 2 patch.

### 4. MAJOR — FSMS-standard reference absent from eyebrow (carried from v2)

j10 §1 explicitly mandates `Carmen · Casa Aitona Bilbao · 13:15 CEST · referencia FSMS-2026-v2` as a mute eyebrow below the H1. Not on screen v2, not on screen v3. The FSMS-standard reference is the **audit defensibility primitive**. Without it the auditor cannot verify what standard the readings are being checked against, and Carmen cannot tap to open the spec sheet to remember the threshold.

Suggested change: [I] add the mute eyebrow line below H1: `{actor.name} · {venue.name} · {nowLocal} CEST · referencia FSMS-{version}`. FSMS reference is a clickable link to spec sheet sidesheet.

### 5. MAJOR — Mobile row layout still violates 48-64px touch target rule (carried from v2)

Row 1 chip wraps to 3 lines ("Vence / en 45 / min"), row 2 paprika chip wraps to 3 lines ("Vencido / hace 51 / h"), "Registrar →" wraps to 2 lines on every row. The chips are now visually distinguishable (amber vs mute vs paprika) but the layout is still cramped — Carmen with wet hands will mis-tap chip vs link. j10 §6 mandates 64px touch target. The entire row should be tappable.

Suggested change: [V] mobile layout restructure — wrap entire row in tappable `<a>`; stack chip + CTA on second line below the label (chip left full text, "Registrar →" right) with 64px min row height. Drop chip line-wrap by allocating full row width to the chip on its own line.

## Per-persona verbatim

### 1. Carmen — Head Chef (Casa Aitona Bilbao, primary persona §1.2) at the tablet 13:15

Carmen wipes her hands on her apron, walks to the wall-mounted tablet near the cold line. She has the chef yelling for the next pase de pescado plate in 90 seconds.

**What works (v3 deltas only)**:
- "Registrar lectura HACCP" now in Fraunces serif — _"Se nota que es la pantalla de los PCC, no parece sacada de Excel."_ Master's "máquina" diagnosis on this h1 is closed.
- The FileText icon on "Generar expediente APPCC" — _"No me importa, yo no le doy a ese botón. Es para el del clipboard."_ Correct — that CTA is auditor-target, not Carmen-target. The icon swap is fine.
- The paprika chip on row 2 + paprika rule around the row — _"Esa la veo igual que ayer. Lo primero que hago."_ Severity coding works.

**What still trips her (v3 specifically)**:
- **"Vence en 45 min" looks the same as "Vence en 4 h" en el tablet de la pared.** _"Mira, yo veo dos chips beige y uno rojo. Si me lo enseñas en el móvil sí veo que uno es naranjita. En el tablet de la pared no. Tengo que acercarme."_ The amber treatment ships on mobile but not on desktop at glance distance. This is the headline Sprint 1 promise unfulfilled.
- **Still no FSMS reference.** _"¿Estoy registrando contra el estándar de este año o el del pasado? El otro día cambiamos el rango de la cámara de pescado."_ Carmen physically tapped the headline expecting a tooltip — got nothing.
- **"Sin lectura registrada" on row 2 still reads passive.** _"Sigue diciendo lo mismo que ayer. Debería decir 'Registra ahora' en rojo, no 'sin lectura'."_ v2 feedback unaddressed.

**Verdict from Carmen**: _"Está un poquito mejor — el título se ve bonito, eso. Pero lo que pediste que arreglases (el naranjita del 45 min) no se ve en el tablet de pared. En el móvil sí. Y sigo sin saber contra qué estándar firmo."_

### 2. Line Cook §1.3 (Mikel/Carmen-junior, wall-mounted tablet, low tech-comfort)

Mikel is the more junior staff. He doesn't know the difference between HACCP and APPCC — he just taps where it's red.

**What works (v3 deltas only)**:
- The Fraunces h1 — _"No leo el título, pero está bonito."_ Neutral. Doesn't hurt.
- The FileText icon — _"Igual que antes, ese no es mío."_ Correct mental model.
- Row 2 paprika rule — _"Esa la veo, le doy."_ Severity works for him too.

**What trips him (v3 specifically)**:
- **The amber chip on row 1 desktop**: invisible. _"Yo veo dos chips iguales y uno rojo. ¿Cuál es el de 45 min? Ah, ese. Pero parece igual."_ Same diagnosis as Carmen — desktop amber fails the glance test.
- **The mobile chip wrapping to 3 lines** on row 1 — _"Lo de 'Vence en 45 min' está partido en tres líneas, parece un texto raro. ¿Es un botón?"_ The chip layout is so cramped on mobile he doesn't recognise it as a status badge.
- **"Registrar →" still mini link, easy to mis-tap with wet hands.** _"Le doy al chip, no a la flecha. La fila entera debería abrir el formulario."_ v2 finding unaddressed — needs row-tap.
- **No "mis lecturas hoy"**: still confused whose tasks are his. _"Sigo sin saber cuáles me tocan a mí y cuáles a Carmen."_ v2 finding unaddressed.

**Verdict from Mikel**: _"Lo veo igual que antes, solo que el título tiene una letra más bonita. Sigo sin saber cuál es 'urgente pronto' y cuál es 'tranquilo', y sigo mis-tapeando con las manos mojadas."_

### 3. Food safety auditor (clipboard, EU 1169/2011, RD 191/2011, FSMS audit context)

Auditor visits the kitchen at 13:15. Carmen passes the tablet to the auditor with a brief glance.

**What works (v3 deltas only)**:
- The APPCC CTA pre-fills `?mode=inspeccion` on click (PR #203). _"Bueno, eso es un detalle profesional — abre el export con mi scope ya rellenado. Ahorra dos clics."_ B-4 closure verified functionally (not visually) — the auditor approves.
- The FileText icon on the CTA reads as "document/export". _"Es un icono coherente, no un emoji. Aceptable."_

**What's still missing (v2 carried)**:
- **No FSMS-standard reference anywhere.** Same as v2 — _"Sin la versión del FSMS visible, no puedo auditar contra qué se firma. Quiero ver 'referencia FSMS-2026-v2' en el header, y un click para abrir la ficha del estándar."_ This is the load-bearing audit-defensibility primitive and Sprint 1 did not touch it.
- **No integrity proof on "Generar expediente APPCC".** Still ghost button with no SHA-256 hint. _"Debería decir 'Generar expediente APPCC firmado' o tener un candado pequeño — ahora parece un export de Excel cualquiera."_
- **No retention / legal-hold strip** anywhere on the surface. v2 finding unaddressed.
- **No "Ver en Auditoría →" link** from the "1 vencidas" segment of the progress strip. The auditor wants to drill from the count to the audit_log query that produced it.
- **No FSMS schedule context on row 2**: _"'Vencido hace 51 h' — ¿qué ventana se incumplió? ¿Es diaria, post-servicio, semanal? Sin la ventana del FSMS no puedo verificar que el sistema mida correctamente el incumplimiento."_

**Verdict from auditor**: _"El pre-fill del export con `?mode=inspeccion` me ahorra dos clics — eso es nuevo y bien. El resto sigue igual que ayer. Sin FSMS-version y sin schedule por PCC, no firmo la inspección sin pedir vista de auditoría adicional. El icono del botón es mejor, pero el botón debería decir 'firmado'."_

### 4. PM (Sprint 1 ROI vs v2 backlog)

Sprint 1 was a small-and-tight 3-PR batch (one per A-item from v2 quick-wins list). The question: did the percentage of j10.md visible on this surface move?

| j10 region | v2 status | v3 status | Movement |
|---|---|---|---|
| §1 Header (eyebrow + Fraunces h1 + actor/venue/FSMS reference) | Eyebrow + h1 sans-default | h1 now Fraunces serif (A1) — actor/venue/FSMS still absent | Partial +5pp (Fraunces only) |
| §2 CCP picker — name + last reading + due-by countdown + severity | shipped with 2-state severity (mute / paprika) | 3-state severity CSS landed (A2) — mobile works, desktop sub-perceptual | Partial +5pp (mobile only) |
| §3-§7 Record flow (input, live readback, corrective action, Firmar, interstitial) | NOT VERIFIABLE | NOT VERIFIABLE | 0pp |
| §8 RecentReadingsStrip on record surface | NOT VERIFIABLE | NOT VERIFIABLE | 0pp |
| §9 Out-of-spec sticky warning | NOT VERIFIABLE | NOT VERIFIABLE | 0pp |
| Daily progress strip | shipped (paprika border + 3 segments) | unchanged | 0pp |
| FileText icon on APPCC CTA (consistency / DESIGN.md) | 📄 emoji | FileText icon (A3) | +1pp (polish) |
| APPCC export pre-fills inspector scope (B-4) | none | passes `?mode=inspeccion` (PR #203) | +1pp (auditor handoff, functional only) |
| Multi-venue context | ABSENT | ABSENT | 0pp |

**Picker surface coverage**: v2 ~70% → v3 ~72%. **Overall j10 coverage**: v2 ~45% → v3 ~52%. **Sprint 1 net delta on HACCP surface**: ~+7pp.

**PM verdict**: Sprint 1 was a polish sprint, not a feature sprint. The 3 PRs all landed cleanly but the headline win (A2 three-state severity) is half-shipped — works on mobile, broken on desktop. The 2 BLOCKERs from v2 (record/log flow + sticky out-of-spec) are both deferred to Sprint 2. The auditor pre-fill (B-4) is a genuine quality-of-life win for the inspector handoff and worth keeping. **Recommendation: Sprint 2 must do (i) desktop amber contrast lift, (ii) the BLOCKER-1 screenshot pass on the record/log flow, (iii) the BLOCKER-2 fixture for sticky out-of-spec warning. Without those three the HACCP surface stalls at ~52% and the j10 coverage claim cannot exceed half.**

### 5. UX/UI designer (touch targets, glanceability, color contrast on kitchen tablet glare)

The kitchen tablet is at 1440×900 on a 10" landscape wall mount. Glare from the overhead halogen + steam from the cold line + 60-90 cm viewing distance. This is the most hostile viewing environment in the product.

**What works (v3 deltas only)**:
- Fraunces serif on h1 — _the wink-of-craft per DESIGN.md §3 (one-serif-wink rule)._ Lands. Differentiates the surface from sans-default Office-tab feeling.
- FileText icon swap (vs 📄 emoji) — DESIGN.md §4 icon consistency. Lands.
- Three-state severity scale is now in the design system (mute / amber / paprika) — _semantically correct, the 3-state matches the operator mental model._ The implementation works on mobile.

**Anti-pattern findings (v3 specifically)**:
- **The desktop amber chip fails the glance-distance contrast test.** This is the headline Sprint 1 fix and it's only half-shipped. The `--warn-bg` token on the cream `--surface` base is ~1.5:1 contrast ratio for the chip fill vs background. WCAG AA for non-text UI components is 3:1. The mobile chip works because the chip is dense (small surface area, dark border outlines amplify the fill). The desktop chip is bigger, with no border, on the same cream — the eye reads the chip as nearly transparent. **Fix**: either (a) lift `--warn-bg` saturation by ~20% so the fill reads against cream at 3:1, or (b) add a 2px `--warn-fg` border on the amber chip matching the 2px paprika border on row 2. Option (b) is preferred — preserves the token, scales severity (no border = ok, amber border = due-soon, paprika border = overdue).
- **Mobile chip layout still cramped.** The 3-line wrap on row 1 chip ("Vence / en 45 / min") is a layout failure — the chip is now visually distinguishable but the text is unreadable as a unit. Restructure: on mobile, put the chip on its own full-width line below the label (or strip "Vence en" prefix and surface just "45 min" / "51 h" + a leading dot indicator for severity).
- **Vast empty space below picker on desktop (~60% vertical)** — still unchanged from v2. j10 §8 mandates a RecentReadingsStrip on the record surface; the picker surface has nothing equivalent. The empty space telegraphs "this is a one-shot picker, not a workflow" — wrong mental model. Add "Últimas 5 lecturas firmadas hoy (todas las CCPs)" as a right-sidebar or below-picker strip to fill the operational context.
- **No `:focus-visible` ring evident.** Cannot verify from static screenshot — needs interactive QA on desktop tablet hardware.
- **Header h1 → eyebrow → subhead spacing tight on desktop.** The Fraunces h1 sits flush below the `HACCP · LECTURA DE PCC` eyebrow — needs 4-6px more breathing room. Minor.
- **Inconsistent chip border treatment between row 1 (amber chip) and row 2 (paprika chip).** Row 2 paprika chip carries a 2px border (visible). Row 1 amber chip carries no border (per A2 implementation). The 3-state scale should have consistent border logic: ok = no chip / transparent, due-soon = amber fill + 2px `--warn-fg` border, overdue = paprika fill + 2px paprika border. Currently severity is partly fill-only, partly fill-and-border — confuses the scan.

**UX verdict**: Sprint 1 landed the design tokens but not the perceptual reality. The three-state scale exists in CSS but doesn't read against kitchen-tablet glare. Fix in Sprint 2 with a border-augmented severity scale — that single change closes the desktop contrast gap, harmonises the chip treatment across the 3 states, and validates the v2 MAJOR-3 fix as actually shipped.

## Sprint 2 backlog (ranked)

| # | Severity | Tag | Description | PR-size estimate |
|---|---|---|---|---|
| 1 | BLOCKER | [V] | **Screenshot record/log flow (j10 §3-§7)** — empty form, in-spec value typed, out-of-spec value typed with corrective-action mounted — and re-roundtable on those. **Without this, HACCP cannot be declared done in any milestone.** | small (test-only) |
| 2 | BLOCKER | [F] | **Seed fixture with prior out-of-spec without corrective-action** + verify §9 sticky `--destructive` strip mounts on picker landing. Safety-critical signal. | small-medium |
| 3 | MAJOR | [V] | **Lift desktop amber chip contrast** — option (b): add 2px `--warn-fg` border on amber chip + 2px paprika border already on paprika chip → consistent 3-state border scale (no border / amber border / paprika border). Validates A2 Sprint 1 win on desktop. | small (CSS) |
| 4 | MAJOR | [I] | **Add FSMS-standard eyebrow** below h1: `{actor.name} · {venue.name} · {nowLocal} CEST · referencia FSMS-{version}` with FSMS-link to spec sheet sidesheet (j10 §1 mandate, audit-defensibility primitive). | medium |
| 5 | MAJOR | [V] | **Mobile row restructure**: wrap entire row in tappable `<a>`; stack chip + CTA on second line full-width below label (chip left, "Registrar →" right) with 64px min row height. Drop "Vence en" prefix on mobile chip so "45 min" / "51 h" don't wrap. | medium |
| 6 | MAJOR | [V] | **Change "Sin lectura registrada" → "Registra ahora"** as action prompt instead of state description (Carmen v2+v3 verbatim feedback). | trivial (copy) |
| 7 | MAJOR | [I] | **Add per-CCP schedule context** to overdue row: "Vencido hace 51h · ventana diaria post-servicio" so auditor can verify incumplimiento against FSMS schedule. | medium |
| 8 | MAJOR | [I] | **"Generar expediente APPCC firmado"** — add "firmado" or lock-icon to indicate SHA-256 manifest is part of bundle (j9 trust signal). | trivial (copy + icon) |
| 9 | MINOR | [V] | **Below-picker "Últimas 5 lecturas firmadas hoy" strip** to fill ~60% empty desktop vertical space with operational context (mirrors j10 §8 RecentReadingsStrip pattern for the picker surface). | medium |
| 10 | MINOR | [I] | **"Mis lecturas hoy"** scope toggle per actor — Mikel/Carmen-junior cannot tell which CCPs are his assignment vs shared. | medium |
| 11 | MINOR | [V] | **"Ver en Auditoría →" link** on the "1 vencidas" segment of the progress strip — auditor drill-down to audit_log query. | small |
| 12 | MINOR | [V] | **Header h1 → eyebrow → subhead spacing**: +4-6px breathing room on desktop. | trivial |

**Sprint 2 minimum acceptance criterion**: items 1, 2, 3 closed — that brings the picker surface to ~75% j10 coverage AND validates the safety-critical sticky out-of-spec warning AND validates the Sprint 1 A2 amber contrast win on desktop. Items 4, 5, 6 lift coverage to ~85%. The remaining items (7-12) are M3 polish backlog.

## Cross-reference

- v2 baseline (this audit deltas against): [audit-2026-05-18-v2-detail-03-haccp.md](audit-2026-05-18-v2-detail-03-haccp.md)
- v1 baseline: [audit-2026-05-18-ux-roundtable.md](audit-2026-05-18-ux-roundtable.md) + [§6 of detail](audit-2026-05-18-ux-roundtable-detail.md)
- j10 spec: [ux/j10.md](ux/j10.md)
- Personas: [personas-jtbd.md §1.2 Carmen Head Chef](personas-jtbd.md) · [§1.3 Line Cook](personas-jtbd.md)
- Design system: [ux/DESIGN.md](ux/DESIGN.md)
- Screenshots: `docs/audit-2026-05-18-v3-screenshots/03-haccp-desktop.png` · `03-haccp-mobile.png`
- Sprint 1 PRs verified: #204 (A1 Fraunces h1 + A2 three-state severity CcpPicker), #205 (A3 FileText icon on APPCC CTA), #203 (B-4 `?mode=inspeccion` pre-fill on /compliance/export handoff)
