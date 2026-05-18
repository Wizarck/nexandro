---
title: "v2 Detail — 05 Foto-ingestión (post-#197 review surface)"
status: canonical
last-updated: 2026-05-18
parent: docs/
related:
  - audit-2026-05-18-ux-roundtable.md (baseline v1)
  - audit-2026-05-18-ux-roundtable-detail.md §7 (v1 verbatim verdict)
  - ux/j12.md (spec)
  - ux/DESIGN.md
  - personas-jtbd.md
screens:
  - audit-2026-05-18-v2-screenshots/05-foto-ingestion-desktop.png
  - audit-2026-05-18-v2-screenshots/05-foto-ingestion-mobile.png
source:
  - apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx
  - packages/ui-kit/src/components/ConfidenceBandBadge/ConfidenceBandBadge.tsx
  - packages/ui-kit/src/components/{HitlQueueList,PhotoViewer,ExtractedFieldList,AiProvenanceChip}/*
prs_in_baseline:
  - "#193 fase 0 — locale + dev-speak removal"
  - "#197 single empty state on Dashboard + Foto-ingestión"
---

# Foto-ingestión (`/photo-ingest/review`) — v2 detail

## 0. What changed between v1 audit and these screenshots (factual)

The v1 audit was taken **before** PRs #193 / #197 landed. Between v1 and v2:

- **PR #193 (Fase 0)** removed the dev-leak banner copy (`audit_log / capítulo 0`) and replaced it with the **j12 §1 verbatim transparency paragraph** about the 60–85 % confidence band + EU AI Act HITL iron rule. ✅ Confirmed in DOM.
- **PR #197 (single empty state)** collapsed the two side-by-side "No hay elementos pendientes de revisión" boxes into one centred empty-state card with a band-legend strip (✅ ≥85 % auto-fill · ● 60–85 % revisar · ● <60 % manual) and pivoted the headline to `Cola vacía · todo al día`. ✅ Confirmed in DOM.
- Hotkey legend was kept (`j/k navegar cola · ↵ firmar · R reclasificar`).

**What was NOT shipped between v1 and v2:**
- L1-4: Confidence-band three-column anatomy as a *visible* default state (see flag #1 below — the anatomy exists in code but renders only on a non-empty queue).
- `+ Subir foto` interactive upload control (still inline `<code>`, "cuando esté disponible").
- Pre-classify upload split (`Subir factura` / `Subir producto`).
- Chip counts (`Mis revisiones (n) · Todas (n) · Rechazadas (n) · Firmadas (n)`).
- Empty-state preview/placeholder of the three-column anatomy.
- `Firmadas` chip scoping (j12 §9 specifies three chips, not four — `Firmadas` is still in the bar).
- Staff feedback surface (cook's "mis subidas" view).

## 1. Surprise finding: the three-column anatomy IS implemented — but invisible

Re-reading `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx:209-249` confirms the full j12 §2-§8 anatomy is wired:

```tsx
{queueRows.length === 0 ? (
  <EmptyState />
) : (
  <div className="mt-4 grid gap-6 lg:grid-cols-12">
    <aside className="lg:col-span-3"><HitlQueueList … /></aside>
    <main className="lg:col-span-9">
      <DetailPane … />  {/* renders PhotoViewer + ExtractedFieldList + AiProvenanceChip + Firmar CTA */}
    </main>
  </div>
)}
```

`ConfidenceBandBadge`, `PhotoViewer`, `ExtractedFieldList`, `HitlQueueList`, `AiProvenanceChip`, `CorrectionsHistoryList`, `CorrectionsHistoryDiffModal` all exist as ui-kit primitives and are imported here. The keyboard shortcuts (`j/k/Enter/R`), the `Firmar ingestión` primary CTA, the IndexedDB-equivalent localStorage draft (30-min TTL per `DRAFT_TTL_MS`), the `cambiar tipo →` ghost CTA, the `SignedItemPane` retro-correction flow with `CorrectionsHistoryList` + diff modal — all live in the file.

**The user's premise that "the L1-4 three-column anatomy was NOT shipped" is wrong as stated.** It WAS shipped, in slice #17b (PR #147, m3-photo-ingest-review-ui, Wave 2.8) and was hardened across PRs #151 / #152 / #154 / #157 / #160 / #168 over M3.x. The screenshot is misleading because the test org has zero queued items, so the empty state is what we see.

What is *actually* missing for compliance and trust is **the persistent affordances that should live on the empty state**: the upload CTA, anatomy preview, chip counts. The j12 spec assumes the queue will sometimes be empty and treats that as a working surface, not a placeholder.

## 2. Spec-vs-reality against j12.md (revised after code read)

| j12 §  | Region                             | v1 (audit baseline)                       | v2 (post-#193 / #197)                                              | Status                |
|--------|------------------------------------|-------------------------------------------|--------------------------------------------------------------------|-----------------------|
| §1     | Eyebrow + headline                 | OK                                        | OK (`REVISIÓN HUMANA · INGESTIÓN POR FOTO (HITL)`)                 | ✅ shipped            |
| §1     | Transparency banner copy           | Wrong (`audit_log capítulo 0`)            | **Verbatim j12 §1 paragraph**                                      | ✅ fixed by #193      |
| §2     | Queue list (left column)           | Empty placeholder                         | `HitlQueueList` + auto-select first row (renders when n>0)         | ✅ shipped, invisible |
| §2     | `+ Subir foto` CTA                 | Absent                                    | **Still absent** — only inline `<code>` "cuando esté disponible"    | ❌ NOT shipped        |
| §3     | Photo viewer (centre)              | Empty placeholder                         | `PhotoViewer` with bounding boxes (renders when n>0)               | ✅ shipped, invisible |
| §4     | Extracted fields (right)           | Empty placeholder                         | `ExtractedFieldList` + `ConfidenceBandBadge` per row (n>0)         | ✅ shipped, invisible |
| §5     | Bounding-box ↔ field reciprocal    | Absent                                    | Lifted `highlightedField` state + hover handlers wired both ways   | ✅ shipped, invisible |
| §6     | Confirm row (`Firmar ingestión`)   | Absent                                    | Primary CTA, 48 px height, disabled until <0.60 fields filled      | ✅ shipped, invisible |
| §6     | Reclassify (`cambiar tipo →`)      | Absent                                    | Ghost button wired to `useReclassifyIngestion`                     | ✅ shipped, invisible |
| §7     | Result interstitial                | Absent                                    | `SuccessStrip` with `Revisar siguiente` + `Volver al panel`        | ✅ shipped, invisible |
| §8     | EU AI Act provenance chip          | Absent                                    | `AiProvenanceChip` (model + prompt + confidence + auditLogId)      | ✅ shipped, invisible |
| §9     | Three chips (Mis · Todas · Rech.)  | 4 chips, no counts                        | **Still 4 chips** (`Firmadas` extra), still no counts              | ❌ partial            |
| —      | Hotkey legend                      | Present, no affordance                    | Present, wired in DetailPane (only when queue n>0)                 | ⚠ wired, invisible    |
| —      | RBAC                               | n/a                                       | Owner+Manager only (Staff = `ForbiddenForStaff` empty)             | ✅ shipped (per ADR)  |
| §Edge  | 30-min draft persistence           | n/a                                       | localStorage by `(itemId, actorUserId)` + TTL guard                | ✅ shipped            |
| §Decis | Retro-correction surface           | n/a                                       | `SignedItemPane` + history list + diff modal (M3.x)                | ✅ shipped, invisible |

**Coverage shifts: ~30 % (v1) → ~55–60 % (v2)** for users that ever see a non-empty queue. **For the empty-state surface a new user opens for the first time, coverage is still ~25 %** — they get headline + banner + chips + band legend + Hermes-flavoured CTA copy, but no interactive upload, no anatomy preview, no chip counts, no Staff feedback. That is the gap that still makes this surface feel like "wireframe" on first contact.

The user's "still ~30 %" claim is correct **for what an empty-org sees on first paint** and wrong **for a populated queue.** Both numbers matter; demos and first-run experience hit the lower one, which is why the perception persists.

## 3. Top 5 flags (severity-tagged)

### 🔴 BLOCKER 1 — Empty state has no upload affordance, blocking the entire J12 trigger surface

The only inline text reference to `+ Subir foto` is wrapped in `<code>…cuando esté disponible</code>`. There is **no `<button>`, no `<input type=file>`, no file-picker**, no link to the upload endpoint anywhere on the surface, and no other tab carries an "upload an invoice photo" affordance either (confirmed by Grep — `apps/web/src/screens/j12/PhotoIngestReviewScreen.tsx:1062` is the only occurrence of `Subir foto` in the entire `apps/web` tree). 

The j12 §Trigger contract is explicit: "(i) Hermes invoke … from WhatsApp / Telegram / chat widget; or **(ii) operator uploads photos directly from this surface's `+ Subir foto` CTA**". Path (ii) is sealed off in production. The empty state literally tells the operator "use the button when it's available", which is wireframe-language leaking through to users — Owner Roberto reads "the button doesn't exist yet" and assumes the product is unfinished.

Compounding effect for v2: every other "did the slice ship?" check from v1 audit assumes the queue can be populated. With Hermes upload disabled on the test deploy (no WhatsApp seeded) and no upload affordance here, **none of the j12 §2-§8 anatomy can be exercised at all from this UI** — explaining why a casual reviewer (and the user's framing) sees "30 %".

- **Suggested change (V):** Wire a `<button>+ Subir foto</button>` at the bottom of `EmptyState` AND in the persistent header (j12 §2 + v1 flag #6) using existing storage signed-URL flow (PR #137 `m3-photo-storage-lifecycle`). Split into `Subir factura` / `Subir producto` to pre-classify (saves a `cambiar tipo` round-trip).
- **Suggested change (F):** Remove the wireframe-language `cuando esté disponible` — copy is shipping to a real user.

### 🔴 BLOCKER 2 — `Firmadas` chip violates j12 §9 and inflates scope to an unspecified state

j12 §9 specifies three chips: `Mis revisiones`, `Todas` (Manager+ scope), `Rechazadas`. The shipped surface adds a fourth `Firmadas` chip (PR #160 `m3.x-photo-ingest-retroactive-correction-ui`). That chip is the only entry point to the M3.x retroactive-correction surface (`SignedItemPane`). It is therefore not removable without breaking the retro flow — but as it stands it has **no count**, **no separation from "what needs my attention now"**, and **conflates a power-user feature (retro correction) with the day-to-day HITL review backlog**. 

For the EU AI Act compliance officer persona this is the single worst flag on the surface: retroactive corrections are *the* forensic-trail mechanism the regulator inspects ("what did the model think, what did the human change, when, why?"), and surfacing them under a chip indistinguishable from a filter chip undersells the mechanism. Marta the inspector would expect a separate, labelled "Correcciones retroactivas" section with date filter, actor filter, and reason-required column, not a bare filter chip.

- **Suggested change (V):** Split the chip group into two: filter chips `[Mis revisiones · Todas · Rechazadas]` ABOVE the queue, and a separate header link `Correcciones retroactivas →` (right-aligned, mute color) that routes to a dedicated subroute. j12 §9 then re-aligns to spec.
- **Suggested change (V):** Add counts to filter chips (`Mis revisiones (3) · Todas (12) · Rechazadas (5)`). Without counts the chip group provides no triage value.
- **Suggested change (F):** If splitting is too costly this sprint, at minimum rename `Firmadas` → `Historial firmado` so the lexicon doesn't suggest "another inbox".

### 🔴 BLOCKER 3 — EU AI Act Art. 13 provenance chip is invisible to empty-state visitors and to auditors who never trigger a review

The `AiProvenanceChip` (model / prompt version / overall confidence / auditLogId) renders **only inside `DetailPane`, only when an item is selected from a non-empty queue**. Per j12 §8 and PRD-M3 §FR41 + EU AI Act Article 13, this chip is the surface-level transparency disclosure of which model produced an output. Two failure modes flow from its current placement:

1. **First-paint compliance demo to an inspector fails.** Marta opens `/photo-ingest/review`, sees the empty state with no model attribution anywhere, and has to either trust the empty-state copy ("nexandro pide tu revisión humana…") or drill into the audit log to verify which model is wired. The chip should be visible at all times — at minimum a global footer: `Modelo activo en esta org: gpt-oss-vision-72b · prompt v2.3 · ver auditoría →`.

2. **Compliance officer cannot validate org-wide provenance without triggering an extraction.** The chip is per-item only, which is correct for forensic trail, but means there is no surface that answers "which vision-LLM is this org configured to use right now?" — a question Art. 13 reads "shall be designed in such a way that … natural persons can oversee them" + Annex IV §2 requires a description of "the system's capabilities and limitations".

The compliance hard-rule (j12 §1 banner copy) is now correctly worded post-#193, so the *contractual* transparency text is shipping. The *operational* transparency artifact (the chip) is not, on the surface where regulators are most likely to land.

- **Suggested change (V):** Mount a global `OrgAiProvenanceFooter` at the bottom of the empty state AND in the page footer when a non-empty queue is shown: `Modelo activo: gpt-oss-vision-72b · prompt v2.3 · cambiar configuración → · ver auditoría →`. Pull from the same `useIngestionItem` provider catalogue endpoint used by AI obs.
- **Suggested change (I):** When `ConfidenceBandBadge` band = `reject`, the row's destructive border is per spec, but the row currently lacks the "Manual mandatory eyebrow" + "value empty + required" treatment that j12 §4 mandates. Confirm in INT spec.

### 🟠 MAJOR 4 — Mobile breaks the operator persona's actual device

The Line Cook (Carmen / cook) persona uses a shared wall-mounted tablet (`personas-jtbd.md §1.3`). The Manager / Head Chef persona uses a kitchen tablet 10" landscape (`DESIGN.md §8`). The Owner persona uses mobile on the sofa. On the **mobile screenshot** the surface renders the empty state passably (single column, transparency banner wraps, chips wrap to two rows, legend strip wraps to two rows, hotkey legend still visible). **What breaks:**

1. The chip group wraps to two rows on a 390 px viewport — `[Mis revisiones · Todas · Rechazadas]` on row 1, `[Firmadas]` orphaned on row 2. Visually reads as "Firmadas is a new section, not a chip".
2. The hotkey legend (`Atajos: j/k navegar cola · ↵ firmar · R reclasificar`) is visible on mobile where there are no hotkeys. Cognitive load + irrelevant.
3. The Hermes upload guidance (`Sube una foto desde Hermes (WhatsApp / Telegram)`) is in italic-ish mute text; on mobile this is exactly the surface where the operator most needs a tappable affordance, not a paragraph of instructions.
4. The `+ Subir foto` button (when wired per BLOCKER 1) MUST be a sticky bottom bar on mobile per DESIGN.md §8 (`pointer: coarse` branch → 48 px min hit area). Currently the empty state has no bottom-anchored affordance at all.

- **Suggested change (V):** Hide hotkey legend below `--bp-tablet`. Stack chip group vertically (or use overflow-scroll) below `--bp-mobile`. Replace inline Hermes guidance with a tappable `Abrir WhatsApp` deep link (`wa.me/<orgPhone>`) + the upload button as primary action.
- **Suggested change (I):** Add `data-testid` hooks to the chip group + empty-state CTAs so Playwright can lock visual regression at `--bp-mobile`.

### 🟠 MAJOR 5 — Empty state lacks an anatomy preview, so first-run users cannot trust the surface will do what the banner promises

The transparency banner promises a sophisticated three-column review flow ("foto + extracción + firmar"). The empty state below it shows a camera emoji, three legend chips, and an instructional paragraph — visually as if nothing is built yet. The v1 audit's suggested change #3 ("Add empty-state preview of three-column anatomy. Greyed placeholder for PhotoViewer + ExtractedFieldList + Firmar CTA") was NOT shipped.

This matters disproportionately for **Owner Roberto** (validates invoices in seconds — does the flow help him trust the AI extraction). He has 30 seconds of attention. The current empty state asks him to trust that an entire workflow exists somewhere offscreen. The accountant / bookkeeper persona has the same problem amplified: they're evaluating whether to move month-end invoice processing onto nexandro, and a wireframe-looking empty state actively undersells the shipped capability.

- **Suggested change (V):** Add a `<details>` (or always-visible at desktop, collapsed at mobile) below the legend strip: `Cómo se ve una revisión →` with a static screenshot of a populated DetailPane (the same one already implemented). Self-screenshot using the existing INT-spec fixtures (`apps/api/src/photo-ingestion/__fixtures__/*`).
- **Suggested change (F):** Add an `Activar datos de ejemplo` CTA on the empty state (consistent with audit-2026-05-18 L2-4 "Demo-data toggle") that hydrates a 3-item demo queue from an env-gated fixture. One click → DetailPane mounts fully exercisable, no Hermes integration required.

## 4. Per-persona findings

### 4.1 Owner Roberto (validates invoices in seconds — does the flow help him trust the AI extraction)

- **Trust signal score: 3/10 on empty state, 7/10 on populated DetailPane (which he won't see without BLOCKER 1 + 5).** The banner says the right thing (60–85 % band, EU AI Act HITL), but without an anatomy preview he has no way to verify the promise renders to a real surface. He will close the tab in 15 seconds.
- **JTBD trigger missing.** Roberto's JTBD ("when I open the app on Sunday night…") doesn't actually map to this surface — it maps to Dashboard. He arrives here only when notified ("3 invoices waiting your review"), and there is no notification badge on the top nav from this screen. The Cola revisión nav entry shows no count.
- **Hermes mention is positive but unactionable.** "Sube una foto desde Hermes (WhatsApp / Telegram)" — Roberto's mental model says "good, my staff can text the invoice in", but there is no link to the WhatsApp bot configuration, no proof the bot is live for his org.
- **Suggested change (V):** Add nav-level badge with queue count + oldest-age. Add a `Estado de Hermes: WhatsApp activo · Telegram activo` chip on the empty state.

### 4.2 EU AI Act compliance officer (Art. 13 transparency — confidence bands 0.60–0.85)

- **Banner copy (j12 §1) is now spec-perfect** post-#193. Cites the 60-85 band, names "iron-rule HITL", names "EU AI Act". This is the load-bearing legal paragraph. ✅
- **Provenance chip (AiProvenanceChip per Art. 13) is per-item only** — see BLOCKER 3. Inspector cannot verify the model/prompt configuration without first triggering a review. This is the *one* compliance failure mode on the surface.
- **Confidence-band classification logic is correct in code** (`ConfidenceBandBadge.deriveBand`: `>=0.85 auto_fill`, `>=0.60 flag_for_review`, else `reject`) and duplicated on the API side (`apps/api/src/photo-ingestion/application/confidence-band.classifier.spec.ts` exists). The boundary constants are iron-rule per ADR-034. ✅
- **Forensic trail (M3.x retroactive correction) is correctly implemented** as append-only history with diff modal (`SignedItemPane` + `CorrectionsHistoryList` + `CorrectionsHistoryDiffModal`). This is the strongest compliance asset on the surface, but it is buried behind the `Firmadas` chip — see BLOCKER 2.
- **Storage retention** (PR #137 `m3-photo-storage-lifecycle`): 90-day photo retention with signed URLs + audit linking exists in backend. Not surfaced anywhere on the UI — the operator/inspector has no visibility into "this photo will be purged on YYYY-MM-DD".
- **Suggested change (V):** Add an `Estado de cumplimiento` strip on the empty state with three checks: `✓ Modelo registrado (gpt-oss-vision-72b)` · `✓ HITL band 60–85 % activa` · `✓ Retención: 90 días`. Pulls from the same providers used by AI obs.
- **EU AI Act compliance verdict for v2:** **CONDITIONAL PASS.** Surface meets Art. 13 in *contractual* copy and meets it in *forensic-trail* code, but fails it on *operational visibility of provenance* (BLOCKER 3). Net: a determined inspector can verify compliance by reading audit_log; a casual inspector reading the UI alone cannot.

### 4.3 UX/UI designer (three-column anatomy, density, photo viewer affordance)

- **Empty state density is wasteful.** ~80 % vertical white space on desktop. Pattern is consistent with the cross-cutting Patrón #7 (massive vertical void) flagged in v1 baseline.
- **Hierarchy collapse.** The transparency banner (load-bearing legal text), the empty-state headline (`Cola vacía · todo al día`), and the legend chip strip all carry near-equal visual weight on the empty state. The legal text should be the heaviest element (it's the contract); right now it's a quiet italic.
- **Chip styling is inconsistent with `BulkReviewChips` vs band-legend chips.** Filter chips (`Mis revisiones`…) use pill border + selected state. Legend chips (`≥85 % auto-fill`…) use pill border but are non-interactive. Visually identical → operators will tap them and nothing will happen. Need either visually distinct styling (mute background, no border) or convert to a single legend strip without chip shapes.
- **No clear "anatomy preview" CTA bridging empty state to populated.** See MAJOR 5.
- **Hotkey legend uses `<kbd>` semantics** (good). Discoverability is poor (no `?` opens overlay). Accessibility v1 flag #12 still applies.
- **`PhotoViewer` bounding-box overlay** (not visible on this screenshot but in code) uses lifted `highlightedField` state, which is correct per ADR-J12-RECIPROCAL-LINK-CLIENT-SIDE. No INT visual regression spec for bounding-box visibility exists yet (need to confirm — grep shows no `.spec.tsx` for PhotoViewer bounding overlay).
- **Suggested change (V):** Re-rank visual hierarchy: transparency banner = `--text-md` ink on `--surface-2`, empty-state headline secondary, legend chips merged into single legend strip without chip shapes.
- **Suggested change (I):** Make filter chips and legend chips visually distinct.

### 4.4 PM (j12.md spec coverage)

- **Coverage estimate: 55–60 % of j12.md for a populated queue user, 25 % for an empty-state first-run.** The split is the key insight — v1's flat "~30 %" was correct for the surface-as-presented but masks that the heavy backend work (slice #17a/b + M3.x H1a/b + retroactive correction) is shipped.
- **Spec drift watch:** j12 §9 explicitly says THREE chips. We ship four. The fourth (`Firmadas`) was added in #160 to host the retro-correction flow. Spec was not updated. **Action: open a docs PR to either (a) update j12 §9 to mention the M3.x retro chip, or (b) split the retro surface off (BLOCKER 2 suggestion).** Decision-needed.
- **Unshipped j12 §2 affordance: `+ Subir foto`** — see BLOCKER 1. This is the single largest spec gap.
- **j12 §Edge case "vision-LLM extracted ZERO fields"** — no visible row treatment for overall confidence < 0.60. Need to confirm via INT spec; ConfidenceBandBadge handles per-field reject band, but the row-level "fallida · 7 campos requeridos" eyebrow is not visible in the code.
- **j12 §Edge case "two operators view same row simultaneously"** — no UI for the "Otro operador firmó este ítem · 14:32 CEST por Carmen" interstitial. Likely lives as backend error handling; not surfaced.
- **j12 §Edge case "network drops mid-edit"** — localStorage draft IS shipped (correct), the "Borrador desde hace N min" message renders (correct). No "reconectado · sincronizando…" surface. ⚠ minor.
- **Suggested change (V):** Open docs PR to update j12 §9 spec OR refactor (per BLOCKER 2). Either way, code+spec drift is the deeper issue — it'll recur if the gate isn't fixed.

### 4.5 Accountant / bookkeeper (real-world invoice validation workflow)

- **Workflow expectation: batch mode.** End-of-month: 50–200 invoices in a sitting. Current surface is one-at-a-time (`j/k` navigate, `Enter` sign). No bulk-select, no bulk-sign for high-confidence band, no "approve all in `≥0.85` band" override (which is correct per ADR-034 iron rule — auto-fill items should not surface here at all — but the accountant doesn't know that and will expect a "select all" affordance).
- **Visible data missing for accounting workflow:** supplier, date, total amount, VAT line. The `ExtractedFieldList` exposes these per-field (Proveedor, Albarán nº, Total, Fecha entrega, VAT lines per j12 §4) but they're invisible on this empty state. The queue list row preview (when populated) shows `thumbnail · kind · hint · time-since-upload · confidence` — does NOT show total amount. For an accountant scanning 50 invoices, total amount in the queue list is the single most useful data point.
- **Export expectation absent.** Accountant wants to dump the signed-review history into Excel/CSV at month-end. No export affordance from this surface. The audit_log holds the data; the path to it is via Auditoría tab, which is two clicks away with no filter pre-set.
- **Reclassification (`cambiar tipo →`) is the right pattern** for the typed-wrong-from-WhatsApp case but is not discoverable on the empty state.
- **Suggested change (V):** Add `Total` column (amount) to `HitlQueueList` row preview when `kind === 'invoice'`. Highest information value for the accountant persona scanning the queue.
- **Suggested change (F):** Add a `Exportar revisiones firmadas` link from the `Firmadas` chip (or its successor surface per BLOCKER 2) — pre-filters Auditoría to `aggregate_type='photo_ingestion' AND outcome='signed'` for the date range.

## 5. Coverage delta vs. v1 baseline

| Dimension                              | v1 (pre-#193) | v2 (post-#197) | Delta |
|----------------------------------------|---------------|----------------|-------|
| Compliance banner copy (j12 §1)        | ❌            | ✅             | +    |
| Single empty-state (v1 flag #2)        | ❌            | ✅             | +    |
| Band legend on empty state             | ❌            | ✅             | +    |
| Headline "Cola vacía · todo al día"    | ❌            | ✅             | +    |
| Three-column anatomy (code)            | ❌            | ✅ (invisible) | +    |
| `+ Subir foto` CTA                     | ❌            | ❌             | =    |
| Chip counts                            | ❌            | ❌             | =    |
| `Firmadas` chip removed/scoped         | ❌            | ❌             | =    |
| AiProvenanceChip on empty state        | ❌            | ❌             | =    |
| Anatomy preview on empty state         | ❌            | ❌             | =    |
| Mobile chip wrap fix                   | ❌            | ❌             | =    |
| Hotkey legend hidden on mobile         | ❌            | ❌             | =    |
| Multi-venue selector                   | ❌            | ❌             | =    |
| Demo-data toggle (L2-4)                | ❌            | ❌             | =    |
| Nav-level queue count badge            | ❌            | ❌             | =    |

**Net delta:** 5 fixes (the 5 covered by PR #193 + #197), 10 v1 suggestions still open. The remaining gap is operational visibility, not architectural — the backend work and the component primitives are done; the empty state is what an inspector / Owner / first-run user sees, and it is still wireframe-shaped.

## 6. EU AI Act compliance dependency status

**Status: CONDITIONAL — passes contract, fails operational visibility.**

- **Banner copy (j12 §1)** — ✅ spec-perfect post-#193. Names the band, names the iron rule, names the EU AI Act. This is the legal artifact.
- **Per-field confidence band classification** — ✅ correct (`ConfidenceBandBadge.deriveBand` + `apps/api/src/photo-ingestion/application/confidence-band.classifier.spec.ts`).
- **Boundary constants iron rule** — ✅ duplicated on UI + API per ADR-J12-CONFIDENCE-THRESHOLDS-DUPLICATED with proposal-checklist gate to catch drift.
- **Forensic trail (append-only retroactive corrections + diff)** — ✅ shipped (M3.x H1b, PRs #152 / #160 / #168). This is the strongest single compliance asset on the surface.
- **Provenance chip (AiProvenanceChip per Art. 13)** — ⚠ **per-item only**. Invisible on empty state. Inspector cannot verify org-wide model/prompt configuration from the UI alone. See BLOCKER 3.
- **Photo retention (90 days)** — ✅ shipped (PR #137) but ⚠ **not surfaced**. Operator/inspector has no visibility into the retention clock.
- **Storage signed URLs + audit linking** — ✅ shipped (PR #137).
- **Org-level "which model is wired"** — ❌ not surfaced anywhere on this UI.

**If a Spanish AEPD / EU AI Act regulator inspected this surface today:**
- They would accept the banner copy as Art. 13 transparency satisfaction.
- They would query "where can I see which model is wired?" — current answer is "open audit_log and read a JSON envelope". This is technically compliant under Annex IV but practically a fail for "natural persons can oversee" (Art. 14).
- They would accept the forensic trail (M3.x retro-correction) as exceptional, once it's surfaced cleanly (currently buried behind `Firmadas`).

**Recommended pre-inspection hardening (single sprint):**
1. Mount `OrgAiProvenanceFooter` on empty state + page footer.
2. Split `Firmadas` chip per BLOCKER 2.
3. Add `Estado de cumplimiento` 3-check strip on empty state.

These three changes close the operational-visibility gap without touching the backend.

## 7. Verdict

The Foto-ingestión surface ships ~55–60 % of j12.md for users who reach a populated queue, ~25 % for first-run / empty-state visitors. The shipping gap is **operational visibility**, not architecture — the backend, the ui-kit primitives, the keyboard flow, the retroactive-correction surface, the AI Act forensic trail are all done. What is missing is the persistent empty-state affordances (upload CTA, anatomy preview, chip counts, provenance chip, compliance strip) that would let an Owner / inspector / accountant trust the surface on first contact.

EU AI Act compliance status is **conditional pass** — contract met (banner copy, classification logic, iron-rule constants, forensic trail), operational visibility short (provenance chip per-item only, no org-level model surface, no retention clock surfaced). Single-sprint hardening would close the gap.

**Tag legend:** [V] visible-on-empty-state (highest leverage), [I] interaction or animation, [F] copy / lexicon.
