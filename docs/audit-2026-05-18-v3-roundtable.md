---
title: UX/UI Roundtable Audit v3 — 2026-05-18 (post Sprint 1)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  Master: "vuelve a correr el roundtable a ver que dicen, pasales a los
  stakeholders los Jtbd y los journeys de cada tab para que entiendan
  que se suponia que debia hacer la tab, dales mas food de contexto"
method: |
  Sprint 1 deployed (7 PRs #201-207) → Playwright walk (26 screenshots,
  13 routes × 2 viewports) → 10 parallel agents, each given:
  - v3 screenshots for their surface
  - personas-jtbd.md verbatim persona+JTBD
  - Custom journey narrative I constructed step-by-step
  - j*.md spec (where exists)
  - v2 detail file as baseline
  - Specific list of Sprint 1 PRs affecting that surface
related:
  - docs/audit-2026-05-18-v2-roundtable.md (v2 baseline)
  - docs/audit-2026-05-18-v3-detail-*.md (10 per-surface deep dives)
---

# UX/UI Roundtable Audit v3 — 2026-05-18 (post Sprint 1)

Master directive: re-run roundtables with **expanded JTBD + journey context**
so stakeholders evaluate against the *actual* user job, not generic SaaS norms.

---

## Executive synthesis

### 🩸 Diagnosis (1 sentence)

**Brand identity unlocked; JTBDs partially unlocked; new regressions introduced.**
Sprint 1 successfully made the product *feel* like nexandro (Fraunces serif +
Sparkles + lucide icons + grid fix), but several wins are **half-shipped**
(amber chip invisible on desktop, 4 enum labels still English in Auditoría,
stepper step 5 clips off desktop, mobile loses PRONTO badges) and several v2
BLOCKERS remain untouched (Recall sticky CTA, Foto upload button, hash chain
visibility, real Auditoría table).

### 🎯 v2→v3 movement (the table you'll be quoted on)

| Surface | v2 | v3 | Δ | Headline |
|---|---|---|---|---|
| Dashboard | 30% | **32%** | +2 | Fraunces rendered at 20px not 28px; no JTBD movement; "0,00 €" hard zero next to em-dashes ERODES TRUST |
| Recall | 30% | **38%** | +8 | B-2 countdown visibly fixed — bold paprika now dominates ✓ |
| HACCP | 45% | **52%** | +7 | Amber works mobile, **INVISIBLE on desktop** (WCAG ~1.5:1) ⚠️ |
| AI obs | 20% | demote correct | n/a | Execution half-shipped — orphan URL has no banner ⚠️ |
| Foto-ingest | 55/25% | 55/26% | +1 | Camera icon promises a tap-affordance that doesn't exist (worse than v2 in a way) ⚠️ |
| Compliance | 65% | **75-80%** | +12 | B-4 deep-link route works; bare URL still wrong default scope |
| Auditoría | 15-20% | **22-25%** | +5 | B-1 humanización HALF-DONE — 4 enums slipped through still English ⚠️ |
| Cola revisión | 15% | spec only | n/a | j13.md approved + 5 open-q agent recommendations |
| Settings | 40% avg | **55% avg** | +15 | Grid fix #1 cleanest win. StickySaveBar UNVERIFIED. Privacidad screenshot bug ⚠️ |
| Onboarding | 20% | **45%** | +25 | BIGGEST WIN — first surface that "says nexandro". Step 5 clips desktop, mobile loses badges ⚠️ |

**Weighted average: ~30% → ~46%.** Real movement, but ~8 percentage points are eroded by regressions/half-ships that need Sprint 2 to clean up before claiming the gain.

### 🟢 What Sprint 1 unambiguously closed

1. **Settings descuadre** (PR #201) — sidebar 220px + content 1fr now works. Top win of the sprint.
2. **Recall countdown** (PR #203 B-2) — bold paprika dominates eyebrow. Closed.
3. **Onboarding brand** (PR #204 + #205) — "first nexandro surface" verdict from 5/5 agents.
4. **AI obs demote** (PR #207 E-1) — correct call per 4/5 agents.
5. **Settings B-5 dev-speak fix** — copy is now operator-friendly.
6. **Compliance `?mode=inspeccion` deep-link** — route 200 verified, HACCP CTA wires it.

### 🔴 What Sprint 1 broke or half-shipped (Sprint 2 P0)

1. **HACCP amber chip invisible on desktop** — contrast `--warn-bg` against `--surface` ≈ 1.5:1, below WCAG 3:1. Mobile works because contrast against white differs. **Fix: 2px `--warn-fg` border on amber chip matching the 2px paprika on overdue rows.**
2. **Auditoría humanize incomplete** — 4 enum labels slipped through still in English (`Recipe source override changed`, `Recipe ingredient updated`, `Supplier price updated`, `IA · sugerencia rechazada` inconsistency). Half-done is *worse* than v2's all-uppercase consistency.
3. **Onboarding stepper regression** — desktop clips step 5 off the right edge; mobile loses PRONTO badges entirely (badge is `hidden sm:inline` — wrong direction). NEW regression introduced by Sprint 1 E-4.
4. **StickySaveBar UNVERIFIED** — never captured in dirty state. Could have mobile safe-area-inset issues. Need a screenshot.
5. **Privacidad screenshot rendering bug** — both viewports rendered as ~290px thumbnails. Either CSS regression post-#201 OR Playwright harness bug. Investigate.
6. **AI obs orphan URL** — `/ai-obs/dashboard` reachable with no banner explaining the demote. CFO who bookmarked it loses entry point.

### 🟡 v2 BLOCKERS still untouched (Sprint 2 P1)

1. **Recall sticky CTA "Detener servicio + Generar dossier"** — j6.md §38 defining affordance. 85% vertical vacuum unchanged. Lawyer: "loud countdown for an action the screen cannot fire arguably worsens defensibility posture."
2. **Foto-ingest `+ Subir foto` button** — j12 §Trigger path (ii) still sealed off. Camera icon now visually PROMISES a tap-affordance that doesn't exist — worse than v2.
3. **Hash chain visibility** — moat audit-as-feature still given away. M3 ADR-030 backend exists; UI exposes nothing. Forensic auditor: "without per-row ✓ Verificado chip, can't defend the trail."
4. **Auditoría real table** — empty state better now (EmptyStateCard), but the table itself never renders for demo orgs.
5. **Compliance bare-URL wrong default** — `Expediente APPCC` top-nav lands on bare `/compliance/export` with HACCP+Lot only. Inspector would get wrong scope. Needs in-page "Modo inspección →" escalation chip.

---

## Cross-cutting themes from v3

| # | Theme | Severity |
|---|---|---|
| 1 | **Half-ships read as "broken feature" not "WIP"** — Auditoría 6/10 enums + HACCP amber-on-desktop + stepper-mobile-badges + StickySaveBar-unverified all became NEW friction sources. | **BLOCKER** |
| 2 | **Brand identity unlocked (typography + Sparkles + lucide) but only deeply on Onboarding.** Dashboard and Recall still feel like wireframes despite serif H1. Density (A4 deferred) is the gap. | MAJOR |
| 3 | **Trust spine missing everywhere** — no as-of timestamps, no venue chip, no delta vs prior period, no hash chain chips. Owner cannot trust the numbers; auditor cannot defend them. | MAJOR |
| 4 | **Mobile is the secondary citizen** — desktop fixes don't always degrade gracefully (HACCP amber, onboarding badges, stepper overflow). Persona §1.1 is "mostly on mobile" — this matters. | MAJOR |
| 5 | **JTBDs not always served by what's onscreen** — Dashboard answers "here are 4 aggregate KPIs" but Owner's JTBD is "which DISH lost money this week." Compliance answers "configure a bundle" but Owner's panic-mode JTBD is "give me the PDF in 2 minutes." | MAJOR |

---

## j13 — agent recommendations on Master's 5 open questions

The Cola revisión agent ran the §8 open questions through its roundtable:

| # | Question | Agent vote |
|---|---|---|
| 1 | Naming | **"Cambios retroactivos"** — unanimous |
| 2 | Top-nav removal timing | **After badges ship on Recetas+Etiquetas+HACCP** — 4/5 |
| 3 | Mantener firma confirm pattern | **Tiered: 1-click + auto-stamped "non-material" below threshold; typed reason above** — 4/5 |
| 4 | Re-sign default state | **Default-new** — 4/5 (diff side-panel makes change explicit pre-submit) |
| 5 | Dashboard pill visibility | **Always-on with `0 / N esta semana` zero-state, venue-scoped** — unanimous |

Plus 6 suggested edits to j13 spec BEFORE code lands. Detail in `docs/audit-2026-05-18-v3-detail-08-cola-revision.md`.

---

## 📋 Sprint 2 backlog (recommended priorities)

### P0 — Clean up Sprint 1 regressions / half-ships (1-2 days)

- **P0-1** HACCP amber chip 2px border (`--warn-fg`). One-line.
- **P0-2** Auditoría — fix the 4 missing enum translations (`RECIPE_SOURCE_OVERRIDE_CHANGED`, `RECIPE_INGREDIENT_UPDATED`, `SUPPLIER_PRICE_UPDATED`, plus 1 inconsistency).
- **P0-3** Onboarding stepper — `hidden sm:inline` → `inline` on PRONTO badge (mobile loss) + `overflow-x-auto` issue (step 5 clip).
- **P0-4** Capture StickySaveBar dirty-state screenshot + Privacidad render bug investigation.
- **P0-5** AI obs orphan URL — add `Vista preliminar · en revisión` banner on `/ai-obs/dashboard` pointing to Settings → Avanzado.
- **P0-6** Dashboard "Coste 0,00 €" hard zero → em-dash with rest (until all KPI connectors seed).

### P1 — Close v2 BLOCKERS not yet shipped (2-3 sprints)

- **P1-1** Recall sticky CTA "Detener servicio + Generar dossier" (j6.md §38).
- **P1-2** Foto-ingest `+ Subir foto` upload button (j12.md §Trigger).
- **P1-3** Compliance bare-URL "Modo inspección →" escalation chip (avoids wrong-scope generation).
- **P1-4** Auditoría per-row "✓ Verificado" hash-chain chip (M3 ADR-030 backend exists).
- **P1-5** Auditoría demo seed (B-3 deferred from Sprint 1) so table renders for first-run orgs.
- **P1-6** Translate 5 Compliance scope labels to full Spanish (`HACCP records` → `Registros HACCP`, etc).

### P2 — Dashboard JTBD unlock (1 sprint)

The Dashboard is the only surface whose v3 movement was effectively zero (32%). Sprint 2 should target the §1.1 JTBD directly:

- **P2-1** Promote MarginPanel to lead card (2-up 60/40 grid, dominant Margen €). DESIGN.md §4.
- **P2-2** MenuItemRanker render even on demo data (top-5/bottom-5 cards). Roberto's "which dish" JTBD requires dish granularity.
- **P2-3** Trust spine: venue chip + as-of timestamp + delta vs prior period in header.

### P3 — j13 implementation (1 sprint)

Once Master answers the 5 open questions (or accepts agent recommendations above):

- **P3-1** Implement `ReviewQueueScreen.tsx` per j13.md §4 layout.
- **P3-2** `<RetroactiveBadge count />` primitive + wire into Dashboard, Recetas, Etiquetas, HACCP.
- **P3-3** Top-nav removal once badges land.

### P4 — GDPR legal core (1 sprint, EU GA blocker)

Privacidad section is GDPR theater today (per v2 BLOCKER). Phase D unchanged from v2 backlog:

- **P4-1** Art.15 Derecho de acceso (export-mi-data ZIP)
- **P4-2** Art.17 Derecho al olvido (delete-org with 30-day grace)
- **P4-3** Art.20 Portabilidad (JSON export)
- **P4-4** Editable retention windows per data class
- **P4-5** DPO contact form + API token rotation

### P5 — Phase A4 density pass (1 sprint)

Deferred from Sprint 1. Needed to push Dashboard / cards past wireframe-feel. Theme #2 above won't close without this.

---

## Suggested sequencing

| Sprint | Phase | Why |
|---|---|---|
| 2.0 | P0 (full) | 1-2 days. Don't let half-ships fester. Costs trust. |
| 2.1 | P1 + P2 | Close v2 BLOCKERS + unlock Dashboard JTBD. After this, Dashboard moves from 32% → ~60% and Recall/Foto/Compliance/Auditoría from 22-80% → 50-90%. |
| 2.2 | P3 (j13) + P4 (GDPR) | After Master confirms j13 open questions. GDPR is EU GA blocker. |
| 2.3 | P5 (A4 density) | After P2 lands and we see what density actually needs across the cleaned-up surfaces. |

After Sprint 2.2 the weighted average should be 70-80%.

---

## Per-surface verdicts (planning index)

Each surface has a detail file with v2→v3 delta tables, BLOCKER closure checks, per-persona verbatim, and Sprint 2 backlog tagged [V]/[I]/[F]:

| # | Surface | Detail file | v2→v3 |
|---|---|---|---|
| 01 | Dashboard | [v3-detail-01-dashboard.md](audit-2026-05-18-v3-detail-01-dashboard.md) | 30→32% |
| 02 | Recall | [v3-detail-02-recall.md](audit-2026-05-18-v3-detail-02-recall.md) | 30→38% |
| 03 | HACCP | [v3-detail-03-haccp.md](audit-2026-05-18-v3-detail-03-haccp.md) | 45→52% |
| 04 | AI obs | [v3-detail-04-ai-obs.md](audit-2026-05-18-v3-detail-04-ai-obs.md) | demote correct, exec half-shipped |
| 05 | Foto-ingestión | [v3-detail-05-foto-ingestion.md](audit-2026-05-18-v3-detail-05-foto-ingestion.md) | 55/25 → 55/26 |
| 06 | Compliance | [v3-detail-06-compliance.md](audit-2026-05-18-v3-detail-06-compliance.md) | 65→75-80% |
| 07 | Auditoría | [v3-detail-07-auditoria.md](audit-2026-05-18-v3-detail-07-auditoria.md) | 15-20→22-25% |
| 08 | Cola revisión | [v3-detail-08-cola-revision.md](audit-2026-05-18-v3-detail-08-cola-revision.md) | j13 spec review + 5 open-q recs |
| 09 | Settings | [v3-detail-09-settings.md](audit-2026-05-18-v3-detail-09-settings.md) | 40→55% avg |
| 10 | Onboarding | [v3-detail-10-onboarding.md](audit-2026-05-18-v3-detail-10-onboarding.md) | 20→45% |

---

## Decision points for Master

1. **Sprint 2 ordering** — P0 first (clean half-ships) or jump to P2 Dashboard JTBD unlock?
2. **j13 open questions** — accept agent recommendations as-is OR Master picks each one separately?
3. **AI obs orphan URL** — add the redirect banner now OR keep accessible without comment until traffic data tells us something?
4. **Mobile-first triage** — should Sprint 2 P0 prioritise the mobile regressions (stepper badges, HACCP amber, etc.) since persona §1.1 is mobile-primary?
5. **Phase A4 density** — bundle with P2 Dashboard work, or separate sprint?
