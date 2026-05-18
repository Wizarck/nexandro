---
title: UX/UI Roundtable Audit v2 — 2026-05-18 — HACCP record
status: canonical
last-updated: 2026-05-18
parent: docs/audit-2026-05-18-v2-screenshots/
trigger: Post-deploy v2 verification — PR #193 (Spanish CCP labels) + PR #195 (per-CCP status row, paprika rule, due-by/overdue) + PR #197 (Generar expediente APPCC CTA)
method: |
  2 screenshots (desktop 1440×900 + mobile iPhone 14) + roundtable of 5
  personas (Carmen Head Chef · Line Cook · Food safety auditor · UX/UI
  designer · PM) grounded in personas-jtbd.md §1.2-§1.3 + DESIGN.md +
  docs/ux/j10.md + v1 audit baseline (HACCP shipped ~10% of j10).
related:
  - docs/audit-2026-05-18-ux-roundtable.md (v1 baseline)
  - docs/audit-2026-05-18-ux-roundtable-detail.md §6 (v1 HACCP per-tab)
  - docs/personas-jtbd.md §1.2 (Carmen — Head Chef) §1.3 (Line Cook)
  - docs/ux/DESIGN.md
  - docs/ux/j10.md
---

# UX/UI Roundtable Audit v2 — HACCP record

## Recap from v1 baseline

V1 verdict (2026-05-18 morning): _"Implements ~10% of j10.md — the bare picker stripped of every status, severity, language consistency, affordance and safety signal — and so transmits exactly Master's diagnosis: 'made and used by a machine, not by users'."_

V1 P0 list (6 items):
1. Mixed-language CCP labels.
2. No per-CCP status / due-by / overdue.
3. No tap affordance (chevron / "Registrar" link).
4. No daily progress strip.
5. No sticky out-of-spec warning (j10 §9).
6. (Implicit) No "Generar expediente APPCC" surface — the v1 audit flagged this as a Compliance discoverability bug (§9 of v1 detail) but recommended surfacing the CTA from HACCP dashboard.

## What shipped (v2 verification against screenshots)

| v1 P0 item | PR | Visible in v2 desktop? | Visible in v2 mobile? |
|---|---|---|---|
| Mixed-language CCP labels | #193 | ✅ "Curva de enfriamiento", "Mantenimiento en caliente", "Limpieza · pase de pescado" all-Spanish | ✅ same |
| Per-CCP status row (última lectura + due-by + overdue badge + 3px paprika left rule on overdue row) | #195 | ✅ Row 1 "Vence en 45 min" ghost chip; Row 2 "Vencido hace 51 h" paprika-filled chip with paprika border around the row; Row 3 "Vence en 4 h" ghost chip | ✅ chips present but wrap to 2-3 lines |
| Daily progress strip (j10 §9) | #195 | ✅ "1 / 3 lecturas hoy · 1 vencidas · 1 sin lectura" with paprika border around the strip | ✅ same |
| Sticky out-of-spec warning (j10 §9 prior-out-of-spec-without-corrective) | — | ❌ NOT VISIBLE (no prior out-of-spec in test data so cannot verify the surface exists) | ❌ same |
| "Generar expediente APPCC" CTA | #197 | ✅ ghost button top-right with stacked-paper icon | ✅ moved below subhead, full-width-ish |
| Tap affordance ("Registrar →") | #195 | ✅ accent-coloured link on every row | ⚠ wraps to 2 lines on every row (cramped) |

**Net coverage gain**: ~10% (v1) → ~45% of j10.md visible on the index/picker surface. Big jump. But the **record/log flow** (j10 §3-§7: ReadingInput, SpecRangeReadback, CorrectiveActionPicker, Firmar lectura primary CTA 64px tall, Confirmation interstitial) and the **right-sidebar RecentReadingsStrip** (§8) cannot be verified — they live behind the "Registrar →" link and the screenshots only show the picker index.

## Roundtable

### 1. Carmen — Head Chef (Casa Aitona Bilbao, primary persona §1.2)

Carmen is at her station, hands oily, tablet in front of her at 7am rush. She has 60 seconds before she has to leave for prep.

**What works**:
- The H1 "Registrar lectura HACCP" + subhead "Elige un PCC para empezar a registrar la lectura" tells her in 2 seconds what this surface is for. Big win vs v1.
- "Vencido hace 51 h" paprika chip on row 2 + paprika rule around the entire row screams "do this one first". She reads the screen in less than 1 second and knows.
- Spanish CCP labels — "Curva de enfriamiento" reads natural; "Mantenimiento en caliente" is the literal kitchen verb she uses. PR #193 landed correctly.
- "Última hace 2h 15m: 1.5 °C · Carmen" on row 1 — confirms HER last reading is in spec (1.5 °C inside the -2 to 2 °C cooling-curve range). She knows the system saw her last entry.

**What still trips her**:
- **"Vence en 45 min" vs "Vence en 4 h" are visually identical ghost chips.** Both are mute-on-bg. She has no way to tell at a glance that 45 min is urgent and 4 h is comfortable. j10 §Trigger says "those overdue carry a warning eyebrow" but the unspoken spec is also: due-soon (< 1 h) needs amber, not mute.
- **The progress strip "1 / 3 lecturas hoy · 1 vencidas · 1 sin lectura" has a paprika border** — but the body text is mute on cream. The visual weight of the border tells her something is wrong, but her eye doesn't know WHICH number to fix. The "1 vencidas" segment should be paprika fill (not just the strip border), and "1 sin lectura" should be amber.
- **"Sin lectura registrada" on row 2 reads like a passive observation** ("there is no reading"), not an action prompt. Carmen is low tech — she expects the system to tell her "Registra ahora", not describe a state.
- **No FSMS-standard version eyebrow** anywhere on the surface. j10 §1 mandates "FSMS-2026-v2" in the eyebrow. Carmen taps on row 2 not knowing if she's logging against last year's standard or this year's.

**Verdict from Carmen**: _"Está mucho mejor. Veo lo que tengo que hacer. Pero el 'Vence en 45 min' debería estar en naranja — ahora mismo parece igual de tranquilo que las 4 horas."_

### 2. Line Cook (Mikel-equivalent, persona §1.3)

Mikel is wall-mounted-tablet only, low-tech-comfort, multiple times per day. Per j10 he uses Hermes (WhatsApp) more than this web surface — but PRD-M3 §Journey 6 says the web is also a Staff surface when the wall tablet is in his face.

**What works**:
- "Registrar →" link per row — Mikel taps it, he gets to the input form. The verb is unambiguous.
- The CCP labels are short and visible (Curva de enfriamiento, Mantenimiento en caliente, Limpieza · pase de pescado).

**What trips him**:
- **Touch target of "Registrar →" on desktop is ~32px tall** — fails DESIGN.md §5 "Touch targets ≥ 48 px on every interactive control" and j10 §6 "Touch target 64 px tall — oily-finger friendly". The whole row should be tappable (Mikel will mis-tap the chip vs the link 1 in 5 times with wet hands).
- **On mobile every row wraps "Registrar →" to 2 lines** — visually confusing. Mikel will tap the row trying to register and likely hit the chip instead.
- **No "Mis lecturas hoy"** scoping per actor. Mikel sees Carmen's reading on row 1 ("Carmen") and Iker's on row 3 ("Iker") and wonders if those are HIS to do too. No clear indication that "Última hace Xh: Y · {operator}" is informational vs assignment.

**Verdict from Mikel**: _"La pantalla está bien para ver, pero cuando intento darle a 'Registrar' con las manos mojadas le doy a otra cosa. Y no sé cuáles me tocan a mí."_

### 3. Food safety auditor (clipboard, EU 1169/2011, RD 191/2011, FSMS audit)

The auditor's job here: verify that CCP readings are being captured, traceable, and that out-of-spec readings trigger corrective actions.

**What works**:
- The progress strip "1 / 3 lecturas hoy · 1 vencidas · 1 sin lectura" gives the auditor a 2-second compliance snapshot. Big deal — this is the kind of summary an inspector wants on landing.
- Row 2 with "Vencido hace 51 h · Sin lectura registrada" + paprika rule is exactly the "queryable lapse" pattern j10 §Decisions invokes (audit_log indexes CCP-without-corrective; the UX surfaces it).
- The "Generar expediente APPCC" CTA top-right gives the auditor an obvious path to a signed bundle.

**What's missing**:
- **No FSMS-standard reference anywhere.** j10 §1 mandates "referencia FSMS-2026-v2" in the eyebrow. The auditor wants to know: "what standard version are you logging against?" — without it, the audit is undefended.
- **No integrity proof.** The progress strip says "1 vencidas" but doesn't link to audit_log to show WHY (was there a reading attempt that failed? was the CCP scheduled and missed?). The auditor would want a "Ver en Auditoría →" link.
- **No retention / legal-hold strip.** Auditor expects to see "Retención: 7 años · próxima purga: ninguna · Legal hold: 0" somewhere. Currently absent.
- **Row 2 says "Sin lectura registrada" but doesn't show WHEN the CCP was last expected to be read.** "Vencido hace 51 h" tells the auditor the CCP missed its window 51h ago — but what was the window? Was it daily? Weekly? After-service-only? The auditor cannot verify FSMS compliance without the schedule context.
- **j10 §9 sticky out-of-spec warning** — the auditor specifically wants to see the prior-out-of-spec-without-corrective gap surfaced. Cannot verify it exists from these screenshots; the test data has no prior out-of-spec readings.
- **The "Generar expediente APPCC" CTA has no integrity primitive in its label.** Should read "Generar expediente APPCC firmado" (signed) — per j9.md the bundle includes SHA-256 manifest, that's a load-bearing trust signal.

**Verdict from auditor**: _"Esto ya es defendible en una inspección rápida, pero sin la versión del FSMS visible y sin el calendario de cada PCC, no puedo verificar que el 'vencido hace 51h' sea real o un fallo del sistema. Necesito el linaje completo."_

### 4. UX/UI designer (DESIGN.md fidelity, severity coding, density)

**What works**:
- Paprika 3px left rule on the overdue row + paprika border around the row + paprika progress strip border = consistent severity language. Aligned with DESIGN.md §1.5 ("Allergen as legal duty" — colour as semantic, not decorative) extended to overdue compliance signals.
- All-Spanish labels honour DESIGN.md §7 Copy rule "One term per concept".
- The "Vencido hace 51 h" chip uses paprika fill on warn-bg-adjacent surface — passes contrast.
- "Generar expediente APPCC" is a ghost button — appropriate per DESIGN.md §4 (the primary action on this page is "Registrar →" per row, not export).

**Anti-pattern findings**:
- **Two-state severity (mute vs paprika) is insufficient.** DESIGN.md §2 defines `--success`, `--warn-bg`, `--destructive` precisely so a three-state scale exists. Carmen's complaint above ("Vence en 45 min" vs "Vence en 4 h" look identical) is exactly this gap. The "due-soon" state needs `--warn-bg` chip fill with `--ink` text — distinct from mute (>4h comfortable) and paprika (overdue).
- **Inconsistent border treatment between row 2 and progress strip.** Both use paprika border but row 2 is a 1-2px border around the entire row plus a 3px left rule, and the progress strip is just a 1-2px border. They should be the same visual weight or document why they differ.
- **Mobile row layout breaks the j10 §6 64px touch target rule.** Chips wrap to 2-3 lines, "Registrar →" wraps to 2 lines. The row is cramped to the point of mis-tap risk. Either the entire row should be tappable (`<a>` wrapping everything) or the layout should restructure on `--bp-mobile` so the chip + CTA are full-width below the label.
- **Desktop has ~60% empty vertical space below the picker.** Master's diagnosis ("parece hecho por una máquina") applies here too. j10 §8 mandates a "RecentReadingsStrip (last 5 readings for this CCP, oldest at bottom)" on the right sidebar of the **record/log surface** — but the **index/picker surface** has nothing equivalent. Suggest: surface "Últimas 5 lecturas firmadas hoy (todas las CCPs)" as a right-sidebar or below-the-picker strip to fill the surface with operational context.
- **No `:focus-visible` ring evident.** Cannot verify from a static screenshot but DESIGN.md §4 universal-states requires 3px `--accent` ring with 2px offset on every focusable. Needs verification in interactive QA.
- **Header right-side CTA "Generar expediente APPCC" competes visually with the H1.** The ghost styling is right but the icon (stacked paper / horizontal lines) is generic — should be a document/PDF icon or removed to keep the button minimal.

### 5. PM (spec coverage gap vs j10.md)

| j10 region | Spec | v2 status | Gap |
|---|---|---|---|
| §1 Header (eyebrow + headline + actor/venue/FSMS reference) | Eyebrow `HACCP · Lectura de PCC` + H1 + mute eyebrow `Carmen · Casa Aitona Bilbao · 15:32 CEST · referencia FSMS-2026-v2` | Partial — eyebrow + H1 present; actor/venue/timestamp/FSMS reference ABSENT | MAJOR — FSMS reference is load-bearing for auditor |
| §2 CCP picker | Day's CCPs listed with name + last reading + due-by countdown | ✅ shipped (PR #195) | OK |
| §3 Reading input | 60px tall, decimal keyboard, placeholder | NOT VERIFIABLE (behind "Registrar →") | unknown |
| §4 Live spec-range readback | `--success` / `--destructive` line below input on type | NOT VERIFIABLE | unknown |
| §5 Corrective-action linkage | Mounts on out-of-spec, picker + notes textarea | NOT VERIFIABLE | unknown |
| §6 Confirm row | `Cancelar` ghost + `Firmar lectura` primary 64px | NOT VERIFIABLE | unknown |
| §7 Confirmation interstitial | Strip mounts with audit_log ID + auto-redirect 8s | NOT VERIFIABLE | unknown |
| §8 Recent readings strip (right sidebar on landscape tablet) | Last 5 readings for this CCP with timestamp + value + actor + glyph | NOT VERIFIABLE on record surface; ABSENT on picker surface | unknown / MAJOR |
| §9 Out-of-spec sticky warning | Sticky `--destructive` strip at top when prior reading out-of-spec without corrective | NOT VERIFIABLE (no test data with prior out-of-spec) | unknown — needs explicit test fixture |
| Daily progress strip (v1 audit recommendation, NOT in j10 verbatim but inferred from §Trigger) | `5 / 8 lecturas de hoy · 2 vencidas · 1 fuera de rango sin acción` | ✅ shipped — currently `1 / 3 lecturas hoy · 1 vencidas · 1 sin lectura` (no fuera-de-rango segment) | Minor — add "fuera de rango sin acción" segment when applicable |
| Multi-venue context (v1 audit P1) | Venue + shift context when org has >1 location | ABSENT | MAJOR for multi-venue orgs |
| "Generar expediente APPCC" CTA | (v1 audit recommendation; j9 §Trigger says "Iker opens /compliance/export from the top nav"; v1 §9 recommends surfacing CTA from HACCP dashboard) | ✅ shipped (PR #197) — ghost button top-right desktop, below-subhead mobile | OK; minor: add "firmado" or SHA hint |

**Coverage of picker/index surface**: ~70% of j10.md regions that apply at this level are visible. **Coverage of full j10 record flow**: cannot assess from these screenshots — likely <30% since §3-§7 (the actual reading capture) is gated behind "Registrar →" and the screenshots end at the picker.

**PM verdict**: significant progress from v1 (~10% → ~45% overall, ~70% on the picker surface alone). The 2 critical gaps remaining: (i) **the record/log flow itself** is unverified — needs its own screenshot+audit pass and (ii) **the FSMS-standard reference + multi-venue context + 3-state severity coding** are picker-surface bugs to fix before next milestone.

## Top-5 flags (severity-ranked)

### 1. BLOCKER — Record/log flow (j10 §3-§7) is unverified

The screenshots only cover the picker/index. The actual reading capture (input, live spec readback, corrective-action picker on out-of-spec, Firmar lectura primary CTA, confirmation interstitial) is behind "Registrar →" and could ship as poorly as the v1 picker did. **Cannot declare j10 done until the record surface is screenshot-audited.**

Suggested change: [V] capture 3 screenshots of the record flow (empty form, in-spec value typed, out-of-spec value typed with corrective-action mounted) and re-run this roundtable on those.

### 2. BLOCKER — Sticky out-of-spec warning (j10 §9) cannot be verified

j10 §9 mandates: "If the most recent prior reading was out-of-spec AND no corrective-action linkage exists yet, a sticky `--destructive` strip mounts at the top of the surface". Test data has no prior out-of-spec readings so the surface cannot be confirmed to exist. This is the **safety-critical** signal of the entire HACCP feature — if it's not implemented, a kitchen is operating with a known unaddressed hazard and Carmen won't see it.

Suggested change: [F] add a seed fixture with a prior out-of-spec reading without corrective-action, then re-screenshot to verify §9 implementation.

### 3. MAJOR — Three-state severity is missing ("due-soon" amber state)

"Vence en 45 min" and "Vence en 4 h" are visually identical mute chips. Carmen's primary glance signal is broken — she should see green (>4h or just done), amber (due in <1h), and paprika (overdue). The current two-state scale (mute vs paprika) collapses two distinct urgency levels.

Suggested change: [V] add `--warn-bg` chip with `--ink` text for "due-soon" (<60 min remaining). Threshold configurable per CCP definition but default <60 min = amber. Apply same scale to the progress strip segments (mute "lecturas hoy", amber "sin lectura", paprika "vencidas").

### 4. MAJOR — FSMS-standard reference absent from eyebrow

j10 §1 explicitly mandates `Carmen · Casa Aitona Bilbao · 15:32 CEST · referencia FSMS-2026-v2` as a mute eyebrow below the H1. None of this is on screen. The FSMS-standard reference is the **audit defensibility primitive** — without it, the auditor cannot verify what standard the readings are being checked against, and Carmen cannot tap to open the spec sheet.

Suggested change: [I] add the mute eyebrow line below the H1: `{actor.name} · {venue.name} · {nowLocal} CEST · referencia FSMS-{version}`. FSMS reference is a clickable link that opens the spec sheet in a sidesheet (j10 §1 contract).

### 5. MAJOR — Mobile row layout violates 48-64px touch target rule

On mobile, "Vence en 45 min" wraps to 3 lines, "Vencido hace 51 h" wraps to 2 lines, and "Registrar →" wraps to 2 lines on every row. The row is cramped and the tap targets are sub-spec. Mikel will mis-tap with oily hands. DESIGN.md §5 + j10 §6 (64px) are violated.

Suggested change: [V] mobile layout restructure — make the entire row a tappable `<a>` element; stack chip + CTA on a second line below the label (chip left, "Registrar →" right) with 56px min row height total. Alternatively: drop the inline chip on mobile and surface it as a small badge to the left of the label (`vencido` red dot) to free horizontal space for the CTA.

## Suggested change tags

- **[V]** Visual / CSS-only (no logic change, no API change) — items 3, 5
- **[I]** Information architecture (add data already in the model to the surface) — items 1 (auditor PM gaps), 4
- **[F]** Feature / new functionality (requires backend or fixture work) — items 1 (record flow audit), 2 (out-of-spec fixture + sticky warning)

## Cross-reference

- v1 baseline: [audit-2026-05-18-ux-roundtable.md](audit-2026-05-18-ux-roundtable.md) + [§6 of detail](audit-2026-05-18-ux-roundtable-detail.md)
- j10 spec: [ux/j10.md](ux/j10.md)
- Personas: [personas-jtbd.md §1.2 Carmen](personas-jtbd.md) · [§1.3 Line Cook](personas-jtbd.md)
- Design system: [ux/DESIGN.md](ux/DESIGN.md)
- Screenshots: `docs/audit-2026-05-18-v2-screenshots/03-haccp-desktop.png` · `03-haccp-mobile.png`
- PRs verified: #193 (CCP Spanish translation), #195 (per-CCP status row), #197 (Generar expediente APPCC CTA)
