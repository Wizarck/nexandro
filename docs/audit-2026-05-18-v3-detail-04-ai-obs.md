---
title: UX/UI Roundtable Audit v3 — `/ai-obs/dashboard` (post Sprint 1 demote)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: |
  Post-Sprint-1 verification of PR #207 (E-1: remove IA from top-nav; add
  "Avanzado: IA · próximamente" to Settings sidebar). Surface itself
  (`/ai-obs/dashboard`) shipped unchanged.
method: |
  Visual review of `04-ai-obs-desktop.png` + `04-ai-obs-mobile.png` and the
  Settings shell screenshot (`09-settings-negocio-desktop.png`) against v2
  audit baseline. Two-axis evaluation:
    (A) the demote decision itself (top-nav E-1)
    (B) the surface at `/ai-obs/dashboard` (unchanged from v2)
  5-persona roundtable:
    Owner Roberto · PM · AI/ML engineer · CFO/accountant · UX/UI designer.
baseline:
  - docs/audit-2026-05-18-v2-detail-04-ai-obs.md
  - PR #207 E-1 (remove IA: gasto from top-nav)
related:
  - docs/personas-jtbd.md §1.1 (Owner Roberto)
  - docs/ux/DESIGN.md §8 (responsive / per-persona device locks)
---

# UX/UI Roundtable Audit v3 — `/ai-obs/dashboard` (post Sprint 1 demote)

## 0. What changed between v2 and v3

| Axis | v2 (pre Sprint 1) | v3 (post PR #207) | Verdict |
|---|---|---|---|
| Top-nav presence | `IA: gasto` tab visible to all roles | **Removed.** Top-nav now `Dashboard · Auditoría · HACCP · Expediente APPCC · Recall · Foto-ingestión · Cola revisión · Configuración` | E-1 implemented as v2 recommended |
| Settings landing for IA | None | `Avanzado: IA · próximamente` greyed in Settings sidebar (below `Sedes`, `Usuarios y permisos`, `Facturación`, `Integraciones`) | Placeholder shipped; no real surface behind it |
| Surface at `/ai-obs/dashboard` | Eight zero-state cards, three pivot dimensions, no spend-vs-budget answer | **Identical.** No PR touched the cards | All v2 BLOCKERS still present |
| Redirect from old URL | N/A | None | Direct URL still serves the page silently |
| Banner / migration notice on the orphan page | N/A | None | Orphan, not transitional |

**Net:** Sprint 1 took the v2 nav recommendation (demote) but stopped halfway. The surface still exists, still answers nothing, is now also unfindable, and has no migration story for the small set of users who knew the URL.

---

## 1. Analysis A — the demote decision (top-nav E-1)

### 1.1 Was the demote correct?

**Yes, with one caveat.** The v2 verdict ("strip this surface back … and demote the standalone `IA: gasto` tab") was the right call and Sprint 1 honoured it. Top-nav real estate is the most contested element of the IA, and the v2 evidence was conclusive:

- The tab violated Owner Roberto's JTBD (§1.1 personas-jtbd.md): he doesn't know what AI obs is and would only land on the tab once, see `0,00 €`, and assume the app was broken.
- The hero KPI was zero. Promoting a zero to the top nav is anti-onboarding: the nav teaches Roberto what nexandro cares about, and "AI cost" is not a Roberto concern in 2026-05.
- The competing nav slots (Recall, HACCP, Cola revisión) all do real, persona-shaped work. AI obs was sitting at the same hierarchy as Recall, which is a legal compliance surface.

The caveat is that the demote target — `Configuración → Avanzado: IA · próximamente` — is currently a **greyed-out label with nothing behind it**. The functional surface (`/ai-obs/dashboard`) was not wired to this label. So today the demote is logically *"remove from nav, do not provide a replacement entry point"*. That is not a demote, it is a **hide**.

### 1.2 Per-persona reading of the demote

**Owner Roberto.** Net positive. He never knew what `IA: gasto` was, so removing it cleans his nav. The greyed `Avanzado: IA · próximamente` in Settings is correct register — it signals "there will be one day, not your problem now". He will not miss the tab.

**PM.** Decision was correct but the migration plan is missing. Three questions Sprint 1 did not answer:
1. How many active users had `/ai-obs/dashboard` bookmarked / in browser history? (Telemetry should answer this — if non-zero, those users now hit a dead-feeling page with no orientation.)
2. What is the criterion to "re-promote" once there is real spend data? (No threshold defined. e.g. "promote to Dashboard hero strip once organisation has >10 € monthly AI spend for 2 consecutive months".)
3. What replaces it for the CFO use case? (CFO needs to see AI cost line-item somewhere — it cannot just disappear because Roberto doesn't read it.)

**AI/ML engineer.** The page was never actual obs (the real obs lives in Grafana/Tempo per the v2 closing line). Removing the marketing skin from the top nav is a quiet improvement: it stops engineers from getting sent to `/ai-obs/dashboard` for ops debugging when they need the OTLP traces. **However**, the surface still exists at `/ai-obs/dashboard` with the dev-shaped pivot cards (Coste por capacidad / modelo / tag). If the intent is "engineers go to Grafana, operators don't see this", then the page should not be reachable at all from inside the app — currently it is reachable, just not advertised. That's the worst of both worlds: not findable for those who need it, still present for those who don't.

**CFO / accountant.** Net negative for this persona, who was already underserved in v2. CFO needs AI cost as line-item in monthly close. v2 already flagged the AI-spend allocation was the wrong shape; Sprint 1 made it physically unreachable. The CFO now has zero entry point to ask "what's the AI line on this month's P&L?". The right place is a row inside the existing Dashboard (Negocio group) or inside Configuración → Facturación, not a hidden URL.

**UX/UI designer.** The demote action is half a pattern. The complete pattern would be: (a) remove from nav, (b) wire the Settings placeholder to a real (lean) surface OR redirect old URL to the placeholder with a one-line explanation, (c) define a re-promotion criterion. Sprint 1 did (a). It did not do (b) or (c). The greyed `Avanzado: IA · próximamente` label is correct copy but functionally inert — clicking it does nothing observable in the screenshot.

### 1.3 What's the migration plan for bookmark / direct-URL users?

This is the **specific gap** Sprint 1 left. Three viable options:

1. **Hard redirect.** `/ai-obs/dashboard` → `/configuracion#avanzado-ia` with a one-time toast: `Hemos movido IA a Configuración → Avanzado (próximamente). Los detalles llegan en una próxima versión.` Pros: clean, no orphan page. Cons: erases the working dashboard for users who relied on it (engineer use case).
2. **Banner on the existing surface.** Keep `/ai-obs/dashboard` reachable but render a sticky banner at the top: `Esta pantalla está en revisión y se moverá a Configuración → Avanzado en una próxima versión. Si dependes de algún dato aquí, [escríbenos →].` Pros: zero data loss; signal of intent. Cons: leaves the v2 BLOCKERs (8 empty cards, no spend answer) visible to anyone who lands here.
3. **Inert with redirect after grace period.** Banner now, hard redirect in N weeks. The "industry default" two-step deprecation. Best of both if the team has bandwidth for the second step.

The roundtable's consensus is **option 2 short-term (this sprint or next), with option 3 as the planned arc** once the Settings → Avanzado → IA placeholder gets a real surface behind it.

---

## 2. Analysis B — the surface itself (unchanged since v2)

The screenshot `04-ai-obs-desktop.png` is **bit-for-bit equivalent** to the v2 capture. No PRs in Sprint 1 touched the page content. Therefore every v2 BLOCKER and MAJOR is still open. Re-stated here for the v3 record, not re-litigated:

### 2.1 v2 BLOCKERs still present in v3

| # | v2 finding | v3 status | Notes |
|---|---|---|---|
| B1 | No "is my AI spend healthy?" answer anywhere | **Still open** | Spend card still shows flat `0,00 €`, no comparison axis (vs last month, vs revenue, vs budget). |
| B2 | Eight cards, zero next-action affordance | **Still open** | Eight `Refrescar` links remain the only verbs. Budget-setup CTA still buried as third hero. |
| B3 | "Coste por capacidad / modelo / tag" is engineer IA in Spanish | **Still open** | All three cards untouched. `Etiqueta tus capacidades MCP con \`nexandro.tag\`` still leaks MCP + backticks. |

### 2.2 v2 MAJORs still present in v3

- Heatmap asserts `Patrón típico: pico viernes 09-12` on zero observations (credibility leak — still there).
- 8 per-card `Refrescar` links + no page-level timestamp + no auto-poll (still there).
- Hero-row split into 3 equal cards (still dilutes hierarchy — spend, error-rate, runway compete instead of spend dominating).
- No drill-down anywhere (Top-5 fallos, Coste por modelo are non-clickable).
- No €/unit-of-work translation (0,003 €/foto · 0,12 €/receta — still missing).
- No compliance strip (Claude 4.7 · EU-Frankfurt · retención 90 d · ver Auditoría — still missing).
- No latency / tail-failure widgets for the engineer audience (still missing).

### 2.3 New observations introduced by the demote

The demote changes the **audience model** of the surface, which surfaces two additional issues that did not matter when the page was nav-promoted:

1. **The page has no self-explanation of why it's no longer in the nav.** A user who arrives here via bookmark or shared URL has no idea this surface has been deprioritised. The page header still reads `Coste y salud de la IA` with the v2 subtitle `Cuánto te cuesta la IA este mes y si está fallando.` — written for a nav-promoted page. The voice mismatches the new orphan status.
2. **The Settings sidebar `Avanzado: IA · próximamente` does not link to this page.** A logical wiring would be: clicking the greyed label opens a brief explanation of what "Avanzado: IA" will eventually be, optionally with a link to the current `/ai-obs/dashboard` flagged as `Vista preliminar`. Today the greyed label is purely decorative.

---

## 3. Per-persona findings (v3 lens)

### 3.1 Owner Roberto — does the demote work for him?

**Yes.** He never had vocabulary for "IA: gasto" so the simpler 8-item top nav is a clean win. He may eventually notice `Avanzado: IA · próximamente` in Settings, but the `próximamente` register tells him "not for me, not today" — which is correct. He has zero risk of landing on `/ai-obs/dashboard` accidentally. From his perspective the demote is complete and good.

**Caveat — when the bank statement arrives.** Per the JTBD in the brief (*"I just saw a charge labelled 'nexandro · IA'. I want to know what features used AI this month and whether I got value for it."*), Roberto's actual moment of need is **triggered by the invoice**, not by browsing the app. When that moment lands, the right answer is **not** to send him to `/ai-obs/dashboard`. The right answer is a row inside the existing Dashboard (Negocio group) that says `IA este mes: X € · [ver desglose]`. Sprint 1 demoted the surface but did **not** add this row. So when Roberto's bank-statement moment comes, he will still go through the same broken funnel the brief describes: Settings → nothing usable → type URL → broken empty page. The demote alone does not solve Roberto's JTBD; it just hides the bad answer.

### 3.2 PM — was the demote correct? What's the migration plan?

Correct decision, incomplete execution. The missing pieces are:

- **Telemetry on `/ai-obs/dashboard` traffic** for the 14 days pre- and post-demote. Without this, the team has no way to decide between option 1 (hard redirect) and option 2 (keep + banner) above. Recommendation: drop a one-line analytics event on pageload before deciding.
- **Re-promote criterion.** Define a single metric that triggers promotion of an IA spend element back into Dashboard / Negocio. Suggested threshold: `>10 € AI spend in 2 consecutive months` adds a `IA este mes: X €` row to the Dashboard hero strip; `>200 € / month` or `>5 %` of revenue adds a budget-alert banner above the strip.
- **Settings → Avanzado → IA placeholder content.** Today the label is greyed. Sprint 2 should land at minimum a one-paragraph card: *"IA: detalles técnicos. Próximamente podrás ver consumo, modelos activos, retención de telemetría y enlace a Auditoría. Mientras tanto, el resumen aparecerá en tu Dashboard cuando empieces a usar IA."* This is 30 minutes of work and closes the orphan-page issue.

### 3.3 AI/ML engineer — still useful for ops debugging?

**No, and that's fine.** The page was never real obs (no traces, no spans, no p95 latency, no tail-failure decomposition). Engineers debug AI in Grafana + Tempo + the OTLP collector. The demote correctly aligns the UI signal with reality: this is an operator surface in the making, not a developer console. Removing it from the nav reduces the risk of an engineer being told "did you check AI obs?" and burning time on a page that doesn't answer engineering questions.

**However:** the surface still exists at `/ai-obs/dashboard` and still **looks** like an obs page (capacidad / modelo / tag pivots, Dependencia AI strip, Top 5 fallos). For engineers who land here from a shared bookmark, the page presents the **shape** of an obs surface without the **substance**. That's worse than no page at all. If the demote intent is "engineers use real obs, operators get a different surface", the cleanest move is to route this URL to either the Settings placeholder or to an internal-only Grafana link.

Engineer's vote on the three options in §1.3: **option 1 (hard redirect)** is preferred for engineering hygiene. Engineers won't lose anything (they have Grafana); orphan-page risk goes to zero.

### 3.4 CFO / accountant — does the surface answer "is AI spend healthy?"

**No, in v2; still no, in v3; arguably worse now because the surface is hidden from his normal flow.** Every v2 CFO finding is unchanged:

- No view of AI cost as % of revenue.
- No AI cost per processed unit.
- No budget pacing.
- No compliance strip (Claude 4.7 · EU-Frankfurt · retention).
- No multi-venue allocation.

What changed for the CFO: previously he could at least click `IA: gasto` in the nav and look at the (broken) page. Now there is no entry point at all from the chrome. The CFO's lens on the demote: **net negative for him**, because the underlying need (AI line on monthly close) still exists and now has zero affordance in the UI.

CFO's recommendation: an `IA · este mes: X €` line item must appear somewhere a CFO already looks — ideally inside `Configuración → Facturación` (once Facturación ships), or as a row in the existing Dashboard. The orphaned `/ai-obs/dashboard` is not where a CFO will look, with or without the nav entry.

### 3.5 UX/UI designer — gap left by the demote

The demote pattern is incomplete. A clean implementation of "demote a surface from nav" requires three artifacts that Sprint 1 did not ship:

1. **An entry point at the new location.** Today the new location (`Configuración → Avanzado: IA`) is a greyed inert label. Either it should be active (with a stub page or redirect) or it should not be in the sidebar at all. Listing it greyed creates phantom-IA at the worst moment — the user sees "IA" in the sidebar, hopes for an answer, gets nothing.
2. **A migration affordance on the orphan page.** A one-line banner at the top of `/ai-obs/dashboard`: `Esta pantalla está en revisión. Próximamente la encontrarás en Configuración → Avanzado → IA. Si tienes dudas sobre tu consumo de IA, escríbenos.` Costs ~10 lines of HTML; eliminates the "is this still maintained?" doubt.
3. **A copy update on the orphan page header.** The H1 `Coste y salud de la IA` and subtitle `Cuánto te cuesta la IA este mes y si está fallando.` are written in nav-promoted voice (declarative, ownership tone). For a deprecated / soft-deprecated page they should shift to: `Vista preliminar · Coste y salud de la IA. Esta versión es técnica; estamos trabajando en una versión integrada.` This adjusts the voice to the new register.

UX's vote on the three options in §1.3: **option 2 (keep + banner)** as the immediate move, **option 3 (banner now, hard redirect later)** as the planned arc. Option 1 (immediate hard redirect) is too abrupt without telemetry on who uses the URL.

---

## 4. Suggested concrete changes (priority order)

### P0 — close the demote properly (this sprint)

1. **[F]** Add a sticky banner at the top of `/ai-obs/dashboard`: `Esta pantalla está en revisión y se moverá a Configuración → Avanzado en una próxima versión.` Single line, dismissible.
2. **[I]** Wire the greyed `Avanzado: IA · próximamente` label in Settings sidebar to a minimal stub: a one-paragraph card explaining what's coming + a `Vista preliminar` link to `/ai-obs/dashboard` for power users. Removes the phantom-IA / dead-label problem.
3. **[F]** Drop a one-line analytics event on `/ai-obs/dashboard` pageload to measure orphan traffic. Decision input for option 1 vs option 3 in §1.3.

### P0 — add the actual Owner JTBD answer somewhere visible

4. **[V]** Plan (next sprint) a `IA este mes: X € · [ver desglose]` row inside the existing Dashboard (Negocio group), gated on `monthlyAiSpend > 0`. This is the real Roberto JTBD answer per the brief. The demote of `/ai-obs/dashboard` makes this row mandatory, not optional.

### P1 — voice / copy alignment on the orphan page

5. **[I]** Update the H1 on `/ai-obs/dashboard` from `Coste y salud de la IA` to `Vista preliminar · Coste y salud de la IA`. Signals the soft-deprecated status without rewriting the page.
6. **[I]** Drop the v2 banner intent ("estamos trabajando en una versión integrada") into the subtitle to align voice.

### P1 — kill the remaining v2 BLOCKERs IF the surface stays reachable

7. (All v2 P0/P1 items still apply if §1.3 option 2 is chosen — see v2 audit §4 for the full list. Specifically: collapse the 3-column hero, promote the budget-setup CTA, strip the "Patrón típico" assertion from the empty heatmap, replace the MCP-leaking copy on `Sin tags registrados`.)

### P2 — define the re-promotion criterion

8. **[F]** Codify in PM doc: "Promote `IA: gasto` back into Dashboard hero strip (not nav) once organisation has >10 € AI spend for 2 consecutive months. Promote to budget-alert banner above hero strip once >200 €/month or >5 % of revenue." Without this, the demote is permanent by default — which the team may not want.

---

## 5. Verdict

The demote was the right call and Sprint 1 took the easy half. The hard half — wiring the new location to something real, giving the orphan page either a redirect or a self-explanation, and adding a Roberto-shaped AI cost row to the Dashboard for the actual JTBD moment — is unshipped. The surface at `/ai-obs/dashboard` is now both unfindable and unchanged: every v2 BLOCKER is still there, just hidden behind a no-longer-advertised URL. That makes the demote a net positive for Owner Roberto (nav clean) and the AI/ML engineer (signal-truth aligned), neutral for the PM (decision correct, migration incomplete), and net negative for the CFO (the one persona who actually wanted a number is now denied an entry point).

**Net recommendation:** keep `/ai-obs/dashboard` reachable with a "vista preliminar / en revisión" banner this sprint (option 2 in §1.3). Wire the Settings → Avanzado → IA label to a real stub. Add the `IA este mes: X €` row to Dashboard as soon as there's non-zero spend to render. Plan a hard redirect to Settings once telemetry confirms zero meaningful traffic on the bookmark URL. Do not invest in fixing the v2 BLOCKERs on this page in its current orphan state — that effort belongs to the eventual Settings → Avanzado → IA real surface, not to a soft-deprecated standalone.
