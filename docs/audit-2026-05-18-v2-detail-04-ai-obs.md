---
title: UX/UI Roundtable Audit v2 — `/ai-obs/dashboard` (AI obs)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: Post-deploy v2 verification of PR #193 (dev-speak/title fixes) + Owner-Roberto fitness check
method: |
  Visual review of `04-ai-obs-desktop.png` + `04-ai-obs-mobile.png` against
  v1 baseline (`audit-2026-05-18-ux-roundtable.md` + detail §4), DESIGN.md,
  and personas-jtbd.md §1.1 (Owner). 5-persona roundtable:
  Owner Roberto · UX/UI · CFO/accountant · PM · AI/ML engineer.
baseline:
  - docs/audit-2026-05-18-ux-roundtable.md (v1 — flagged OTLP localhost:4318, English title, dev-speak)
  - docs/audit-2026-05-18-ux-roundtable-detail.md §4
related:
  - docs/personas-jtbd.md §1.1 (Owner Roberto — low tech, WhatsApp-level)
  - docs/ux/DESIGN.md
---

# UX/UI Roundtable Audit v2 — `/ai-obs/dashboard` (AI obs)

## 0. Regression verification vs v1 baseline

v1 (audit-2026-05-18-ux-roundtable.md) flagged three CRITICAL items on this surface. PR #193 was supposed to clear the dev-speak banner + title issues. Verifying against `04-ai-obs-desktop.png` and `04-ai-obs-mobile.png`:

| v1 finding | v1 severity | v2 status | Evidence in screenshot |
|---|---|---|---|
| English title "AI Observability" over Spanish chrome | CRITICAL | **FIXED** | H1 now reads "Coste y salud de la IA" |
| OTLP banner exposing `http://localhost:4318` + `gen_ai.*` + "Cambiar endpoint" | CRITICAL | **FIXED** | Banner removed; no infra URL visible |
| Subtitle is a value sentence | (v1 suggestion #4) | **DONE** | "Cuánto te cuesta la IA este mes y si está fallando." |
| `Scope` dev jargon | BLOCKER (cross-cutting) | **PARTIALLY FIXED** | "Tu alcance: organización activa" — improved, but `alcance` still abstract for Roberto |
| `bundle` dev jargon | BLOCKER | **NOT VISIBLE on this surface** (it lived in Compliance) — N/A |
| Top-nav still has `IA: gasto` entry | BLOCKER | **CHANGED LABEL** | v1 had "AI obs". v2 reads `IA: gasto` — better Spanish, but two-word colon-separated label still reads as engineer shorthand and breaks no-em-dash / one-term-per-concept (DESIGN.md §7) |

**Net:** PR #193 closed the embarrassing leaks. The surface no longer screams "developer staging build". It now screams something subtler: **a financial dashboard that has been told not to use technical words, but doesn't yet know what business question it answers.**

---

## 1. Tab summary

Eight zero-state cards under a Spanish title with a value sentence, organised in a 3-column desktop grid. Range chips (`24h · 7d · 30d · Este mes · Mes pasado`) sit above the grid; `Este mes` is selected. The hero row carries `Error rate · 24h`, `Gasto · mes en curso (0,00 €)`, and `Tier · Runway (Sin presupuesto configurado)`. Below: `Coste por capacidad / modelo / tag`, `Uso por día × hora`, `Top 5 fallos`, and a `Dependencia AI` strip. Each card carries an "Actualizado hace 0 min · Refrescar" footer (8 individual refresh links).

The dev-speak is gone. The information architecture remains engineer-shaped: nine widgets describe state, none prescribe an action, none translate "0,00 €" into "you have no AI spend yet — that's healthy / unhealthy / not applicable". Roberto is presented with a dashboard whose primary number is 0 € and whose primary call-to-action is the implicit "configure a monthly budget" CTA buried inside the third card.

---

## 2. Top-5 flags (cross-persona)

### 1. [BLOCKER] No "is my AI spend healthy?" answer anywhere on the page

Owner Roberto's JTBD on this surface (extrapolated from §1.1): *"Open this once a week on the phone, see how much AI is costing me this month, see whether it's a sane % of my revenue, see whether anything is failing."*

The page answers none of that.

- Spend card shows `0,00 €` with no comparison: not "vs last month", not "vs revenue", not "vs budget" (because no budget is configured), not "per processed invoice". Just a flat zero.
- There is no per-unit cost translation (DESIGN.md §1 principle 7 — "the contract is the API; the visual layer here is the human consumption channel"). The v1 suggestion #8 ("0,003 € por foto procesada") didn't ship.
- The Runway card says "Sin presupuesto configurado" — the value-of-the-page is gated behind a config step that is not promoted as the first action.

Roberto leaves the page thinking either (a) "I'm not using AI" (true today, but the page doesn't say so), or (b) "something is broken" (because 8 of 8 cards say `Sin actividad` / `0,00 €` / `Sin tags`). Either reading is a failure.

### 2. [BLOCKER] Eight cards, zero next-action affordance

Per the cross-cutting v1 pattern (#6 — "no hay próxima acción") and `reference_m3_ux_deep_revision_patterns.md` (next-action affordance is one of 5 must-have patterns for any new operator surface). The grid here violates it eight times in a row:

- Every card terminates in "Actualizado hace 0 min · Refrescar". Refresh is the only verb on the page.
- "Sin tags registrados" closes with an instructional sentence — `Etiqueta tus capacidades MCP con \`nexandro.tag\` para ver el desglose` — that is **(a)** the only remaining dev-speak on the page (backticks + literal token name + MCP idiom), and **(b)** has no link / button to act on it.
- The `Sin presupuesto configurado` card has a CTA arrow ("Configurar presupuesto mensual →") — the **only** prescriptive element on the page. It should be promoted to a page-level banner per v1 suggestion #3, not hidden as the third hero card.

### 3. [BLOCKER] "Coste por capacidad / modelo / tag" is engineer IA pretending to be Spanish

The three middle-row cards are direct SRE/MLOps idioms transliterated to Spanish. Roberto does not know what a "capacidad" is in this context (capacity? capability? MCP capability?), what a "modelo" is (LLM model — but the brief says he has no idea what an LLM is), or what a "tag" is for. The card copy reinforces the confusion:

- `Sin actividad por capacidad` → *Aún no se han registrado **capacidades MCP** en el rango seleccionado.* (MCP leaks back in.)
- `Sin actividad por modelo` → *No se han observado llamadas a **modelos** en el rango seleccionado.* (LLM concept assumed.)
- `Sin tags registrados` → *Etiqueta tus capacidades MCP con `nexandro.tag`* (worst of the three — both `MCP` and a literal config-key token).

The CFO persona on the roundtable: *"You're showing me three pivot tables of cost by dimension I don't have a vocabulary for. Where is the single line that says 'AI spend this month: X €, vs revenue Y%, budget pacing Z%'?"*

### 4. [MAJOR] Heatmap "Patrón típico" copy is asserted on zero data (v1 suggestion #13 didn't ship)

The `Uso por día × hora · esta semana` card shows the header copy `Patrón típico: pico viernes 09–12 (recepción de pedidos vía foto) · uso bajo domingos.` **before** any data exists. Inside the dashed box: `Sin actividad en la semana · El heatmap se rellena en cuanto se ejecuten capacidades AI durante la semana.`

So the page is asserting a typical pattern (`pico viernes 09-12`) on a heatmap that contains zero observations. This is a credibility leak — Roberto cannot tell if the pattern is **his** data or **a marketing claim**. v1 detail §4 suggestion #13 explicitly called this out ("Heatmap copy must be conditional"). Not done.

### 5. [MAJOR] 8 individual "Refrescar" links + no last-data-timestamp + no auto-poll

Every card carries its own "Actualizado hace 0 min · Refrescar" link. That's eight links to do the same global action. On mobile (per `04-ai-obs-mobile.png`) the per-card refresh links push the page to ~3.5 viewport-heights of scroll for an empty state — the cognitive overhead is entirely UI chrome, none of it is data.

v1 suggestion #9 (one global refresh + auto-poll 30s with pause control) didn't ship. Also: every card claims "hace 0 min" simultaneously — there is no `as-of` timestamp anywhere on the page that anchors the data freshness to a real wall-clock time. (v1 cross-cutting pattern #8 — "sin timestamps / freshness".)

---

## 3. Per-persona findings

### Owner Roberto (low tech, WhatsApp-level, mobile-primary)

Cannot answer "is my AI spend healthy?" from this page. Cards talk about capacidades, modelos and tags — vocabulary he doesn't have. Scrolls mobile (10 cards stacked) and gives up around `Coste por tag`. Closes tab. Will not return without a reason.

**Diagnostic question (CFO/PM lens):** would Roberto even know to visit this tab if it weren't in the top-nav? No — the tab is `IA: gasto` and currently shows `0,00 €`. He will either (a) never click, or (b) click once, see zero, and assume it's broken.

### UX/UI designer

- Hero-row split into 3 equal cards dilutes hierarchy — none reads as primary KPI. DESIGN.md §6 ("hierarchy via luminance + border, not shadow") respected, but the 3-column hero violates the spirit: when 1 metric matters more (spend vs budget), the grid should reflect that.
- 8 dashed empty-state boxes in a row pattern as visual debt — they look like skeleton loaders that never resolved. DESIGN.md §7 anti-pattern: empty states should be onboarding surfaces, not placeholder graphics.
- `Refrescar` link styling = same weight as `Configurar presupuesto mensual →`. The only prescriptive CTA on the page is indistinguishable from the lowest-stakes UI action.
- Mobile (per second screenshot): the 10 stacked cards do not respect the §8 mobile-first principle that critical KPIs go above the fold. Roberto sees Error rate first (a healthy 0% but he doesn't know that), then Spend, then a Runway card that essentially says "set me up" — three zero-state cards burn the top 2 viewports.
- Colour discipline: `0,0 %` error rate uses a green check (✓) — the only severity-coded element on the page. Good — but isolated: spend has no colour coding, runway has no colour coding, top-5-fallos has no colour coding even though its header promises "coloreados por severidad".

### CFO / accountant

Allocation lens completely missing.

- No view of AI cost as % of revenue. (Should be the first chip in the hero row: `Gasto IA / Ingresos del mes = X%`.)
- No view of AI cost per processed unit (invoice / photo / recipe generation). This is the only way an accountant can sanity-check whether AI is paying for itself.
- No budget pacing (e.g. "12 días transcurridos del mes · presupuesto consumido al 8%" — read: on track).
- No legal-hold / retention strip — the v1 suggestion #12 (compliance strip with "Modelos: Claude 4.7 EU-Frankfurt · Retención telemetría 90 días · Ver Auditoría →") didn't ship. CFO needs this for the GDPR data-map.
- No multi-venue allocation — Owner is "multi-venue group CEO" per personas-jtbd.md §1.1. Where does each venue's spend land? (Cross-cutting v1 pattern #10.)

### PM (AI ROI visibility)

Does this surface make AI ROI visible? **No.** It makes AI **cost** visible (sort of — currently 0). ROI requires both numerator (value generated: photos auto-extracted, recipes drafted, recall searches accelerated) and denominator (cost). Only the denominator is here, and only as 0.

The surface as shipped answers: *"What is the absolute € amount of AI I am spending?"* That's a question for an FP&A analyst, not the Owner persona this tab defaults to. A correct ROI surface would answer: *"What did AI do for me this month, and what did it cost relative to what it produced?"* — closer in shape to a dashboard like the one Recall or HACCP wants (incidents prevented · automation rate · cost per intervention).

### AI/ML engineer

For actual obs, this is **decorative**. The real observability lives in OTLP traces, which the PR-#193 cleanup correctly removed from the UI. But replacing the OTLP banner with 8 empty pivot cards is not the same as building an obs surface — it's hiding the obs surface and putting a marketing skin where it used to be.

For the engineer use case:
- No drill-down anywhere. v1 detail §4 suggestion #6 ("Make widgets clickable — Coste por modelo → list of calls; Top fallos → trace/auditoría link") didn't ship.
- No latency widget (p50/p95/p99). The page says it's about cost + health; health is more than error rate.
- No tail-failure breakdown (timeouts vs 4xx vs 5xx vs rate-limit).
- No model-version drift indicator (Claude 4.6 → 4.7 cost delta).

**Engineer verdict:** if the engineer needs obs, they go to Grafana/Tempo. If the operator needs cost, they don't have it here. So this surface serves neither audience.

---

## 4. Suggested concrete changes (priority order)

### P0 — make the page answer the Owner question (or hide it)

1. **[V]** Collapse the 3-column hero into a single dominant `Gasto vs presupuesto` card. The card shows: € spent this month (large, tabular-nums), `vs presupuesto: X% consumido · Y € restantes`, `vs mes pasado: ±Z%`, `vs ingresos: W%`. If no budget configured, the card becomes a setup card with a primary CTA (not a third hero showing "Sin presupuesto configurado" as if it were data). v1 suggestion #5 — still not done.
2. **[V]** Demote `Error rate` and `Runway` to a single secondary strip below the hero: `Errores 24h: 0.0% ✓ · Runway: Sin presupuesto`. v1 suggestion #5.
3. **[I]** Add `vs mes pasado` delta on the spend card with arrow + colour-coded magnitude. v1 suggestion #14 — still not done.
4. **[I]** Add €/unit-of-work line under spend: `0,003 €/foto · 0,12 €/receta · 0,05 €/búsqueda recall`. v1 suggestion #8 — still not done. CFO + Roberto need this.
5. **[V]** Make the budget-setup CTA the **first** thing on the page when no budget exists. Promote to a dismissible banner above the hero: `Configura un presupuesto mensual para activar alertas de gasto y runway`. v1 suggestion #3 — still not done.
6. **[I]** Strip the `Patrón típico: pico viernes 09-12 …` copy from the heatmap header **until** there's data. The card must not assert a pattern on zero observations. v1 suggestion #13 — still not done.

### P1 — kill remaining dev-speak

7. **[I]** Replace `Sin tags registrados · Etiqueta tus capacidades MCP con \`nexandro.tag\`` with operator-facing copy: `Sin etiquetas asignadas · Asigna etiquetas (cliente, sede, plato) para ver el desglose de coste`. Remove backticks. Remove `MCP`.
8. **[I]** Rename the three middle-row cards: `Coste por capacidad` → `Coste por proceso (foto, receta, recall…)`. `Coste por modelo` → drop entirely from Owner view, surface only behind an "Avanzado" toggle for the engineer use case. `Coste por tag` → `Coste por etiqueta personalizada`.
9. **[I]** Rename `Dependencia AI · si un modelo cae, ¿qué capacidades mueren?` → drop from Owner view entirely. Move to `Configuración → Avanzado → Diagnóstico IA`. This is an SRE blast-radius question, not an operator question.
10. **[I]** `Tu alcance: organización activa` → simply `Toda la organización` or, if multi-venue, a venue selector.

### P1 — instrument for actual action

11. **[I]** Single global refresh + auto-poll 30s with pause control. Remove the 8 individual `Refrescar` links. v1 suggestion #9 — still not done.
12. **[I]** Add a page-level `as-of HH:MM CEST` timestamp; remove the per-card "hace 0 min" lies.
13. **[F]** Wire drill-down on every numeric widget. Click spend bar → list of recent calls (capacidad, timestamp, cost). Click Top-5 fallos row → trace + audit-log deep link. v1 suggestion #6 — still not done.
14. **[I]** Add compliance strip at the bottom: `Modelos activos: Claude 4.7 (EU-Frankfurt) · Retención telemetría: 90 días · Ver Auditoría →`. v1 suggestion #12 — still not done. CFO needs this for the GDPR data-map.

### P2 — fit-to-persona role gating

15. **[F]** Hide the entire tab from MANAGER role by default. Surface only to OWNER unless `ai.cost.manager_visible=true`. v1 suggestion #11 — still not done.
16. **[V]** Mobile reorder (Owner's primary surface): `Gasto vs presupuesto` → `Errores 24h` → `Top fallos actuales` → rest collapsed behind "Ver más detalles". v1 suggestion #10.
17. **[I]** Add empty-state with persona-shaped copy when nothing has been used yet: `Aún no usas IA en nexandro. Funciones disponibles: extracción de facturas, búsqueda de recall, generación de etiquetas. Cuando empieces, este panel se llenará automáticamente.` Tied to the demo-data toggle proposed in v1 §Backlog L2-4.

---

## 5. Verdict

PR #193 stopped the bleeding (no more `localhost:4318`, no more English title) but did not change the diagnosis. The surface is now politely engineer-shaped instead of bluntly engineer-shaped. Eight zero-state cards, three pivot dimensions that need a glossary, one buried budget CTA, no answer to "is my AI spend healthy?", no per-unit cost translation, no multi-venue allocation, no compliance strip, no drill-down. The single biggest win v1 promised on this tab — collapsing the 3-column hero into one dominant spend-vs-budget card with comparisons (#5) — did not ship.

This is a financial dashboard whose primary number is currently zero and whose value-of-page (alerts + runway) is gated behind a config step that the page does not promote. Roberto will not return.

**Recommendation:** strip this surface back to a single "Gasto IA este mes" card embedded inside the existing Dashboard (`Negocio` group) until there is real data to render, and demote the standalone `IA: gasto` tab to `Configuración → Avanzado → IA: detalles` (engineer + curious-Owner audience). See summary §Top-3 BLOCKERS + nav recommendation below.
