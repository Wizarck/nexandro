---
title: UX/UI Roundtable Audit v2 — Detail 09 · Configuración (Settings shell + 3 sections)
status: canonical
last-updated: 2026-05-18
parent: docs/
v1-baseline: docs/audit-2026-05-18-ux-roundtable.md (single-page `/owner-settings` = SCREAMING all-caps Etiquetas form, no shell, no Negocio/Privacidad)
v2-deploy: 2026-05-18 (PR #198 shell + left-nav + 3 live sections + 4 "próximamente"; PR #188 legend padding + Save fix; PR #190-191 logo upload + drag-drop)
related:
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/audit-2026-05-18-ux-roundtable.md (v1 baseline — single-screen `/owner-settings` = Etiquetas only)
---

# Detail 09 · Configuración shell + Negocio · Etiquetas · Privacidad

Three sections now live behind a left-nav shell. v1 found a single page with SCREAMING ALL-CAPS labels, IPP/CUPS plumbing in the face of an Owner, no Negocio, no Privacidad. v2 inverts the diagnosis: the **shell is correct**, two of three sections are credible, one (Etiquetas) still leaks IT-admin plumbing.

---

## Spec-vs-reality

| Region (v1 backlog item)                              | Spec source                       | Status v2                                                                                                       |
|-------------------------------------------------------|-----------------------------------|-----------------------------------------------------------------------------------------------------------------|
| **L2-1** Settings shell left-nav                      | v1 audit backlog                  | DONE — 7 entries (3 live + 4 próximamente). Order roughly matches spec.                                         |
| **L2-2** Rename nav "Configuración" → "Etiquetas"     | v1 audit backlog                  | OBSOLETED — shell exists, top-nav stays "Configuración" (correct).                                              |
| **L2-5** Fields legales del negocio (CIF/NIF/VAT)     | v1 audit backlog                  | PARTIAL — placeholder card "Identidad fiscal próximamente" visible. Real fields next slice.                     |
| **L3-1** GDPR/RGPD surfaces                           | v1 audit backlog                  | PARTIAL — landing copy + retención + derechos RGPD prose live; DPO contact + 2FA + token rotation = próximamente. |
| **L3-2** All-caps body labels → sentence case         | DESIGN.md §3 anti-reflex          | DONE — all field labels now sentence case in all 3 sections.                                                    |
| **L3-3** Logo upload (file, not URL)                  | v1 audit backlog                  | DONE (PR #190-191) — drag-drop + URL externa fallback visible in Etiquetas.                                     |
| **L3-4** Focus rings token-bound (3 px `--accent`)    | DESIGN.md §7 a11y                 | NOT verified from screenshots (no focused state captured).                                                      |
| Sticky save bar at top                                | new                               | Etiquetas DONE (Guardar cambios in header). Negocio + Privacidad have button bottom-right only.                 |
| `Auditoría` entry in Settings nav                     | v1 backlog L2-1                   | NOT done — Auditoría stayed in top-nav, not surfaced as a Settings sub-section. Acceptable (still discoverable).|

**Shell-level v2 wins (vs v1 baseline)**

- ALL-CAPS labels eradicated everywhere. Single biggest visual fix.
- Left-nav with `próximamente` muted styling sets correct expectation about scope.
- Negocio identity card has the right 4 fields (name + locale + tz + currency) with the immutability annotation `EUR · no editable (ADR-007)` — chef's-kiss traceability.
- Privacidad reads like a privacy notice, not like a form. Right register for the audience.
- Mobile: stacks cleanly. No 2-line nav wrap.

**Shell-level v2 misses**

- Save button placement inconsistent across the 3 sections (Etiquetas top-right header sticky; Negocio + Privacidad bottom-right footer only, non-sticky).
- No "saved at 14:23" timestamp anywhere after save.
- Privacidad is read-only — has a Save button anyway (Guardar cambios cuando no hay nada editable = falso afford).
- Etiquetas section title is `Configuración de etiquetas` (h2) competing with shell `Configuración` (h1) — duplicate noun, redundant.
- No section-changed unsaved-changes guard (left-nav click discards form values silently — not verifiable from screenshots but standard hazard).

---

## Top-7 BLOCKERS / MAJOR flags (shell-wide)

| # | Flag | Section | Severity | Owner persona affected |
|---|---|---|---|---|
| 1 | Etiquetas exposes IPP/CUPS server URL + Cola + Timeout(ms) + API key + raw `ipp://printer.local:631/printers/labels` placeholder to an Owner who codified in personas-jtbd.md as "WhatsApp + Instagram + Excel" tech-comfort level. | Etiquetas | **BLOCKER** | Owner Roberto, IT admin (if any) |
| 2 | Negocio + Privacidad have NO sticky save bar; Etiquetas does. Three sections, three save UX contracts. | Shell | **BLOCKER** | All |
| 3 | Negocio "Identidad fiscal próximamente" is a card with empty `<fieldset>` and inline copy "Aterrizan en la siguiente iteración junto con la migración de schema." That is a dev commit message, not user copy. | Negocio | **BLOCKER** | Accountant, Owner |
| 4 | Privacidad has "Guardar cambios" button on a 100% read-only page. False affordance — clicking it does what? | Privacidad | **BLOCKER** | DPO, Owner |
| 5 | Etiquetas duplicates 7 fields (nombre, email, teléfono, dirección postal x4) that overlap with Negocio (nombre del negocio) and with the upcoming `Identidad fiscal` card. Single source of truth violated; Owner now has to type "Nexandro Demo" in 2 places. | Etiquetas + Negocio | MAJOR | Owner |
| 6 | Privacidad lists `Próximamente` 5 times in 4 cards (DPO + 2FA + token rotation + session close + Acceso/Eliminación rights). 60% of the section is "comming soon" — borderline GDPR theater. | Privacidad | MAJOR | DPO |
| 7 | 4 left-nav `próximamente` entries (Sedes, Usuarios y permisos, Facturación, Integraciones) are real navigation items that don't navigate. No `cursor: not-allowed`, no tooltip, no ETA. They tease, then betray. | Shell | MAJOR | Owner, Manager |

---

## Per-persona roundtable

### 1. Owner Roberto (configures the business once, never wants to return)

**Wants** to set business name + tz + locale + upload logo + verify retention, in <5 min, on a Sunday on his phone, and never come back.

**v2 verdict:** The shell makes this MOSTLY achievable. Negocio = 30 sec. Etiquetas = stalls hard at IPP/CUPS. Privacidad = "ok, I read this once."

Flags:

- **Etiquetas printer config is impassable.** "Tipo de impresora: IPP/CUPS (servidor de impresión)" + URL + Cola + Timeout + API key. Roberto closes the tab.
- **Negocio Nombre del negocio duplicates Etiquetas → Nombre del negocio.** Same field, two places.
- **No "siguiente paso" anywhere.** After saving Negocio, what now? Add a sede? Invite a chef? The shell doesn't tell him.
- **"Identidad fiscal próximamente" copy** ("Aterrizan en la siguiente iteración junto con la migración de schema") is for the dev team's standup. Roberto reads "migración de schema" and worries something is going to break.
- Positive: the immutability annotation `EUR · no editable (ADR-007)` is exactly the trust signal he needs — but he doesn't know what ADR-007 is, so soften it: "Definitivo. La moneda no se puede cambiar después de crear la organización."

### 2. DPO / GDPR officer (Privacidad section)

**Wants** to verify the data controller can answer an AEPD inspector's first 3 questions: (1) what data do you store, (2) for how long, (3) how does a data subject exercise rights.

**v2 verdict:** Section register and content are RIGHT. Coverage is INCOMPLETE — but honest about it (próximamente tags).

Flags:

- **"Acceso + portabilidad (arts. 15 + 20)" + "Eliminación (art. 17)" both marked `Próximamente`.** That's the legal core of RGPD. If an inspector asks "show me how a customer requests deletion" today, the answer is "not implemented." Should be flagged BLOCKER for any EU GA. Section currently *promises* compliance without delivering it = GDPR theater risk.
- **`Datos del DPO` is read-only "podrás capturar su contacto aquí. Próximamente."** A DPO designate needs to be appointed before the org goes live in EU. If the field can't be filled, the inspector sees blank.
- **Retención copy is good** — specific durations (`7 años`, `90 días`, `7 días de grace`), specific reference (`UE 178/2002`). This is exactly the right depth.
- **Missing: data residency statement.** "Datos almacenados en VPS Hetzner, Falkenstein (Alemania), región EU." DPO needs this in writing.
- **Missing: third-party processor list (sub-encargados).** Anthropic (Claude), Stripe (billing), Sendgrid (email), etc. RGPD art. 30 record-of-processing requires it.
- **Missing: breach notification commitment.** "Notificación a la AEPD en 72h por mecanismo X."
- **`Detalle completo en Auditoría: cada evento muestra qué datos fueron escritos`** — beautiful cross-link, leverages existing Auditoría tab. Keep.
- Verdict: 40% real, 60% promise. Acceptable as a roadmap surface; **NOT** acceptable as compliance evidence yet.

### 3. UX/UI designer (left-nav design, sticky save bar, density)

**Wants** consistency, hierarchy, no surprises across the 3 live sections.

Flags:

- **Left-nav active-state highlight is correct** — accent-soft background, clear "you are here." Mobile keeps the same nav above content (no hamburger collapse). Good.
- **`próximamente` styling is right** — italic + smaller eyebrow tag, low chroma. Reads as roadmap, not as bug.
- **3 different "save" contracts:**
  1. Etiquetas: button in header sticky right.
  2. Negocio: button bottom-right of content, non-sticky.
  3. Privacidad: button bottom-right of content (read-only page, should not exist).
  Pick one and stick to it. Recommendation: persistent top-right sticky on every editable section; remove from Privacidad.
- **`Configuración de etiquetas` h2 inside the Etiquetas section duplicates the shell h1 `Configuración` + the left-nav highlight `Etiquetas`.** Drop the h2; the breadcrumb is already implicit.
- **Fieldset legend `Identidad` / `Contacto` / `Dirección postal` etc.** — the `<fieldset>` outline visible in the screenshots reads as 1990s HTML form chrome. Replace with a `<section>` + h3 + thin top divider (still semantic, less browser-default ugly).
- **Density inconsistent**: Etiquetas crams 7 fieldsets in one column; Negocio puts Identidad fields in 2-column responsive grid. Etiquetas should adopt the same 2-column grid for the address block + contacto.
- **Mobile Etiquetas: brand `Arrastra una imagen aquí o haz clic para elegirla` wraps to 8 lines** because the image dropzone has a fixed icon column eating ~30% of width. Visible in screenshot — looks broken.
- **`Choose File No file chosen`** is the unstyled native `<input type="file">` UI showing through (visible in both Etiquetas screenshots). The drag-drop component should hide or restyle it.
- **`/static/brand-marks/00000000-0000-4000-8000-000000000001.jpg?v=1779069130928`** appears in the "URL externa" field as default value. That's the test seed file path — leaks dev fixtures to user.
- **No breadcrumb** — `Configuración / Negocio`. Helpful on mobile when the long left-nav scrolls.

### 4. PM (L2-1 spec coverage + what "próximamente" sections need next)

**Wants** the shell to honour the v1 backlog item L2-1 and to surface a credible roadmap.

Coverage vs v1 spec L2-1: `[Negocio · Sedes · Usuarios y permisos · Facturación · Integraciones · Etiquetas · Privacidad y datos · Auditoría]`

| Slot | v2 status | Notes |
|---|---|---|
| Negocio | LIVE | Identity card only; fiscal pending. |
| Sedes | próximamente | Should ship next — multi-venue is in personas (Owner = "multi-venue group CEO"). |
| Usuarios y permisos | próximamente | RBAC matrix already in personas-jtbd.md §2 — straightforward implementation. |
| Facturación | próximamente | Enterprise-only per personas; can defer to post-GA. |
| Integraciones | próximamente | Vague — what integrations? POS? Suppliers? OFF mirror? Needs scope decision. |
| Etiquetas | LIVE | Owner-misfit (see flag #1). |
| Privacidad y datos | LIVE | 40% real, see DPO section. |
| Auditoría | NOT in Settings nav | Stayed in top-nav. Acceptable — auditing is operational, not config. |

Flags:

- **Sedes próximamente is the BIGGEST gap** — Owner persona is explicitly multi-venue; until Sedes ships there is no multi-venue Onboarding flow. Should be Wave +1.
- **Usuarios y permisos próximamente blocks** the Manager + Staff personas entirely. Without RBAC UI, Owner cannot invite a Head Chef. Wave +1.
- **Integraciones próximamente has no scope.** Either define what it covers (POS, OFF, suppliers, Anthropic API key BYO) or remove from nav.
- **Should the 4 próximamente entries be hidden?** NO — they communicate the roadmap to a prospect Owner and reduce "is this feature missing or just hidden?" support load. But they need a tooltip on hover: "Disponible en mayo 2026" or similar.
- **Onboarding wizard (v1 backlog L2-3, persona-jtbd §3) still not surfaced.** First-run experience is "land on Dashboard with empty state" — not the 5-step wizard the personas doc specified.

### 5. Accountant / legal (Identidad fiscal placeholder — is the field list right for ES VeriFactu?)

**Wants** to issue compliant facturas + comply with the new ES VeriFactu mandate (2026-07 deadline for non-large taxpayers).

Placeholder copy says: "CIF/NIF/VAT, razón social, domicilio fiscal."

Flags:

- **Missing fields for ES VeriFactu / EU B2B invoicing:**
  - `Régimen fiscal` (autónomo · S.L. · S.A. · cooperativa) — affects factura format.
  - `Epígrafe IAE` — required on facturas in ES.
  - `Inscripción Registro Mercantil` (for S.L./S.A.) — required on facturas.
  - `Capital social` (for S.L./S.A.) — required on facturas.
  - `Régimen IVA` (general · recargo de equivalencia · simplificado · agricultura · REBU) — affects how IVA is computed per line.
  - `EORI number` — for EU intra-community sales (B2B).
  - `Sujeto a SII / VeriFactu` (boolean + URL endpoint AEAT cert) — VeriFactu submission target.
  - `Serie de facturación por defecto` + `Próximo número de factura` — facturación spec needs both.
- **`Domicilio fiscal vs operativo`** — placeholder collapses them. They are LEGALLY different and frequently differ for restaurants (fiscal in gestor's address, operativo en local).
- **Multi-país support:** placeholder lists "CIF/NIF/VAT" implying a generic. But VAT validation differs by country (NIE for individuos extranjeros, NIF intra-comunitario, etc.). Nexandro EU-only lock per memory `project_nexandro_eu_only.md` means: ES (NIF + CIF) + PT (NIPC) + IT (Partita IVA + Codice Fiscale) + FR (SIRET + TVA) + DE (Steuernummer + USt-IdNr) + NL (BTW). Per-country tax-ID schema validation needed.
- **Recommendation:** before shipping Identidad fiscal, do a JTBD interview with a real ES gestor/asesor fiscal. The placeholder copy "razón social, domicilio fiscal" reads like the dev wrote it from memory, not from a real factura inspection.

### 6. IT admin (Etiquetas printer config — is local printer discovery realistic?)

**Wants** to point Nexandro at the kitchen's existing label printer in <10 min, ideally with auto-discovery.

Flags:

- **`Tipo de impresora: IPP/CUPS (servidor de impresión)` is correct for the Linux/Mac kitchens.** Brother QL-820NWB, Zebra GK420d, Dymo LabelWriter — all CUPS-compatible. But:
  - No `Tipo de impresora` alternatives visible in screenshot (only the IPP option). Where is `Network printer (mDNS)` / `Direct USB` / `PDF download only`? A small kitchen on Windows 10 with a USB Dymo doesn't have CUPS.
  - `URL del servidor IPP` placeholder `ipp://printer.local:631/printers/labels` assumes the user knows their print queue name. Real-world: nobody knows. Need a "Discover" button that mDNS-broadcasts and lists found queues.
  - `Cola` is a separate field — but the URL placeholder already includes `/printers/labels` (which IS the queue). Pick one.
  - `Timeout (ms)` exposed to the Owner = bug. Default to 5000ms, hide.
  - `API key` field unlabeled — API key for what? CUPS doesn't auth via API key. Probably leftover from a different driver. Confusing.
- **No `Imprimir página de prueba` flow before saving.** There is a `Imprimir etiqueta de prueba` button (good), but it's at the bottom after all fields. If timeout/queue/URL are wrong, the test print fails silently or hangs.
- **No printer-status check** — is the printer online? Out of labels? CUPS exposes this; the UI does not.
- **Recommendation:** wrap the entire Impresora block in an advanced disclosure (`Configuración avanzada de impresión`) hidden by default. Default behavior should be `Descargar PDF` (always works, zero config) with the IPP path as an opt-in for IT-savvy venues.
- **mDNS / Bonjour auto-discovery** is feasible from a NestJS backend (`mdns-js` package, broadcasts `_ipp._tcp.local`). Should be in scope.
- **For Windows-only kitchens (common in ES SMB):** CUPS is not available. Need a "Print via local-print agent" path (small Windows installer that polls Nexandro for pending labels). Out of MVP scope but should be on the roadmap.

---

## Suggested changes [V] / [I] / [F]

Tags: **[V]** Visual (CSS/copy) · **[I]** Information architecture · **[F]** Functional (new code path)

### Etiquetas

- **[V][BLOCKER]** Wrap entire `Impresora` fieldset in `<details>` collapsed by default with summary "Configuración avanzada de impresión". Default print path = "Descargar PDF a tu dispositivo."
- **[V][BLOCKER]** Hide `Timeout (ms)` and `API key` fields unless `Tipo de impresora` is explicitly set to a driver that needs them. Provide sensible defaults invisibly.
- **[V]** Drop fieldset chrome (default browser outline) and use `<section>` + h3 + 1px top border in `--border` instead.
- **[V]** Clear the default value `/static/brand-marks/...` from `URL externa` — should be empty placeholder text only.
- **[V]** Restyle/hide native `Choose File No file chosen` — currently leaking through the drag-drop component.
- **[V]** Mobile: fix `Arrastra una imagen aquí…` text wrapping (8 lines on phone). Stack icon above text on `pointer:coarse`.
- **[V]** Drop h2 `Configuración de etiquetas` — redundant with shell h1 + left-nav highlight.
- **[I]** Move `Datos del negocio → Nombre del negocio` away — single-source from Negocio section. Display read-only here: "Nombre tomado de Configuración → Negocio. [Editar]" link.
- **[I]** Move `Dirección postal` to Negocio (or new "Identidad fiscal" card) — postal address is business data, not labels data. Etiquetas only needs to reference it.
- **[I]** Add `Tipo de impresora` alternatives: `PDF descarga` (default), `IPP/CUPS`, `Impresora local (Windows agent)`, `mDNS auto-detectada`.
- **[F]** Add mDNS-discovery button: "Buscar impresoras en mi red" → lists `_ipp._tcp.local` advertisements with one-click "Usar esta."
- **[F]** Pre-flight test: "Imprimir etiqueta de prueba" button should call the printer, show ✓ / ✗ inline, and surface CUPS error message (`printer offline`, `out of labels`).
- **[F]** Add printer-status polling on page load (last 30 s cached): show "Impresora en línea · 247 etiquetas restantes" or "Sin conexión" badge next to the URL field.

### Negocio

- **[V][BLOCKER]** Rewrite Identidad fiscal placeholder copy. Current: "Aterrizan en la siguiente iteración junto con la migración de schema." (dev-speak). Replace with: "Próximamente. Aquí configurarás tu CIF/NIF, razón social, régimen fiscal y todo lo necesario para emitir facturas que cumplan con la AEAT y VeriFactu."
- **[V]** Soften the immutability annotation: `EUR · no editable (ADR-007)` → `EUR · No se puede cambiar después de crear la organización`. Hide the ADR reference behind an info-tooltip for power users.
- **[V]** Make `Guardar cambios` sticky in header (match Etiquetas pattern). Add `Última edición: hace 2 min` timestamp after save.
- **[I]** Add `Dirección postal del negocio` block here (moved from Etiquetas).
- **[I]** Add `Identidad fiscal` proper field set when shipping the next iteration. Field list per Accountant persona above (régimen fiscal, IAE, registro mercantil, capital social, régimen IVA, EORI, VeriFactu endpoint, serie facturación).
- **[F]** Add validation on `Nombre del negocio` (required, ≥ 3 chars, ≤ 100).
- **[F]** Add `Logo del negocio` block here (currently only in Etiquetas — but logo is a global business asset, used on facturas + labels + emails).
- **[F]** Add unsaved-changes guard on left-nav click.

### Privacidad

- **[V][BLOCKER]** Remove `Guardar cambios` button — section is 100% read-only.
- **[V]** Reduce `Próximamente` density: group all 5 próximamente bullets under one "Funcionalidades en desarrollo" subsection at the bottom, with target dates.
- **[V]** Add a top-of-section status pill: `RGPD parcial · 40% implementado · GA EU Q3 2026` (or similar) — sets expectation honestly.
- **[I]** Add `Residencia de datos` block: "Tus datos se almacenan en Hetzner Cloud, región Falkenstein (Alemania). Datacenter certificado ISO 27001."
- **[I]** Add `Sub-encargados de tratamiento` block (RGPD art. 28 + 30 requirement): list third-party processors (Anthropic for AI, infra, email, billing) with version-controlled timestamp.
- **[I]** Add `Notificación de brechas` commitment: "Notificamos a la AEPD en <72h. Notificamos a usuarios afectados sin demora indebida."
- **[I]** Add `Política de privacidad completa` link → PDF / web page (not embedded in app).
- **[F][BLOCKER → GA]** Implement Acceso + portabilidad (arts. 15 + 20) export — required for any EU GA.
- **[F][BLOCKER → GA]** Implement Eliminación (art. 17) flow — required for any EU GA.
- **[F][BLOCKER → GA]** Implement DPO contact field — required for any org > 250 employees OR processing sensitive data.
- **[F]** Implement 2FA (TOTP) — table-stakes for B2B SaaS.

### Shell-wide

- **[V][BLOCKER]** Pick ONE save bar pattern across all editable sections (top-right sticky). Apply to Negocio. Remove from Privacidad.
- **[V]** Add `Última edición: …` timestamp inline with save button (matches other dashboards).
- **[V]** Add `:focus-visible` rings 3 px `--accent` on left-nav items (per DESIGN.md §7).
- **[V]** Add tooltip on `próximamente` left-nav entries: "Disponible en [mes año]" or "En desarrollo."
- **[V]** Disable click on `próximamente` entries (`cursor: not-allowed`, `aria-disabled="true"`).
- **[I]** Add breadcrumb on mobile: `Configuración / Negocio`.
- **[I]** Add unsaved-changes guard on left-nav click (browser-style "¿Descartar cambios?" modal).
- **[F]** Surface onboarding wizard on first login (personas-jtbd §3, v1 backlog L2-3) — currently first-run lands on Dashboard empty state.

---

## Visual identity gap (shell-wide)

The shell has zero **trattoria soul** — feels generic SaaS settings page, not nexandro. Specifically:

- No use of `--accent` (aged turquoise) anywhere except the left-nav highlight. Save button uses default border + small disk icon (no accent bg). DESIGN.md §2 says primary CTA = accent bg.
- No serif (Fraunces) on h1 `Configuración`. DESIGN.md §3 reserves serif for "recipe titles (H1)" — so shell H1 in sans is technically correct, but the whole shell reads typographically flat (one weight, one family, one size).
- Border-only emphasis on cards is correct per DESIGN.md §6 (no drop shadows = good). But `<fieldset>` browser-default outline visible in Etiquetas is a chrome leak, not the intentional aesthetic.
- No `--warn-bg` or `--destructive` anywhere in Privacidad — RGPD is a serious surface; visual weight should match.
- Mobile drop-zone in Etiquetas is visually broken (text wrapping at 8 lines). Looks like a CSS bug, not a design choice.
- Empty `<fieldset>` for "Identidad fiscal próximamente" with dashed border reads as TODO placeholder, not as intentional roadmap signaling.

Net: the shell is functionally credible but visually generic. Apply the Pulcinella palette + add the immutability + provenance microcopy patterns from the Auditoría/Recall surfaces to give it more presence.

---

## "Próximamente" placeholders — hide or show?

**Recommendation: SHOW, but improve treatment.**

Reasons to SHOW (keep current behavior):
1. Communicates roadmap to prospect Owners evaluating nexandro for procurement.
2. Reduces "is feature X coming?" support load.
3. Sets expectation about scope — Owner doesn't wonder "where's billing?" because they see `Facturación próximamente`.
4. Aligns with the honest-roadmap voice of the Privacidad section (which also liberally uses `próximamente`).

Improvements needed:
1. **Add ETA** — "Disponible en mayo 2026" or "Wave 2.x" tooltip on hover.
2. **Disable click** — `aria-disabled="true"` + `cursor: not-allowed`. Currently the nav entry is clickable and does nothing.
3. **Define scope for `Integraciones`** — currently a vague promise. Either commit ("POS · suppliers · OFF mirror") or drop until scope is defined.
4. **Prioritize `Sedes` and `Usuarios y permisos`** — both block core persona flows (multi-venue Owner; Manager + Staff invitation). Should ship Wave +1.

Reasons NOT to HIDE: would leave Owner thinking "no multi-venue support" / "no team management" — both contradict the personas spec.

---

