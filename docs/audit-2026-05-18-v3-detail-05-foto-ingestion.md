---
title: "v3 Detail — 05 Foto-ingestión (post-Sprint 1 deploy)"
status: canonical
last-updated: 2026-05-18
parent: docs/
related:
  - audit-2026-05-18-v2-detail-05-foto-ingestion.md (v2 baseline)
  - ux/j12.md (canonical spec)
  - ux/DESIGN.md
  - personas-jtbd.md
screens:
  - audit-2026-05-18-v3-screenshots/05-foto-ingestion-desktop.png
  - audit-2026-05-18-v3-screenshots/05-foto-ingestion-mobile.png
source:
  - apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx
  - packages/ui-kit/src/components/ConfidenceBandBadge/ConfidenceBandBadge.tsx
  - packages/ui-kit/src/components/{HitlQueueList,PhotoViewer,ExtractedFieldList,AiProvenanceChip}/*
prs_in_v3:
  - "#197 single empty state (v2 baseline)"
  - "#205 A3 — camera icon replaces emoji in empty state (accent-soft circle)"
---

# Foto-ingestión (`/photo-ingest/review`) — v3 detail

## 0. Delta v2 → v3 (factual)

The Sprint 1 deploy landed exactly **one change** on this surface:

- **PR #205 A3 — Camera icon.** The 📷 emoji at the top of the empty state has been replaced with a Lucide `Camera` glyph rendered inside an `--accent-soft` circular badge. Visual upgrade: the icon now reads as a deliberate affordance (filled disc + ink-on-soft) rather than the system emoji's flat orange tone. Confirmed in DOM and on both desktop + mobile screenshots.

**What Sprint 1 did NOT touch on this surface:**

- v2 BLOCKER 1 — `+ Subir foto` interactive control. Still inline text `…o usa el botón + Subir foto cuando esté disponible`. Wireframe-language still leaking.
- v2 BLOCKER 2 — `Firmadas` chip. Still present as fourth chip, still no count, still conflated with filter chips.
- v2 BLOCKER 3 — `AiProvenanceChip` / `OrgAiProvenanceFooter` on empty state. Still per-item only.
- v2 MAJOR 4 — Mobile chip wrap (`Firmadas` orphaned to row 2). Confirmed still broken on `05-foto-ingestion-mobile.png` — chip wraps to its own row exactly as in v2.
- v2 MAJOR 5 — Anatomy preview / `Cómo se ve una revisión` toggle. Not shipped.
- Mobile hotkey legend still visible (irrelevant on `pointer: coarse`).
- Nav-level queue count badge — still absent on top nav `Cola revisión`.
- Retention clock surface (90 days per #137) — still backend-only.

**Other v3-deploy changes that touch this surface tangentially:** the global top-nav typography hierarchy from PR #205 A2 (`nexandro` brand in heavier serif) is visible on the desktop screenshot. Otherwise the surface is byte-identical to v2 minus the icon swap.

## 1. BLOCKER closure status (v2 → v3)

| v2 BLOCKER | Status v3 | Notes |
|---|---|---|
| **B1** — No `+ Subir foto` button | ❌ NOT closed | Inline `<code>` "cuando esté disponible" verbatim from v2 |
| **B2** — `Firmadas` chip violates j12 §9 | ❌ NOT closed | Same 4-chip group, same conflation |
| **B3** — Provenance chip invisible on empty state | ❌ NOT closed | Per-item only, no org-level footer |
| **M4** — Mobile chip wrap + hotkey-legend leak | ❌ NOT closed | Mobile screenshot confirms identical wrap |
| **M5** — No anatomy preview on empty state | ❌ NOT closed | Empty state still 80 % vertical void on desktop |

**Sprint 1 closed 0 of 5 flags on this surface.** PR #205's icon swap is a Patrón Visual improvement (replacing emoji with iconography is part of the cross-cutting v3 brand-system delta), not a content/affordance fix.

## 2. Spec-vs-reality vs j12.md — v3 movement only

Coverage of j12.md by region (delta from v2 in **bold**):

| j12 § | Region | v2 status | v3 status | Delta |
|---|---|---|---|---|
| §1 | Eyebrow + headline | ✅ | ✅ | = |
| §1 | Transparency banner copy | ✅ | ✅ | = |
| §2 | Queue list (left col) | ✅ (invisible) | ✅ (invisible) | = |
| §2 | `+ Subir foto` CTA | ❌ | ❌ | = |
| §3 | Photo viewer (centre) | ✅ (invisible) | ✅ (invisible) | = |
| §4 | Extracted fields (right) | ✅ (invisible) | ✅ (invisible) | = |
| §5 | Bounding-box ↔ field link | ✅ (invisible) | ✅ (invisible) | = |
| §6 | Confirm row `Firmar` | ✅ (invisible) | ✅ (invisible) | = |
| §7 | Result interstitial | ✅ (invisible) | ✅ (invisible) | = |
| §8 | EU AI Act provenance chip | ⚠ per-item only | ⚠ per-item only | = |
| §9 | Three chips spec | ❌ partial (4 chips) | ❌ partial (4 chips) | = |
| — | Empty-state icon affordance | ⚠ flat 📷 emoji | **✅ Camera glyph in accent-soft disc** | **+** |
| — | Hotkey legend | ⚠ wired, invisible | ⚠ wired, invisible | = |

**Coverage shifts (v2 → v3):**
- Populated queue path: **55–60 % → 55–60 %** (no change — Sprint 1 didn't touch DetailPane).
- Empty-state first-run path: **25 % → 26–28 %** (the camera icon is a real visual upgrade but a 1-pt swing at best — the affordance gap is what defines the 25 % floor, not the iconography).

The user's premise that v2 was 55/25 is preserved in v3 with a marginal +2 pp on the empty-state ceiling for visual polish only.

## 3. Top 5 flags (v3)

### 🔴 BLOCKER 1 (still) — Empty state has no upload affordance

**Verbatim from v2 BLOCKER 1 — re-opened for Sprint 2.** The empty state now has a pretty Camera icon, which makes the affordance gap *worse*: the icon visually promises "tap me to take a photo", but tapping does nothing (it's not interactive — the icon is purely decorative inside the `--accent-soft` circle). A user trained on iOS / Android photo-picker conventions will tap the icon expecting a file-picker dialog and receive zero feedback.

The j12 §Trigger contract path (ii) `+ Subir foto` is still sealed off in production. Hermes path (i) requires WhatsApp/Telegram org setup which a first-run org doesn't have. **Net result: the surface is still unusable from first contact for a new org with no Hermes wiring**, and the icon upgrade has accidentally amplified the trust failure (better-looking dead-end).

- **Suggested change (V):** Wire `<button>+ Subir foto</button>` at the bottom of `EmptyState` + persistent header. Split into `Subir factura` / `Subir producto` to pre-classify. Make the new camera icon itself tappable (decorate-as-affordance) once the button is wired, so the visual investment in #205 A3 pays off.
- **Suggested change (F):** Remove `cuando esté disponible` wireframe-language from copy.

### 🔴 BLOCKER 2 (still) — `Firmadas` chip violates j12 §9

**Verbatim from v2 BLOCKER 2 — re-opened for Sprint 2.** Four chips, no counts, conflates retro-correction inbox with filter chips. Mobile screenshot makes the violation visually worse: `Firmadas` orphans to its own row, reading as a section heading rather than a peer chip.

EU AI Act forensic-trail mechanism (M3.x retroactive correction) is still buried behind `Firmadas`. An inspector landing on `/photo-ingest/review` and scanning the surface for the forensic mechanism will look for "Auditoría" or "Correcciones retroactivas" labels and miss `Firmadas` entirely (the lexicon suggests "filtered queue view", not "regulator forensic surface").

- **Suggested change (V):** Split chip group: filter chips `[Mis revisiones · Todas · Rechazadas]` + separate header link `Correcciones retroactivas →` (right-aligned, mute).
- **Suggested change (V):** Add counts to all three filter chips.
- **Suggested change (F):** Minimum: rename `Firmadas` → `Historial firmado`.

### 🔴 BLOCKER 3 (still) — EU AI Act Art. 13 provenance chip invisible on empty state

**Verbatim from v2 BLOCKER 3 — re-opened for Sprint 2.** `AiProvenanceChip` per-item only. No org-level footer or strip declares "model = gpt-oss-vision-72b, prompt = v2.3, retention = 90 days" on the surface a first-paint inspector lands on.

Compounding gap: the recently-shipped global brand-system polish (camera icon, top-nav typography) makes the empty state visually *more* trustworthy at first glance, which inverts the compliance risk — an inspector is now more likely to believe the surface is "production-grade and Art. 13-compliant" because it looks polished, but the operational-visibility gap is unchanged. Polish without provenance disclosure is the worst compliance posture.

- **Suggested change (V):** Mount `OrgAiProvenanceFooter` at bottom of empty state + page footer. Pull from `useIngestionItem` provider catalogue endpoint.
- **Suggested change (V):** Add `Estado de cumplimiento` 3-check strip on empty state: `✓ Modelo registrado (gpt-oss-vision-72b)` · `✓ HITL band 60–85 % activa` · `✓ Retención: 90 días`.

### 🟠 MAJOR 4 (still) — Mobile chip wrap + hotkey legend leak

**Verbatim from v2 MAJOR 4 — re-opened for Sprint 2.** Mobile screenshot at `05-foto-ingestion-mobile.png` confirms identical state to v2:
- Chips wrap with `Firmadas` orphaned on row 2.
- Hotkey legend `Atajos: j/k navegar cola · ↵ firmar · R reclasificar` visible on `pointer: coarse` viewport where there are no hotkeys.
- Hermes upload guidance still inline mute text with no tappable `wa.me/<orgPhone>` deep link.
- Empty state has no bottom-sticky CTA (the new Camera icon is centred mid-card, not bottom-anchored).

The mobile case is critical for Owner Roberto's actual JTBD ("Sunday night on the sofa, mobile") and for Line Cook Carmen's wall-mounted tablet (DESIGN.md §8 `pointer: coarse` branch). v3 ships zero mobile fixes.

- **Suggested change (V):** Hide hotkey legend below `--bp-tablet`. Single-row scroll for chips below `--bp-mobile`. Sticky bottom bar with `+ Subir foto` primary action.
- **Suggested change (V):** Replace inline Hermes guidance with `Abrir WhatsApp` deep-link button.

### 🟠 MAJOR 5 (still) — Empty state lacks anatomy preview

**Verbatim from v2 MAJOR 5 — re-opened for Sprint 2.** The transparency banner promises a sophisticated three-column review flow; the empty state below it (now with a prettier camera icon) still visually reads as "wireframe stub". Owner Roberto's 30-second attention window expires before he can verify the promise. Accountant evaluating month-end-processing migration has the same problem amplified.

- **Suggested change (V):** Add `Cómo se ve una revisión →` (collapsible on mobile, always-visible on desktop) below the legend strip, with a static screenshot of a populated DetailPane.
- **Suggested change (F):** Add `Activar datos de ejemplo` env-gated CTA that hydrates a 3-item demo queue from existing INT fixtures.

## 4. Per-persona findings (v3)

### 4.1 Owner Roberto (validates 5 albaranes morning routine — flow OK?)

- **Trust signal score: 4/10 on empty state (was 3/10 in v2), 7/10 on populated DetailPane (unchanged).** The Camera icon contributes +1 pt to visual polish, but the affordance gap (BLOCKER 1) caps the empty-state experience at 4 — a prettier dead-end is still a dead-end.
- **Sunday-night JTBD test (extrapolated to morning-tablet variant from input):** Roberto opens app on tablet 7:30 AM, expects notification "1 albarán pendiente revisión". Top nav `Cola revisión` shows no badge. He has to navigate explicitly. Lands on the surface, sees `Cola vacía · 0 elementos` because no Hermes upload has happened. No way to upload from the tablet directly. **Flow is broken end-to-end without Hermes wiring.**
- **Walkthrough step 5 (three-column layout):** Cannot be exercised at all from the deployed surface without a populated queue. The 73 %-confidence walkthrough described in the input never reaches the operator because step 2 (`Photo uploads`) has no UI affordance on this screen.
- **<30s per item target:** Impossible to measure — the surface never gets to a populated state in test.
- **Hermes mention is still positive but unactionable.** No proof the bot is live for his org, no `Estado de Hermes` chip, no `Abrir WhatsApp` link.
- **Suggested change (V):** Nav-level badge with queue count + oldest-age. `Estado de Hermes: WhatsApp activo · Telegram activo` chip on empty state.

### 4.2 EU AI Act compliance officer (Art. 13 transparency — all 4 requirements visible?)

Four Art. 13 requirements per input + j12:
1. **Model name + version** — ❌ NOT visible on empty state. Per-item only inside `AiProvenanceChip` which requires a populated queue. **CONDITIONAL FAIL.**
2. **Confidence score** — ⚠ Band legend visible (`≥85 % auto-fill · 60–85 % revisar · <60 % manual`) ✅ but no per-extraction score visible (requires populated queue). **CONDITIONAL PASS on band rule, FAIL on per-item visibility.**
3. **Banner explaining "this was AI-extracted, you are signing it"** — ✅ j12 §1 verbatim banner shipped post-#193, present on both desktop + mobile. **PASS.**
4. **Audit trail link** — ❌ NOT visible on empty state. `AiProvenanceChip` carries the `auditLogId` link but only when an item is selected. **CONDITIONAL FAIL.**

**Net Art. 13 status: 1/4 PASS, 1/4 PARTIAL, 2/4 FAIL on the empty-state surface.** v2 was CONDITIONAL PASS (because the banner contract was met). v3 maintains the same posture — Sprint 1 did not touch any of the 4 Art. 13 surfaces. The CONDITIONAL PASS verdict still holds because the banner copy is the legal-text artifact and is shipping; the operational visibility gap is unchanged.

- **Forensic trail (M3.x retro-correction)** — still ✅ shipped (PRs #152 / #160 / #168), still buried behind `Firmadas`. Strongest compliance asset still poorly surfaced.
- **Storage retention (90 days)** — still ✅ backend, ❌ not surfaced.
- **EU AI Act compliance verdict for v3: CONDITIONAL PASS (unchanged from v2).** No operational-visibility improvement. The visual polish on the empty state slightly worsens compliance posture (inspector trusts the polish more, but the chip is still missing).

### 4.3 UX/UI designer (3-column anatomy shipped per j12? mobile?)

- **3-column anatomy:** Still shipped in code (`PhotoIngestReviewScreen.tsx:209-249` per v2 baseline), still invisible from empty state. Sprint 1 did not address empty-state placeholder for anatomy.
- **Empty state density:** ~80 % vertical white space on desktop, unchanged. Camera icon is centred in the card (good visual anchor) but does not solve the density problem.
- **Hierarchy:** Banner + headline + legend chips still near-equal weight. The Camera icon is now the strongest visual anchor in the empty state, which is wrong — the transparency banner (legal contract) should be heaviest. **Risk: icon distracts from banner.**
- **Mobile breaks:** Chip wrap + hotkey leak + no sticky CTA — all unchanged from v2.
- **Icon-vs-affordance dissonance:** The new Camera icon is a polish win when read in isolation but creates affordance-language confusion when read in context with the inline `<code>+ Subir foto cuando esté disponible</code>` text below. Convention says "icon + nearby text = button". Here it's "icon + nearby text = static decoration + future-tense disclaimer". Confusing.
- **Patrón #7 (massive vertical void)** still applies, slightly mitigated by the icon disc filling the visual centre.
- **Suggested change (V):** Re-rank hierarchy. Transparency banner `--text-md` weight, empty-state headline secondary, Camera icon size reduced or wrapped in a real `<button>` tap target.
- **Suggested change (I):** Make filter chips and legend chips visually distinct. (Still applies from v2 — Sprint 1 didn't address.)

### 4.4 PM (j12 spec coverage — Sprint 1 only touched empty state icon. Big surface still 25% empty / 55% populated?)

- **Coverage estimate: 26–28 % empty-state (was 25 %), 55–60 % populated (unchanged).** The user's framing is essentially correct: Sprint 1's single change is icon polish, which moves the empty-state visual quality but not the affordance/anatomy coverage. The split is identical to v2 within margin of error.
- **Sprint 1 verdict on this surface: 1 PR, 0 BLOCKER closures, 0 MAJOR closures, +1 visual polish.** Net coverage delta: +1–2 pp on empty-state ceiling for iconography.
- **Spec drift (4-chips-instead-of-3):** Still open. Docs PR to either update j12 §9 or split retro surface is still pending. No discussion of either path landed in Sprint 1.
- **j12 §Edge cases (vision-LLM extracted ZERO fields, dual-operator conflict, network drop reconnect):** Still un-surfaced per v2.
- **The single largest spec gap is still `+ Subir foto` (BLOCKER 1)**. If Sprint 2 ships only one thing on this surface, it should be this — it unblocks the entire J12 trigger path (ii) and lets the rest of the surface be exercised, which then exposes whether the DetailPane really meets j12 §3-§8.
- **Sprint 2 backlog prioritisation:** BLOCKER 1 ≫ BLOCKER 3 > BLOCKER 2 > MAJOR 4 > MAJOR 5. Rationale: B1 unlocks the entire surface flow; B3 is the standalone compliance fix that doesn't depend on anything else; B2 is a refactor that requires spec decision; M4 needs mobile-only work; M5 is the polish layer that compounds on top of B1.
- **Suggested change (V):** Open the docs PR to resolve j12 §9 drift either way (update spec to 4 chips or split retro surface). Decision-needed.

### 4.5 Accountant / bookkeeper (does verification workflow protect him from booking wrong invoices?)

- **Workflow expectation: batch mode (50–200 invoices at month-end)** — unchanged from v2. Surface is still one-at-a-time; no bulk-select, no bulk-sign, no batch-export.
- **Protection from booking wrong invoices:** This is the core accountant JTBD per input. The protection layer that exists is the j12 §1 HITL band (60–85 % requires review) + per-field confidence + immutable audit_log + retroactive-correction trail. **In principle, all four protections are shipped.** In practice from the empty-state surface, none are visible. The accountant on first contact sees the legend chips (good — they signal the rule exists) but cannot verify that any invoice he booked last week was actually reviewed at the right band.
- **Forensic visibility from accountant POV:** He wants "show me every invoice signed in April, who signed, at what confidence, with what corrections". The path exists (Auditoría tab → filter by aggregate_type) but is two clicks away with no filter pre-set. The `Firmadas` chip is the closest affordance to "history of what I booked" but doesn't expose totals, dates, or supplier breakdown.
- **Queue-list information density (when populated):** Still missing `Total` column on row preview, per v2 finding. Highest-value column for the accountant; not shipped.
- **Reclassification (`cambiar tipo →`):** Still un-discoverable from empty state.
- **Export to CSV/Excel:** Still absent.
- **Net accountant verdict: workflow protection exists architecturally but is invisible operationally.** Same as v2. Sprint 1 changed nothing here.
- **Suggested change (V):** Add `Total` column to `HitlQueueList` row preview when `kind === 'invoice'`.
- **Suggested change (F):** Add `Exportar revisiones firmadas` link from the `Firmadas` chip (or its successor surface per BLOCKER 2).

## 5. Coverage delta vs. v2 baseline

| Dimension | v2 status | v3 status | Delta |
|---|---|---|---|
| Empty-state camera affordance (visual) | ⚠ flat 📷 emoji | ✅ Camera glyph in accent-soft disc | + |
| Compliance banner copy (j12 §1) | ✅ | ✅ | = |
| Single empty-state (v1 flag #2) | ✅ | ✅ | = |
| Band legend on empty state | ✅ | ✅ | = |
| Three-column anatomy (code) | ✅ (invisible) | ✅ (invisible) | = |
| `+ Subir foto` CTA | ❌ | ❌ | = |
| Chip counts | ❌ | ❌ | = |
| `Firmadas` chip removed/scoped | ❌ | ❌ | = |
| AiProvenanceChip on empty state | ❌ | ❌ | = |
| Anatomy preview on empty state | ❌ | ❌ | = |
| Mobile chip wrap fix | ❌ | ❌ | = |
| Hotkey legend hidden on mobile | ❌ | ❌ | = |
| Multi-venue selector | ❌ | ❌ | = |
| Demo-data toggle | ❌ | ❌ | = |
| Nav-level queue count badge | ❌ | ❌ | = |
| `Total` column on populated queue rows | ❌ | ❌ | = |
| CSV/Excel export of signed reviews | ❌ | ❌ | = |
| Org-level retention clock visible | ❌ | ❌ | = |
| `Estado de Hermes` chip | ❌ | ❌ | = |

**Net delta: 1 visual upgrade (icon swap), 0 BLOCKER closures, 0 MAJOR closures, 18 v2 suggestions still open.**

## 6. EU AI Act compliance dependency status (v3)

**Status: CONDITIONAL PASS (unchanged from v2).**

| Art. 13 / Annex IV requirement | v2 | v3 | Notes |
|---|---|---|---|
| Banner copy (legal text) | ✅ | ✅ | Iron-rule HITL + 60–85 % band, j12 §1 verbatim |
| Per-field confidence classification | ✅ | ✅ | `ConfidenceBandBadge.deriveBand` + API parity |
| Boundary constants iron rule | ✅ | ✅ | ADR-034 + ADR-J12-CONFIDENCE-THRESHOLDS-DUPLICATED |
| Forensic trail (retro corrections) | ✅ | ✅ | Buried behind `Firmadas` chip |
| Provenance chip on empty state | ⚠ per-item only | ⚠ per-item only | BLOCKER 3 |
| Org-level "which model" disclosure | ❌ | ❌ | Inspector cannot verify from UI alone |
| Retention clock visible | ❌ | ❌ | Backend-only (#137) |

**Inspector reads:** unchanged from v2. Determined inspector still passes via audit_log read; casual inspector reading the UI alone still fails on operational visibility. Sprint 1's icon swap does not move this needle.

**Recommended pre-inspection hardening (Sprint 2 single sprint):**
1. Mount `OrgAiProvenanceFooter` on empty state + page footer.
2. Split `Firmadas` chip per BLOCKER 2.
3. Add `Estado de cumplimiento` 3-check strip on empty state.

Identical recommendation to v2. The three changes still close the operational-visibility gap without touching the backend.

## 7. Sprint 2 backlog for this surface (prioritised)

| # | Item | Persona impact | Compliance impact | Effort |
|---|---|---|---|---|
| 1 | Wire `+ Subir foto` button (BLOCKER 1) + remove `cuando esté disponible` copy | Owner, Line Cook, Accountant (unlocks entire flow) | None directly (Art. 13 unchanged) | M (uses existing storage signed-URL flow, PR #137) |
| 2 | Mount `OrgAiProvenanceFooter` (BLOCKER 3) | Compliance officer, Owner | **High — closes Art. 13 operational gap** | S |
| 3 | Split `Firmadas` chip → filter chips + retro link (BLOCKER 2) | Compliance officer, Accountant | High — surfaces forensic-trail mechanism | M (touches 4-chip group + new sub-route) |
| 4 | Add `Estado de cumplimiento` 3-check strip | Compliance officer, Owner | High — operational visibility | S |
| 5 | Mobile fixes (M4): hide hotkey legend, sticky bottom-CTA, single-row chips, `wa.me` deep link | Line Cook (tablet), Owner (mobile) | None | M |
| 6 | Anatomy preview / `Cómo se ve una revisión` (M5) | Owner (first-paint trust), Accountant (eval) | Medium | M (use INT fixtures) |
| 7 | Chip counts (`Mis revisiones (n) · Todas (n) · Rechazadas (n)`) | All personas | None | S |
| 8 | Nav-level queue count badge | Owner, Accountant | None | S |
| 9 | `Total` column on populated `HitlQueueList` rows | Accountant | None | S |
| 10 | `Activar datos de ejemplo` env-gated demo-data toggle | Owner (eval), Compliance officer (inspection) | Medium | M |
| 11 | Open docs PR to resolve j12 §9 drift (3 vs 4 chips) | PM | None | XS |
| 12 | Retention clock visible per item + org-level | Compliance officer | High | S |
| 13 | CSV/Excel export from `Firmadas` chip / retro surface | Accountant | Medium | S |

**Sprint 2 recommendation:** items 1–4 fit a single sprint and close all three BLOCKERs plus the highest-leverage compliance MAJOR. Items 5–6 fit a second sprint. The remainder are polish/feature work distributable across M4 planning.

## 8. Verdict

Sprint 1 shipped one visual polish change on this surface (Camera icon, PR #205 A3). It did not close any v2 BLOCKER or MAJOR. The coverage split is essentially unchanged: ~55–60 % populated queue, ~26–28 % empty-state first-run (was 25 %).

The Camera icon upgrade is a clean win in isolation but introduces a new affordance-language dissonance: it visually promises "tap me" while the underlying control is still missing, amplifying the wireframe-feel for users trained on iOS/Android photo-picker conventions. **The missing `+ Subir foto` button (v2 BLOCKER 1) is Sprint 2's clear #1 priority for this surface** — it unblocks the entire J12 trigger path (ii), lets the rest of the shipped DetailPane be exercised in real testing, and pays off the visual investment in the icon.

EU AI Act compliance remains **CONDITIONAL PASS** — banner contract met (still), forensic trail shipped (still buried), operational visibility of provenance still per-item only. Sprint 2 items 2 + 4 (OrgAiProvenanceFooter + Estado de cumplimiento strip) close the operational gap and would graduate the verdict to **UNCONDITIONAL PASS** without touching the backend.

**Tag legend:** [V] visible-on-empty-state (highest leverage), [I] interaction or animation, [F] copy / lexicon.
