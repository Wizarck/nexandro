---
title: UX/UI Roundtable Audit v3 — Detail 06 Compliance Export (APPCC inspector flow)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  v2 flagged 3 BLOCKERS — (#1) no "Inspector aquí ahora" pre-fill, (#2) bilingual EN/ES scope
  copy, (#3) no chain-integrity reassurance pre-generation. PR #203 B-4 shipped the
  `?mode=inspeccion` deep-link with paprika banner + widened default scope
  (HACCP+Lot+Procurement+Photo); PR #203 also wires the HACCP "Generar expediente APPCC"
  CTA to that query string. PR #204 A1 applied Fraunces serif on h1. v3 re-audit checks
  whether the inspector-arrival JTBD is now executable in ≤2 min.
scope: |
  Single surface — /compliance/export. PANIC-MODE simulation: Inspector physically arrives
  unannounced; Owner Roberto has ≤2 minutes from inspector entering to PDF in hand.
  Validate B-4 visibility, residual blockers from v2 (copy + chain integrity), j9.md
  coverage, plus mobile parity.
method: 5-persona roundtable (Owner Roberto panic mode · Food safety inspector Marta · UX/UI designer · PM · Lawyer / compliance officer)
related:
  - docs/audit-2026-05-18-v2-detail-06-compliance.md (v2 baseline)
  - docs/ux/j9.md
  - docs/ux/DESIGN.md
  - docs/personas-jtbd.md
inputs:
  - docs/audit-2026-05-18-v3-screenshots/06-compliance-export-desktop.png (BARE URL, no query string)
  - docs/audit-2026-05-18-v3-screenshots/06-compliance-export-mobile.png (BARE URL, no query string)
  - https://nexandro.palafitofood.com/compliance/export?mode=inspeccion (route returns 200; visual NOT captured — needs supplementary playwright run)
---

# Detail 06 — Compliance export (APPCC inspector flow) — v3 audit

## v2 → v3 deltas (verified from screenshots + code)

| Item | v2 state | v3 state | Verdict |
|---|---|---|---|
| Nav entry "Expediente APPCC" | Present (PR #194) | Present, position 4 of 8, font-Inter regular | RETAINED |
| HACCP CTA `Generar expediente APPCC` wires to compliance | PR #197 wired CTA without query string | PR #203 now passes `?mode=inspeccion` | RESOLVED (code-verified; visual deferred to HACCP audit) |
| `?mode=inspeccion` deep-link route | Did not exist | Returns HTTP 200; PR #203 B-4 implements pre-fill | RESOLVED (route-verified via curl; **banner NOT visually captured — bare URL only**) |
| `?scope=haccp,photo` cherry-pick query | Did not exist | PR #203 B-4 ships it | RESOLVED (code-only) |
| Default scope on inspection deep-link | n/a (deep-link missing) | HACCP+Lot+Procurement+Photo (4 of 5) | RESOLVED (matches v2 C6 recommendation) |
| Paprika "Modo inspección activo" banner | Did not exist | Mounts only on `?mode=inspeccion` | **VISUALLY UNVERIFIED — see Top flag #1** |
| Fraunces serif on h1 (PR #204 A1) | Was already shipped per v2 | Confirmed: `Generar bundle de auditoría` renders Fraunces ~48 px | RESOLVED |
| Scope labels in Spanish (v2 BLOCKER #2) | Bilingual EN/ES | **STILL bilingual** — `HACCP records`, `Lot lifecycle`, `Procurement (PO + GR + …)`, `Photo-ingestion provenance`, `AI observability footprint` | **UNRESOLVED — see Top flag #2** |
| Banner `audit_log` literal token | Token visible | **STILL `audit_log`** (verbatim in italic banner) | UNRESOLVED |
| Chain-integrity strip pre-generation (v2 BLOCKER #3) | Missing | **STILL MISSING** — no integrity row above form | UNRESOLVED — see Top flag #3 |
| Empty archive state guidance (v2 MAJOR #4) | Silent | **STILL silent** — `Sin bundles generados todavía.` only | UNRESOLVED |
| Banner typographic restructuring (v2 MAJOR #5) | One paragraph | **STILL one paragraph** — no emphasis on "No producimos resumen ejecutivo" | UNRESOLVED |
| Defaults footer (`Defaults: últimos 90 días · es-ES · HACCP + Lot`) | Present | Present, sits left of Generate CTA | RETAINED |
| Mobile layout (single column, sticky CTA) | Worked | Works — Generate button visible without scroll on iPhone 13 viewport | RETAINED |

**Net movement:** 1 blocker resolved (Flag #1 partial — the route exists and B-4 ships, but the bare-URL surface still gives no entry path for a panicking owner who lands here directly from the nav, and we have **no visual proof** the paprika banner renders correctly when `?mode=inspeccion` is hit). 2 blockers unchanged (copy still bilingual, chain integrity still invisible). 2 major issues unchanged. Net: **~75%** spec coverage on layout, **~50%** on the inspector-arrival end-to-end flow when measured from "inspector enters door" → "PDF in hand".

---

## Top-3 BLOCKERS (residual)

### 🔴 BLOCKER — Flag #1 — `?mode=inspeccion` banner visually unverified + bare-URL entry has no panic affordance [F][V]

**What B-4 shipped (per PR #203 code):** When the surface is loaded with `?mode=inspeccion`, a paprika banner ("Modo inspección activo…") mounts above the form and the scope checkboxes pre-fill HACCP+Lot+Procurement+Photo. The HACCP "Generar expediente APPCC" CTA was updated in the same PR to append `?mode=inspeccion` so the deep-link chain works end-to-end.

**What v3 screenshots show:** The bare `/compliance/export` URL was captured. The paprika banner is **NOT in the screenshot** because the query string is absent. Curl against `https://nexandro.palafitofood.com/compliance/export?mode=inspeccion` returns HTTP 200, confirming the route is reachable, but we cannot visually verify (a) that the banner mounts, (b) that paprika contrast against `bg-paper` is AA-compliant, (c) that the 4 pre-checked boxes are actually pre-checked in the rendered DOM, (d) that the "Defaults:" footer at the bottom of the form updates to reflect the inspection-mode scope (currently the bare-URL screenshot reads `Defaults: últimos 90 días · es-ES · HACCP + Lot` — which would be **wrong** under inspection mode).

**Residual gap even if B-4 renders correctly:** If Roberto comes from a place that is NOT the HACCP dashboard — e.g. he taps `Expediente APPCC` directly from the top nav in panic — he lands on the bare URL, sees the same plain form v2 shipped, and the j9 default scope (`HACCP + Lot only`) kicks in. There is no `Modo inspección →` chip or button on the bare-URL surface itself to escalate scope. The deep-link only fires from the HACCP entry point. Owner Roberto's muscle memory is split: some days he opens the HACCP dashboard first (then B-4 works), other days he taps `Expediente APPCC` directly from nav (then he gets the v2 form with no panic mode).

**Owner Roberto panic-mode walkthrough (T+0 to T+90s):**
- T+0–T+20s — Inspector enters, Roberto opens app. **GOOD outcome:** Roberto's muscle memory is HACCP dashboard → he sees `Generar expediente APPCC` → tap → lands at `?mode=inspeccion` → banner shows + 4 boxes pre-checked → he taps Generate. **BAD outcome:** Roberto's muscle memory is "tap Expediente APPCC in the nav" → bare URL → default form with HACCP+Lot only → he generates the wrong-scope bundle and the inspector asks for procurement records that aren't in it.
- T+30s — Even in the GOOD path, Roberto cannot visually confirm `Modo inspección activo` was set unless the banner is bold + paprika-coded and the eyebrow text reads the new scope ("HACCP + Lot + Procurement + Photo" not "HACCP + Lot").
- T+35s — Footer still reads `Defaults: últimos 90 días · es-ES · HACCP + Lot` per the bare-URL screenshot. Under inspection mode this footer **must** update to reflect the new defaults or it actively misleads.

**Suggested change (incremental — B-4 is the right shape, just incomplete):**
1. Add a `Modo inspección →` chip on the bare-URL surface (top right of the form, before Date range). One click promotes the bare URL to inspection-mode behaviour client-side — same scope pre-fill + paprika banner mount. No re-route needed.
2. Wire the `Defaults:` footer to read the active mode, e.g. `Defaults: últimos 90 días · es-ES · HACCP + Lot + Procurement + Photo · Modo inspección` when `mode=inspeccion`.
3. Add a playwright capture of `?mode=inspeccion` in the next screenshot batch so we can visually audit the banner, contrast, and pre-fill state. Recommend `audit-2026-05-18-v3-screenshots/06b-compliance-export-inspeccion-desktop.png`.

**Severity:** BLOCKER. B-4 closes ~70% of v2 Flag #1, but the bare-URL surface still fails the inspector-arrival JTBD because muscle memory routes Roberto through either entry point.

---

### 🔴 BLOCKER — Flag #2 — Scope label copy STILL bilingual EN/ES + banner STILL says `audit_log` [V]

**Persona affected:** Owner Roberto (Spanish, low-tech) + Inspector Marta (reads the cover page; English tokens signal "this wasn't built for our market") + Lawyer (vocabulary mismatch between user-facing form and the legal disclaimer the inspector reads on the cover page = audit-trail credibility risk).

**Evidence (verbatim from v3 desktop screenshot):**
- `HACCP records (CCP readings + correctivas)` — EN noun + ES adjective. Inspector pet peeve.
- `Lot lifecycle (recepción → consumo)` — EN noun + ES parenthetical.
- `Procurement (PO + GR + reconciliación)` — `PO` and `GR` are SAP/ERP procurement jargon (`Purchase Order` + `Goods Receipt`). Restaurant owners speak `pedido` and `recepción`. This was flagged in v2 and not addressed in any Sprint 1 PR.
- `Photo-ingestion provenance` — pure English.
- `AI observability footprint` — pure English.

**Banner copy still reads:** *"El expediente contiene el `audit_log` sin editar como capítulo 0…"* — the `audit_log` literal database identifier is unchanged.

**Inspector Marta verdict (panic mode):** Inspector picks up the PDF, sees the cover page reference `audit_log` and scope labels mixing English nouns. Her trust signal flips from "this is a serious tool" to "this looks like a half-localised import". She starts looking harder at the records, asking more probing questions. Roberto's 2-minute window collapses.

**Lawyer verdict:** If a defence later argues "the operator did not understand which records he was submitting because the labels were not in his language", the vocabulary mismatch is exhibit A. The cover-page banner uses correct Spanish but references an `audit_log` token; the user-facing form scope uses English. A regulator could plausibly claim the operator pre-selected a scope without informed consent.

**Suggested change (must land in Sprint 2 — this is a 1-hour copy PR):**
- `HACCP records (CCP readings + correctivas)` → `Registros HACCP (lecturas CCP + acciones correctivas)`
- `Lot lifecycle (recepción → consumo)` → `Ciclo de vida del lote (recepción → consumo)`
- `Procurement (PO + GR + reconciliación)` → `Aprovisionamiento (pedidos + recepciones + conciliación)`
- `Photo-ingestion provenance` → `Origen de fotos (procedencia de aprovisionamiento)`
- `AI observability footprint` → `Huella de uso de IA`
- Banner: `audit_log` → `registro de auditoría` (keep `capítulo 0` because that token is for the inspector reading the cover page).

**Severity:** BLOCKER. This was Flag #2 in v2, deferred for Sprint 1, and not picked up in any of #203/#204. Cost is trivial (string-only PR); blast radius is inspector-trust + lawyer-defensibility.

---

### 🔴 BLOCKER — Flag #3 — STILL no chain-integrity reassurance pre-generation [F][I]

**Persona affected:** Lawyer / compliance officer (this is the entire job-to-be-done) + Inspector Marta (chain-of-custody is the basis for accepting the bundle as evidence) + Owner Roberto (under stress, needs a visible "✓ everything is OK" before he commits to handing a PDF to the inspector).

**v2 articulated this in detail (BLOCKER #3) and the v3 screenshot shows the form is unchanged above the Date range row — no integrity strip, no banner, nothing.** The operator and the inspector have to take it on faith that:
- `validateChainIntegrity()` returns true (vs the 1-line sliding-window seed bug fixed in PR #158).
- The PDF embeds the SHA-256 in a verifiable place (footer? cover page?).
- The chain has not been broken at any point in the date range being exported.

If the chain were broken right now — e.g. someone tampered with the DB, or the cron archival job (PR #174) wrote a corrupted envelope row — the form would still generate a bundle. The bundle would be technically signed but evidentially worthless. Neither Roberto nor Marta would know until a defence lawyer at a future hearing pulls the chain apart.

**Sprint 1 did NOT address this.** The closest reference is PR #172 (nested-emitasync direct-call refactor for audit-log re-entry) — that's a quality fix for the producer side, not a verification surface on this consumer side.

**Suggested change (carries from v2 BLOCKER #3 unchanged):**
- Above the form (between the transparency banner and the Date range): `Cadena de auditoría · ✓ íntegra · 187,554 eventos · desde 2026-02-14 · última verificación hace 3 min` with a green chip.
- If broken: red banner `⚠ Cadena rota en <fecha> · contacta soporte antes de generar expediente` + Generate button disabled.
- Modal explaining how the inspector can independently verify the SHA-256 after download (or link to a docs page).

**Severity:** BLOCKER. The trust contract that distinguishes nexandro from competitors (audit-log chapter 0 raw + signed) is invisible pre-generation. Lawyer cannot sign off; inspector has no handshake.

---

## 🟠 MAJOR — Residual issues (carried from v2)

| Flag | v2 ref | v3 status | Carry verdict |
|---|---|---|---|
| Empty archive state silent | v2 MAJOR #4 | `Sin bundles generados todavía.` unchanged | CARRY to Sprint 2 |
| Banner typographic structure | v2 MAJOR #5 | One paragraph, no emphasis on "No producimos resumen ejecutivo" | CARRY to Sprint 2 |
| `Defaults:` footer does not reflect mode | NEW in v3 | Reads `HACCP + Lot` even when inspection deep-link is active (suspected — needs visual proof) | CARRY to Sprint 2 |
| SHA-chain explainer accordion | v2 C8 nice-to-have | Not shipped | CARRY (low priority until Flag #3 lands) |

---

## Per-persona summaries

### Owner Roberto (PANIC MODE — inspector physically in the kitchen, T+0)

**End-to-end walkthrough in v3 deploy:**
- T+0–T+15s — Inspector enters, says "I'd like to see your APPCC records for last quarter". Roberto picks up tablet. **OK.**
- T+15–T+25s — IF Roberto's muscle memory goes via HACCP dashboard, he sees `Generar expediente APPCC`, taps, lands at `?mode=inspeccion`. **OK** *(if B-4 renders correctly — visually unverified)*.
- T+25–T+30s — IF Roberto taps `Expediente APPCC` in the top nav directly, he lands on bare URL, sees default form with `HACCP + Lot` only. **FAIL.** The inspector will ask for procurement records and they will not be in the bundle.
- T+30–T+35s — In the GOOD path, Roberto reads paprika banner (assumed) — but the scope labels are still in English. He hesitates. "Procurement? PO? GR? ¿Eso es lo que necesito?"
- T+35–T+40s — Inspector asks "make it 6 months not 3". Roberto taps `Año natural en curso` instead — wrong, but the labels are unclear and he's stressed. He has to look at the date inputs again to course-correct.
- T+40s — Roberto taps Generate. No chain-integrity indicator was visible before he tapped. He has no pre-flight reassurance he is about to hand the inspector a signed-and-valid PDF.
- T+90s — PDF downloads. Roberto opens it on the tablet, hands it to the inspector. He has no idea whether the SHA in the footer is verifiable.

**Verdict:** Inspector-arrival JTBD is 50% executable in 2 min via the HACCP dashboard entry (if B-4 renders), 0% executable via the bare URL. Sprint 1 closed the deep-link path but not the surface itself. Roberto's panic state is mitigated only when his muscle memory matches the engineered path.

### Food safety inspector (Marta)

**Cover-page reading (post-PDF generation):** Inspector picks up bundle. Cover page references `audit_log` in raw form — looks like a database token leaked into a regulator-facing artefact. Locale picker chose `es-ES` correctly (or `eu-ES` if Basque country); EN scope labels would not appear on the cover page (they map to chapter headings), so the cover-page experience is intact for Marta. But the OPERATOR's experience choosing the scope was confused — and if the operator chose `HACCP + Lot` only because B-4 didn't fire on the bare URL, Marta has to ask for procurement records and the gap erodes Roberto's professionalism.

**Verdict:** The bundle output is likely acceptable IF the operator generated the right scope. The probability that happens is ~50% in v3 (depends on which entry point Roberto used). The bundle's hash chain disclosure on the download row is fine post-generation; the absence of pre-generation chain-integrity verification is not visible to Marta because she's not in the room when Roberto generates — but the lawyer will read it later.

### UX/UI designer

**Layout:** Clean. Fraunces serif on h1 (`Generar bundle de auditoría`) landed in PR #204 A1 and reads correctly. Hierarchy is good. Accent CTA bottom-right is correctly positioned. Mobile stacks correctly (single column, sticky CTA visible without scroll on iPhone 13 viewport). Date inputs use native browser pickers (correct per j9.md §implementation notes).

**Copy:** Bilingual scope labels (Flag #2) are a design smell more than a layout issue — but they break the typography rhythm because the EN tokens are longer and force longer wraps. Banner has no typographic restructuring (Flag #5 carry).

**Inspection-mode visibility:** Cannot evaluate because v3 screenshot is bare-URL only. Recommend supplementary playwright run on `?mode=inspeccion`.

**Verdict:** 80% spec coverage on layout (up from 75% in v2 due to typography upgrade); 0% improvement on copy; the inspection-mode paprika banner is the unverified delta.

### PM (spec coverage)

**j9.md spec coverage by region (v3 update):**
- Header + transparency banner (§1): ~80% (banner present, copy not visually structured per v2 Flag #5; Fraunces serif on h1 = +5% from v2 = 80% vs v2 75%).
- Date range picker (§2): 100% (Desde/Hasta + 4 quick chips, defaults correct).
- Locale picker (§3): 100% (4 chips, ES selected, footer mute line present).
- Scope checkboxes (§4): 90% (5 rows present, defaults match j9.md, copy still bilingual — same as v2).
- Recipient picker (§5): 70% (collapsed strip present, expansion not verified).
- Generate button (§6): 100% (accent CTA, bottom-right).
- Progress strip (§7): N/A (only mounts on click — correct).
- Download row (§8): N/A (post-generation — correct).
- Past bundles archive (§9): 50% (heading + empty state present, no guidance — same as v2).
- **Inspector pre-fill trigger (§Trigger alternate path): 60%** (was 0% in v2; B-4 shipped the deep-link route + paprika banner + widened default scope, but the bare-URL surface still has no escalation chip, and visual verification of the banner is pending).
- Edge cases (§Edge cases): unverifiable from a static empty-state screenshot.

**Overall spec coverage estimate: 75-80%** (vs. v2's 65-70%). The +10% comes from B-4 closing most of v2 Flag #1 plus the Fraunces serif upgrade. The remaining 20-25% is: bare-URL escalation, copy translation, chain-integrity strip, empty-archive guidance, banner typographic restructure.

**Was B-4 visibly enough?** No. B-4 closes the deep-link path from HACCP but does not fix the bare-URL entry. The blocker is partially resolved, not fully resolved. And without a visual capture of `?mode=inspeccion`, we can't confirm that the banner contrast, the paprika token usage, or the pre-checked state actually renders correctly.

### Lawyer / compliance officer

**Audit-trail integrity:** Still invisible from this surface. Pre-generation the operator and the lawyer reviewing in advance have no way to verify `validateChainIntegrity` status. SHA-256 chain disclosure is post-action only (download row). If the chain were broken — and PR #158 already showed there was a 1-line bug here — the export generates anyway and the bundle is evidentially useless without anybody knowing until a future hearing.

**Chain-of-custody:** Bundle SHA appears on download row post-generation per j9.md §8. Good. But there is no inline explainer telling the inspector HOW to verify the hash independently. A defence later could argue "the inspector accepted a hash without an independent verification mechanism documented on the surface".

**Copy mismatch:** Scope labels in English / banner in Spanish is a vocabulary mismatch that a defence could exploit ("the operator selected a scope labelled in a language he does not speak").

**Verdict:** Surface fails the audit-trail integrity handshake. Blocker #3 from v2 still stands. Cannot recommend forwarding bundles to inspectors with confidence until the chain-integrity strip lands.

---

## Inspector-readiness verdict (v3)

| Criterion | v2 status | v3 status |
|---|---|---|
| Surface is discoverable from nav | ✅ Resolved (PR #194) | ✅ Retained |
| Surface ships in <5s from any nav click | ✅ | ✅ |
| Inspector-surprise pre-fill works (HACCP entry) | ❌ Blocker #1 | 🟡 Partial — B-4 shipped, **visually unverified** |
| Inspector-surprise pre-fill works (direct nav entry) | ❌ Blocker #1 | ❌ Still missing — no escalation chip on bare URL |
| Bundle output likely accepted by inspector | 🟡 If right scope picked | 🟡 If right scope picked + right entry point used |
| Chain integrity verifiable pre-generation | ❌ Blocker #3 | ❌ Still missing |
| Copy is in operator's language (no dev-speak) | ❌ Blocker #2 | ❌ Still bilingual EN/ES |
| Empty-state guides first-time user | ❌ Major #4 | ❌ Still silent |
| Mobile layout works | ✅ | ✅ |
| Fraunces serif h1 | n/a | ✅ Shipped PR #204 A1 |

**Ready for an actual surprise inspection? NO — but improved.** The HACCP entry path now works (assuming B-4 renders), but bare-URL entry still fails. Two of three v2 blockers are unchanged. Suggest landing the 3 blockers below + visual verification of `?mode=inspeccion` before marketing this surface as "inspector-ready".

---

## Suggested changes (Sprint 2 backlog)

| ID | Change | Tag | Severity | Effort | Origin |
|---|---|---|---|---|---|
| D1 | Add `Modo inspección →` chip on bare-URL surface that toggles inspection-mode client-side (paprika banner + 4-scope pre-fill + footer update) | [F] | BLOCKER | S (1d) | v3 Flag #1 |
| D2 | Translate 5 scope labels to full Spanish + banner `audit_log` → `registro de auditoría` | [V] | BLOCKER | XS (1h copy) | v2 C2 carry / v3 Flag #2 |
| D3 | Add chain-integrity strip above form + disable Generate if broken | [F] | BLOCKER | M (2d, needs `validateChainIntegrity` API exposure + UI) | v2 C3 carry / v3 Flag #3 |
| D4 | Update `Defaults:` footer to reflect active mode (so it reads `…HACCP + Lot + Procurement + Photo · Modo inspección` under inspection) | [V] | MAJOR | XS | v3 new |
| D5 | Empty archive state → designed card with icon + headline + demo CTA + first-bundle CTA | [V][I] | MAJOR | S | v2 C4 carry |
| D6 | Restructure banner into 2 lines + emphasise no-summary contract + `Ver estructura →` accordion | [V][I] | MAJOR | S | v2 C5 carry |
| D7 | Capture `?mode=inspeccion` URL in next playwright batch as `06b-compliance-export-inspeccion-{desktop,mobile}.png` | [I] | MAJOR (audit gap) | XS (script tweak) | v3 new |
| D8 | Add SHA-chain explainer accordion below Generate (`Cómo verifica el inspector la integridad del expediente →`) | [V][I] | NICE TO HAVE | S | v2 C8 carry |

Legend: [V] = visual/copy · [I] = information architecture · [F] = functional/flow.

---

## Notes for next iteration

- B-4 is the right shape — deep-link with query string + paprika banner + widened scope. The miss is (a) the bare-URL surface has no parallel escalation, (b) we did not capture the rendered banner in the v3 screenshot batch. Fix the playwright capture script first (D7) so the next audit can actually see what B-4 does.
- The 3 residual blockers are all small-to-medium effort. D2 (copy) is a 1-hour PR that should land THIS week. D1 (escalation chip) and D3 (chain integrity) are 1-2 days each. None should slip past Sprint 2.
- The `?scope=haccp,photo` cherry-pick query from PR #203 B-4 is useful for the inspector-by-email use case from j9.md §Trigger (deep-link from inspector email pre-request). Not the surprise-arrival case — surprise inspections will always use `?mode=inspeccion`.
- Demo-data toggle from v1 baseline L2-4 still applies for the archive table. Once D5 lands, also let the operator preview a populated archive.
- HACCP audit (detail 03) needs to verify the CTA on its end is actually firing `?mode=inspeccion` — that's the entry point this surface depends on. Cross-reference required.
- Once D1+D2+D3 land + D7 captures the visual, this surface is genuinely inspector-ready. Estimated 4-5 dev days + 1d copy + 1d design review.
