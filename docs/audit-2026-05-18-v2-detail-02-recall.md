---
title: UX/UI Roundtable Audit v2 — Tab 02 Recall (post-PR #194)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  Master post-deploy review of PR #194 (CrisisLayout + countdown + paprika
  banner + EU 178/2002 footer). v1 audit (2026-05-18-ux-roundtable.md) called
  Recall the worst offender — "shipped ~10% of j6.md spec". v2 verifies the
  fix landed and re-scores spec coverage.
method: |
  Manual inspection of the two new screenshots (desktop 1440×900, mobile
  iPhone-class portrait) against `docs/ux/j6.md` (canonical Recall spec)
  and `docs/ux/DESIGN.md` (token / typography / spacing contract). Five-
  persona roundtable: UX/UI designer, Owner Roberto (panic operator), food
  safety auditor, PM (spec coverage), lawyer / compliance officer.
related:
  - docs/audit-2026-05-18-ux-roundtable.md (v1 baseline)
  - docs/ux/j6.md (Recall canonical spec — bible)
  - docs/ux/DESIGN.md
  - docs/personas-jtbd.md
  - docs/audit-2026-05-18-v2-screenshots/02-recall-search-desktop.png
  - docs/audit-2026-05-18-v2-screenshots/02-recall-search-mobile.png
  - PR #194 (CrisisLayout + countdown + paprika banner + reg footer)
---

# UX/UI Roundtable Audit v2 — Tab 02 Recall (post-PR #194)

## Executive summary (150 words)

PR #194 closed the structural gap v1 flagged: `CrisisLayout` is now mounted on
`/recall/investigate`, the top edge carries the 4 px paprika `--destructive`
rule, the eyebrow shows live `INVESTIGACIÓN DE INCIDENTE · 04:35 CEST · VENTANA
LEGAL 03:59:58` in tabular-nums, and the footer carries the EU 178/2002 reg
citation. Chrome (top nav, sidebar, theme switcher) is gone. The empty-state
"Sin coincidencias. Refina la búsqueda — o reporta sin lote conocido" sentence
matches j6.md §40 verbatim. **However**, the load-bearing recall machinery is
still missing: no sticky single CTA `Detener servicio + Generar dossier`, no
`Reportar sin lote conocido` ghost link as a tappable element, no candidate-
lot list contract, no autofocus signal visible, and the eyebrow links are
mute-on-mute (WCAG fail). Coverage is **~30% of j6.md** (was 10%) — Master's
read is correct. Three BLOCKERS remain before Recall can be called shipped.

### Top-3 BLOCKERS

1. **No sticky single CTA `Detener servicio + Generar dossier`** (j6.md §5,
   §38). The crisis surface's defining affordance is absent — the operator
   cannot 86-flag or dispatch the dossier from this screen. Empty-state mode
   may legitimately hide the destructive CTA, but a `Reportar sin lote conocido`
   sticky button MUST take its place (j6.md §40 — "single ghost link" is
   currently rendered as inline body text, not a button-grade affordance).
2. **`Reportar sin lote conocido` is invisible as an interactive element.**
   The empty-state strip reads as one sentence with no visual distinction
   between the dead text and the CTA phrase. j6.md §40 requires "a single
   ghost link" — there is no ghost link styling, no chevron, no `:focus-
   visible` indicator, no 48 px touch target. Roberto cannot find it; the
   screen-reader user will not perceive a link at all.
3. **`VENTANA LEGAL 03:59:58` countdown is mute-on-mute and reads as label,
   not as urgency.** The four-hour clock is the load-bearing reminder of
   regulatory pressure (j6.md §1, §67). At `--mute` weight on `--bg`, sized
   the same as the surrounding eyebrow, it has no rank. j6.md mandates
   tabular-nums (✓ present) but also that the digits "communicate urgency at
   minute 230 the way `01:30 restante` does" (§67) — current rendering does
   not.

### Biggest visual / copy gap vs j6.md

The screen renders **one of seven j6.md walkthrough regions**: the empty-state
post-search text (§7 / §40). Six are missing or stub:

- §1 Crisis banner — partial (paprika rule + eyebrow + countdown ✓; rule-to-
  eyebrow contrast and countdown weight wrong)
- §2 Single search field — partial (field present, autofocus unverifiable from
  static screenshot, **placeholder is wrong** — should be "pescado crudo
  Algorta esta semana" per §35, ships as "lote, proveedor, ingrediente,
  síntoma...")
- §3 Candidate lot list — **missing** (no row contract, no Fraunces serif lot
  code, no supplier/received-date eyebrow)
- §4 Forward-trace tree (`RecallTraceTree`) — **missing**
- §5 Sticky single-CTA bar `Detener servicio + Generar dossier` — **missing**
- §6 Confirmation strip — **missing** (gated on §5)
- §7 Empty state — present + copy verbatim ✓
- §8 No theme switcher, no nav, no avatar — ✓ (CrisisLayout earns this)

### Verdict — 30% or 50%?

**30%.** PR #194 delivered the layout shell and the empty-state copy. The
recall capability itself — candidate ranking, forward-trace, 86-flag, dossier
dispatch — is not on this screen. The shell now correctly looks like a crisis
surface; the crisis workflow is not yet wired.

---

## What shipped (PR #194, verified against screenshots)

| j6.md region | Shipped? | Evidence in screenshot |
|---|---|---|
| §82 `CrisisLayout` mounted on `/recall/*` | ✓ | No top nav, no sidebar, no avatar; route owns its shell. |
| §1 4 px `--destructive` top rule (paprika, never red) | ✓ | Top edge carries a paprika rule. Width = viewport. |
| §1 Eyebrow `INVESTIGACIÓN DE INCIDENTE · 04:35 CEST · VENTANA LEGAL 03:59:58` | ✓ | All-caps tracked eyebrow, centred, three middle-dot-separated segments. |
| §1 Countdown in tabular-nums | ✓ | `03:59:58` digits do not shift width on tick. |
| §82 Reg-citation footer `REG. (CE) 178/2002 ART. 19 · PLAZO 4 H` | ✓ | Footer bottom-centred, mute weight, all-caps tracked. |
| §2 Single search field, full width | ✓ | One input, magnifier icon left-aligned, no other fields competing. |
| §2 Touch target ≥ 56 px | partial | Visual height looks ≥48 px; the spec wants ≥56 px because "the operator is shaking" — hard to verify from a screenshot but the form-factor reads at the lower bound. |
| §7 / §40 Empty-state copy `Sin coincidencias. Refina la búsqueda — o reporta sin lote conocido.` | ✓ verbatim | Single mute sentence in a `--surface` strip beneath the field. |

## What did NOT ship (still missing from j6.md)

| j6.md region | Status | Why this matters |
|---|---|---|
| §5 Sticky single CTA `Detener servicio + Generar dossier` | **MISSING** | The crisis surface's defining action. Even in empty state, a sticky `Reportar sin lote conocido` button should hold the slot (j6.md §40 promotes this to a real ghost button, not body text). |
| §3 `LotCandidateRow` list contract | MISSING (gated on search input) | Cannot verify; the empty-state screenshot precludes a populated list. Recommend a second screenshot with a 3-letter typed query to verify. |
| §4 `RecallTraceTree` mount-in-place behaviour | MISSING (gated on §3) | Cannot verify without a candidate selected. |
| §6 Confirmation strip (NOT modal) | MISSING (gated on §5) | Cannot verify. |
| §40 `Reportar sin lote conocido` rendered as a tappable ghost link | NOT INTERACTIVE | Currently inline mute text. No `<a>` / `<button>` affordance visible — no underline, no chevron, no focus ring. |
| §2 Placeholder `pescado crudo Algorta esta semana` | DRIFT | Ships as `lote, proveedor, ingrediente, síntoma...` — generic field-hint copy that teaches the operator the schema rather than the natural-language search the spec demands. |
| §2 Autofocus on mount | UNVERIFIED | Static screenshot cannot confirm; recommend a Playwright assertion. |
| §1 Live countdown weight / hierarchy | INSUFFICIENT | Countdown digits should out-rank the surrounding eyebrow (the spec implies "load-bearing reminder", §1 §67). Current rendering is mute-on-mute, same size as the eyebrow text — reads as a label not a clock. |
| §1 First-paint < 800 ms on 4G NFR | UNVERIFIED | Not visible from a screenshot. |
| §1 Server-side clock seed (to avoid clock-skew anxiety) | UNVERIFIED | Not visible from a screenshot. |
| §1 Eyebrow contrast `--mute` on `--bg` ≈ 5:1 | partial | The mute eyebrow looks WCAG-AA on cream but the orange-tinted segments (`INVESTIGACIÓN DE INCIDENTE`, `VENTANA LEGAL`) appear washed — may dip below AA at small caps. Needs a contrast check. |

---

## Top-5 flags

1. **[BLOCKER]** No sticky CTA — even an empty-state CTA `Reportar sin lote
   conocido` should occupy the slot. Currently the bottom 70% of the viewport
   is empty cream. j6.md §5 + §40.
2. **[BLOCKER]** `Reportar sin lote conocido` is body text, not a ghost link.
   No affordance, no contrast cue, no touch target. j6.md §40.
3. **[BLOCKER]** Countdown is mute-on-mute and same size as the eyebrow label.
   Should be bolder, larger, or higher-contrast so it pulls the eye. j6.md §1
   §67.
4. **[MAJOR]** Search placeholder `lote, proveedor, ingrediente, síntoma...`
   teaches the operator the field schema. j6.md §35 wants a natural-language
   example (`pescado crudo Algorta esta semana`) so the persona models the
   search behaviour, not the DB.
5. **[MAJOR]** Massive vertical vacuum (~85% of the desktop viewport is empty
   cream). Even with no results, a CTA + a 2-line "what to do next" eyebrow
   (e.g. "Si no tienes el lote, reporta el incidente sin lote y completaremos
   la traza después") would orient the panic operator.

## Per-persona verbatim

### 1. UX/UI designer

> "PR #194 fixed the chrome. The shell is correct — paprika rule, centred
> eyebrow, no nav, reg footer. That alone earns 20 points. What it doesn't fix
> is hierarchy. The countdown `03:59:58` is the entire reason this surface
> exists, and it's rendered the same weight and colour as the label
> `VENTANA LEGAL` next to it. The eye doesn't know where to land. Make the
> digits one step bolder (`--ink` or one shade darker than mute), one step
> larger (`--text-lg` or `--text-xl`), and give them their own column so the
> label sits to the left and the timer sits to the right. Right now it's a
> word salad in capitals.
>
> The search field is fine — one field, full width, magnifier glyph, accent
> focus ring. Good. But the placeholder is wrong. Reading
> `lote, proveedor, ingrediente, síntoma…` tells me the developer thought
> about the data model. The mock teaches the operator: type the way you talk.
> `pescado crudo Algorta esta semana` is a sentence Roberto would actually
> type at 02:14.
>
> The empty-state strip is the right shape and the right copy. But the
> `Reportar sin lote conocido` phrase has the same colour weight as the rest
> of the sentence. j6.md §40 calls it a ghost link — make it look like one.
> An underline, an arrow `→`, a focus ring. Mobile users tap-targeting that
> phrase will miss.
>
> Vertical vacuum: 85% of the screen is empty cream. Even on a crisis
> surface this reads as "wireframe forgot to finish". Either pull the
> search field down by 30% so it sits at thumb-zone (mobile reality), or
> add the sticky CTA slot at the bottom even in empty mode so the layout
> commits to its skeleton."

### 2. Owner Roberto (panic mode at 02:14, multi-venue, mobile-first)

> "Vale. He llegado aquí porque un cliente está en urgencias y no sé si fue
> el pescado del martes o un postre que llevaba huevo. Mi pulso es 110, son
> las dos de la madrugada, y el teléfono lo agarro con una mano mientras con
> la otra busco en WhatsApp el número de la aseguradora.
>
> Lo bueno: NO veo el panel normal. La franja roja arriba me dice 'esto va
> en serio'. El reloj que cuenta hacia atrás me dice 'tienes 4 horas, idiota'.
> Eso lo entiendo a los 0.3 segundos. Bien.
>
> Lo malo: no veo dónde tocar para parar el servicio. Yo esperaba un botón
> grande, abajo, que dijera 'CORTA AHORA + MANDA EL DOSSIER'. No lo veo. Lo
> que veo es una caja vacía con texto gris. Si no encuentro mi lote en el
> buscador, ¿qué hago? Hay una frase 'o reporta sin lote conocido' pero
> parece parte del texto, no parece un botón. ¿Toco ahí? ¿Cómo sé que es
> tappable? En el móvil el tap zone es minúsculo.
>
> El placeholder del buscador me confunde: dice 'lote, proveedor,
> ingrediente, síntoma...'. Yo no sé qué lote pedí el martes — lo busco
> precisamente porque NO lo sé. Si me hubiera dicho 'pescado crudo Algorta
> el martes' me copiaba ese patrón y escribía lo mío.
>
> Móvil: el reloj se rompe en dos líneas (`VENTANA LEGAL` arriba, `03:59:58`
> abajo, centrado raro). El countdown queda escondido. En una crisis lo
> primero que tengo que ver es el cronómetro — no debe romperse a 390 px de
> ancho.
>
> Si pudiera pedir una cosa: el botón rojo abajo. Pegajoso. Siempre visible.
> Aunque diga 'Reportar incidente sin lote' cuando no he buscado nada. Pero
> que esté ahí. Sin eso no sé qué me ofrece esta pantalla."

### 3. Food safety auditor (regulatory traceability lens, EU 178/2002)

> "El footer cita `REG. (CE) 178/2002 ART. 19 · PLAZO 4 H`. Correcto.
> Artículo 19 obliga al explotador de empresa alimentaria a retirar del
> mercado cualquier alimento bajo su control cuando tenga motivos para creer
> que no cumple los requisitos de seguridad, y a notificar a la autoridad
> competente. El plazo razonable para esa notificación, derivado del RASFF
> y de la práctica nacional, es 4 horas — esto el operador lo está
> respetando con el countdown. Bien.
>
> Pero falta el **artículo 18 §4**: 'los explotadores deberán disponer de
> sistemas y procedimientos que permitan poner esta información a
> disposición de las autoridades competentes que así lo soliciten'. Lo que
> el regulador inspecciona es el ROUND TRIP: ¿podemos demostrar que se
> activó la búsqueda, que se identificó el lote, que se cortó el servicio
> en todas las sedes implicadas, que se generó y envió el dossier, y todo
> con timestamp inalterable?
>
> En esta pantalla no veo el botón que dispara ese round trip. Si el
> operador no puede generar el dossier desde aquí, el countdown es teatro.
> El regulador no acepta 'estaba a punto de hacerlo'. Lo que importa
> jurídicamente es la marca de tiempo del audit_log row `recall.dispatch-
> 86-flag` (ADR-025, ADR-031 confirmado en j6.md §73), y esa marca sólo
> aparece cuando hay un CTA que la dispara.
>
> Aspecto positivo: la ausencia total de chrome (no hay nav, no hay
> dashboard de fondo) refleja que el operador no se distrae. Eso, en un
> juicio, lo argumentamos como diligencia debida — el sistema canalizó al
> operador hacia la acción regulatoria.
>
> Sugerencia adicional: añadir en el footer una segunda línea con `ART. 18
> §4 · TRAZA OPERATIVA` para señalar que esta pantalla es parte del sistema
> trazable que el inspector puede auditar. Hoy el operador no sabe que cada
> tecla queda registrada en audit_log; el regulador sí necesita verlo
> citado."

### 4. PM (j6.md spec coverage)

> "Coverage scoring, region by region, against `docs/ux/j6.md`:
>
> | Region | Spec line | Status | Score |
> |---|---|---|---|
> | §1 Crisis banner (4px paprika + eyebrow + countdown) | §34 | partial — banner present, countdown weight insufficient | 8/10 |
> | §2 Single search field (full-width + autofocus + placeholder + ≥56px) | §35 | partial — field + width ✓, placeholder ✗, autofocus unverified, touch height ≈50px | 5/10 |
> | §3 Candidate lot list (`LotCandidateRow`) | §36 | not present in screenshot (empty state) | 0/10 verifiable |
> | §4 `RecallTraceTree` mount-in-place | §37 | not present (gated on §3) | 0/10 verifiable |
> | §5 Sticky single-CTA bar `Detener servicio + Generar dossier` | §38 | **missing** | 0/10 |
> | §6 Confirmation strip (NOT modal) | §39 | not present (gated on §5) | 0/10 verifiable |
> | §7 Empty state copy | §40 | present + verbatim | 10/10 |
> | §40 `Reportar sin lote conocido` ghost link | §40 | rendered as body text, not interactive | 2/10 |
> | §8 No theme / nav / avatar | §41 | ✓ CrisisLayout earns this | 10/10 |
> | §82 `CrisisLayout` shell + dedicated layout exemption | §82 | ✓ | 10/10 |
> | §73 `recall.dispatch-86-flag` audit row | §73 | cannot ship without §5 CTA — gated | 0/10 |
> | §77 First-paint < 800ms on 4G NFR | §77 | unverifiable from screenshot | – |
> | §81 Dark-mode override (paprika stays) | §81 | unverifiable (light-mode screenshot only) | – |
>
> Weighted score across the verifiable regions: **~30%** of j6.md is on
> screen. v1 baseline was ~10% (shell missing entirely). PR #194 added
> the shell and the empty-state copy; it did not add the recall capability.
>
> Spec gaps to file as M3.x follow-ups (priority order):
>
> 1. [F1] Sticky single-CTA bar `RecallActionBar` component — empty state
>    holds `Reportar sin lote conocido` ghost variant, populated state
>    holds `Detener servicio + Generar dossier` paprika variant.
> 2. [F2] `LotCandidateRow` component with Fraunces lot code, supplier
>    name, natural-date eyebrow, drill-down handler.
> 3. [F3] `RecallTraceTree` — gated on F2 and the recursive CTE per ADR-028.
> 4. [F4] `RecallConfirmationStrip` — gated on F1.
> 5. [F5] Placeholder copy correction: `pescado crudo Algorta esta semana`.
> 6. [F6] Countdown hierarchy fix: digits one weight + size step above the
>    eyebrow label.
> 7. [F7] Autofocus + tabular-nums + server-clock-seed integration tests.
> 8. [F8] Dark-mode validation per §81.
>
> Recommendation: bundle F1+F5+F6 as a 'crisis-shell-finishing' slice —
> they're cheap and they're what the persona feels. F2+F3+F4 as a 'recall-
> capability' slice — that's the actual journey closure. Without the
> capability slice, Recall is decorative."

### 5. Lawyer / compliance officer

> "From a liability standpoint, the surface is now defensible at the
> presentation layer in a way the v1 version was not. The 4-hour countdown
> citing 'VENTANA LEGAL' plus the footer reference to Reg. 178/2002 art. 19
> creates an explicit good-faith signal: the operator was confronted with
> the legal timeline at every second they spent on this screen. In a
> regulatory audit or a civil claim, that is the first paragraph of our
> defence — the system did not let the operator forget the deadline.
>
> However, three operator-protection gaps remain:
>
> **(a) Action gap.** The screen reminds the operator of the duty but does
> not provide the mechanism to discharge it. If the regulator asks 'why
> didn't you dispatch the dossier within the 4-hour window?', 'the button
> wasn't there' is not a defence — but it IS a defence to argue
> 'reasonable reliance on the product'. We want the product to discharge
> the duty for the operator, not just remind them of it. The sticky CTA
> is therefore a compliance-grade requirement, not just a UX nicety.
>
> **(b) Notification gap.** Art. 19 also requires notification to the
> competent authority when there is reason to believe the food is unsafe.
> The current footer cites art. 19 generically. I would split the citation
> into two lines or two segments so the operator can see both duties: the
> 4-hour traceability response (art. 18 §4) AND the immediate notification
> obligation (art. 19). One generic reference may be argued by opposing
> counsel as boilerplate.
>
> **(c) Evidence-of-attempt gap.** The 'Reportar sin lote conocido'
> fallback — currently dead text — is the operator's escape hatch when
> they cannot identify the lot in time. Burying it as body text is risky:
> if the operator does not see the fallback and the 4 hours expire without
> a dossier, the regulator will read the screen as designed to make the
> fallback hard to reach. Make it a visible ghost button. From a Reg.
> 178/2002 lens, the option to report-without-lot is itself part of the
> notification obligation — the operator must be able to discharge the
> duty even with incomplete information.
>
> Recommended copy additions:
>
> - Below the search field, in `--mute` `--text-xs`: 'Cada acción en esta
>   pantalla queda registrada en el log de auditoría con marca de tiempo
>   inalterable.' (Reinforces art. 18 §4 traceability + GDPR art. 30
>   record-of-processing posture.)
> - In the footer, second line: 'Esta acción discurre los plazos del
>   art. 19 — el sistema preserva la cadena de custodia en audit_log.'
>
> Net: the legal posture moved from 'absent' to 'present but unfinished'.
> Close the action gap (sticky CTA) and the surface becomes a defence
> exhibit rather than a liability."

---

## Suggested changes — tagged [V] visual · [I] interactive · [F] follow-up

### Visual

- **[V1]** Countdown hierarchy. Bump `03:59:58` from current mute eyebrow
  weight to `--ink` `--text-lg` `font-weight: 600` `tabular-nums`. Keep the
  `VENTANA LEGAL` label at current mute eyebrow weight. The digits must
  out-rank the surrounding text.
- **[V2]** Eyebrow segments `INVESTIGACIÓN DE INCIDENTE` and `VENTANA
  LEGAL` currently render in a warm tan / orange-rust hue that may dip
  below WCAG-AA at small caps on `--bg`. Either lift the tint chroma down
  toward `--mute` proper, or step the size up to `--text-sm` so the AA
  large-text threshold (≥3:1) applies.
- **[V3]** Mobile eyebrow wrap. At 390 px viewport, `VENTANA LEGAL
  03:59:58` wraps with `03:59:58` on a new line, centred — visually
  detaches the digits from the label. Apply `white-space: nowrap` to the
  `VENTANA LEGAL <countdown>` segment, OR break the eyebrow into two
  rows by design (label row + countdown row, countdown row larger).
- **[V4]** Empty-state strip width and contrast. The `Sin coincidencias…`
  panel on `--surface` is currently the same width as the search field
  above it — visually attached. Add 8 px vertical gap so it reads as a
  separate result region.
- **[V5]** Footer hierarchy. `REG. (CE) 178/2002 ART. 19 · PLAZO 4 H` is
  fine at mute eyebrow weight. Per lawyer feedback, split into two
  middle-dot segments — first line keeps the reg citation, second line
  adds `ART. 18 §4 · TRAZA OPERATIVA · CADA ACCIÓN EN AUDIT LOG` so the
  inspector reading the screenshot sees both duties surfaced.
- **[V6]** Vertical vacuum at desktop (≈85% empty cream below the search
  field). Either pull the search field down by 30vh to honour thumb-zone
  on mobile-first (and let desktop sit higher than the canonical
  half-screen), or commit to the sticky CTA slot at the bottom so the
  layout earns its skeleton.

### Interactive

- **[I1]** Sticky single-CTA bar (`RecallActionBar`). j6.md §5 + §38 +
  §40. Two variants:
  - Empty state (no candidate selected) → ghost button `Reportar sin lote
    conocido`, full width minus 24 px gutter, 64 px height, mute border,
    `--mute` text.
  - Populated state (candidate selected) → paprika button `Detener
    servicio + Generar dossier`, same geometry, `--destructive` bg,
    `--accent-fg` text.
- **[I2]** Convert the empty-state `Reportar sin lote conocido` phrase
  from inline body text to a `<button>` ghost link with underline,
  trailing chevron `→`, 48 px touch target, focus ring per DESIGN.md §7.
  Even after [I1] lands, the inline link is the secondary route the
  operator hits if they overlook the sticky CTA.
- **[I3]** Search-field placeholder change: `lote, proveedor, ingrediente,
  síntoma…` → `pescado crudo Algorta esta semana` (j6.md §35 verbatim).
  Teaches natural-language search.
- **[I4]** Verify autofocus on mount. Currently the screenshot does not
  show a focus ring on the search field — Playwright assertion required.
  j6.md §35.
- **[I5]** `:focus-visible` ring on the search field per DESIGN.md §4 — 3
  px `--accent` outline, 2 px offset. The current outline (1 px thin
  rectangle within the field) reads as the field's own border, not as a
  focus indicator.
- **[I6]** Add `aria-live="polite"` to the empty-state strip and to the
  future candidate-list region so screen readers announce result changes
  as the operator types.
- **[I7]** Footer-row second line (per lawyer) added as `<p>` with `<abbr
  title="Reglamento (CE) 178/2002, artículo 18 §4: trazabilidad
  operativa">ART. 18 §4</abbr>` so the abbreviation expands on hover /
  long-press for the regulator.

### Follow-ups (file as M3.x slices)

- **[F1]** Implement `LotCandidateRow` per j6.md §36 — lot code in
  Fraunces serif, supplier name, natural-date eyebrow (`el martes 09:30`),
  menu-item eyebrow, ≥48 px touch target. Drill-down handler routes to
  trace tree.
- **[F2]** Implement `RecallTraceTree` per j6.md §37 — root = lot,
  children = recipes, grandchildren = menu items, great-grandchildren =
  location × service-window leaves. Single accent rule per depth level,
  no nested cards. SQL recursive CTE per ADR-028.
- **[F3]** Implement `RecallConfirmationStrip` per j6.md §39 — strip
  below the CTA (NOT modal), confirm pill + ghost back, morphs to
  receipt on dispatch.
- **[F4]** Server-clock seed for the countdown per j6.md §1 + §77 to
  avoid clock-skew anxiety. Countdown reads from server-time at first
  render, then ticks client-side.
- **[F5]** Dark-mode validation per j6.md §81 — paprika destructive
  stays paprika, cream canvas inverts to warm charcoal `oklch(20% 0.012
  70)`. Take a screenshot at `prefers-color-scheme: dark` and verify.
- **[F6]** `prefers-reduced-motion` audit per j6.md §80 — every
  transition disabled. Countdown continues to tick (data, not motion).
- **[F7]** First-paint < 800 ms on 4G NFR per j6.md §77 — verify with a
  Lighthouse run under 4G throttling.
- **[F8]** WCAG-AA validation on the new paprika rule + eyebrow + mute
  footer per j6.md §83 — automated axe-core run on
  `/recall/investigate`.
- **[F9]** `recall.dispatch-86-flag` MCP capability wiring (gated on
  [I1] populated state). Per j6.md §79 the same handler must fire from
  Hermes (WhatsApp / Telegram) and from this surface — single MCP
  endpoint, multiple agent surfaces.
- **[F10]** Document j6 acceptance gates as a checklist (not prose) in
  the slice template, per v1 audit insight ("convertir las regiones de
  cada j*.md en checklist de acceptance en lugar de prosa").

---

## Verdict

Recall moved from **~10% (v1) → ~30% (post-PR #194)** of j6.md spec
coverage. The structural shell is correct; the recall capability is
absent. Three blockers (sticky CTA, ghost-link affordance, countdown
hierarchy) gate a credible v3. Estimated effort: 1 slice for the
crisis-shell finishing items (`[V1-V6]` + `[I1-I7]` minus F-tagged); a
second slice for the recall capability itself (`[F1-F3]`). Until both
ship, Recall is a defensible-but-decorative crisis surface — the
regulator timeline is communicated, but the regulator-required action
cannot be taken from this screen.
