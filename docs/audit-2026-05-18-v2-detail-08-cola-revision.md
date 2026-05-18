---
title: UX/UI Roundtable Audit v2 — 2026-05-18 — Cola de revisión (`/m3/review-queue`)
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: post-deploy v2 (PRs #193–200) per-tab deep-dive
baseline: docs/audit-2026-05-18-ux-roundtable.md §8 (v1 — surface was a route stub, no design)
related:
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/ux/j12.md (the *other* HITL queue — adjacent to this one in the nav and the source of the upstream `HITL_RETROACTIVE_CORRECTION` events that seed this surface)
  - apps/web/src/screens/ReviewQueueScreen.tsx (PR #161 + post-deploy copy)
  - docs/openspec-slice-module-3.md §17a/17b/22.x
legend:
  - "[V] verbal: copy, tone, labels, language"
  - "[I] information: data exposed, severity, freshness, counts, provenance"
  - "[F] flow: nav, affordances, layout, multi-step, multi-venue, accessibility"
---

# `/m3/review-queue` — Cola de revisión (v2 deep-dive)

## Surface summary (what shipped)

Owner + Manager surface where Lots and Goods Receipts whose upstream auto-fill photo-extraction (`confidence ≥ 0.85`) was later corrected via `HITL_RETROACTIVE_CORRECTION` land flagged `requires_review=true`. The operator's job is to (i) realise an upstream extraction changed, (ii) reconcile the downstream row against reality, (iii) "Marcar como revisado" once done. Backend at `GET/POST /m3/review-queue` (PR #161). UI shipped as `apps/web/src/screens/ReviewQueueScreen.tsx` — a chip filter (`Todas` / `Lotes` / `Recepciones`), a counts line (`0 en cola · 0 lotes · 0 recepciones`), a list-on-left + detail-pane-on-right two-column grid, and the empty-state copy (`Bandeja al día. · No hay lotes ni recepciones pendientes de revisión.`).

PR #197 added the empty-state copy and `Bandeja al día` cue. **Nothing else of substance landed in PRs #193–200.** The right-column "Selecciona una fila…" placeholder is also dashed-bordered, producing the v1-flagged "two empty dashed boxes side-by-side" pattern unchanged.

## Spec-vs-reality

There is **no `j*.md` spec for this surface.** That is the first finding. The closest spec, `j12.md`, defines the *front-line* HITL queue (photo-ingest, 60-85 % band, `PhotoViewer` + `ExtractedFieldList` + `Firmar ingestión`). This one is the *reconciliation* queue (downstream effect of a `HITL_RETROACTIVE_CORRECTION` rewriting an auto-fill). The product fork between the two was never written down beyond the openspec line "Owner+Manager browse UI for the review-queue" (PR #161).

The result is exactly what an undesigned surface looks like:
- The H1 says "Cola de revisión" — the same words as `j12.md`'s H1 (`Cola de revisión · 4 elementos`), so two adjacent nav entries (`Foto-ingestión` and `Cola revisión`) compete for the same mental model.
- No region defined for *why* an item is here. No diff. No "what changed upstream". No link back to the `HITL_RETROACTIVE_CORRECTION` audit row that seeded the flag. No cost delta. No "this downstream row used to say X, now should say Y".
- "Marcar como revisado" mutates the audit trail (clears `requires_review`) with no acknowledgement copy, no required-reason, no actor co-sign for material-impact items, no preview of what gets written to `audit_log`.

The intent is plausibly EU AI Act Art. 14 oversight + GDPR Art. 30 forensic trail. The execution surfaces the database concept (`requires_review` boolean) and stops there.

## Roundtable — 5 personas

### 1. Owner Roberto (mobile-primary, low tech comfort)

> "Si esto es donde la IA marca cosas para que yo confirme, ¿por qué está vacío todo el rato? ¿Significa que la IA no se equivoca nunca, o que nadie está mirando? El contador dice cero en todas partes, así que ¿confío o me preocupo?"

- **Does this give him confidence the AI isn't running wild?** No. The empty state reads as "nothing here", not as "the AI's auto-fills have not needed any retroactive correction in the last N days, here's the most recent one we cleared (link)". A perpetually empty queue is indistinguishable from a broken queue.
- **Mobile (his primary device):** the two-column grid collapses to single-column; the right-pane placeholder ("Selecciona una fila…") becomes a second meaningless dashed box stacked below the first one. Two empty boxes on a phone is comical.
- **The "Marcar como revisado" CTA is a black-box mutation.** Owner has no idea what gets written. EU AI Act tells him a human signed; the UI tells him nothing.

### 2. Manager / supervisor (kitchen-tablet, the actual triage operator)

> "Si me llega una alerta de que tengo 4 ítems en cola, espero ver: cuál cambió, qué decía antes, qué dice ahora, cuánto dinero baila, y poder confirmar 4 de 4 en 30 segundos con un solo motivo de reconciliación. Aquí tengo que abrir uno a uno, leer un UUID, y hacer clic ciego en un botón verde."

- **Real-world triage workflow is shaped like:** *bulk-scan by recency or by venue → select N rows that share a root cause → clear with one reason text → audit log captures the bulk-acknowledgement.* This surface forces single-select, single-clear, zero-reason, zero-rationale, no aging sort, no severity colour.
- **No diff is visible.** The `DetailPane` shows `Marcado · Recibido · Ubicación · Proveedor · Unidad · Foto-ingesta (UUID)`. That is *metadata*. The thing the operator needs — *what changed upstream* and *what's the suggested downstream change* — is absent.
- **Counts line is a lie of completeness.** `0 en cola · 0 lotes · 0 recepciones` reads as "everything checked, all clear". In reality it means "0 visible in the current filter scope on this venue with the default 50-row cap". No multi-venue. No aging. No oldest-flagged warning. Manager cannot tell if the queue is genuinely clean or if she's looking at one venue while another bleeds.

### 3. UX/UI designer (queue UX references: Gmail, Linear, Zendesk)

> "Las colas que funcionan tienen tres cosas: (1) cada fila vende su urgencia en 1 segundo (severidad, edad, monto), (2) el bulk-select es el flujo por defecto, no la excepción, (3) la acción que vacía la fila escribe un trazo entendible. Aquí no tengo ninguna de las tres."

- **Gmail / Linear / Zendesk pattern:** the list item is the primary surface; the detail pane is for the few items that need a deeper read. nexandro inverts this — the list rows are stripped (chip + relative date + 1 line + elided UUID) and *all* meaningful information lives in the detail pane.
- **Dashed-border anti-pattern.** DESIGN.md §6 ("borders feel like dry parchment edges, 1 px solid `--border`") is violated twice: the empty-state box AND the unselected-detail box are `border-dashed border-border-strong`. Dashed = wireframe sketch, not finished surface. This is the same finding as v1; PR #197 added copy but left the dashed borders.
- **No severity coding.** `reference_m3_ux_deep_revision_patterns.md` pattern 3 (severity colour) and pattern 1 (trend/history surface) both fail. A Lot whose corrected cost delta is +480 € looks identical to a Lot whose corrected supplier_id was a no-op typo fix.
- **The chip-group is over-loud, the counts line is under-loud.** The three chips are big rounded pills with full `--accent` selected state; the counts line is `text-xs text-mute` floating to the right. The counts are the most actionable piece of info on the page and they're whispering.
- **Accessibility:** the `aria-pressed` on chips and `role="group"` on the filter are present (good). But there's no `aria-live` on the list when filter changes, no `aria-busy` during the query loading state, the skeleton has no screen-reader equivalent, and the toast `role="alert" / role="status"` is correct but the focus is not moved.
- **No keyboard shortcuts.** Gmail-style `j/k` to walk rows, `e` to clear, `u` to undo — none. j12 has them; this surface does not.

### 4. PM (what value does this add for nexandro positioning)

> "Si vendemos 'AI-first ERP con HITL visible', esta surface es donde demostramos que la IA está supervisada de forma material, no decorativa. Ahora mismo demuestra lo contrario: una caja vacía con un botón verde."

- **This is one of two surfaces where the EU AI Act story is sold (the other is `Foto-ingestión`).** It should carry visible *evidence of supervision*: how many corrections has the AI received this month, how many downstream rows did they touch, what was the cost impact, who cleared them. The audit_log already has all this data (`HITL_RETROACTIVE_CORRECTION` events, `requires_review` flag flips). The UI shows zero.
- **The "tab exists but is always empty" pattern actively hurts positioning.** Owner opens it twice, sees `Bandeja al día`, stops opening it. The single most visible HITL-oversight signal in the product becomes invisible by disuse.
- **The split between this queue and `j12` is invisible to the user but load-bearing for compliance.** `j12` is *primary* HITL (limited-risk AI gate before action). This is *secondary* HITL (act already happened, AI was retroactively corrected, audit the downstream blast). PM needs the surface to *name* this distinction — Owner sees "Cola revisión" and assumes it's the same as `Foto-ingestión` ⇒ stops trusting the nav.
- **No demo-data mode.** Sales demos walk through `Foto-ingestión` (which has data) and skip this tab (which never has data). The compliance story is told 50 %.

### 5. EU AI Act compliance officer (HITL Art. 14)

> "Article 14 demands that human oversight be 'effective' — comprensible, traceable, and that the operator can override or reverse the AI's effect. Aquí tengo un botón sin trazabilidad de razón, sin captura de identidad legible (UUIDs only), sin diff de qué se cambió, y sin pista del evento upstream que originó la marca. Esto no falla la auditoría pero tampoco la pasa con holgura."

- **Art. 14 §4(a) "fully understand the AI system's capacities and limitations":** the surface gives zero context that the flag came from a confidence-band auto-fill that was retroactively corrected. The operator clears blind.
- **Art. 14 §4(c) "interpret the AI system's output correctly":** there is no AI output shown here. The detail pane shows `aggregate_type · receivedAt · supplierId · unit`. The corrected vs. original extraction is invisible.
- **Art. 14 §4(d) "decide not to use the AI system or otherwise disregard, override or reverse the output":** the only available action is "Marcar como revisado". There is no "rechazar la corrección upstream", no "revertir esta fila al estado anterior", no "escalar a Owner". One-way mutation.
- **Art. 13 transparency:** no model name, no prompt version, no `HITL_RETROACTIVE_CORRECTION` audit_log link. j12's `AiProvenanceChip` should live here too — even though the AI didn't write *this* row, it wrote the upstream row that caused the flag.
- **Art. 22 GDPR (automated decision):** the retroactive correction may have changed cost / supplier / quantity values that feed downstream cost or HACCP decisions. The operator needs to know if the downstream automated effects already fired.
- **Material-impact threshold:** if the cost delta exceeds an org-configurable threshold (e.g. > 100 € or > 5 % unit cost shift), the clear should require Owner co-sign. Currently any Manager can clear silently.

## Top-5 flags

1. **🔴 BLOCKER — There is no `j*.md` spec for this surface.** Everything else stems from this. The product fork between *primary HITL* (`Foto-ingestión`, j12) and *retroactive reconciliation* (this tab) was never written down. Result: the implementation surfaces the database concept (`requires_review` flag) with zero scaffolding around it. **Write `j13.md` before any UI work.**
2. **🔴 BLOCKER — Tab name and H1 ("Cola de revisión") collide with j12's H1 ("Cola de revisión · 4 elementos").** Two adjacent nav entries (`Foto-ingestión` and `Cola revisión`) compete for the same mental model. Owner cannot reason about which queue does what. Rename to `Cambios retroactivos` or `Reconciliación` (v1's recommendation, still right). This is the literal cause of "should this tab even exist in top-nav".
3. **🔴 BLOCKER — Detail pane shows metadata, not the diff.** The single most valuable piece of information — *what changed upstream and what is the suggested downstream change* — is absent. Operator clears blind. EU AI Act Art. 14 §4(c) fails (cannot interpret the AI's effect).
4. **🟠 HIGH — "Marcar como revisado" is a one-tap mutation with no reason, no acknowledgement, no Owner co-sign for material impact.** Audit trail captures who+when but no rationale. Bulk-clear is impossible (must walk rows one-by-one). EU AI Act Art. 14 §4(d) (override / reverse) fails — the only available verb is "accept".
5. **🟠 HIGH — Empty state communicates broken-or-clean ambiguity.** `Bandeja al día. · No hay lotes ni recepciones pendientes de revisión.` reads identically whether (a) the AI is working perfectly and no retroactive corrections fired, or (b) the upstream listener crashed and no flags are landing. No "última corrección upstream cleared hace 3 días" link to the last cleared item, no "esta semana revisaste N items" history, no link to `Auditoría` filtered by `HITL_RETROACTIVE_CORRECTION`.

## Suggested concrete changes (priority order)

### Phase 0 — write the spec (do this first; 1 day)

- **[F] Write `docs/ux/j13.md`** — "Operator reconciles downstream rows after a HITL retroactive correction". Anchor: this surface exists because `HITL_RETROACTIVE_CORRECTION` events upstream rewrite an auto-fill (`≥0.85`) extraction; downstream Lots/GRs that referenced the old extraction get `requires_review=true`; operator reconciles. Define regions: header + transparency banner; queue list (severity-coded rows); diff pane (original extraction → corrected extraction → downstream-row current state → suggested action); acknowledgement form (reason text, optional comment, Owner co-sign threshold); audit-link footer; bulk-select strip; venue switcher in header.
- **[F] Decide whether this tab belongs in top-nav.** Recommendation: **no, in top-nav** — instead, surface as (a) a badge on `Foto-ingestión` ("3 reconciliaciones pendientes"), (b) a row in `Auditoría` filterable by `HITL_RETROACTIVE_CORRECTION`, and (c) a top-of-`Dashboard` warning strip when `count > 0`. **Top-nav entry hidden when count == 0 AND user has never cleared one** (zero-state cleanup). When non-zero, badge with count + oldest-age (e.g. "3 (oldest: 4 d)").

### Phase 1 — fix what shipped (1 sprint)

- **[V] Rename tab + H1.** `Cola de revisión` → `Cambios retroactivos` (or `Reconciliación · cambios retroactivos`). Eyebrow: `Revisión humana · cambios retroactivos (HITL)`. This single change removes the collision with `Foto-ingestión` and makes the surface's job legible.
- **[V] Rewrite the intro paragraph.** Current: *"Lotes y recepciones marcados para revisión tras una corrección retroactiva. Marca como revisado cuando hayas reconciliado."* Better: *"Cuando alguien corrige una extracción de IA que ya estaba autocompletada (≥85 % confianza), las filas que dependían de esa extracción (lotes, recepciones) quedan marcadas para que un humano confirme el efecto. nexandro guarda original + corrección + tu acuse en `audit_log`. Esto cumple con el Article 14 del EU AI Act."* Mirror j12 §1 tone.
- **[F] Replace dashed borders with `--border` 1px solid** in both empty-state and unselected-detail boxes. DESIGN.md §6 compliance. Drop the second box entirely on mobile (single column); show only the list with inline-expand on tap.
- **[I] Add severity coding per row.** Left edge 2 px rule: `--destructive` for cost delta > threshold, `--warn-bg` tint for items > 7 d unaged, `--mute` for cosmetic-only corrections. Pattern from `reference_m3_ux_deep_revision_patterns.md` §3.
- **[I] Add age column to rows.** Currently rows show `hace X min/h/d` in `text-mute` floating right; that's relative date, not aging signal. Add explicit `Pendiente Nd` chip in `--destructive` when > 7 d.
- **[I] Make counts line the headline, not a whisper.** Promote `N en cola · M lotes · K recepciones` to `text-lg` next to the H1. Add `oldest: Xd` when N > 0. Add venue context when org has > 1 location: `· en 2 sedes`.
- **[F] Add venue switcher in header.** Owner persona is multi-venue group CEO (personas-jtbd §1.1). Cross-cutting flag #10 from v1 audit applies here.

### Phase 2 — the missing diff pane (1 sprint)

- **[I] Replace metadata-list detail pane with three-part diff:** (i) *"Lo que se corrigió upstream"* — original extraction vs corrected extraction, link to the `HITL_RETROACTIVE_CORRECTION` audit row, name of who corrected; (ii) *"Cómo afecta a esta fila"* — current downstream state of the Lot/GR, suggested change (e.g. `cantidad: 12 → 14`, `coste unit: 3.40 € → 4.10 €`), cost delta `+8.40 €` with `tabular-nums`; (iii) *"Qué se va a escribir al confirmar"* — preview of the `audit_log` envelope (event_type, actor, reason, timestamp).
- **[V] Add `AiProvenanceChip` at bottom of detail pane.** Same component as j12 §8 — `Modelo upstream · gpt-oss-vision-72b · prompt v2.3 · audit_log AL-…`. Even though the AI didn't write this row, it wrote the upstream row that caused the flag — provenance is still load-bearing for Art. 13.
- **[F] Replace one-tap "Marcar como revisado" with structured acknowledgement form.** Required: reason text (free-text, persisted to `audit_log.payload_after.reason`). Optional: comment. Auto-captured: actor, timestamp, upstream `correction_id`. Submit CTA: `Confirmar reconciliación` (primary `--accent`); secondary: `Escalar a Owner`.
- **[F] Owner co-sign gate for material impact.** When the cost delta (or quantity delta, or supplier change) exceeds an org-configured threshold (default: > 100 € OR > 5 % unit cost shift), the `Confirmar` CTA disables and shows `Requiere co-firma del Owner · pedir aprobación →`. Manager triggers an in-app notification + audit_log row; Owner clears from same surface.
- **[F] Add `Revertir a estado anterior` secondary action.** Per Art. 14 §4(d) — the operator must be able to override/reverse the AI's effect. Reversion writes its own audit row, never silently undoes the upstream correction.

### Phase 3 — bulk + history (1 sprint)

- **[F] Bulk select + bulk clear.** Checkbox per row, header checkbox for select-all-in-view, shared reason field for the batch. Audit_log writes one envelope per row but with shared `batch_id`. Limit batch to 25 rows.
- **[F] Aging sort default.** Sort by `flaggedAt ASC` (oldest first), not by aggregate type. Add quick-sort chips: `Más antiguos · Más recientes · Mayor impacto coste`.
- **[I] Add "Recién revisados" strip below the queue.** Last 10 cleared items in the last 7 days, with the operator who cleared + reason summary. Visible trace that the queue is *being worked*, not abandoned.
- **[I] Add "Esta semana" rollup card above the queue.** `N cleared · M pendientes · X € de impacto reconciliado`. Owner-facing supervision-evidence surface.
- **[F] Keyboard shortcuts.** `j` / `k` walk rows, `c` open clear form, `↵` confirm clear, `b` toggle bulk-select. `<kbd>` legend in a footer strip. Parity with j12.
- **[F] Demo-data toggle on empty state.** Per cross-cutting recommendation L2-4 — "Ver con datos de ejemplo" shows what a populated queue looks like. Sales-demo unblocker.

### Phase 4 — accessibility + polish

- **[F] `aria-live="polite"` on the list when the filter changes** ("Mostrando 0 elementos en la categoría Lotes").
- **[F] `aria-busy` on the list during fetch.**
- **[F] Move focus to the first row after filter change** (or to the empty-state heading if no rows).
- **[F] Skeleton screen reader equivalent** ("Cargando elementos de la cola…").
- **[F] Toast focus management.** Currently the toast appears with `role="alert"` but focus stays on the cleared row (which has unmounted). Move focus to either the next row or the chip filter.
- **[F] 48 px touch targets.** Row buttons currently `py-2` (~36 px) — bump to `py-3` minimum (44 px) on `pointer: coarse`.
- **[F] `:focus-visible` 3 px `--accent` ring** on chips, rows, and detail-pane CTAs (DESIGN.md §4 component states).

## Verdict

**The surface ships the database concept (`requires_review` boolean) with zero of the design scaffolding (severity, aging, diff, reason, Owner co-sign, history, bulk, multi-venue, AI provenance) that would make it a usable EU AI Act Art. 14 oversight surface.** v2 (PRs #193–200) added the empty-state copy `Bandeja al día.` and the intro paragraph; otherwise the surface is materially unchanged from v1. The collision with `Foto-ingestión`'s H1 is unresolved; the dashed-border anti-pattern persists; the metadata-only detail pane is still where the diff should be.

The right move is **(a) write `j13.md` first**, **(b) hide the tab from top-nav** until the queue has content, and **(c) re-implement against the spec** with the diff pane + acknowledgement form + Owner co-sign threshold + bulk select. Until those land, the tab actively damages the "AI-first with visible HITL" positioning by demonstrating the opposite — an empty box with a green button.
