---
title: UX/UI Roundtable Audit — 2026-05-18 — Full per-tab outputs
status: canonical
last-updated: 2026-05-18
parent: docs/audit-2026-05-18-ux-roundtable.md
---

# UX/UI Roundtable Audit — 2026-05-18 — Full per-tab outputs

The 9 sections below are verbatim from the parallel general-purpose subagents.
Each was given: 3 screenshots (desktop / iPad Pro landscape / iPhone 14) +
`docs/personas-jtbd.md` + `docs/ux/DESIGN.md` + the relevant `docs/ux/j*.md`
spec, and ran a 7-persona roundtable (UX/UI · PM · Software Architect + 4
tab-specific personas) producing severity-tagged flags + suggested changes.

---

## 1. `/owner-dashboard` — Dashboard

### Tab summary
Owner's Sunday-night "did I make money?" surface — top+bottom-5 MenuItems ranking by 7-day margin, intended for mobile glance use by a low-tech General Manager. Success = Owner decides which dishes to pull from Monday's menu in under 30 seconds without reading docs.

### Top 5 cross-persona flags

- **BLOCKER — Empty state is a developer placeholder, not an onboarding surface.** "Add MenuItems to see the ranking." — no CTA button, no link, no sample preview. Violates DESIGN.md §7 + onboarding promise of personas-jtbd.md §3.5.
- **BLOCKER — Top nav is a flat list of 8 engineering nouns.** Owner persona has no mental model for "AI obs" or "Cola revisión". Violates Principle 8 ("Boring before clever") + §7 ("One term per concept").
- **MAJOR — Language is bilingual schizophrenia.** Nav in Spanish, page body in English ("Owner dashboard", "Add MenuItems"). Personas-jtbd.md §3.1 sets language at org level, immutable.
- **MAJOR — The page has one element and 1200px of empty cream below.** Restraint ≠ vacancy.
- **MAJOR — Zero affordance for the Sunday-night JTBD.** No date range, no compare-to-last-week, no venue switcher, no "what changed" delta.

### Suggested concrete changes (priority order)

1. Replace empty state with onboarding card: icon + headline "Aún no hay platos" + 2-line context + primary CTA "Añadir menú" + secondary "Ver con datos de ejemplo".
2. Localise the page — read `Organization.defaultLanguage`; remove "MenuItems" PascalCase in favour of "platos".
3. Replace top nav with 3-group structure: **Negocio** (Dashboard, Auditoría), **Operaciones** (HACCP, Recall, Cola revisión, Foto-ingestión), **Configuración** (Configuración, AI obs) — collapse to hamburger below `--bp-tablet`.
4. Add header strip: venue selector, date-range chips (7d · 30d · esta semana · este mes), last-sync timestamp + data-source badge.
5. Add top-of-page KPI row before ranking: Ventas · Coste · Margen € · Margen % vs semana anterior — 4 cells with delta arrows.
6. Render the `MenuItemRanker` per DESIGN.md §4: 5 winner + 5 loser cards with thumbnail, units sold, margen €, margen %, delta vs last week.
7. Add menu-engineering quadrant (Star · Plowhorse · Puzzle · Dog) as secondary tab.
8. Wire loss-leader cards to Journey 2 cost-spike audit.
9. Add `:focus-visible` 3px `--accent` ring; verify 48px touch-target on mobile.
10. Add export action (PDF report for gestor, CSV for spreadsheet).

### Verdict
**Redesign required** — renders a one-line developer placeholder against the Owner persona's most important JTBD, fails responsive on the persona's primary device, and contains zero of the components the design system (`MenuItemRanker`, `MarginPanel`) was built to support.

---

## 2. `/owner-settings` — Configuración

### Tab summary
Owner-only org settings page that today exposes only label-printing config. Success metric: a non-technical Owner completes one-time setup in <5 min on mobile without calling support.

### Top 5 cross-persona flags

- **BLOCKER — Identity mismatch:** Nav says "Configuración", H1 says "Configuración de etiquetas". Owner clicks expecting users/locations/billing and lands in printer form.
- **BLOCKER — IPP/CUPS/URL/API key/Timeout (ms) exposed by default** to "low tech comfort, uses WhatsApp" Owner. Violates DESIGN.md §1.1 + persona §1.1.
- **MAJOR — No empty/help/onboarding state.** Naked form with zero placeholder examples, zero "Skip for now". Contradicts personas-jtbd §3 wizard promise.
- **MAJOR — Form is unbroken vertical wall (~1500px tall on desktop with ~70% whitespace right of the form).** Violates DESIGN.md §5.
- **MAJOR — Mobile nav broken** (overflow tabs clip into "Configuración" tab text). On Owner's primary device, the chrome is unusable.

### Suggested concrete changes (priority order)

1. Rename nav entry "Configuración" → "Etiquetas" (or scope under parent) until the broader settings surface exists.
2. Add a real Settings shell: left-nav [Negocio · Sedes · Usuarios y permisos · Facturación · Integraciones · Etiquetas · Privacidad y datos · Auditoría]. Move today's form into "Etiquetas".
3. Split "Etiquetas" into Basic (default) and Advanced (collapsed). Basic = page size + printer type + test print. Advanced = IPP URL, queue, timeout, API key.
4. Fix the all-caps labels (DESIGN.md §3 violation) and add placeholders + help text + required markers + per-field examples.
5. Fix mobile nav — clipped tabs over the H1 is P0.
6. Sticky save bar at bottom with last-saved-at timestamp.
7. Add Org identity fields (CIF/NIF/VAT, fiscal address vs operational, base currency, language, timezone).
8. Convert logo URL to upload component with org-scoped storage. ✅ DONE in PR #190/#191.
9. Add empty-state for first-time Owner: "Bienvenida. Vamos a configurar las etiquetas en 3 pasos · Estimado: 3 min · Saltar por ahora".
10. File Compliance ticket for GDPR/RGPD surfaces (DPO, retention, export/delete-org, audit log, 2FA, API keys).

### Verdict
SQL admin tool with a stylesheet — forces a non-technical Owner to read engineer vocabulary on a broken-on-mobile chrome, while silently absent are 90% of the settings the Owner role and personas-jtbd.md promise.

---

## 3. `/audit-log` — Auditoría

### Tab summary
A bare filter form sitting above a dashed empty-state box — there is literally no table, no row, no actor, no timestamp on screen. For a tab whose primary user is an EU food-safety inspector holding a clipboard, this is a compliance liability, not a forensic trail.

### Top 5 cross-persona flags

1. **BLOCKER — There is no table.** The "log" is a filter form. Reader cannot scan recent activity without first guessing filters.
2. **BLOCKER — `SCREAMING_SNAKE_CASE` event keys leak the database schema.** `RECIPE_ALLERGENS_OVERRIDE_CHANGED` is an enum constant, not human copy.
3. **BLOCKER — No integrity proof anywhere.** No hash chain visible, no signature, no "verified" banner. EU 1169/2011 + GDPR Art. 30 + RD 191/2011 inspections demand tamper-evidence.
4. **MAJOR — Empty default state is a dead-end.** "No hay eventos para los filtros aplicados" with no filters applied is misleading.
5. **MAJOR — Export CSV is the only export.** Lawyers and inspectors need signed PDF and JSON-with-hash; CSV is unsigned, mutable, useless as evidence.

### Suggested concrete changes (priority order)

1. Ship a default table — last 50 events on load, newest first. Columns: `When` (UTC + local) · `Actor` (user + role chip) · `Aggregate` (type + linked ID) · `Action` (human verb, not enum) · `Diff` (before→after summary) · `Hash ✓`. Filters become a collapsible drawer.
2. Translate enums to human copy. `RECIPE_ALLERGENS_OVERRIDE_CHANGED` → "Alérgenos de receta · sobrescritos". Group into 3 categories: Operaciones / IA / Forense.
3. Add `aggregate_id`, `correlation_id`, `actor (user)` filters + quick-preset date ranges (Hoy / 7d / 30d / Personalizado) + Saved views.
4. Surface the hash chain. Per-row green tick "Verificado" with hover showing SHA. Page-level "Cadena íntegra desde 2024-01-01 (1 234 567 eventos)" banner.
5. Add signed exports. PDF with embedded chain summary + signature; JSON Lines with `prev_hash`/`curr_hash`; preflight count with async-job-by-email above 5k rows. Demote raw CSV.
6. Row drawer with rendered diff. Click any row → sidesheet with before/after JSON rendered as key-level diff.
7. Deep links from other tabs. Recall, HACCP, Foto-ingestión, AI obs — every "view trail" affordance points to `/audit-log?correlation_id=…` pre-filtered.
8. Persona-shape the top of the page. Owner default: "Anomalías de los últimos 7 días". Manager default: full table.
9. Retention + legal-hold UI. "Retención: 7 años · Próxima purga: ninguna · Legal hold: 0" strip above the table.
10. Fix the chrome. Replace native `<fieldset>`, replace native date inputs, ensure 48px touch targets, fix mobile nav wrap.

### Verdict
This tab is unfit for purpose: the PRIMARY USER (an EU food-safety inspector) cannot see a single audit row, an actor, a timestamp, or an integrity proof — so the surface is, today, a compliance liability rather than the forensic trail it claims to be.

---

## 4. `/ai-obs/dashboard` — AI obs

### Tab summary
Nine cards of zero-state telemetry under an English title in a Spanish UI, with no narrative, no thresholds tied to euros, and no "what should I do next" affordance. Every cost-related widget says €0 and every list says "Sin actividad", yet nothing tells the operator that empty state is healthy or alarming.

### Top 5 cross-persona flags

1. **[CRITICAL] English title in Spanish chrome.** "AI Observability" violates DESIGN.md §1.8.
2. **[CRITICAL] OTLP Integration banner is developer chrome leaking into user UI.** `http://localhost:4318`, `gen_ai.*`, "Cambiar endpoint" — dev/ops surface that does not belong on an Owner/Manager screen + security smell (URL disclosure).
3. **[CRITICAL] No business decision is enabled.** Nine widgets, zero "next action". All zero-states are descriptive, none are prescriptive.
4. **[HIGH] Information architecture is engineer-shaped, not operator-shaped.** "Coste por capacidad / modelo / tag", "Dependencia AI", "Runway" — SRE/MLOps idioms.
5. **[HIGH] Tab gets default access but no qualification.** Nothing tells them *why they should care* on first visit.

### Suggested concrete changes (priority order)

1. Translate title → "Coste y salud de la IA" (or "IA: gasto y errores").
2. Remove the OTLP Integration banner. Move to `Configuración → Avanzado → Telemetría` behind a dev flag.
3. Promote budget setup to a dismissible banner at the top until configured: "Configura un presupuesto mensual para activar alertas y runway."
4. Rewrite sub-title to value sentence: "Cuánto te cuesta la IA este mes y si está fallando."
5. Collapse 3-column hero into 1 dominant card (Gasto vs Presupuesto with delta and runway inside) + 2 secondary (Error rate, Top falla actual).
6. Make widgets clickable — Coste por modelo → list of calls; Top fallos → trace/auditoría link.
7. Add glossary tooltip on every engineer-term.
8. Add €/unit-of-work ("0,003 € por foto procesada · 0,12 € por receta generada").
9. Replace 6× "Refrescar" with one global refresh + auto-poll (30s) with pause control.
10. Reorder for mobile (Owner's primary surface): Gasto → Error rate → Top fallo → rest collapsed.
11. Hide tab from MANAGER role by default; surface only to OWNER unless `ai.cost.manager_visible=true`.
12. Add compliance strip: "Modelos: Claude 4.7 (EU-Frankfurt), GPT-4.6 (EU-Ireland) · Retención telemetría: 90 días · Ver Auditoría →".
13. Heatmap copy must be conditional: only show "Patrón típico…" when there's data.
14. Add "vs mes pasado" delta on Gasto card.

### Verdict
Engineer-shipped telemetry wrapped in operator chrome — it observes the system but does not serve the persona, and the OTLP banner is the loudest evidence that no Owner was in the room when it was designed.

---

## 5. `/recall/investigate` — Recall

### Tab summary
Crisis-mode incident search surface where an Owner/Manager types a lot/supplier/ingredient/symptom to trace contamination across the audit trail. Reality: a single autofocused search box, an empty-state hint, and the standard top-nav looming above it — a search bar pretending to be a recall tool.

### Spec-vs-reality (j6.md compliance)

- **§28, §82 — "no top nav, dedicated `CrisisLayout.tsx`" → VIOLATED.** Screenshot shows standard top-nav across all viewports.
- **§34 — Crisis banner (4px paprika rule + `Investigación de incidente · 02:14 CEST · ventana legal 04:00` countdown) → ABSENT.** Zero red rule. Zero countdown clock. Zero EU 178/2002 timer.
- **§35 — Single autofocus search field with placeholder `pescado crudo Algorta esta semana` → PARTIALLY MET.** Field exists but placeholder is mechanical `Lote, proveedor, ingrediente, síntoma…`.
- **§36 — 8 candidate lots ranked by recency + symptom-match → CANNOT VERIFY (empty state only).**
- **§38 — Sticky bottom CTA `Detener servicio + Generar dossier`, 64px tall, paprika bg → ABSENT.**
- **§34 — 56px touch target on search field → FAILS** on desktop/tablet (looks ~38–40px).
- **§81 — Dark mode "honoured at 02:00" → NOT VERIFIABLE but unlikely.**

### Top 5 cross-persona flags

1. **No CTA, no escalation path, no dossier dispatch.** [BLOCKER] FR17/FR18/FR19/FR20 are entirely unrepresented.
2. **No 4-hour EU 178/2002 countdown.** [BLOCKER — regulatory] j6.md §34, §67.
3. **Standard top-nav present.** [HIGH] Direct violation of j6.md §28, §64, §82.
4. **Empty state is the only state shown** — no recent incidents, no demo, no quick-fills. [HIGH]
5. **Vast empty canvas (~85% of viewport).** [HIGH] Master's complaint — "hecho por una máquina" lands here exactly.

### Suggested concrete changes (priority order)

1. **[P0]** Mount `/recall/*` on `CrisisLayout.tsx` and strip the top-nav per j6.md §28, §82.
2. **[P0]** Add the crisis banner: 4px paprika top rule + centred eyebrow `Investigación de incidente · {HH:MM} CEST · ventana legal {countdown}` with live tabular-nums countdown.
3. **[P0]** Build the sticky bottom CTA `Detener servicio + Generar dossier`, 64px tall, `--destructive` bg, full-viewport width minus 24px gutter.
4. **[P0]** Add `Reportar sin lote conocido` ghost link under the empty-state hint.
5. **[P1]** Populate result region with last 5 open/recent investigations as fallback list when search is empty.
6. **[P1]** Replace placeholder `Lote, proveedor, ingrediente, síntoma…` with the spec example `pescado crudo Algorta esta semana`.
7. **[P1]** Add footer eyebrow `Reg. (CE) 178/2002 art. 19 · plazo 4 h` on every state.
8. **[P1]** Fix focus ring — replace UA orange with `--accent` (aged turquoise).
9. **[P2]** Force min-touch-target 56px on search field, 48px on candidate rows.
10. **[P2]** Wire `prefers-color-scheme: dark` (j6.md §81).
11. **[P2]** Surface debounce + result-cap eyebrows: `buscando…` (200ms after keystroke), `Mostrando 8 de N coincidencias`.
12. **[P2]** Add `Incidentes abiertos · N` chip in the crisis banner.

### Verdict
What shipped is the empty-state of j6.md's §40 footnote rendered as the entire surface — would fail a regulator audit, a sales demo, and a real 02:00 incident in equal measure.

---

## 6. `/haccp/record` — HACCP

### Tab summary
A bare, undifferentiated list of 3 CCP rows on a beige page — no severity, no overdue, no due-by, no input flow visible from the index. The implementation is the j10 spec's *picker step alone*, with steps 1–9 amputated and no kitchen affordances surviving the cut.

### Spec-vs-reality (j10.md compliance)

- **j10 §2 picker rows MUST show "name + last reading + due-by countdown".** Reality: only row 1 shows last reading; rows 2 & 3 show nothing.
- **j10 §9 sticky out-of-spec warning, §1 eyebrow with FSMS reference, §8 RecentReadingsStrip, §4 live spec readback** — all absent.
- **j10 "Touch target 64px on primary CTA, 56px on input"** — no primary CTA exists; on mobile rows shrink and labels wrap to multi-line.
- **j10 §1 Fraunces wink** — H1 OK but CCP labels show **zero severity colour, zero overdue glyph, zero in/out-of-spec icon**.
- **j10 §Trigger: "those overdue carry a warning eyebrow"** — no concept of overdue at all.

### Top 5 cross-persona flags

1. **🔴 P0 — Mixed-language CCP labels** ("Cooling curve · cámara entrante", "Hot-hold ensalada", "Cleaning · pase pescado"). PRIMARY persona has low tech comfort.
2. **🔴 P0 — No status whatsoever per CCP.** No "due in 2h", no "overdue 51h", no "✓ done".
3. **🔴 P0 — No visible affordance the row is tappable.** No chevron, no "Tap to log" CTA, no hover/press hint.
4. **🟠 P1 — The page is 90% empty cream.** Wall-mounted tablet at 7am rush should show today's plan.
5. **🟠 P1 — Mobile breaks the nav.**

### Suggested concrete changes (priority order)

1. **🔴 P0** Fix mixed-language CCP labels. Re-translate seed; CI lint on org-locale mismatch.
2. **🔴 P0** Render per-CCP status row with j10 §2 contract: `name · última hace Xh: 1.5 °C ✓` or `· vencido hace 51h ⚠` or `· nunca leído`. Use `--success` / `--destructive` / `--mute` per state. 2px left-edge severity rule on destructive rows.
3. **🔴 P0** Make tap affordance explicit. Right-aligned chevron + "Registrar →" link; press-state `--surface-2`; `:focus-visible` ring. 64px row height on tablet landscape; 56px min on mobile.
4. **🔴 P0** Surface daily progress strip above the picker: `5 / 8 lecturas de hoy · 2 vencidas · 1 fuera de rango sin acción`.
5. **🔴 P0** Implement j10 §9 sticky warning for prior-out-of-spec-without-corrective.
6. **🟠 P1** Add timestamp to "Última" line: `Última hace 2h 15m · 1.5 °C · Carmen`.
7. **🟠 P1** Fix mobile nav overflow.
8. **🟠 P1** Add FSMS version eyebrow above the picker.
9. **🟠 P1** Add venue + shift context when org has >1 location.
10. **🟡 P2** Replace H1 + subhead with H1 + status strip on wall-tablet variant.
11. **🟡 P2** Add empty-state / overflow handling (group by category when CCP count > 8).
12. **🟡 P2** Self-render-and-audit before next review (per ai-playbook §17.1).

### Verdict
Implements ~10% of j10.md — the bare picker stripped of every status, severity, language consistency, affordance and safety signal — and so transmits exactly Master's diagnosis: "made and used by a machine, not by users".

---

## 7. `/photo-ingest/review` — Foto-ingestión

### Tab summary
Empty queue surface that ships zero of the j12.md anatomy (no PhotoViewer, no ExtractedFieldList, no ConfidenceBandBadge, no AiProvenanceChip). What is visible looks like an unstyled NestJS demo: two identical empty-state boxes, a dev-leak transparency banner, and four chips with no counts.

### Spec-vs-reality (j12.md compliance)

- **Banner copy is wrong.** j12 §1 mandates operator-trust paragraph ("nexandro pide tu revisión humana sólo cuando … 60%–85% … iron-rule HITL del EU AI Act"). Reality ships backend-architect sentence about `audit_log` as "capítulo 0" of an "expediente".
- **Tabs are wrong set.** j12 §9 specifies three chips: `Mis revisiones`, `Todas`, `Rechazadas`. Reality adds a fourth `Firmadas` and none carry counts.
- **No upload affordance on desktop above the fold.**
- **Missing entire right column.** j12 mandates PhotoViewer + ExtractedFieldList + AiProvenanceChip + `Firmar ingestión` CTA. Reality is a single-column nothing.
- **Hotkey legend present, but no visible affordances they map to.**

### Top 5 cross-persona flags

1. **Dev-speak banner ("audit_log sin editar como capítulo 0")** — leaks implementation language into operator UI. (HIGH)
2. **Two redundant "No hay elementos pendientes de revisión" messages side-by-side.** (HIGH)
3. **No visible upload affordance if queue has items.** (HIGH)
4. **Zero confidence-band education on the empty state** — EU AI Act HITL principle is supposed to be load-bearing copy. (HIGH)
5. **Chips have no counts and no scope hints.** (MED)

### Suggested concrete changes (priority order)

1. Replace banner copy. Drop `audit_log / capítulo 0`. Paste j12.md §1 verbatim paragraph about 60%–85% band + EU AI Act HITL.
2. Collapse double empty state. One full-width empty state with icon, j12 §1 transparency text, `+ Subir foto` CTA inside.
3. Add empty-state preview of three-column anatomy. Greyed placeholder for PhotoViewer + ExtractedFieldList + Firmar CTA.
4. Add confidence-band legend strip below chip group: `🟢 ≥85% auto-fill · 🟡 60–85% revisar · 🔴 <60% manual`.
5. Add counts to chips: `Mis revisiones (0) · Todas (0) · Rechazadas · Firmadas (esta semana)`.
6. Move `+ Subir foto` to persistent header position. Split into `Subir factura` / `Subir producto` to pre-classify.
7. Drop `Firmadas` chip or scope it (j12.md specifies only three chips).
8. Add Staff feedback surface in Recall / Cook home: "Mis subidas · 0 en revisión · 0 firmadas · 0 rechazadas".
9. Make hotkey legend keyboard-discoverable (`?` opens overlay; `<kbd>` semantics; remappable). Add visible focus ring.
10. Replace "0 elementos" with "Cola vacía · todo al día" when count is 0.

### Verdict
This surface ships the navigation skeleton and nothing else — Carmen would close the tab in under 10 seconds and the cook gets zero feedback that his upload was even seen.

---

## 8. `/m3/review-queue` — Cola revisión

### Tab summary
A near-empty screen with a header, three filter chips, two dashed-bordered empty-state boxes, and a counter ("0 en cola · 0 lotes · 0 recepciones"). Zero visible affordances explain *what triggered an entry*, *what "clearing" actually does to the audit trail*, or *why this is a separate queue from `Foto-ingestión`*.

### Top 5 cross-persona flags

1. **[CRITICAL] The label "Cola revisión" does not name what is being reviewed.** Two adjacent nav entries (`Foto-ingestión` and `Cola revisión`) both imply HITL review.
2. **[CRITICAL] Empty state is a dead end.** No link to audit log, no example, no link to related Foto-ingestión flow.
3. **[CRITICAL] "Marca como revisado" verb mutates audit history with no provenance scaffolding visible.** No: who flagged, when, what changed, the diff, who can clear, what gets written to the audit trail.
4. **[HIGH] Two empty panels side-by-side waste the screen.**
5. **[HIGH] Mobile layout breaks the Owner persona's primary device.**

### Suggested concrete changes (priority order)

1. Rename the tab. "Cola revisión" → "Cambios retroactivos" (or "Reconciliación").
2. Add nav badge with count + oldest-age. Make queue visible from anywhere when non-empty. Hide tab entirely when empty AND user has never had a flag.
3. Redesign empty state as explainer. One panel (not two), with: what triggers entry, sample row mock, link to last cleared item, link to `Auditoría`.
4. Promote diff as primary content of every row. Before/after classification, downstream artefact (Lot/GR), cost delta with `tabular-nums`, link to upstream `correction_id`.
5. Replace "Marca como revisado" with structured acknowledgement form. Required: reason text, optional comment, auto-captured actor/timestamp/upstream-id.
6. Add Owner-gate for material-impact clears (cost delta > threshold → require Owner co-sign).
7. Add multi-venue lens. Venue column, venue filter.
8. Add aging + bulk select. Sort default by oldest-flagged. Bulk-clear with one shared reason field.
9. Fix mobile nav.
10. Remove dashed borders. Replace with `--border` 1px solid; drop second panel when no row selected.

### Verdict
The screen is a route stub, not a product surface — it ships the database concept ("downstream row flagged for review") without any of the human scaffolding that would let either persona trust or use it.

---

## 9. `/compliance/export` — Compliance export

### Tab summary
A single-page form to generate an APPCC bundle (range + locale + scope + optional email → PDF/CSV/manifest ZIP). The execution is correct against the j9 spec on the happy path, but it is invisible from the nav, untested for the urgency case it exists to serve, and shipped without three of j9's eight regions (progress strip, download row, archive).

### Discoverability (CRITICAL)

**Severity: P0 / blocker for the entire feature.**

The desktop top nav reads: `Dashboard · Configuración · Auditoría · AI obs · Recall · HACCP · Foto-ingestión · Cola revisión`. There is **no `Compliance`, no `Exportación`, no `APPCC`, no `Expediente`, no `Bundle`**. Per j9.md §2 it should be in the top nav. Owner persona will NEVER guess `/compliance/export`. When the inspector knocks, Iker will open `HACCP` (closest semantic neighbour), find no export button, and panic.

### Spec-vs-reality (j9.md compliance)

- **Region 1 (transparency banner)**: present and verbatim — passes.
- **Region 2 (date range + chips)**: present, defaults to "Últimos 90d" — passes.
- **Region 3 (locale chips)**: shows `es-ES / ca-ES / eu-ES / gl-ES` only. Spain-only autonomous communities. NO `pt-PT`, `en`, `fr`, `it`, `de`, `nl`. Direct contradiction with brand positioning Phase 1 ES+PT.
- **Region 4 (scope checkboxes)**: present, defaults match — passes.
- **Region 5 (recipient picker)**: collapsed, can't validate spec.
- **Regions 7/8/9 (progress strip · download row · past-bundles archive)**: NOT RENDERED.
- **j9 §2 (Trigger)**: spec text says "Iker opens `/compliance/export` from the top nav". Top nav has no such item.

### Top 5 cross-persona flags

1. **Invisible from nav** (P0).
2. **Locales = Spain autonomous communities only** (P0). Blocks Phase-1 PT, all of Phase 2–4.
3. **No urgency / no time-to-bundle signal** (P1).
4. **Integrity surface absent** (P1).
5. **Past bundles table is one line of text, not a table** (P1).

### Suggested concrete changes (priority order)

1. **[P0]** Add `Compliance` (or `Expediente APPCC`) to top nav, adjacent to `HACCP`. Surface "Generar expediente APPCC" CTA on HACCP dashboard.
2. **[P0]** Add `pt-PT` locale chip now; design country→region two-tier picker for IT/FR/DE/NL Phase 2-4.
3. **[P0]** Rename "Generar bundle de auditoría" → "Generar expediente APPCC para inspector". Kill all "bundle"/"Scope"/"footprint" English words.
4. **[P0]** Add "Inspector aquí ahora" one-tap path at top: button that pre-fills last 90d + es-ES + full scope, jumps straight to Generate with confirm modal.
5. **[P1]** Build & wire regions 7-9 (progress strip · download row · past-bundles archive) per j9 spec.
6. **[P1]** Expand email strip inline (not via `Configurar →` page-jump). Show 2 recipient names. Add ad-hoc recipient input.
7. **[P1]** Surface integrity primitives upfront in trust banner: "Recibirás un ZIP con PDF + CSV (UTF-8) + manifest firmado SHA-256; trazable por audit_log entry."
8. **[P1]** Async-mode warning when range > 90d: "Esta exportación se procesará en segundo plano; te avisaremos cuando esté lista."
9. **[P1]** Idempotency check on Generate: if same range+scope+locale generated in last N min → "Reusar el bundle de hace X min".
10. **[P2]** Mobile: sticky-bottom CTA + collapse scope rows by default.
11. **[P2]** Sample-bundle link in empty-state of "Bundles anteriores".
12. **[P2]** Locale-completeness badge per chip ("PT 80%") + linked roadmap for full coverage.
13. **[P2]** "Verificar integridad de un PDF descargado" utility.
14. **[P2]** Cold-storage retention copy near archive table per ADR-029.

### Verdict
The form is functionally faithful to j9's happy path but ships invisible from the nav, missing post-action regions, locked to Spain-only locales, and devoid of the urgency affordances the inspector-arrival job demands — exactly the *"made by a machine"* smell Master called out.

---

## Cross-reference

- Synthesis + executive backlog: [audit-2026-05-18-ux-roundtable.md](audit-2026-05-18-ux-roundtable.md)
- Personas + JTBD ground truth: [personas-jtbd.md](personas-jtbd.md)
- Design system: [ux/DESIGN.md](ux/DESIGN.md)
- Journey specs: [ux/j6.md](ux/j6.md) · [ux/j9.md](ux/j9.md) · [ux/j10.md](ux/j10.md) · [ux/j12.md](ux/j12.md)
- Screenshots used: `tmp/audit-screens/` (9 routes × 3 viewports, captured 2026-05-18)
