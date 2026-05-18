---
title: UX/UI Roundtable Audit v3 — 2026-05-18 — Cola de revisión (`/m3/review-queue`)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: post-Sprint-1 deploy (PR #207 j13.md spec landed; surface code unchanged)
baseline: docs/audit-2026-05-18-v2-detail-08-cola-revision.md
related:
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/ux/j12.md (Foto-ingestión — the *primary* HITL surface)
  - docs/ux/j13.md (NEW — Master-approved spec DRAFT shipped via PR #207)
  - apps/web/src/screens/ReviewQueueScreen.tsx (unchanged since PR #161)
legend:
  - "[V] verbal: copy, tone, labels, language"
  - "[I] information: data exposed, severity, freshness, counts, provenance"
  - "[F] flow: nav, affordances, layout, multi-step, multi-venue, accessibility"
---

# `/m3/review-queue` — Cola de revisión (v3 deep-dive)

## Surface summary (what changed since v2)

**Code: nothing.** The screen `apps/web/src/screens/ReviewQueueScreen.tsx` is byte-identical to the v2 snapshot: H1 `Cola de revisión`, intro `Lotes y recepciones marcados para revisión tras una corrección retroactiva. Marca como revisado cuando hayas reconciliado.`, three chips (`Todas` / `Lotes` / `Recepciones`), counts whisper `0 en cola · 0 lotes · 0 recepciones`, two dashed-border boxes side-by-side (empty-state + "Selecciona una fila para ver el detalle."). Mobile collapses both dashed boxes vertically — still two empty parchment rectangles.

**Spec: everything.** PR #207 E-3 shipped `docs/ux/j13.md` as a DRAFT with Master approval (sign-off 2026-05-18). For the first time in the surface's history, the design intent is written down: §1 anchors the j12-vs-j13 fork, §2 nails personas+JTBD, §3 enumerates upstream triggers, §4 lays out regions, §5 recommends badge-driven IA (NOT a top-nav primary), §6 acceptance criteria including EU AI Act Art. 14 §4(c), §7 explicit non-goals, §8 five open Master questions, §9 implementation footprint (~1 sprint).

The result: **the gap between spec and reality is now visible and bounded.** v2 said "no spec exists, write one"; v3 says "spec exists, ship implementation against it." The surface remains, however, an empty placeholder behind a top-nav entry the spec itself recommends removing.

## Spec-vs-reality (v3)

| Dimension | Shipped surface | j13.md spec | Delta |
|---|---|---|---|
| H1 | "Cola de revisión" | "Cambios retroactivos" | Rename pending — collision with j12 H1 unresolved |
| Intro | "Lotes y recepciones marcados…" | Eyebrow "Cambios upstream que afectan firmas existentes" | Rewrite pending |
| Row anatomy | n/a (empty state only) | Severity dot + headline + 2-line body + 2 primary CTAs + diff link | Not implemented |
| Detail pane | Dashed "Selecciona una fila…" placeholder | Side-panel via `<CorrectionsHistoryDiffModal>` | Not implemented |
| IA placement | Top-nav primary entry | Badge-driven on Recetas/Etiquetas/HACCP + Dashboard pill | Removal pending sequencing decision |
| Empty state | `Bandeja al día. · No hay lotes ni recepciones pendientes de revisión.` | `<EmptyStateCard Icon={CheckCircle2} title="Sin cambios retroactivos pendientes" body="Todas las firmas están al día con sus datos fuente." />` + "Ver con datos de ejemplo" CTA | Copy + icon + demo CTA pending |
| Audit event types | n/a | `*_RETROACTIVE_RECONCILED` / `*_RETROACTIVE_DECLINED` | Backend confirmation pending |
| Keyboard shortcuts | none | `j/k/r/m/d` | Not implemented |

## Roundtable — 5 personas

### 1. Owner Roberto (mobile-primary, low tech comfort)

> "Vale, ahora sé que esto va a ser para cuando algo que firmé la semana pasada cambie de coste o de alérgenos. Pero hoy entro y veo lo mismo de la semana pasada — caja vacía. ¿La página está en obras o no hay nada que revisar? Si voy a usar esto desde el móvil el domingo por la noche, necesito que el aviso me llegue a mí, no que yo abra una pestaña para descubrir que está vacía."

- **Does Roberto understand what the page IS today?** No. The screen does not say "esta surface está en desarrollo" nor "aquí vivirán los cambios retroactivos cuando los haya". It just shows `Bandeja al día`, which is **technically true but operationally meaningless** because the surface isn't wired to fire either way yet. He still has the same broken-or-clean ambiguity v2 flagged — except now it's "broken or unfinished or clean", three branches.
- **What cue would tell him to come back later?** None visible. There is no "próximamente · ver spec" link, no "esta funcionalidad llega en Sprint 2", no roadmap pill. From his POV the page has been "the same empty thing" across two deploys.
- **Mobile (his primary device):** unchanged from v2 — two stacked dashed boxes on a 360 px viewport. The j13 spec §4 says mobile collapses rows to 2-line summary with tap-to-expand; until that ships, the mobile surface remains the worst-case experience of an empty placeholder.
- **Verdict from Roberto:** "Ponme un cartel honesto. Si no está hecho, dímelo. Si está hecho y está vacío, dame ejemplo." The "próximamente · ver spec j13" pill would solve the honesty problem at zero engineering cost.

### 2. PM (j13.md spec critique — what will surprise users)

> "El spec es la primera vez que esta surface tiene una identidad clara y diferenciable de j12. La separación 'primario HITL' vs 'retroactivo HITL' es load-bearing para el AI Act story y por fin está escrita. Pero hay tres apuestas en §4 que van a sorprender al usuario si no las testamos antes."

- **§4 row anatomy assumes 2 primary CTAs are always legible.** "Re-firmar con nuevo coste" + "Mantener firma" works when the change is a coste delta. What's the CTA when the change is "alérgenos override eliminado"? Or "supplier cert lapsed"? The spec lists 4 upstream change types in §3 but only sketches the row for one of them. **PM concern**: 4 different row variants will need 4 different CTA pairs; the spec needs an §4.2 enumerating each.
- **§4 row body sentence is dense.** "Aceite oliva 5L — coste +0.04€/g · Pizza Margarita — firmado por Iker 2026-05-12; cambio detectado hace 2h por extracción albarán PA-2026-887" is 4 entities in one breath (SKU, downstream, signer+date, trigger+event). The Owner-on-mobile-on-Sunday-night scan budget is closer to 3-4 word chunks. **Suggested edit**: split into structural row anatomy with named slots (eyebrow / title / metadata / trigger) — keep the entities, drop the visual run-on.
- **§5 badge-driven IA is right but the spec doesn't say what happens when count = 0 forever.** The Dashboard pill spec ("visible only when count > 0") creates a discoverability cliff — if the queue is rarely populated, no one ever learns the affordance. **Open Q5 captures this**; PM votes "always-on with `0 / 0 esta semana`" so the surface exists in the user's mental model before they need it.
- **§6 acceptance criterion "<500 ms for ≤500 queued items" is a backend SLO disguised as UX criterion.** Frontend should care about perceived latency (skeleton, optimistic clear, etc.) more than wall-clock. **Suggested edit**: split into perf SLO (backend) + perceived-latency criteria (frontend skeleton + optimistic UI + toast on confirm).
- **§7 explicit non-scope is excellent — bulk re-sign correctly excluded.** The "each row is a deliberate legal/operational re-affirmation" rationale is exactly the Article 14 §4(c) argument the compliance officer needs. Keep verbatim.

### 3. EU AI Act compliance officer (HITL Art. 14 §4(c) ongoing oversight)

> "El spec satisface el espíritu de Art. 14 §4(c) — 'ongoing oversight' está construido en el hecho de que cada propagación deferred queda en la cola hasta que un humano re-firma. Eso es exactamente lo que pide el artículo. Pero hay dos riesgos legales que el spec todavía no cierra."

- **§6 criterion "Mantener firma writes an `*_RETROACTIVE_DECLINED` event with free-text reason (200 char limit)" is correct.** Without forced reason, Mantener firma becomes a 1-click rubber stamp — exactly the "decorative supervision" pattern Art. 14 §4(d) is designed to prevent. **STRONG +1 to typed-reason in Open Q3** (compliance position).
- **§6 criterion "every action is logged with actor + timestamp + before/after state" satisfies Art. 14 §4(c) on paper.** But the spec doesn't say *who can clear* — is Manager allowed to dismiss a coste delta of +480 € unilaterally? The v2 audit raised "Owner co-sign threshold for material impact"; j13 §7 explicitly excludes "auto-propagation toggles" but is silent on Owner co-sign. **Suggested edit**: §6 should add a criterion "items above org-configured impact threshold require Owner-role actor for re-firmar; Manager can decline but not confirm." This is the material-impact gate.
- **§3 upstream change types are good but missing "model-version drift".** If the photo-ingestion model is retrained and produces materially different outputs on the same input, that's also an upstream change that should land here. Article 14 §4(a) ("fully understand the AI system's capacities and limitations") implies the model drift case must be visible to the human reviewer. **Suggested edit**: add 5th row in §3 table for "Model version upgrade with retroactive re-extraction of historical photos".
- **§4 row body should surface model+prompt version of the upstream extraction.** Currently spec says "firmado 2026-05-12 por iker; cambio detectado hace 2h por extracción albarán PA-2026-887". For Art. 13 transparency, the row should additionally surface `Modelo: gpt-oss-vision-72b · prompt v2.3` either inline or in the diff side-panel header. **Already nodded to in v2 audit**; j13 §4 silently dropped this.
- **§9 footprint note "Confirm `*_RETROACTIVE_RECONCILED` event_type registered" is a load-bearing pre-flight check.** If the backend hasn't actually registered the event type, the Sprint 2 implementation will write rows with a TBD event_type that's not in the audit_log enum. **Flag for Sprint 2 kickoff**: validate event registration in Day 1.
- **Verdict on Art. 14 §4(c) satisfaction:** spec satisfies the *requirement* but leaves the *enforcement* loose (no co-sign threshold, no model-drift case). 7/10. Closing the two gaps gets it to 9/10.

### 4. UX/UI designer (badge-pattern recommendation in j13 §5)

> "El spec recomienda badge-driven, no top-nav primario. Esa es la decisión correcta del 90 % — pero el 10 % restante depende de cómo se siente la 'home' de la oversight. Si el Owner abre el Dashboard el domingo y solo ve una pill 'Cambios retroactivos (3)' entre otras 12 pills, esto se diluye. La pregunta no es 'badge vs tab' sino 'cuál es la home de la supervisión humana del AI Act'."

- **Badge-driven is right for distribution.** Linking from Recetas → 3 pendientes is the workflow-anchored entry: the user is already in the context of the artefact being affected. Linear / Notion / Linear-style "things that need your attention" patterns work this way. **+1 to §5.1**.
- **Dashboard pill is right for ambient awareness.** Roberto (Owner, low tech comfort, 2-3x/week mobile) needs a single glanceable signal. **+1 to §5.2**. But — visibility should be **always-on with `0 / N esta semana`** when the queue is empty (Open Q5: vote always-on), so the affordance exists in his mental model.
- **Top-nav primary "Cola revisión" entry should go away** — but only **after** Recetas/Etiquetas/HACCP have the badges wired. Pulling the entry now, before badge-pattern lands, creates a "where did the queue go" hole for users who already discovered the URL. **Position on Open Q2: wait for badge pattern.**
- **Should this be a primary tab after all?** No. Tabs are for surfaces the user navigates to *by intent*; badge-driven surfaces are for surfaces the user is *summoned to* by a state change. j13 is the latter — there is no scenario where the user "decides to go check the reconciliation queue" outside of being told there's something there. The badge pattern is correct.
- **Spec §4 row layout uses `⊙` for severity dot.** That's a specific Unicode character; suggest spec clarify whether this is a literal `⊙` glyph or a 2 px left-edge rule (the latter is what v2 audit recommended and is more accessible). **Suggested edit**: §4 should reference DESIGN.md primitive for severity treatment, not pick a character inline.
- **§4 diff side-panel reuses `<CorrectionsHistoryDiffModal>` — good reuse decision.** No new diff component = no new visual vocabulary to learn = consistent with §7's "no decision fatigue" principle. Reuse rate is the right metric.

### 5. Manager / supervisor persona (the actual triager — daily workflow)

> "Yo soy quien va a vivir aquí. Si me llega un badge en Recetas 'Hay 3 cambios upstream que afectan a tus recetas firmadas', tap, llego a esta surface filtrada a 3 filas — eso es exactamente el flujo que necesito. Pero el spec dice 'no bulk' (§7), y eso me preocupa porque mi día real es 'aceite oliva subió 0.04€/g, eso afecta a 8 recetas que firmé, y todas deberían re-firmarse con la misma razón'."

- **§7 'no bulk re-sign' is the right legal call but the wrong workflow call.** Compliance officer says "each row is a deliberate legal/operational re-affirmation"; Manager says "8 rows from the same upstream event ARE the same deliberate re-affirmation, just expressed 8 times." **Suggested edit**: §7 should distinguish between (a) bulk-clear of unrelated rows (correctly forbidden) and (b) bulk-confirm of N rows that share the same upstream `correction_id` (legitimate — they're the *same* deliberation). Add §6 criterion: "When N rows share an upstream `correction_id`, offer a `Re-firmar las N filas afectadas` chip on each row that opens a single confirm flow for the shared deliberation."
- **§4 layout works for daily triage IF the sort is right.** Spec says "sorted by impact desc (€ delta * volume)" — that's the headline triage signal Manager needs. **+1 to §4 default sort**. Add secondary sort by `upstream_correction_id` so siblings cluster visually.
- **§4 row CTAs need a third option: "Escalar a Owner".** When the cost delta is borderline (5-10 % shift on a high-volume item), Manager doesn't want to unilateral re-sign. v2 audit raised this; j13 §4 dropped it. **Suggested edit**: §4 row anatomy should add a tertiary `Escalar →` CTA next to `Ver diff →`. Writes a `*_ESCALATED_TO_OWNER` audit row and notifies the Owner persona.
- **§5 badge-driven flow has a missing piece: counter-per-venue.** Manager works at one venue ("Palafito Madrid Centro"); Owner Roberto has multi-venue. The Dashboard pill needs to scope to the user's venue context, NOT show "12 pendientes globally". **Suggested edit**: §5 should explicitly note `venue scope = user's current location filter, not org-wide`.
- **The <10s/row JTBD budget is achievable IF the diff side-panel is keyboard-navigable.** Spec §6 has `j/k/r/m/d` shortcuts. **+1 strongly**. Add `e` to escalate.
- **Verdict from Manager:** the spec describes a surface I'd use daily IF: (a) bulk-confirm for shared-`correction_id` cluster is added, (b) `Escalar a Owner` tertiary is added, (c) venue scoping is explicit on the Dashboard pill.

## Top-5 flags

1. **🟠 HIGH — Placeholder is not honest about its own status.** The shipped surface looks "finished but empty" (dashed-bordered empty-state with copy `Bandeja al día`). After 2 deploys without code change, users have no cue that the surface is awaiting Sprint 2 implementation against the new spec. **Action**: ship a "próximamente · ver spec j13" pill in the empty state body, linking to a Master-facing doc URL (or, if internal-only is fine, just `Próximamente — ver j13.md`).
2. **🔴 BLOCKER — j13 spec §3 missing "model-version drift" upstream change type.** Article 14 §4(a) implication: when the photo-extraction model is retrained and produces materially different outputs on historical inputs, those need to land in this queue. Spec must enumerate this case before Sprint 2 starts implementation.
3. **🔴 BLOCKER — j13 spec §7 "no bulk re-sign" is too absolute.** Bulk-confirm of rows sharing an upstream `correction_id` is the same deliberation expressed N times, not N separate deliberations. The Manager workflow breaks without this. Resolve §7 ambiguity (clarify bulk-clear vs cluster-confirm) before implementation.
4. **🟠 HIGH — j13 spec §4 row CTAs missing "Escalar a Owner".** v2 audit raised material-impact co-sign; j13 silently dropped it. Manager needs a third action when borderline; compliance needs the audit_log row. Add `Escalar →` to row CTA set and a `*_ESCALATED_TO_OWNER` event type.
5. **🟠 HIGH — Top-nav "Cola revisión" entry persists.** j13 §5 explicitly says "removed in a follow-up slice once badge pattern lands." Sequencing question (Open Q2) is unresolved — current state shows two pathways (top-nav + future badges) that will compete for the same surface. Lock the sequencing: badges first, nav removal second.

## Suggested concrete changes (priority order)

### Sprint 2 — Phase 0 (1 day, no implementation deps)

- **[V] Add "próximamente · ver j13" pill to the empty state** of the shipped surface. Honest placeholder beats dishonest placeholder. Solves the Owner-Roberto "página en obras o no hay nada" ambiguity at zero engineering cost.
- **[V] Master answers all 5 open questions in j13 §8** so Sprint 2 implementation has a frozen spec. Recommendations in section "j13.md spec review" below.
- **[F] Decide top-nav removal sequencing** (Open Q2). Recommendation: badges first, then remove top-nav entry. Documented in j13 §5.

### Sprint 2 — Phase 1 (1 sprint, j13 §9 footprint)

- **[F] Replace `ReviewQueueScreen.tsx` placeholder** with j13 §4 layout. ~300 LOC + tests. Includes severity coding (left 2 px rule, NOT `⊙` glyph), row CTAs per §4 *plus* `Escalar a Owner` tertiary, mobile collapse to 2-line tap-to-expand.
- **[F] Wire `<RetroactiveBadge count />` primitive** into Recetas/Etiquetas/HACCP screens per j13 §5. ~80 LOC.
- **[F] Wire Dashboard pill** with always-on `0 / N esta semana` zero-state (Open Q5 recommendation).
- **[I] Confirm `*_RETROACTIVE_RECONCILED` + `*_RETROACTIVE_DECLINED` + `*_ESCALATED_TO_OWNER` event types** are registered in audit_log enum. Day-1 task.
- **[I] Wire diff side-panel** via `<CorrectionsHistoryDiffModal>` adapter per j13 §6. ~20 LOC.

### Sprint 3 — Phase 2 (post-Master sequencing decision on Q2)

- **[F] Remove top-nav "Cola revisión" entry** once badges are live on all three downstream surfaces.
- **[I] Add cluster-confirm for shared-`correction_id` rows** per Manager workflow. Requires spec amendment §7.
- **[I] Add model-version-drift upstream change type** per compliance officer. Requires backend listener for model upgrade events.

## j13.md spec review

### Per-persona pre-implementation feedback (summarized)

| Persona | Verdict on spec | Top suggested edits |
|---|---|---|
| Owner Roberto | "Once it ships per spec, I'd use it. Right now the placeholder doesn't tell me about the spec." | Add honest placeholder pill linking to j13 |
| PM | "Best version of this surface that's ever been written. 3 things will surprise users." | Enumerate row variants per upstream change type (§4.2); split row sentence into named slots; split §6 perf criterion into backend SLO + perceived latency |
| EU AI Act compliance | "Spec satisfies the *requirement* but loose on *enforcement*." 7/10 → 9/10 with two edits | Add Owner co-sign threshold criterion (§6); add model-version-drift to §3; add `Modelo+prompt vN` to row body (§4) |
| UX/UI designer | "Badge-driven is right. Always-on Dashboard pill (zero-state). Reference DESIGN.md primitive for severity instead of `⊙` glyph." | §4 severity → primitive reference; §5.2 Dashboard pill → always-on with `0 / N esta semana` |
| Manager | "Daily-driver-quality spec IF cluster-confirm + Escalar + venue scoping are added." | §7 clarify bulk-clear vs cluster-confirm; §4 add `Escalar →` tertiary; §5 explicit venue scope on Dashboard pill |

### Suggested edits to the spec BEFORE code lands

1. **§3 (upstream change types)** — add 5th row: "Model version upgrade with retroactive re-extraction of historical photos" → "Re-extracted artefacts differ from human-signed cost / allergen / lot data" → "Article 14 §4(a) requires the human to evaluate the model's new behaviour vs the old signed state."
2. **§4 (layout regions)** — add §4.2 "Row CTA variants per upstream change type": coste → `Re-firmar con nuevo coste` + `Mantener firma`; alérgenos → `Re-firmar con nueva matriz` + `Mantener firma`; procurement → `Acuse de baja proveedor` + `Mantener firma`; lot → `Aceptar downgrade` + `Mantener firma`. All variants get tertiary `Escalar a Owner` + `Ver diff →`.
3. **§4 (row anatomy)** — replace `⊙` literal with reference to DESIGN.md severity primitive (2 px left rule per pattern 3 in `reference_m3_ux_deep_revision_patterns.md`). Add `Modelo: gpt-oss-vision-72b · prompt v2.3` chip in row body for Art. 13 transparency.
4. **§5.2 (Dashboard pill)** — change "visible only when count > 0" to "always visible with `0 / N esta semana` zero-state to surface the affordance"; add explicit "venue-scoped to user's location, not org-wide".
5. **§6 (acceptance criteria)** — add: "items where impact > org-configured threshold (default €100 OR 5 % unit shift) require Owner-role actor for re-firmar; Manager can decline or escalate but not confirm." Split perf SLO from perceived-latency criteria.
6. **§7 (non-goals)** — clarify "no bulk re-sign of *unrelated* rows" (correctly forbidden); add "cluster-confirm of N rows sharing an upstream `correction_id` IS in scope per Sprint 3" so the spec doesn't paint Sprint 3 into a corner.

### Answers / positions on the 5 open questions (§8)

| # | Question | Owner | PM | Compliance | UX | Manager | Synthesized recommendation |
|---|---|---|---|---|---|---|---|
| 1 | Naming: "Cambios retroactivos" vs "Reconciliación" vs "Firmas pendientes" vs "Revisar cambios upstream" | "Cambios retroactivos" — direct, declarative | "Cambios retroactivos" — best collision avoidance with j12 "Cola revisión" | "Cambios retroactivos" — names the thing for audit context | "Cambios retroactivos" — best scan-ability | "Cambios retroactivos" — clear vs "Reconciliación" (jargon) | **"Cambios retroactivos"** — unanimous |
| 2 | Top-nav removal timing: now vs after badges | "Cualquiera, no soy yo quien navega ahí" | After badges (avoid "where did it go" hole) | After badges (don't break compliance officer's bookmark mid-cycle) | After badges (sequence: deliver new path, then remove old) | After badges (I'm fine with either, but two paths > zero paths) | **After badges land on Recetas+Etiquetas+HACCP** — 4-of-5 explicit, 1 abstain |
| 3 | Mantener firma: soft (1-click) vs hard (typed reason 200 char) | Soft for low-stakes, hard for high-stakes | Tiered per impact threshold | Always-typed (Art. 14 §4(d) "decide not to use … or otherwise disregard" demands rationale) | Tiered (UX cost of always-typed on low-stakes is too high) | Tiered (I'd want 1-click for the obvious "the upstream change doesn't actually matter for this row" cases) | **Tiered**: 1-click for items below impact threshold (free-text reason auto-stamped "non-material"); typed reason required above threshold. 4-of-5; compliance dissents but accepts if "non-material" stamp is audit-machine-readable |
| 4 | Re-sign default state: default to new value or keep old value pre-filled | Default-new (faster) | Default-new (common path is "yes the new cost is right, sign it") | Default-old (prevents accidental drift; the human must affirmatively confirm the change) | Default-new but show old prominently in diff | Default-new, hard. The reason I'm signing is BECAUSE the new value is right. | **Default-new** — 4-of-5; compliance accepts because the diff side-panel makes "what I'm signing" explicit before submit |
| 5 | Dashboard pill visibility: always-on vs zero-hide | Always-on (otherwise I forget the feature exists) | Always-on with `0 / N esta semana` (PM concern: zero-hide creates discoverability cliff) | Always-on (visible affordance = visible oversight) | Always-on with `0 / N esta semana` zero-state | Always-on with venue scope | **Always-on with `0 / N esta semana` zero-state, venue-scoped** — unanimous |

## Verdict

**The placeholder is now defensible IF it adds a "próximamente · ver j13" cue** to disambiguate "in obras" from "all clear". Without that pill, the placeholder remains the worst-case UX from v2: a perpetually-empty box that trains users to ignore the most important oversight surface in the product.

**The j13 spec is the best version this surface has ever had** — the j12-vs-j13 fork is finally written down, the badge-driven IA is correct, the empty-state demo CTA closes the Sales-demo gap, the acceptance criteria are AI Act-aware. With 6 small spec edits (model-drift row in §3, row variant matrix in §4.2, severity primitive reference in §4, always-on Dashboard pill in §5.2, impact-threshold co-sign criterion in §6, cluster-confirm clarification in §7) it becomes implementation-ready.

**Sprint 2 should start j13 implementation** in parallel with Master answers on the 5 open questions — 4 of the 5 have unanimous-or-near-unanimous roundtable positions (naming, sequencing, default-new, always-on Dashboard pill), and the 5th (tiered Mantener firma) has a defensible synthesis. The Phase 0 honest-placeholder pill ships in <30 min and unblocks the next 2 weeks of empty-box UX debt.
