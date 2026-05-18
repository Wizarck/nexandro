---
title: UX/UI Roundtable Audit v3 — Detail 09 · Configuración (Settings shell + 3 sections)
status: canonical
last-updated: 2026-05-18
parent: docs/
v1-baseline: docs/audit-2026-05-18-ux-roundtable.md (single-page `/owner-settings` Etiquetas-only, ALL-CAPS)
v2-baseline: docs/audit-2026-05-18-v2-detail-09-settings.md (shell + 3 live sections + 4 próximamente, IPP/CUPS leaked)
v3-deploy: 2026-05-18 (PR #201 grid fix, #204 A1 serif h1+h2, #205 A3 save-icon, #206 A5+A6 EmptyStateCard + StickySaveBar, #203 B-5 dev-speak rewrite, #207 E-1 Avanzado:IA row)
related:
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/audit-2026-05-18-v2-detail-09-settings.md
---

# Detail 09 · Configuración shell + Negocio · Etiquetas · Privacidad — v3

v2 closed L2-1 (shell + left-nav) and L3-2 (sentence case). v3 went after grid alignment (PR #201), brand voice (#204 serif), dev-speak (#203), save-bar primitive (#206 A6), and roadmap honesty (#207 Avanzado:IA row). Result: Negocio is now within "polish" distance of GA; Privacidad regressed visually (screenshot renders at micro-scale on desktop — see Shell-wide F#1); Etiquetas barely moved — IT-admin plumbing still front-and-centre + the dev-fixture URL leak unfixed since v2.

The **StickySaveBar** primitive (A6) is present in code but invisible in the captured screenshots because the forms are at rest with `dirty == false`. That's the intended behaviour, but it leaves a v3 verification gap: we cannot confirm bar UX (height, contrast, sticky behaviour at viewport bottom, mobile bottom-bar collision with iOS Safari toolbar) from these images. Marked **VERIFY** below — needs a dirty-state screenshot before declaring A6 done.

---

## Spec-vs-reality (v3 delta)

| Region                                                  | v2 status      | v3 status                                                                                              |
|---------------------------------------------------------|----------------|--------------------------------------------------------------------------------------------------------|
| **Grid alignment** (sidebar 220 px + content 1fr)       | BROKEN (full-width sidebar pushing content off)  | FIXED (#201) — desktop renders proper 2-col. Verified in Negocio + Etiquetas desktop shots.            |
| **Serif h1 `Configuración`** (DESIGN.md §3 typographic-wink) | sans (flat)    | DONE (#204 A1) — Fraunces visible on h1 + h2 `Negocio`. Privacidad h2 also serif (visible despite micro-scale screenshot). |
| **Save button: icon + label** ("Guardar cambios")       | unlabelled disk icon | DONE (#205 A3) — `Imprimir etiqueta de prueba` + `Guardar cambios` in Etiquetas now show lucide icons. Negocio + Privacidad save now via StickySaveBar (next row).            |
| **StickySaveBar** (#206 A6) bottom-pinned, dirty-state  | n/a (button bottom-right only on Negocio + Privacidad) | LANDED in code, NOT VERIFIABLE from screenshots (forms at rest = bar hidden). Needs dirty-state capture. |
| **Dev-speak rewrite Identidad fiscal** (#203 B-5)       | "Aterrizan en la siguiente iteración junto con la migración de schema" | DONE — copy now reads "Pronto podrás añadir CIF/NIF/VAT, razón social y domicilio fiscal — los datos que tu asesoría te pide para facturas y exportes oficiales". Owner-credible.            |
| **EmptyStateCard upgrade** (#206 A5)                    | n/a            | LANDED but NOT used in Settings (Identidad fiscal placeholder still uses raw `<fieldset>` dashed border, not the new component). Misapplied opportunity.            |
| **Avanzado: IA · próximamente** row (#207 E-1)          | not present    | DONE — appears below Integraciones in left-nav, correctly muted + italic.                              |
| **Etiquetas — IPP/CUPS leak** (v2 BLOCKER #1)           | URL + Cola + Timeout + API key all visible to Owner | NOT FIXED — identical to v2. Owner Roberto still hits the wall here.                                   |
| **Etiquetas — `/static/brand-marks/...` URL externa default** (v2 visual leak) | leaks dev fixture | NOT FIXED — same UUID + cache-bust querystring still pre-filled.                                       |
| **Etiquetas — `Choose File No file chosen` native input through drag-drop** (v2 visual leak) | leaking | NOT FIXED — still visible right of dropzone in both desktop + mobile shots.                            |
| **Etiquetas — mobile dropzone text-wrap at 8 lines**    | broken         | NOT FIXED — mobile shot shows "Arrastra / una / imagen / aquí o / haz / clic / para / elegirla" stacking word-by-word.   |
| **Etiquetas — duplicated `Nombre del negocio` field**   | duplicated with Negocio | NOT FIXED — Etiquetas still has its own `Nombre del negocio` + Email + Teléfono + Dirección postal × 4. |
| **Privacidad — `Guardar cambios` button on read-only page** | false affordance | UNCLEAR from screenshot (renders at thumbnail scale). Likely still present — needs verification.        |
| **Próximamente entries** (Sedes, Usuarios, Facturación, Integraciones, Avanzado:IA) — disabled-cursor + tooltip | clickable-but-noop | NOT FIXED — no `cursor: not-allowed` evidence; no tooltip evidence. Now 5 rows instead of 4.            |
| **Privacidad screenshot rendering**                     | normal scale   | REGRESSED — desktop + mobile both render at thumbnail size (~290 × 175 px desktop). Either CSS bug (`max-width` clipping container), or screenshot capture bug. **VERIFY first.**   |

**v3 wins (vs v2)**

- Grid descuadre fixed — biggest functional win. Sidebar is now 220 px and content fills the rest; mobile collapses to vertical stack cleanly (Negocio mobile shot verifies).
- Serif h1 + h2 land the trattoria-soul typographic-wink that DESIGN.md §3 reserves for display sizes. Reads as nexandro, not as generic SaaS.
- Identidad fiscal copy rewrite is exactly the right register — Owner persona-fit, accountant-credible.
- Save icon (lucide disk) on save buttons is small but contributes to the verb-plus-object discipline.
- "Avanzado: IA · próximamente" row honestly signals where AI obs went without ghosting users who saw it in a prior build.

**v3 misses (vs v2)**

- Etiquetas section is unchanged in everything that matters for the Owner persona. The v2 BLOCKER #1 (IPP/CUPS in face of WhatsApp+Instagram+Excel Owner) is fully intact. The four v2 visual leaks (default URL, native file-input chrome leak, mobile text-wrap, h2 duplicate) are all still present.
- StickySaveBar (#206 A6) cannot be visually verified from a rest-state screenshot. Code says it's there; UI says nothing.
- EmptyStateCard primitive (#206 A5) shipped but wasn't applied to the obvious target (Identidad fiscal placeholder). Misallocation of the primitive.
- Privacidad screenshot rendering is broken at desktop scale — must be diagnosed before claiming v3 status on that section.
- Próximamente entries still clickable-but-noop, now with 5 rows (added Avanzado:IA).

---

## Top-7 BLOCKERS / MAJOR flags (split by section)

| # | Flag | Section | Severity | Persona affected |
|---|---|---|---|---|
| 1 | Etiquetas still exposes `IPP / CUPS (servidor de impresión)` + `URL del servidor IPP` placeholder `ipp://printer.local:631/printers/labels` + Cola + Timeout (ms) + API key to a low-tech Owner. v2 BLOCKER #1 is **not fixed** in v3. | Etiquetas | **BLOCKER** | Owner, IT admin |
| 2 | Privacidad desktop + mobile screenshots render at thumbnail scale (~290 px wide on desktop = 20% of viewport). Either CSS regression (`max-width` collapsing the container after grid-fix PR #201) or screenshot harness bug. Cannot audit Privacidad content visually until diagnosed. | Privacidad / Shell | **BLOCKER (verify)** | All — DPO specifically |
| 3 | StickySaveBar (#206 A6) not visually verifiable from rest-state captures. v3 cannot claim "save UX unified" without a dirty-state screenshot showing the bar pinned bottom with mobile-safe-area inset. | Shell | **BLOCKER (verify)** | All |
| 4 | Etiquetas mobile dropzone text wraps word-by-word into a 9-line column ("Arrastra / una / imagen / aquí o / haz / clic / para / elegirla") because the icon column eats ~30% of viewport width. v2 visual leak, unchanged. Reads as broken UI. | Etiquetas | BLOCKER | Owner, Manager on mobile |
| 5 | Identidad fiscal placeholder card still uses raw `<fieldset>` dashed-border chrome instead of the new `EmptyStateCard` primitive (#206 A5) that shipped specifically for this kind of "coming soon" surface. Primitive misapplied. | Negocio | MAJOR | Owner, Accountant |
| 6 | `Choose File No file chosen` native input chrome still visible through the drag-drop component in Etiquetas (both desktop + mobile). Identical to v2. | Etiquetas | MAJOR | Owner |
| 7 | Próximamente left-nav entries (now 5 rows after Avanzado:IA added) are still clickable and silent — no `cursor: not-allowed`, no `aria-disabled`, no ETA tooltip. Adding a 5th row without fixing the affordance compounds the v2 issue. | Shell | MAJOR | Owner, Manager |

---

## Per-persona roundtable

### 1. Owner Roberto (day-1 setup flow)

**Wants:** name → locale → timezone → logo → printer → done. Sunday-night, mobile, never returns. The journey narrative is 8 steps; how many survive contact with v3?

| # | Journey step | v3 verdict |
|---|---|---|
| 1 | /onboarding/listo → "Configurar etiquetas" QuickAction | Out of scope this audit. |
| 2 | Lands on /owner-settings → sidebar left, content right | ✅ FIXED (#201). Desktop renders correctly. Mobile collapses with hamburger top-right. |
| 3 | Negocio → edits name + locale + timezone | ✅ All 4 fields present, sentence-case, immutability annotation correct. |
| 4 | Edits something → StickySaveBar appears at bottom | ❓ VERIFY — screenshots are at rest, bar hidden. Code says it works. |
| 5 | Saves → "Cambios guardados" | ❓ VERIFY — toast not visible in any screenshot. |
| 6 | Etiquetas → uploads logo, picks printer, configures EU 1169 template | ❌ Logo upload UX still broken on mobile (text-wrap). Printer config still requires knowing IPP URL + queue name. EU 1169 template config NOT VISIBLE in screenshot — the entire Etiquetas page is just brand data + dropzone + page-size radio + IPP config. Where's the template editor? |
| 7 | Privacidad → reviews retention + RGPD landing | ❓ VERIFY — screenshot too small to read. |
| 8 | Notices "Avanzado: IA · próximamente" + "Sedes · próximamente" | ✅ Both visible in left-nav. Honest roadmap signal. |
| 9 | Done. Doesn't return for 3 months. | ❌ He returns within 30 seconds because the printer config defeated him. |

**Key Owner flags:**

- **Step 6 is still the brick wall.** Identical to v2. The whole point of A5 + A6 + B-5 was to polish the surface so Roberto trusts it; the surface he hits hardest (Etiquetas → Impresora) is unchanged.
- **`EUR · no editable (ADR-007)`** still leaks the ADR reference. Should be `EUR · No se puede cambiar después de crear la organización` per v2 recommendation. Not addressed.
- **No "siguiente paso" CTA after Negocio save** — the StickySaveBar (if visible) says "Guardar cambios / Descartar". Where's the "Continuar a Etiquetas →" affordance to thread the journey?
- **Positive:** Identidad fiscal copy rewrite (B-5) is exactly what he needs. "Tu asesoría te pide para facturas" speaks his language — he forwards docs to his gestor every quarter. Owner-credible.

### 2. DPO / GDPR officer (Privacidad section)

**Wants:** verify the controller can answer AEPD's first 3 questions (what data, how long, how do subjects exercise rights).

**v3 verdict:** Cannot audit content from the captured screenshots (thumbnail rendering). Treating this as a verification gate, not a content judgment.

Flags (based on visible structure + v2 baseline):

- **Privacidad desktop screenshot renders at ~290 × 175 px** while the viewport should be ~1440 px. This is a screenshot harness or CSS regression. The text "¿Qué guarda nexandro?" and headers are readable but at a tiny scale; cannot verify whether the v2 issues (Save button on read-only page, 60% próximamente density, missing data-residency block, missing sub-encargados list, missing breach commitment) were addressed.
- **`Detalle completo en Auditoría`** cross-link visible — still good leverage (per v2 verdict).
- **VERIFY FIRST**: re-capture Privacidad screenshots at full desktop + mobile viewport. Until then, all v2 BLOCKER → GA items (Acceso/Eliminación implementation, DPO contact, 2FA) stay open by default.
- **NOT addressed in v3 PRs**: no v3 PR mentioned Privacidad. So functional surface is unchanged from v2 — implementation of arts. 15 + 17 + 20 still próximamente.

### 3. UX/UI designer (StickySaveBar, density, fieldset chrome)

**Wants:** consistency across the 3 live sections, primitive reuse, no chrome leaks.

Flags:

- **StickySaveBar (#206 A6) primitive is correct in concept**: dirty-tracking against `savedSnapshot`, bottom-pinned, dual CTA Guardar/Descartar. But UNVERIFIED visually. Specific verification asks: (a) does it use `--surface-2` per DESIGN.md sticky-strip token; (b) does it respect `env(safe-area-inset-bottom)` on iOS Safari to clear the home indicator; (c) does the bar's "Descartar" use ghost-button styling per DESIGN.md §7 destructive-actions ("Discard is a ghost button"); (d) does the bar appear inside the content column or span the full viewport width over the sidebar?
- **EmptyStateCard primitive (#206 A5) shipped but misapplied.** The clearest "coming soon" surface in Settings is the Identidad fiscal placeholder; v3 left it as a raw `<fieldset>` with dashed border. Should swap to `<EmptyStateCard icon={Briefcase} title="Identidad fiscal" body="Pronto podrás añadir CIF/NIF/VAT…" secondaryCta="Avísame cuando esté listo" />`. That's exactly what A5 is for.
- **Fieldset browser-default outline still visible** in Negocio (Identidad) + Etiquetas (Datos del negocio · Contacto · Dirección postal · Marca · Tamaño de página · Impresora). Six fieldset boxes per page = visual noise. Replace with `<section>` + h3 + 1 px top border in `--border`.
- **h1 + h2 serif** (A1) lands well — Fraunces visible on `Configuración` h1 and `Negocio` h2 in screenshots. Good.
- **Density:** Negocio uses a 2-col responsive grid for Idioma + Zona horaria (good); Etiquetas dumps everything in single column even when fields are short (Email + Teléfono, Calle + Ciudad, Código postal + País all could be 2-col like Negocio). Inconsistent.
- **Mobile dropzone text-wrap** is a CSS bug visible to the eye — fix `min-width` on the icon column or stack vertically below `--bp-tablet`.
- **`/static/brand-marks/00000000-0000-4000-8000-000000000001.jpg?v=1779069130928`** still pre-filled in URL externa field. v2 flag unaddressed.
- **Etiquetas h2 `Configuración de etiquetas`** still duplicates shell h1 `Configuración` + left-nav highlight `Etiquetas`. v2 recommendation to drop the h2 not addressed.
- **No breadcrumb on mobile** — v2 ask unaddressed.

### 4. PM (v2 said shell was 40%; what now post A5+A6+B-5+E-1?)

**Wants:** crisp coverage % per section, decision on próximamente rows.

Coverage delta:

| Section          | v2 %    | v3 %    | Drivers                                                                                  |
|------------------|---------|---------|------------------------------------------------------------------------------------------|
| Shell            | 40 %    | **70 %**  | +30: grid fixed (#201), serif (#204), save-icon (#205), Avanzado:IA row (#207). −10 retained for próximamente clickable-but-noop + missing breadcrumb + unverified StickySaveBar. |
| Negocio          | 65 %    | **75 %**  | +10: B-5 dev-speak rewrite + serif h2. Capped because EmptyStateCard misapplied, immutability copy unchanged, no "siguiente paso" CTA. |
| Etiquetas        | 30 %    | **35 %**  | +5: save-icon only. All v2 BLOCKER + 4 visual leaks unaddressed. Owner persona still hits wall at step 6. |
| Privacidad       | 40 %    | **?? %**  | UNVERIFIED — screenshot too small to audit. Assume 40 % (no v3 PR touched Privacidad) until re-captured. |
| **Average**      | **44 %** | **~55 %** (Privacidad held at v2 baseline) |                                                                                          |

Próximamente rows (5 entries: Sedes, Usuarios y permisos, Facturación, Integraciones, Avanzado: IA):

- **Keep visible.** Reasoning unchanged from v2: communicates roadmap, reduces "where is X?" support load, sets honest scope expectation.
- **But fix the affordance.** Add `aria-disabled="true"`, `cursor: not-allowed`, and a tooltip on hover with ETA ("Disponible en Wave 2.x" or "Q3 2026"). Currently 5 rows tease and betray.
- **Avanzado: IA · próximamente (#207 E-1)** is the right placement after the AI-obs demote — keeps the surface honest. But should clarify scope ("Observabilidad de modelos · costes · auditoría de tools-calls") so prospect Owners know what's coming.
- **Sedes + Usuarios y permisos** remain Wave-+1 blockers per v2. Until they ship, multi-venue Owner + Manager invite flows are dead-ends.

### 5. Accountant / legal (Identidad fiscal placeholder copy confidence)

**Wants:** see that nexandro understands what a Spanish gestor needs on a factura, before committing to nexandro for accounting.

v3 verdict: copy rewrite (#203 B-5) is a clear win. The new text — "Pronto podrás añadir CIF/NIF/VAT, razón social y domicilio fiscal — los datos que tu asesoría te pide para facturas y exportes oficiales" — uses the exact vocabulary a real Spanish small-business accountant uses ("asesoría", "facturas", "exportes oficiales"). Owner reads this and trusts that nexandro speaks his fiscal language.

Flags:

- **Copy is credible but field-list is shallow.** v2 accountant section listed 8 fields needed for ES VeriFactu (régimen fiscal, IAE, Registro Mercantil, capital social, régimen IVA, EORI, VeriFactu endpoint, serie facturación). v3 placeholder copy only names 3 (CIF/NIF/VAT + razón social + domicilio fiscal). When this card ships for real, the field list must expand or the placeholder copy must be more honest about partial scope.
- **VeriFactu 2026-07 deadline is 6 weeks away** (today is 2026-05-18). If Identidad fiscal slips past July, Spanish customers cannot use nexandro for compliant facturación. Should be on the critical path; current placeholder gives no ETA.
- **EU multi-país validation** (NIF + NIE + Partita IVA + SIRET + Steuernummer + BTW per country) needs schema-level work, not just a free-text VAT field. Still future scope.
- **Placeholder uses `<fieldset>` with dashed border** instead of EmptyStateCard primitive — visual treatment doesn't match the credibility of the copy.

### 6. IT admin (Etiquetas printer config)

**Wants:** point nexandro at the kitchen printer in <10 min. Or, if non-IT Owner is configuring this, see auto-discovery.

**v3 verdict:** Identical to v2. Not addressed. Block is fully intact.

Flags:

- **`Tipo de impresora` dropdown still shows only `IPP / CUPS (servidor de impresión)`** in the screenshot. No `PDF descarga` (default), no `Network mDNS auto-discovered`, no `Local USB`, no `Windows agent`. Single-driver assumption excludes Windows-only kitchens (common in ES SMB).
- **`URL del servidor IPP` placeholder `ipp://printer.local:631/printers/labels`** still assumes the user knows their print queue name. No "Discover printers on my network" button.
- **`Cola` field still separate** from the URL (which already encodes queue in path). Pick one.
- **`Timeout (ms)` still exposed.** Should default to 5000 ms invisibly.
- **`API key` field still unlabelled for what.** CUPS doesn't auth via API key; this is leftover plumbing from a different driver. Confusing.
- **`Imprimir etiqueta de prueba` button is present and well-styled** (icon + label per A3) — but no pre-flight check / status surface around it.
- **No printer-status badge** (online / out of labels) — CUPS exposes this; UI does not.
- **Recommendation unchanged from v2:** wrap entire Impresora block in `<details>` collapsed by default; surface `Descargar PDF` as the zero-config default.

---

## Suggested changes [V] / [I] / [F]

Tags: **[V]** Visual (CSS/copy) · **[I]** Information architecture · **[F]** Functional (new code path)

### Shell-wide

- **[V][BLOCKER]** Re-capture Privacidad desktop + mobile screenshots at full viewport. Diagnose whether the thumbnail rendering is a screenshot-harness bug (likely) or a CSS regression (PR #201 grid change may have collapsed Privacidad's content column). Without the re-capture, v3 audit on Privacidad is incomplete.
- **[V][BLOCKER]** Capture a dirty-state screenshot of StickySaveBar (#206 A6) to verify: (a) `--surface-2` token used; (b) `env(safe-area-inset-bottom)` for iOS Safari; (c) ghost-button "Descartar" per DESIGN.md §7; (d) bar contained to content column or spans viewport (decide and document).
- **[V]** Próximamente entries: add `aria-disabled="true"` + `cursor: not-allowed` + tooltip `title="Disponible en [Wave X · ETA mes año]"`.
- **[I]** Add mobile breadcrumb `Configuración / Negocio` (carry-over v2).
- **[F]** Unsaved-changes guard on left-nav click + browser back nav.

### Negocio

- **[V]** Replace the Identidad fiscal `<fieldset>` placeholder with the new `EmptyStateCard` (#206 A5). Use icon `Briefcase` or `FileText`, title "Identidad fiscal", body = current B-5 copy, secondaryCta = "Avísame cuando esté disponible".
- **[V]** Soften immutability annotation: `EUR · no editable (ADR-007)` → `EUR · No se puede cambiar después de crear la organización` (carry-over v2). Tooltip the ADR ref for power users.
- **[V]** Replace `<fieldset><legend>Identidad</legend>...` with `<section>` + h3 + 1 px top border in `--border` to drop browser-default chrome.
- **[I]** Move `Dirección postal del negocio` here from Etiquetas — postal address is business identity, not labels data.
- **[I]** Move `Logo del negocio` here from Etiquetas — logo is global brand asset (facturas + labels + emails).
- **[F]** Add "Continuar a Etiquetas →" CTA in the StickySaveBar success-toast or as a successor link after save — thread the day-1 journey.

### Etiquetas

- **[V][BLOCKER]** Wrap entire `Impresora` fieldset in `<details>` collapsed by default. Default print path = "Descargar PDF a tu dispositivo" (carry-over v2 BLOCKER).
- **[V][BLOCKER]** Hide `Timeout (ms)` + `API key` fields unless an explicit advanced driver is selected.
- **[V][BLOCKER]** Fix mobile dropzone text-wrap. Stack icon above text on `pointer:coarse` or set `min-width` on icon column so text gets ≥ 60 % of width.
- **[V][BLOCKER]** Clear default value `/static/brand-marks/00000000-0000-4000-8000-000000000001.jpg?v=1779069130928` from URL externa input — empty placeholder only.
- **[V][BLOCKER]** Restyle/hide native `Choose File No file chosen` — drag-drop component should swallow this.
- **[V]** Drop h2 `Configuración de etiquetas` — redundant with shell h1 + left-nav.
- **[V]** Replace 6 `<fieldset>` legends with `<section>` + h3 + 1 px top border.
- **[V]** Make Email + Teléfono 2-col on tablet+; Calle + Ciudad 2-col; Código postal + País 2-col. Matches Negocio's responsive grid.
- **[I]** Remove duplicated `Nombre del negocio` field — display read-only with link "Nombre tomado de Configuración → Negocio. [Editar]".
- **[I]** Add `Tipo de impresora` alternatives: PDF (default), IPP/CUPS, mDNS auto-discovered, Local USB (Windows agent).
- **[F]** mDNS discovery button "Buscar impresoras en mi red".
- **[F]** Pre-flight inline test feedback on `Imprimir etiqueta de prueba`: ✓/✗ + surfaced CUPS error message.
- **[F]** Printer-status badge polling: "En línea · 247 etiquetas restantes" or "Sin conexión".

### Privacidad

- **[V][BLOCKER]** Diagnose screenshot rendering. Re-capture at full viewport before any further visual change.
- **[V][BLOCKER]** Remove `Guardar cambios` button (carry-over v2).
- **[V]** Add top-of-section status pill: `RGPD parcial · 40 % implementado · GA EU Q3 2026`.
- **[V]** Group all `Próximamente` bullets under one "Funcionalidades en desarrollo" subsection with target dates.
- **[I]** Add `Residencia de datos`: "Hetzner Cloud · Falkenstein (Alemania) · ISO 27001."
- **[I]** Add `Sub-encargados de tratamiento` list (art. 28 + 30).
- **[I]** Add `Notificación de brechas` commitment: "AEPD en <72h."
- **[I]** Add `Política de privacidad completa` link → external PDF.
- **[F][BLOCKER → GA]** Implement arts. 15 + 17 + 20 (acceso + eliminación + portabilidad).
- **[F][BLOCKER → GA]** Implement DPO contact field.
- **[F]** Implement 2FA (TOTP).

---

## "Próximamente" placeholders — v3 decision

**Decision: KEEP visible, FIX affordance.** Unchanged from v2.

v3 adds Avanzado: IA as the 5th próximamente row (#207 E-1) — the right call after the AI-obs demote. The roadmap signal is now: Sedes · Usuarios y permisos · Facturación · Integraciones · Avanzado: IA. Honest. But the entries are still clickable-but-noop, which is now 5x as many false-affordance bugs. Fix the cursor + aria-disabled + tooltip in the same PR.

---

## Visual identity gap (v3 update)

v2 said: "shell is functionally credible but visually generic." v3 has narrowed that gap meaningfully on the Shell + Negocio (serif h1+h2, save-icon, dev-speak rewrite). Remaining gaps:

- **Etiquetas** stays visually generic — 6 `<fieldset>` outlines + plumbing leak + dropzone bug. Negocio's improvements were not propagated here.
- **No `--warn-bg` or `--destructive` on Privacidad** — still treats RGPD as quiet prose, not as a serious surface (v2 carry-over).
- **EmptyStateCard primitive (A5) exists** but is not used in the obvious Settings location (Identidad fiscal placeholder).
- **Fieldset browser-default outline** is still a chrome leak across all 3 live sections.

The trattoria-soul wink (serif h1+h2) is now present. Pulcinella palette discipline is still under-applied. Net: visual identity moved from 30 % → 55 %.
