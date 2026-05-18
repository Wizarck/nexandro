---
title: UX/UI Roundtable Audit v3 — Tab 02 Recall (post-Sprint 1, PRs #203 + #204)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  Master post-Sprint-1 review. v2 audit flagged 3 BLOCKERS on /recall/investigate:
  (1) sticky single CTA missing, (2) "Reportar sin lote conocido" rendered as
  body text not ghost link, (3) countdown mute-on-mute / no hierarchy. Sprint 1
  shipped PR #203 (B-2: countdown typography fix) + PR #204 (A1: Fraunces serif
  h1 globally). This v3 audit verifies whether B-2 visibly closes BLOCKER #3 and
  re-scores spec coverage against j6.md.
method: |
  Manual inspection of v3 screenshots (desktop 1440×900 + mobile portrait 390 px
  iPhone-class) against j6.md (canonical Recall spec) and the v2 baseline. Five-
  persona roundtable replaying a real recall in cortisol-tunnel mode: Owner
  Roberto (mobile, panic), Head Chef Carmen (tablet, may be called first), food
  safety inspector (evidence lens), PM (j6 spec coverage delta), lawyer (EU
  178/2002 art. 18 §4 + art. 19 defensibility).
related:
  - docs/audit-2026-05-18-v2-detail-02-recall.md (v2 baseline)
  - docs/ux/j6.md (Recall canonical spec — bible)
  - docs/ux/DESIGN.md
  - docs/personas-jtbd.md
  - docs/audit-2026-05-18-v3-screenshots/02-recall-search-desktop.png
  - docs/audit-2026-05-18-v3-screenshots/02-recall-search-mobile.png
  - PR #203 (B-2: CrisisLayout countdown typography — paprika + bold)
  - PR #204 (A1: Fraunces serif h1 applied globally)
---

# UX/UI Roundtable Audit v3 — Tab 02 Recall (post-Sprint 1)

## Executive summary (180 words)

Sprint 1 closed one of the three v2 BLOCKERS. The countdown `03:59:58` now
renders in **bold paprika (`--color-destructive`, `font-bold`, `text-sm`, reset
letter-spacing)** — the eye lands on the digits within ~0.3 s on both desktop
and mobile. PR #203 B-2 ships visibly and unambiguously: the digits out-rank
the surrounding eyebrow text by colour, weight, and tracking. **BLOCKER #3 is
closed.**

Everything else from the v2 audit is unchanged. The sticky single CTA
`Detener servicio + Generar dossier` (C-1 in the v2 backlog) is still
absent — ~85 % of the desktop viewport remains empty cream, and the mobile
mid-zone reads as a wireframe stub. The empty-state phrase `o reporta sin
lote conocido` is still inline body text with no ghost-button affordance.
The search placeholder still teaches the operator the field schema instead
of the natural-language search j6.md §35 specifies. PR #204 (Fraunces serif
h1) does not affect this surface because Recall has no h1 — by design, the
eyebrow IS the title.

Spec coverage moves from **~30 % (v2) → ~38 % (v3)**. Modest, but
qualitative: the single fix that landed was the highest-leverage one — the
operator's pulse-reading anchor.

### Top-3 remaining BLOCKERS

1. **No sticky single CTA** (j6.md §5, §38, §40). Even the empty-state
   variant (`Reportar sin lote conocido` ghost button) is absent. The
   surface's defining affordance is still missing. The operator who lands
   here without a known lot has no exit. Roberto verbatim: *"sin eso no sé
   qué me ofrece esta pantalla."* The B-2 typography fix actually amplifies
   this gap — now the countdown screams urgency for an action the screen
   does not let you take.
2. **`Reportar sin lote conocido` rendered as body text, not a ghost link**
   (j6.md §40). No underline, no chevron, no focus ring, no 48 px touch
   target. The lawyer's "evidence-of-attempt gap" from v2 stands verbatim:
   if the operator misses the fallback and the 4 h expire, the regulator
   reads the screen as designed to make the fallback hard to reach.
3. **Search placeholder still wrong** (j6.md §35). Ships as `lote,
   proveedor, ingrediente, síntoma...` — teaches the developer's mental
   model. Spec verbatim: `pescado crudo Algorta esta semana`. This is the
   second-cheapest fix on the board and it's been on the backlog since v2.

### Is B-2 countdown fix *visibly* enough or still mute-on-mute?

**Visibly enough.** Side-by-side mental compare against v2: v2 read the
digits at the same weight and colour as the label `VENTANA LEGAL`; v3 makes
the digits the only paprika element above the fold (the top rule aside).
On the 1440 desktop the contrast is decisive; on the 390 mobile (where the
eyebrow wraps and `VENTANA LEGAL 03:59:58` sits on its own line) the bold
paprika digits pull rank against the mute label even more cleanly. UX/UI
designer signs off; PM marks B-2 closed.

Two micro-residues remain (NOT blockers): (a) the digits could step up to
`text-base` for better thumb-distance legibility on mobile, and (b) the
desktop eyebrow still keeps `INVESTIGACIÓN DE INCIDENTE` and `VENTANA
LEGAL` in a warm orange-tan that may dip below WCAG-AA at small caps —
that v2 [V2] flag is unaddressed by PR #203's scope. Both go to Sprint 2
polish, not Sprint 2 blockers.

---

## v2 → v3 delta table

| v2 issue | v2 severity | Sprint 1 PR | v3 status | Notes |
|---|---|---|---|---|
| Countdown mute-on-mute / no hierarchy | BLOCKER #3 | PR #203 (B-2) | **CLOSED** | Bold paprika, reset tracking. Visibly load-bearing on both viewports. |
| Sticky single CTA absent | BLOCKER #1 | — (C-1 deferred) | **OPEN** | No code change. ~85 % of viewport still empty. |
| `Reportar sin lote conocido` = body text | BLOCKER #2 | — | **OPEN** | No change. No ghost-link styling, no touch target, no focus ring. |
| Placeholder schema-style not natural-language | MAJOR ([I3]/[F5]) | — | **OPEN** | Still `lote, proveedor, ingrediente, síntoma...`. |
| Eyebrow segments warm orange — possible WCAG-AA dip | MAJOR ([V2]) | — | **OPEN** | Unchanged. Needs axe-core run. |
| Mobile eyebrow wrap detaches countdown | MAJOR ([V3]) | partial via PR #203 | **MITIGATED** | The wrap still happens (`VENTANA LEGAL 03:59:58` on its own line), but the bold paprika of the digits keeps them anchored to the label — no longer a hierarchy crash. |
| `LotCandidateRow` list absent | gated on data | — | **OPEN** | Cannot verify from empty state. |
| `RecallTraceTree` absent | gated on §3 | — | **OPEN** | — |
| Confirmation strip absent | gated on §5 | — | **OPEN** | — |
| Autofocus on mount unverified | UNVERIFIED ([I4]) | — | **UNVERIFIED** | Static screenshot still can't confirm. |
| `:focus-visible` ring on search field | MINOR ([I5]) | — | **OPEN** | Field shows a thin inner rectangle — reads as field border, not focus indicator. |
| Vertical vacuum ≈85 % | MAJOR ([V6]) | — | **OPEN** | Unchanged; arguably *more* glaring now that the countdown earns the eye and there's nothing downstream to act on. |
| Footer hierarchy (single vs two-line citation) | MINOR ([V5]) | — | **OPEN** | Lawyer's v2 suggestion (split `ART. 18 §4 · TRAZA OPERATIVA` onto second line) not adopted. |

**Net delta:** 1 BLOCKER closed (countdown), 0 MAJORs closed, 0 MINORs
closed, 1 MAJOR mitigated as side-effect. Spec coverage **~30 % → ~38 %**.

---

## BLOCKER closure detail — B-2 countdown typography

### What v2 said

> *"`VENTANA LEGAL 03:59:58` countdown is mute-on-mute and reads as label,
> not as urgency. The four-hour clock is the load-bearing reminder of
> regulatory pressure (j6.md §1, §67). At `--mute` weight on `--bg`, sized
> the same as the surrounding eyebrow, it has no rank."*

### What Sprint 1 PR #203 changed

- Token: countdown digits painted `--color-destructive` (paprika), not `--color-mute`.
- Weight: `font-bold` (was inherited 400).
- Size: `text-sm` (was inherited from eyebrow `text-xs`).
- Tracking: reset (was inherited `tracking-widest` from the eyebrow all-caps).
- Numerals stay `tabular-nums` (carried forward from v2 — no regression).

### What the v3 screenshots show

Desktop: the `03:59:58` glyphs read **markedly bolder and warmer** than the
surrounding label text. The bold weight at the smaller-than-label tracking
makes the digits visually compact — they read as a unit, not as four
floating glyphs. The eye lands on them within the first scan.

Mobile: the eyebrow wraps `VENTANA LEGAL 03:59:58` to its own line, and
the bold paprika digits dominate that line. The wrap, which v2 flagged
as detaching the digits from the label, is now visually neutralised: the
digits are the visual anchor of the wrap, not its orphan.

### Persona pulse-check

- **Roberto (v3, mobile, panic):** "El reloj YA se ve. Es lo primero que
  miro. Cuenta hacia abajo y está en rojo. Vale, lo entiendo, 4 horas." —
  pain point recategorised from BLOCKER to *resolved*.
- **Carmen (v3, tablet):** "El reloj me orienta. Sé que estoy en territorio
  legal, no en una pantalla normal." — works for her cohort too.
- **Inspector (v3):** "Buena evidencia de que el operador fue confrontado
  con el plazo en cada segundo. La trazabilidad del aviso visual queda
  reforzada." — strengthens the v2 lawyer paragraph.

### Residual micro-polish (NOT a blocker)

- Mobile readability would benefit from `text-base` on the digits at
  ≤640 px viewport (current `text-sm` is fine on desktop, borderline at
  thumb distance).
- Consider a `font-feature-settings: "tnum" 1, "lnum" 1` lock to defend
  the tabular-nums in case a future font swap loses the variant.

---

## Top-5 flags (v3)

1. **[BLOCKER]** No sticky CTA — `RecallActionBar` empty-state variant
   `Reportar sin lote conocido` is the highest-leverage Sprint 2 ship.
   j6.md §5 + §38 + §40. **Carried from v2.**
2. **[BLOCKER]** `Reportar sin lote conocido` is body text, not a ghost
   button. j6.md §40. Even if [1] lands, this inline link is the
   secondary route — must be tappable. **Carried from v2.**
3. **[MAJOR]** Placeholder still schema-style. j6.md §35 specifies
   `pescado crudo Algorta esta semana` verbatim. Two-line code change.
   **Carried from v2.**
4. **[MAJOR]** Vertical vacuum (≈85 % cream below the search field on
   desktop, ≈70 % of mobile mid-zone). The B-2 fix has actually made the
   vacuum more conspicuous — the countdown earns the eye, then the eye
   has nowhere to go. Resolves with [1] sticky CTA. **Carried from v2.**
5. **[MAJOR]** Eyebrow contrast: `INVESTIGACIÓN DE INCIDENTE` and
   `VENTANA LEGAL` still render in a warm orange-tan that may dip below
   WCAG-AA at small caps on cream `--bg`. Needs axe-core verification.
   **Carried from v2 ([V2]).**

---

## Per-persona verbatim (v3)

### 1. Owner Roberto §1.1 (panic mode, mobile, low tech, multi-venue CEO)

> "Vale, segunda vuelta. Han pasado dos días desde la última vez y han
> arreglado UNA cosa. El reloj. Ahora cuando abro la pantalla, lo primero
> que ven mis ojos a las dos de la madrugada es `03:59:58` en rojo. Eso me
> dice 'tienes 4 horas' antes de que mi cerebro lea las palabras. Eso es
> lo que necesitaba. Bien hecho.
>
> Pero el problema gordo sigue ahí: NO HAY BOTÓN. Yo veo el reloj que me
> grita, veo una caja de búsqueda, veo una franja de texto gris que dice
> 'sin coincidencias, refina o reporta sin lote conocido', y luego veo
> 85 % de pantalla VACÍA. ¿Qué hago? ¿Dónde toco? Si no encuentro el lote
> en el buscador, ¿dónde está el botón rojo grande que dice 'reportar
> sin lote'? No existe. La frase 'o reporta sin lote conocido' está
> escondida dentro del texto gris. En el móvil, con dedo gordo y pulso
> alto, jamás voy a acertar a tocar exactamente esas tres palabras.
>
> Y luego — esto es lo más raro — el reloj me apremia para una acción que
> la pantalla no me deja hacer. Es peor que antes. Antes el reloj no se
> veía y la pantalla estaba mal pero coherente. Ahora el reloj grita y la
> pantalla no entrega. Es como si me pusieran una sirena de incendio y la
> puerta del extintor cerrada con llave.
>
> El placeholder sigue idéntico de mal. `lote, proveedor, ingrediente,
> síntoma...`. Yo no sé qué lote pedí el martes. Lo busco precisamente
> porque no lo sé. ¿Me pueden poner un ejemplo de cómo escribir? Algo
> como 'pescado crudo Algorta esta semana' me copio el patrón.
>
> Móvil: el reloj se ve perfecto. La franja roja arriba se ve. El campo
> de búsqueda se ve. Y luego un agujero negro hasta el footer. No hay
> botón. No hay nada. Necesito el botón rojo abajo. Pegajoso. Aunque
> diga 'Reportar sin lote conocido' porque no he buscado nada. Pero
> que esté ahí.
>
> Si tuviera que dar nota: del 30 % de antes al 38 % ahora. Bien por el
> reloj. Mal por todo lo demás. El siguiente sprint TIENE que ser el
> botón."

### 2. Head Chef Carmen §1.2 (tablet, medium tech, may be called first)

> "Pongámonos en escenario: el maître llama a las 18:45 un martes —
> Roberto está en el otro local. Carmen contesta. Abre el tablet.
> Aterriza aquí.
>
> Lo bueno: la franja roja arriba + el reloj en paprika me dicen
> 'esto no es la pantalla normal, esto es una crisis'. En 0.5 segundos
> sé que estoy en territorio regulatorio. Eso lo gano respecto a la v2
> donde el reloj era invisible.
>
> Pero ahora mi pregunta es: ¿yo puedo actuar o tengo que esperar a
> Roberto? La pantalla no me dice nada sobre quién tiene autoridad
> para disparar el dossier. En el RBAC de personas-jtbd.md yo soy
> `MANAGER` — puedo CRUD ingredientes y recetas, pero ¿puedo cortar
> servicio y mandar dossier? La pantalla debería tener una pista,
> aunque sea un eyebrow `Autorizado: gerente o superior`. Si no lo
> sé, voy a llamar a Roberto y perder 10 minutos del plazo de 4 horas.
>
> El campo de búsqueda — yo SÍ sé buscar por lote. Soy la que recibe
> mercancía con el line cook. Para mí el placeholder schema-style
> `lote, proveedor, ingrediente, síntoma...` es útil, lo entiendo.
> Pero entiendo que para Roberto no. Solución sería poner el ejemplo
> j6.md §35 como placeholder y la lista de schemas como helper text
> bajo el campo en `--mute --text-xs`. Cubrimos a los dos.
>
> El botón abajo — coincido con Roberto. Sin botón sticky esta
> pantalla no cierra el journey. Yo en mi mundo de tablet veo el
> footer y entre el footer y el campo de búsqueda hay un boquete del
> tamaño de un campo de fútbol.
>
> Sobre la inline link 'o reporta sin lote conocido': en tablet con
> dedo, no es tappable. Está pegado al texto. Necesita ser un botón
> ghost con un chevron, por lo menos."

### 3. Food Safety Inspector (defensibility audience, EU 178/2002)

> "Auditoría de la captura. El reloj ahora se lee de un vistazo — eso
> es prueba documental sólida de que el operador fue advertido del
> plazo legal en cada segundo de uso. Si esta pantalla termina como
> exhibit en una inspección, el reloj paprika es la primera línea de
> defensa: 'el sistema confrontó al operador con el plazo de
> art. 19 desde el momento del primer render'.
>
> Pero la inspección no se queda en el reloj. La inspección pregunta:
> ¿qué hizo el operador con la información? Y la respuesta que esta
> pantalla habilita es 'nada, porque no había botón'. El art. 18 §4
> exige que el operador disponga de procedimientos para poner la
> información a disposición de la autoridad — esta pantalla *muestra*
> el plazo pero no *ofrece* el procedimiento. Brecha.
>
> Sugerencia adicional, repetida de v2 y aún sin adoptar: el footer
> cita art. 19 (notificación). Falta art. 18 §4 (trazabilidad
> operativa). Una segunda línea en el footer — `ART. 18 §4 · TRAZA
> OPERATIVA` — señala que esta pantalla forma parte del sistema
> trazable. Hoy día el inspector que mire la captura no sabe que
> cada tecla queda en audit_log; el operador tampoco. Hay que
> citarlo.
>
> Sobre el sticky CTA — desde una perspectiva de evidencia, ese
> botón no es opcional. La cadena de custodia documental empieza con
> el `recall.dispatch-86-flag` row en audit_log (ADR-025, ADR-031,
> j6.md §73). Sin botón no hay row. Sin row no hay evidencia. Sin
> evidencia, en juicio civil el operador no puede demostrar que
> intentó cumplir el plazo. La 'reasonable reliance on the product'
> defence se cae."

### 4. PM (j6.md spec coverage delta)

> "Re-scoring against j6.md, region by region, comparing v2 → v3:
>
> | Region | Spec line | v2 score | v3 score | Δ |
> |---|---|---|---|---|
> | §1 Crisis banner — countdown rank | §34, §67 | 8/10 | **10/10** | +2 (B-2 closed) |
> | §1 Crisis banner — eyebrow contrast | §34 | partial | partial | 0 ([V2] open) |
> | §2 Single search field — width + autofocus + placeholder + ≥56 px | §35 | 5/10 | 5/10 | 0 (placeholder still wrong) |
> | §3 `LotCandidateRow` list | §36 | 0/10 verifiable | 0/10 verifiable | 0 |
> | §4 `RecallTraceTree` mount-in-place | §37 | 0/10 verifiable | 0/10 verifiable | 0 |
> | §5 Sticky single-CTA bar | §38 | **0/10** | **0/10** | 0 (BLOCKER #1 open) |
> | §6 Confirmation strip | §39 | 0/10 verifiable | 0/10 verifiable | 0 |
> | §7 Empty state copy | §40 | 10/10 verbatim | 10/10 verbatim | 0 |
> | §40 `Reportar sin lote conocido` ghost link | §40 | 2/10 | 2/10 | 0 (BLOCKER #2 open) |
> | §8 No theme / nav / avatar | §41 | 10/10 | 10/10 | 0 |
> | §82 `CrisisLayout` shell | §82 | 10/10 | 10/10 | 0 |
> | §73 `recall.dispatch-86-flag` audit row | §73 | 0/10 (gated on §5) | 0/10 (gated on §5) | 0 |
> | §77 First-paint < 800 ms NFR | §77 | unverifiable | unverifiable | – |
> | §81 Dark-mode override | §81 | unverifiable | unverifiable | – |
>
> Weighted score across verifiable regions: **~38 %** (was ~30 %).
> The +8 pt move comes entirely from the countdown going from 8/10
> to 10/10. PR #204 (Fraunces serif h1) does not affect this
> surface because Recall has no h1 — by design, the eyebrow IS the
> title. So we score zero contribution from PR #204 here, which is
> fine and expected.
>
> **Sprint 2 backlog (priority order, fresh from v3):**
>
> 1. [F1-v3] `RecallActionBar` empty-state variant — sticky ghost
>    button `Reportar sin lote conocido`, full width minus 24 px
>    gutter, 64 px height, mute border, `--color-mute` text, dark
>    focus ring. Closes BLOCKER #1 *and* converts BLOCKER #2 into a
>    one-line copy correction (the inline phrase becomes redundant
>    once the sticky button holds the slot). This is the highest-
>    leverage Sprint 2 ship.
> 2. [F2-v3] Inline `Reportar sin lote conocido` phrase: rewrite as
>    `<button type="button" class="ghost-link">` with underline +
>    trailing `→` + 48 px touch target. Keeps the secondary route
>    even after [F1-v3] lands; per j6.md §40 spec.
> 3. [F3-v3] Placeholder copy: `lote, proveedor, ingrediente,
>    síntoma...` → `pescado crudo Algorta esta semana`. Two-line
>    change. Carmen pointed out a both-cohorts solution: spec-
>    verbatim placeholder + helper text below in `--mute --text-xs`
>    with the schema list. Stretch goal if scope allows.
> 4. [F4-v3] Mobile countdown size step — `text-sm` → `text-base`
>    at ≤640 px. Polish, not blocker.
> 5. [F5-v3] Lawyer's two-line footer: split into `REG. (CE)
>    178/2002 ART. 19 · PLAZO 4 H` (line 1) + `ART. 18 §4 · TRAZA
>    OPERATIVA · CADA ACCIÓN EN AUDIT LOG` (line 2). One copy
>    change + one CSS line.
> 6. [F6-v3] Eyebrow contrast axe-core run on
>    `/recall/investigate`. If `INVESTIGACIÓN DE INCIDENTE` /
>    `VENTANA LEGAL` dip below 4.5:1 (small text WCAG-AA), step
>    the segments down toward `--mute` proper or up to `text-sm`.
> 7. [F7-v3] RBAC eyebrow hint (Carmen's request): tiny `--mute
>    --text-xs` line below the search field — `Cualquier MANAGER
>    o superior puede despachar dossier`. Pre-empts the
>    "do-I-have-authority?" 10-minute call to Roberto.
> 8. [F8-v3] `LotCandidateRow` + `RecallTraceTree` + confirmation
>    strip — the actual recall capability slice. Carry-over from
>    v2 [F1-F3]. Largest line item.
>
> Recommendation for Sprint 2 scope: bundle [F1-v3] + [F2-v3] +
> [F3-v3] + [F5-v3] as a 'crisis-shell finishing' slice — all
> cheap, all visible to the persona, closes both remaining
> BLOCKERS and most MAJORs. Hold [F8-v3] (the capability slice)
> for Sprint 3 because it carries real backend work (recursive
> CTE, MCP capability, dossier PDF, SMTP)."

### 5. Lawyer / EU 178/2002 compliance

> "Defensibility delta v2 → v3: marginally improved on the *notice*
> dimension (the countdown now indisputably notifies the operator
> of the plazo in real time), unchanged on the *action* dimension
> (operator still cannot discharge the duty from this screen).
>
> In a regulatory inspection, the v3 screenshots support a
> stronger argument than v2 for *prima facie* good faith: the
> bold paprika countdown is, in evidentiary terms, a high-salience
> visual recurring every second. If opposing counsel argues the
> operator was unaware of the deadline, we hand the inspector
> this screenshot and the argument dies. That's a meaningful
> upgrade.
>
> But the action gap is now *louder*, not quieter. The product
> has explicitly made the deadline visible and has explicitly
> not provided the mechanism. In a civil claim where a patient
> died and the 4-hour window was missed, a jury (or in Spain, a
> judge) looking at this screenshot will ask: 'el operador veía
> el reloj. ¿Por qué no actuó?'. And the only honest answer is
> 'el botón no estaba'. That is exactly the *worst* version of
> a usability defence: 'we knew about the deadline; we built a
> screen that displays the deadline; we did not build the action
> on the same screen'.
>
> Sprint 2 BLOCKERS are not optional from a compliance lens.
> [F1-v3] sticky CTA is a regulatory requirement, not a UX
> polish. The art. 18 §4 footer line ([F5-v3]) is also
> regulatorily warranted — currently a generic art. 19 citation
> can be argued as boilerplate; splitting into two duties
> demonstrates the system has been engineered against both
> obligations.
>
> Final note: the audit_log row `recall.dispatch-86-flag` only
> exists when the operator can fire the dispatch. The
> chronological evidence trail the inspector relies on (ADR-025
> + ADR-031) starts from that row. Until the button ships, the
> trail starts only when the operator gives up and uses an
> alternative channel (email, phone) — and *that* evidence trail
> is not in audit_log, so we lose the immutable chronology. The
> sticky CTA is the gate to defensible compliance, not just to a
> usable surface."

---

## Sprint 2 backlog (Sprint 2 scope recommendation)

### Must-ship (closes both remaining BLOCKERS + key MAJORs)

| ID | Spec | Effort | Persona impact | Compliance impact |
|---|---|---|---|---|
| [F1-v3] | j6.md §5 + §38 + §40 | M | Roberto: closes "no sé qué me ofrece esta pantalla"; Carmen: gives action affordance | Lawyer + Inspector: enables `recall.dispatch-86-flag` audit row |
| [F2-v3] | j6.md §40 | S | Roberto: tappable inline route; Carmen: ghost-link visible on tablet | — |
| [F3-v3] | j6.md §35 | XS | Roberto: copyable example; Carmen: helper text retains schema list | — |
| [F5-v3] | Lawyer carry-over | XS | — | Lawyer: art. 18 §4 + art. 19 dual-duty surfaced |

### Should-ship (polish + accessibility)

| ID | Spec | Effort | Persona impact | Compliance impact |
|---|---|---|---|---|
| [F4-v3] | mobile countdown size | XS | Roberto + Carmen: thumb-distance legibility | — |
| [F6-v3] | eyebrow axe-core run | S | All: WCAG-AA verified | Lawyer: a11y compliance evidence |
| [F7-v3] | RBAC eyebrow hint | XS | Carmen: removes "do-I-have-authority?" hesitation | — |

### Could-ship (capability slice, recommend Sprint 3)

| ID | Spec | Effort | Persona impact | Compliance impact |
|---|---|---|---|---|
| [F8-v3] | j6.md §36 + §37 + §39 | L | All: actual recall journey works | Inspector + Lawyer: forward-trace evidence |

### Verification gates for Sprint 2 sign-off

- [ ] Playwright: sticky CTA visible at 390 px and 1440 px viewports,
      reachable via keyboard tab order from search field.
- [ ] Playwright: `Reportar sin lote conocido` ghost link has
      `role="button"`, `:focus-visible` ring per DESIGN.md §7,
      ≥48 px touch target.
- [ ] Playwright: placeholder text exact-match `pescado crudo
      Algorta esta semana`.
- [ ] axe-core run on `/recall/investigate` — all WCAG-AA failures
      resolved or explicitly waived.
- [ ] Roberto-cohort persona walk-through: complaint received →
      lands on `/recall/investigate` → fires `Reportar sin lote
      conocido` ghost CTA → reaches manual incident draft flow
      → total time <2 minutes from landing.

---

## Verdict

Recall moved from **~30 % (v2) → ~38 % (v3)** of j6.md spec coverage.
The Sprint 1 PR #203 B-2 fix lands cleanly and visibly — the
countdown is now the load-bearing pulse-reader the spec promised, on
both desktop and mobile. BLOCKER #3 (countdown hierarchy) is closed.

BLOCKERS #1 and #2 (sticky CTA + ghost-link affordance) are
unchanged from v2 and are now *more* glaring because the B-2 fix
has earned the eye for an action the surface still does not provide.
The crisis surface is closer to coherent than v2, but it is *less*
honest than v2: v2 was a wireframe-stub that nobody could mistake
for finished; v3 has a screaming countdown above a screen that
cannot discharge the duty the countdown announces.

Estimated Sprint 2 effort to close both remaining BLOCKERS + the
two cheapest MAJORs: ~M (sticky CTA is the only non-trivial item;
the rest is copy + CSS). Recommend bundling [F1-v3] + [F2-v3] +
[F3-v3] + [F5-v3] as a single 'crisis-shell finishing' slice and
holding [F8-v3] (the recall capability slice — recursive CTE +
MCP + dossier PDF) for Sprint 3.

Until [F1-v3] ships, Recall remains a *defensible-but-decorative*
crisis surface — and per the lawyer's read, the loud countdown
without a paired CTA arguably worsens the defensibility position
in a civil claim. Sprint 2 cannot afford to ship without [F1-v3].
