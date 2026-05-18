---
title: UX/UI Roundtable Audit v2 — 2026-05-18 (post PRs #193-200)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  Master review post-deploy: "has mejorado mucho pero estas como al 30% de
  lo que espero antes estabas al 10%". Same Playwright walk +
  10 parallel persona roundtables (one per surface group) requested.
method: |
  Playwright walk → 26 screenshots (13 routes × 2 viewports: desktop
  1440×900 + mobile 390×844) → 10 parallel general-purpose subagents,
  each grounded in personas-jtbd.md + DESIGN.md + relevant j*.md + v1
  audit baseline. Each agent ran 5-6-persona roundtable producing
  severity-tagged flags + planning-grade change suggestions
  (NO implementation).
related:
  - docs/audit-2026-05-18-ux-roundtable.md (v1)
  - docs/audit-2026-05-18-v2-detail-*.md (10 per-surface deep dives)
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/ux/j6.md, j9.md, j10.md, j12.md
---

# UX/UI Roundtable Audit v2 — 2026-05-18

Master directive (verbatim): _"quiero que vuelvas a tomar screenshots con
playwright y vayas uno por uno con el roundtable criticando y escribiendo
las mejoras necesarias a modo de planning, has mejorado mucho pero estas
como al 30% de lo que espero antes estabas al 10%"_

**Mode: planning only. No code, no PRs.** This document plus its 10
detail siblings are the source of truth for the next implementation wave.

---

## Executive synthesis

### 🩸 Diagnosis (1 sentence)

**v1 fixed wiring; v2 needs identity.** PRs #193-200 closed the BLOCKER
chrome bugs the v1 roundtable flagged (Spanish, grouped nav, KPI scaffold,
empty-state copy, Recall layout, HACCP status row, humanizeEventType
utility, Settings shell, Onboarding skeleton), but every surface still
reads as **wireframe-grade beige**: no display typography, no severity
coding applied, no accent usage, no density variation, no iconography
system, and several load-bearing affordances (Recall sticky CTA,
Compliance "Inspector aquí ahora", Auditoría table + hash chain,
Foto-ingestión upload) are absent or invisible.

### 🎯 The 30% read is correct

| Surface | v1 % | v2 % | Δ | Why not 50%+ |
|---|---|---|---|---|
| Dashboard | 10% | **30%** | +20 | KPI cards exist but all equal weight, no display H1, no severity, no venue/time context |
| Recall | 10% | **30%** | +20 | CrisisLayout shell shipped, but candidate-lot list / forward-trace / sticky CTA / dossier flow all missing |
| HACCP | 10% | **45%** | +35 | Best progress — picker rows readable, severity rule on overdue, daily strip in place. Record-flow surfaces unaudited; due-soon amber missing |
| AI obs | 10% | **20%** | +10 | Dev-speak gone but surface still doesn't answer "is my AI spend healthy". Recommend demoting to Settings → Avanzado |
| Foto-ingestión | 30% | **55%** for populated / **25%** for empty | +25/-5 | Three-column anatomy shipped per PhotoIngestReviewScreen but empty-state hides it; no upload affordance anywhere |
| Compliance | 20% | **65%** | +45 | Nav discoverability + scope picker live; "Inspector aquí ahora" pre-fill flow (the WHOLE reason this screen exists) missing |
| Auditoría | 10% | **15-20%** | +5-10 | humanizeEventType code merged but **not wired** to JSX; no table, no hash chain chip, no diff |
| Cola revisión | 0% | **15%** | +15 | Empty state, no `j13.md` spec, IA doubt (rename "Cambios retroactivos" or demote) |
| Settings shell | 0% | **40%** | +40 | Three sections live; visual identity flat; Etiquetas leaks IPP/CUPS to non-technical Owner; Privacidad has GDPR theater risk |
| Onboarding | 0% | **20%** | +20 | Step 1 live + 4 honest stubs + Listo card; AHA moment (live cost per gram) deferred; brand identity (Fraunces, illustration) absent |

**Weighted avg: ~30%.** Master's read is verified, not flattered.

### 🔴 v2 cross-cutting patterns (the 10 things every roundtable said)

| # | Pattern | Surfaces affected | Severity |
|---|---|---|---|
| 1 | **No display typography** (Fraunces in DESIGN.md §3 specified, nowhere applied). All H1/H2 render as Inter regular. | All 10 surfaces | **BLOCKER** |
| 2 | **No accent usage outside left-nav highlight**. `--accent` (aged turquoise), `--destructive` (paprika), `--success` (sage olive) tokens exist but only `--destructive` is applied (Recall banner, HACCP overdue rule). | All 10 surfaces | **BLOCKER** |
| 3 | **Cards uniformly weighted** — no dominant KPI / no hierarchy of importance. Every card is the same beige, same border, same padding, same H. | Dashboard, AI obs, Settings, Onboarding | **BLOCKER** |
| 4 | **Vast vertical emptiness** (≥60% of viewport blank on desktop). Wireframe-feel. | Dashboard, Recall, Onboarding, Cola revisión | **BLOCKER** |
| 5 | **Severity coding absent** where critical — HACCP "due in 45min" and "due in 4h" both render mute (need amber `--warn-bg`); Compliance has no chain-integrity status pre-generation; Auditoría no "✓ Verificado" chip per row. | HACCP, Compliance, Auditoría | **BLOCKER** |
| 6 | **No "next action" affordance** — surfaces show state, never "do this now". Only verb on AI obs page is `Refrescar ×8`. | Dashboard, AI obs, Recall (empty), Onboarding-Listo | MAJOR |
| 7 | **Iconography is inconsistent emojis** (🍷 onboarding, 📊 dashboard quick-actions, 🌡️ HACCP, 🏷️ etiquetas) mixed with **no icons** on most rows. No system (lucide / phosphor). | All 10 | MAJOR |
| 8 | **Mobile breaks** persist on Recall countdown (wraps 2 lines), Etiquetas dropzone (8 lines + native "No file chosen" leaking), Settings left-nav (no collapse on mobile). | Recall, Settings, Etiquetas | MAJOR |
| 9 | **Dev-speak still leaks** in `Identidad fiscal próximamente` ("Aterrizan en la siguiente iteración junto con la migración de schema"), Compliance scope labels (`HACCP records (CCP readings + correctivas)`, `Lot lifecycle`, `Procurement (PO + GR)`), Auditoría raw enums in checkboxes. | Settings, Compliance, Auditoría | MAJOR |
| 10 | **Audit moat invisible** — M3 ADR-030 hash chain backend exists; UI exposes nothing. Same with Compliance signed exports. Owner gives away the forensic differentiator. | Auditoría, Compliance, Settings | MAJOR |

### 🚨 v2 Top-5 individual "vergüenzas"

1. **Auditoría is a code-merged ghost.** `humanizeEventType.ts` shipped in PR #196 but the JSX still binds `{eventType}` raw — Owner sees `RECIPE_ALLERGENS_OVERRIDE_CHANGED` in monospace. No table, no chain chip, no diff. **15-20% of L1-7.** _The moat we built is invisible._
2. **Compliance's reason-to-exist is missing.** j9.md §Trigger explicitly demands deep-link pre-fill for "inspector aquí ahora" with HACCP+Lot+Photo scopes pre-checked. Shipped is a plain manual form. In a real inspection Roberto faces 7 decisions while the inspector taps his foot.
3. **Foto-ingestión has no upload button anywhere.** The whole pipeline (j12) starts with "user uploads photo". The empty state says "cuando esté disponible" in `<code>` tags but the upload affordance is sealed off across `apps/web`. The shipped three-column anatomy hides behind an empty queue.
4. **Recall countdown is mute-on-mute.** `03:59:58` renders same weight/colour as the eyebrow label. The single visual element that should scream "ACT NOW" reads like a metadata timestamp. PR #194 shipped the right shell but the wrong typography weight.
5. **Onboarding establishes no brand.** First impression for new Owners is a beige card with Inter sans-serif H1, three plain inputs, and stub pills. Zero Fraunces, zero illustration, zero AHA. Plus 🍷 wine glass on /listo leaks HORECA-only positioning into a multi-sector product (per `project_nexandro_multisector_repositioning.md`).

---

## Per-surface verdicts (planning index)

Each surface has its own detail file with verbatim persona output + tagged change list (`[V]` visual / `[I]` info-architecture / `[F]` functional).

| # | Surface | Detail file | v2 % | Verdict |
|---|---|---|---|---|
| 01 | Dashboard | [v2-detail-01-dashboard.md](audit-2026-05-18-v2-detail-01-dashboard.md) | 30% | Promote Margen as lead via 2-up grid 60/40; add Fraunces H1; sparkline + as-of timestamp; venue switcher |
| 02 | Recall | [v2-detail-02-recall.md](audit-2026-05-18-v2-detail-02-recall.md) | 30% | Sticky CTA `Detener servicio + Generar dossier`; countdown weight 600 paprika; ghost-link styling for "Reportar sin lote"; candidate-lot + forward-trace tree |
| 03 | HACCP | [v2-detail-03-haccp.md](audit-2026-05-18-v2-detail-03-haccp.md) | 45% | Amber `--warn-bg` for due-soon; FSMS reference eyebrow; record-flow audit needed |
| 04 | AI obs | [v2-detail-04-ai-obs.md](audit-2026-05-18-v2-detail-04-ai-obs.md) | 20% | **Demote out of top-nav** → Settings → Avanzado → IA; surface "Gasto IA este mes" KPI inside Dashboard instead |
| 05 | Foto-ingestión | [v2-detail-05-foto-ingestion.md](audit-2026-05-18-v2-detail-05-foto-ingestion.md) | 55%/25% | Add `+ Subir foto` upload affordance; demo-data toggle so empty state isn't dead end; provenance chip org-level |
| 06 | Compliance | [v2-detail-06-compliance.md](audit-2026-05-18-v2-detail-06-compliance.md) | 65% | `Modo inspección` button → pre-fills HACCP+Lot+Photo scopes; chain-integrity status banner pre-generation; Spanish all scope labels |
| 07 | Auditoría | [v2-detail-07-auditoria.md](audit-2026-05-18-v2-detail-07-auditoria.md) | 15-20% | **Wire humanizeEventType to JSX** (one-line fix, huge UX win); render demo seed data so the table isn't always empty; per-row `✓ Verificado` chip from hash chain |
| 08 | Cola revisión | [v2-detail-08-cola-revision.md](audit-2026-05-18-v2-detail-08-cola-revision.md) | 15% | **Write j13.md spec first**; rename `Cambios retroactivos`; hide from top-nav when count=0, surface as badge on Foto-ingestión |
| 09 | Settings | [v2-detail-09-settings.md](audit-2026-05-18-v2-detail-09-settings.md) | 40% | Etiquetas: collapse IPP/CUPS behind `Avanzado`; Privacidad: implement art.15/17/20 (not Próximamente); de-dupe Nombre del negocio across sections |
| 10 | Onboarding | [v2-detail-10-onboarding.md](audit-2026-05-18-v2-detail-10-onboarding.md) | 20% | **Ship as 1-step** until 2-5 are real; add AHA-style copy + Fraunces moment; remove 🍷 (multi-sector leak); strengthen "Saltar por ahora" friction |

---

## 📋 Backlog v2 (planning, sequenced by leverage)

Five phases. Phase A is **the visual identity work that v1 deferred and is now the dominant feel**. Phases B-E follow the gap-closure pattern but ordered by user value, not spec hygiene.

### Phase A — Visual identity foundation (1 sprint, cross-cutting)

This is the "lavado de cara" Master asked for in v1 that I deferred. **Without this, every other phase still looks like a wireframe.**

- **A-1 Typography scale + Fraunces.** Apply `--font-serif: Fraunces` to all H1, `--text-2xl` weight 600. `Inter` for body. Establish hierarchy: 12 (eyebrow) / 14 (body) / 16 (subtitle) / 20 (H3) / 28 (H2) / 40 (H1 hero). Single PR.
- **A-2 Accent token application audit.** Apply `--accent` (aged turquoise) to H1 underline / hero rules / brand highlights. Audit `--destructive` (Recall, HACCP overdue) consistency. Add `--warn-bg` amber for HACCP due-soon + Compliance pending. `--success` (sage olive) for confirmation chips.
- **A-3 Iconography system.** Pick lucide-react (or phosphor). Replace all emoji-as-icon (🍷 🌡️ 🏷️ 📊). Audit unused icon slots. One icon style, two weights (line / fill).
- **A-4 Density + spacing pass.** Card padding 24-32 (currently 16). Section gaps 32-48. Border-radius consistency. Hover/focus elevation states. Tabular-nums everywhere there's a digit.
- **A-5 Empty state pattern.** One reusable `<EmptyState icon headline copy primaryCTA secondaryCTA />`. Replaces current per-screen placeholders. Includes "Ver con datos de ejemplo" toggle (L2-4 from v1 backlog, never shipped).
- **A-6 Sticky save bar pattern.** `<StickySaveBar last-saved-at primaryCTA secondaryCTA />`. Apply in Settings/Negocio, Settings/Etiquetas, Onboarding steps. L0-6 from v1 backlog.

**Why first**: every subsequent visual change benefits from these primitives. Without them you ship more wireframes faster.

### Phase B — High-leverage 1-line / 1-component wins (1-2 days)

Things where the code already exists or is 5 lines away.

- **B-1 Wire humanizeEventType to Auditoría JSX.** The utility shipped in PR #196 but JSX still renders raw enum. One-line fix. Top-1 vergüenza.
- **B-2 Recall countdown typography.** Change `tabular-nums` mute → `--destructive` weight 600 size 28. Two CSS lines. Top-4 vergüenza.
- **B-3 Auditoría demo seed.** Render `useDemoSeedAuditLog()` when org has zero events. Makes the page actually show its own design. ~30 lines.
- **B-4 Wire "Generar expediente APPCC" CTA from HACCP to pre-fill `/compliance/export?scope=haccp,lots,photos&mode=inspeccion`.** PR #197 added the button; route handler needs to read query string. ~20 lines.
- **B-5 Settings: rewrite "próximamente" dev-speak.** "Aterrizan en la siguiente iteración junto con la migración de schema" → "Lo siguiente en la cocina. Te avisaremos cuando esté listo." ~5 lines.

### Phase C — Surface gap closure (2 sprints)

Closing what v1 BLOCKER #11 (drift vs spec) still leaves open.

- **C-1 Recall sticky CTA + candidate-lot + forward-trace.** j6.md §5, §15, §38. The 70% of Recall still missing.
- **C-2 Compliance "Inspector aquí ahora" pre-fill flow.** j9.md §Trigger. Add `Modo inspección` button + chain-integrity status banner pre-generation.
- **C-3 HACCP record-flow audit + amber due-soon.** Currently picker shipped; record entry screens not visible in audit set. Need screenshots + roundtable. Add `--warn-bg` amber for due-soon rows.
- **C-4 Foto-ingestión upload affordance.** `+ Subir foto` button on screen + drop-zone for PDF/JPG. Provenance chip at org-level (Settings → IA → Modelo activo).
- **C-5 Auditoría real table.** L1-7 spec full implementation: filters drawer, drill-down by aggregate_id/correlation_id/actor, diff view, per-row `✓ Verificado` hash-chain chip.

### Phase D — GDPR / RGPD legal core (1 sprint)

Privacidad section is GDPR theater today. EU GA blocker.

- **D-1 Art.15 Derecho de acceso.** Export-mi-data button → ZIP of all org PII as JSONL. Async job pattern from M3 archival.
- **D-2 Art.17 Derecho al olvido.** Delete-org button with 30-day grace + confirm modal. Audit log entry.
- **D-3 Art.20 Portabilidad.** JSON export of org schema-aware bundle.
- **D-4 Retención editable.** UI to set `audit_log` (7y default), `photos` (90d), `m3_review_queue` retention windows.
- **D-5 DPO contact form** + API token rotation + 2FA opt-in (when R8 auth lands).
- **D-6 Data residency / subprocesadores list / breach notification commitment** copy.

### Phase E — Information architecture clean-up (per-surface, opportunistic)

Things the roundtables flagged as "should this even exist as a tab".

- **E-1 Demote AI obs out of top-nav** → Settings → Avanzado → IA; surface single "Gasto IA este mes" KPI in Dashboard.
- **E-2 Hide Cola revisión from top-nav when count=0**, surface as badge on Foto-ingestión + filterable view in Auditoría.
- **E-3 Write j13.md** for retroactive reconciliation queue. Currently no spec exists.
- **E-4 Onboarding: ship as 1-step** until 2-5 functional. Remove stub pills from stepper; show only "1 paso · ~30 segundos".
- **E-5 De-dupe Settings/Negocio ↔ Etiquetas** fields. Single source of truth for org name + address + contact.

### Out of scope (per Master 2026-05-18)

- ~~L1-6 pt-PT Phase 1 brand commitment~~ — "no hace falta localizacion Portugal ahora mismo"
- Mobile bottom-tab (deferred to native app phase)

---

## Suggested sequencing

| Sprint | Phase | Why |
|---|---|---|
| 1 | A (full) + B (full) | Foundation + cheap wins. After this every screen *looks* like nexandro and the worst code-merged-but-invisible bugs are fixed. |
| 2 | C-1, C-2, C-5 | Spec closure on highest-value surfaces (Recall, Compliance, Auditoría) |
| 3 | C-3, C-4 + D (full) | HACCP record + Foto upload + GDPR legal core (EU GA blocker) |
| 4 | E (full) | IA cleanup once we've seen Phase A-D land. j13.md spec writeup. |

After Sprint 1 the answer to "does it feel like nexandro" should flip from "no" to "yes" without any new functional surface. After Sprint 4 we should be at 70-80% across surfaces.

---

## Decision points for Master

1. **Sequence**: this 4-sprint order, or different priority?
2. **Phase A scope**: full identity foundation (A1-A6), or only A-1 + A-2 (typography + accents) as a faster strike?
3. **AI obs demotion**: E-1 is contentious — confirm before I touch top-nav. Roberto-persona test suggests yes; dev-team-utility test suggests no.
4. **Cola revisión**: write j13.md myself, or workshop with you first?
5. **Onboarding stepper shrink**: hide steps 2-5 entirely (1-step), or keep stepper but mark steps "próximamente"?

Reply with picks and I implement Phase A + B as a single batch. Will not touch C-E without explicit "go".
