---
title: UX/UI Roundtable Audit v2 — Detail 06 Compliance Export (APPCC inspector flow)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: v1 baseline flagged Compliance as invisible from nav. PR #194 added "Expediente APPCC" tab; PR #197 added "Generar expediente APPCC" CTA in HACCP. v2 re-audit to verify discoverability + inspector-readiness post-deploy.
scope: |
  Single surface — /compliance/export. Validate discoverability fix, inspector
  surprise-arrival flow ("Inspector aquí ahora" pre-fill), spec coverage vs
  j9.md, audit-trail integrity. NO pt-PT localisation (Master descoped L1-6).
method: 5-persona roundtable (Owner Roberto panic mode · Food safety inspector · UX/UI designer · PM · Legal/compliance officer)
related:
  - docs/audit-2026-05-18-ux-roundtable.md (v1 baseline)
  - docs/ux/j9.md
  - docs/ux/DESIGN.md
  - docs/personas-jtbd.md
inputs:
  - docs/audit-2026-05-18-v2-screenshots/06-compliance-export-desktop.png
  - docs/audit-2026-05-18-v2-screenshots/06-compliance-export-mobile.png
---

# Detail 06 — Compliance export (APPCC inspector flow) — v2 audit

## v1 → v2 deltas (verified from screenshots)

| Item | v1 state | v2 state | Verdict |
|---|---|---|---|
| Nav entry "Expediente APPCC" | Missing (only reachable via URL) | Present in top nav (position 4 of 8) | RESOLVED (PR #194) |
| CTA "Generar expediente APPCC" from HACCP dashboard | Missing | Claimed shipped (PR #197) — not visible from this screenshot | NOT VERIFIABLE here |
| `pt-PT` locale | Missing | Descoped by Master | OUT OF SCOPE |
| Transparency banner verbatim copy | Missing in v1 deploy | Present, visible above the fold | RESOLVED |
| Locale chips (es-ES / ca-ES / eu-ES / gl-ES) | Missing | Present, 4 chips visible | RESOLVED |
| Scope checkboxes (5 rows) | Missing | Present, defaults HACCP+Lot checked per j9.md §4 | RESOLVED |
| Date range + quick chips (30d / 90d / año natural / trimestre cerrado) | Missing | Present, "Últimos 90d" selected as default | RESOLVED |
| Email recipient picker (collapsed strip) | Missing | Present, "Enviar también por email" collapsed strip | RESOLVED |
| Generate CTA `--accent` primary | Missing | Present, bottom-right sticky | RESOLVED |
| Past bundles archive table | Missing | Present heading, "Sin bundles generados todavía" empty state | RESOLVED (empty content honest) |
| **"Inspector aquí ahora" pre-fill flow** | Missing | **STILL MISSING — see Top flag #1** | UNRESOLVED |
| Progress strip (j9.md §7) | Not yet — only triggers on Generate click | Not visible (correct — only mounts on click) | DEFERRED to interaction |
| SHA-256 chain on download row | Not yet — only post-generation | Not visible (correct — post-action) | DEFERRED to interaction |

The surface is now **discoverable** and matches ~75% of the j9.md trigger spec. The remaining blockers are flow-level, not layout-level.

---

## Top-5 flags

### 🔴 BLOCKER — Flag #1 — No "Inspector aquí ahora" pre-fill flow [F]

**j9.md §Trigger explicit:** *"Iker opens `/compliance/export` from the top nav. **Alternatively, the dashboard auto-opens with a pre-filled `last 90 days` range when an inspector pre-read request arrives by email** (deep-link to this surface with query params)."*

The screenshot shows the form in its plain-vanilla default state. There is **no panic-mode entry path** for Roberto (owner persona, low tech, WhatsApp-comfort) when the inspector physically arrives unannounced at his door. The j9.md spec frames this as a deep-link from an inspector email, but the operational reality is different — the recurring case for SMB EU restaurants is the inspector showing up without prior notice (Spain APPCC inspections under RD 109/2010 are typically unannounced).

What Roberto needs at the moment of panic: a single prominent button on the dashboard (or here, on the empty-state below) labelled `Inspector aquí ahora →` that:
1. Pre-fills last 90 days (already the default — good).
2. Pre-checks HACCP + Lot lifecycle + Procurement + Photo-ingestion (NOT the j9 default which leaves Procurement+Photo unchecked — under inspection you want everything available).
3. Sets locale to the venue's `Organization.defaultLanguage`.
4. Auto-scrolls to the Generate button with a 3 px accent focus ring already on it.
5. Surfaces an eyebrow like `Modo inspección — ámbito ampliado por defecto. Revisa y genera.`

Currently the operator under stress must read the whole form, decide checkboxes correctly, and trust that the defaults are right. The j9 default scope (`HACCP + Lot` only) is wrong for the surprise-inspection case because the inspector will likely ask for procurement records too.

**Owner Roberto verdict:** "Estoy nervioso, hay un inspector en mi cocina, y este formulario me pregunta 4 cosas. ¿Me equivoco si dejo Procurement sin marcar?" → friction at exactly the wrong moment.

**Severity:** BLOCKER. The j9.md trigger spec is explicit, and the deploy ships only the manual configuration path. The inspector-surprise flow — the whole reason this surface exists — is not surfaced.

**Suggested change:**
- Add a `Modo inspección` chip/button above the form (or on the dashboard via PR #197's CTA) that pre-configures all 5 scope checkboxes + venue locale + last-90d range + jumps focus to Generate. One click instead of seven.

---

### 🔴 BLOCKER — Flag #2 — Mixed EN/ES dev-speak in scope labels [V]

**Persona affected:** Owner Roberto (low tech, WhatsApp-level) + Food safety inspector (reads the cover page in Spanish — anything English signals "this software wasn't built for our market").

The scope checkboxes read:
- `HACCP records (CCP readings + correctivas)` — mixes EN noun + ES adjective
- `Lot lifecycle (recepción → consumo)` — mixes EN noun + ES inline
- `Procurement (PO + GR + reconciliación)` — `PO` and `GR` are SAP/ERP jargon, not restaurant Spanish
- `Photo-ingestion provenance` — pure English
- `AI observability footprint` — pure English

This is the same v1 pattern flagged in the baseline (`docs/audit-2026-05-18-ux-roundtable.md` cross-cutting flag #1, BLOCKER). It was not fixed for this surface in PR #194/#197. The transparency banner copy IS in proper Spanish (`El expediente contiene el audit_log sin editar como capítulo 0…`) which makes the bilingual scope labels feel like a half-done copy pass.

Also: the banner itself still uses `audit_log` as a literal database identifier — Roberto and Inspector Marta do not know what that token means. It should read `registro de auditoría` or `bitácora de auditoría`.

**Inspector Marta verdict:** "Si el software no habla mi idioma en su propia plantilla de exportación, ¿qué garantía tengo de que la plantilla técnica que genera está correcta?"

**Suggested change:**
- All 5 scope rows → full Spanish (e.g. `Registros HACCP (lecturas CCP + acciones correctivas)`, `Ciclo de vida del lote (recepción → consumo)`, `Aprovisionamiento (pedidos + recepciones + conciliación)`, `Origen de fotos (procedencia de aprovisionamiento)`, `Huella de uso de IA`).
- Banner copy: `audit_log` → `registro de auditoría`; `capítulo 0` is fine because the inspector sees it on the cover page (it explains the structure).

---

### 🔴 BLOCKER — Flag #3 — No way to verify chain integrity / no signed-export reassurance pre-generation [F]

**Persona affected:** Legal / compliance officer (audit trail integrity is the entire job-to-be-done).

The surface tells the operator they will get an export, but does NOT tell them:
1. That every bundle carries an SHA-256 hash chained to the previous bundle (chain-of-custody for inspector verification).
2. That the chain integrity of the underlying audit_log is currently verified (or broken). The L3-6 backlog item from v1 said: *"Cadena hash visible como chip '✓ Verificado' por row en Auditoría + banner 'Cadena íntegra desde…'"* — same applies here. Before generating an export, the operator and the inspector want to see: `Cadena de auditoría íntegra · 187,554 eventos · desde 2026-02-14 · última verificación hace 3 min ✓`.
3. What "signed" means in practical terms for the inspector — does the PDF embed the SHA in the footer? Can the inspector verify the hash independently?

j9.md §8 mentions the SHA-256 surfaces inline on the download row AFTER generation. But pre-generation, the operator has no reassurance that the audit trail is healthy. If the chain is broken (e.g. someone tampered with the DB), the export would still generate but be useless as evidence. The screen should refuse to generate (or warn loudly) if `validateChainIntegrity` returns false.

**Memory cross-ref:** `feedback_verify_diagnosis_before_implementing.md` flagged a 1-line bug in `validateChainIntegrity` (PR #158). That function is load-bearing for this exact surface — if it returns false, generating an export is irresponsible.

**Suggested change:**
- Add an integrity strip above the form: `Cadena de auditoría · ✓ íntegra · <N> eventos · desde <fecha> · verificada hace <X> min`. If broken: `⚠ Cadena rota en <fecha> · contacta soporte antes de generar exportación`.
- Disable Generate button if chain is broken; show modal explaining why.
- L3-7 from v1 backlog (`Signed exports — PDF con SHA + JSON Lines con prev_hash/curr_hash; CSV pasa a secundario`) is the right direction. Surface this on the trigger screen pre-generation so operator + inspector know what they're getting.

---

### 🟠 MAJOR — Flag #4 — Empty archive state is silent, no guidance [V][I]

**Persona affected:** Owner Roberto (first time on this screen, needs to know what comes next).

Bottom of the screen: `Bundles anteriores` heading + `Sin bundles generados todavía.` That's it. No guidance about:
- What a "bundle anterior" looks like once generated (no demo row).
- That bundles persist indefinitely per j9.md §9 + ADR-029 retention (older ones go to cold storage with `restaurar →`).
- That the inspector can reference them by date ("the one you sent in March").
- A `Ver bundle de ejemplo` link to a demo PDF so the operator knows what they're committing to before clicking Generate the first time.

This is a classic v1 baseline pattern (cross-cutting flag #4: empty states are placeholders, not designed states). The cross-cutting L0-5 unified empty-state pattern was not applied here.

**Suggested change:**
- Empty state should be a card: icon + headline (`Aún no has generado expedientes APPCC.`) + 1 line (`Tras generarlo, encontrarás aquí todos los expedientes con su fecha, ámbito, idioma y hash de verificación.`) + secondary CTA (`Ver expediente de ejemplo →`) + primary CTA (`Generar primer expediente →` jumps focus to Generate button at top).
- Once bundles exist, show table per j9.md §9 (date · range · locale · scope summary · who generated · download link · SHA chip).

---

### 🟠 MAJOR — Flag #5 — Banner copy is too dense + load-bearing text buried [V][I]

**Persona affected:** Inspector Marta (reads the bundle cover page first to know what she's getting) + UX/UI designer (typography hierarchy).

The transparency banner reads, in one paragraph:
> *El expediente contiene el audit_log sin editar como capítulo 0; el resto son vistas estructuradas sobre ese mismo registro. No producimos resumen ejecutivo.*

Three problems:
1. **One paragraph, no visual hierarchy.** The load-bearing phrase is *"No producimos resumen ejecutivo"* — that is the trust-contract sentence that distinguishes nexandro from competitors who pre-curate compliance exports. It deserves visual emphasis (bold, or a separate line, or an icon). Currently it reads as filler at the end of a paragraph.
2. **`audit_log` as literal token** (covered in Flag #2).
3. **No "what's inside" preview.** The banner tells you what the export does NOT contain (no executive summary) but doesn't preview the chapter structure (Chapter 0 raw audit, Chapter 1 HACCP, Chapter 2 Lot lifecycle, etc.) that depends on the scope checkboxes below. A small mute-text accordion `Ver estructura del expediente →` would let the operator know exactly what pages the inspector will receive.

**Designer verdict:** The banner is verbatim from the j9.md spec which says it's "load-bearing", but a load-bearing wall in one undifferentiated paragraph is hard to read. Designer would split into two lines + emphasise the contract sentence.

**Suggested change:**
- Restructure banner into 2 lines:
  - Line 1 (regular): `Este expediente incluye el registro de auditoría completo sin editar (capítulo 0) más vistas estructuradas según el alcance seleccionado.`
  - Line 2 (bold or `--accent` eyebrow): `No incluye resumen ejecutivo — el inspector analiza el registro original.`
- Add accordion below: `Ver estructura del expediente generado →` that previews the chapter table of contents based on the currently checked scope items.

---

## Per-persona summaries

### Owner Roberto (panic mode)
Cannot complete the inspector-arrival flow in one click. Form has 7 decisions before Generate. Bilingual scope labels add cognitive load. No `Inspector aquí ahora` button anywhere on this surface. Roberto under inspector-stress is more likely to click Generate without scope changes — meaning he gets the j9 default (HACCP + Lot only) which omits Procurement and Photo-ingestion. **Verdict: fails the surprise-inspection JTBD.**

### Food safety inspector (Marta)
The cover-page transparency contract (post-generation) reads correctly in Spanish (`audit_log` token aside). Locale chips correctly cover ES + CA + EU + GL — the four official autonomous-community languages most likely required. **Verdict: bundle output likely acceptable IF Roberto generates the right scope; surface itself does nothing to guide him there.**

### UX/UI designer
Layout is clean, hierarchy is OK, accent CTA is correctly positioned. Banner needs typographic restructuring (Flag #5). Empty archive state is a placeholder (Flag #4). Scope label copy is half-translated (Flag #2). Mobile screenshot shows correct stacking and no overflow — the layout adapts well. Date picker uses native browser pickers (correct per j9.md §implementation notes). Focus rings: not visible in static screenshot but assumed UA default — needs token-bound `--accent` per L3-4. **Verdict: 75% spec coverage on layout, 0% on inspector-emergency flow.**

### PM (spec coverage)
j9.md spec coverage by region:
- Header + transparency banner (§1): ~80% (banner present, copy not visually structured per Flag #5).
- Date range picker (§2): 100% (Desde/Hasta + 4 quick chips, defaults correct).
- Locale picker (§3): 100% (4 chips, ES selected, footer mute line present).
- Scope checkboxes (§4): 90% (5 rows present, defaults match, copy is bilingual — Flag #2).
- Recipient picker (§5): 70% (collapsed strip present, can't verify expansion without interaction).
- Generate button (§6): 100% (accent CTA, bottom-right).
- Progress strip (§7): N/A (only mounts on click — correct).
- Download row (§8): N/A (post-generation — correct).
- Past bundles archive (§9): 50% (heading + empty state present, no guidance — Flag #4).
- **Inspector pre-fill trigger (§Trigger alternate path): 0%** (Flag #1).
- Edge cases (§Edge cases): unverifiable from a static empty-state screenshot.

**Overall spec coverage estimate: 65-70%.** Layout side is essentially done; the missing 30% is the inspector-emergency flow + chain-integrity reassurance + copy polish.

### Legal / compliance officer
Audit-trail integrity is invisible from this surface. Pre-generation the operator has no way to verify `validateChainIntegrity` status. SHA-256 chain disclosure is post-action only. If the chain were broken (cf. PR #158 1-line bug in sliding-window seed), the export would generate but be evidentially useless — and the operator would not know. **Verdict: surface lacks the integrity-verification handshake that gives compliance officers the confidence to forward bundles to inspectors. Add the integrity strip from Flag #3.**

---

## Inspector-readiness verdict

| Criterion | Status |
|---|---|
| Surface is discoverable from nav | ✅ Resolved (PR #194) |
| Surface ships in <5s from any nav click | ✅ (top-nav direct link) |
| Inspector-surprise pre-fill flow works | ❌ Blocker #1 |
| Bundle output likely accepted by inspector | 🟡 Yes IF operator picks right scope; defaults are wrong for surprise inspection |
| Chain integrity verifiable pre-generation | ❌ Blocker #3 |
| Copy is in operator's language (no dev-speak) | ❌ Blocker #2 |
| Empty-state guides first-time user | ❌ Major #4 |
| Mobile layout works | ✅ Confirmed from screenshot |

**Ready for an actual surprise inspection? NO.** The form ships but the inspector-emergency JTBD is not covered. Roberto can theoretically generate a bundle, but the configuration friction at the moment of stress means the wrong scope is likely. Suggest the `Modo inspección` chip/button (Flag #1) lands BEFORE marketing this surface as "inspector-ready".

---

## Suggested changes (consolidated)

| ID | Change | Tag | Severity | Effort |
|---|---|---|---|---|
| C1 | Add `Modo inspección` button (or wire PR #197 HACCP CTA here) that pre-configures all 5 scopes + venue locale + 90d range + jumps focus to Generate | [F] | BLOCKER | M (1-2d UI + state mgmt) |
| C2 | Translate 5 scope labels to full Spanish + banner `audit_log` → `registro de auditoría` | [V] | BLOCKER | S (copy only) |
| C3 | Add chain-integrity strip above form (`Cadena · ✓ íntegra · <N> eventos · desde <fecha>`) + disable Generate if broken | [F] | BLOCKER | M (needs `validateChainIntegrity` API + UI) |
| C4 | Empty archive state → designed card with icon + headline + demo CTA + first-bundle CTA | [V][I] | MAJOR | S |
| C5 | Restructure banner into 2 lines + emphasise no-summary contract + add `Ver estructura →` accordion | [V][I] | MAJOR | S |
| C6 | Default scope for "Modo inspección" path = all 5 checked (not j9 default) | [F] | MAJOR (dep of C1) | XS |
| C7 | Surface PR #197 `Generar expediente APPCC` CTA from HACCP dashboard — verify it deep-links into Modo inspección here | [F] | MAJOR | XS (already partly shipped per backlog) |
| C8 | Add SHA-chain explainer accordion (`Cómo verifica el inspector la integridad del expediente →`) below Generate | [V][I] | NICE TO HAVE | S |

Legend: [V] = visual/copy · [I] = information architecture · [F] = functional/flow.

---

## Notes for next iteration

- The 4-language locale (es/ca/eu/gl) is correct for the Spanish autonomous-community context. Master's pt-PT descope is consistent with the Phase 1 Nexandro brand commitment deferral.
- PR #197's CTA from HACCP dashboard is the right insertion point for the inspector-surprise flow — but the CTA needs to deep-link with query params (`?mode=inspection`) that this surface should honour by switching to Modo inspección defaults. j9.md §Trigger already mentions deep-link from email — extend the same pattern.
- The audit_log chain-integrity check (cf. PR #158, PR #172) is load-bearing for this surface's trust contract. Surface it.
- Demo-data toggle from v1 backlog L2-4 applies here too — let the operator see a populated archive with a sample bundle before they commit to generating.
- Once Modo inspección + chain integrity + copy fixes land, this surface is genuinely inspector-ready. Estimated 3-5 dev days of work + 1d copy + 1d design review.
