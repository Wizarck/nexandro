---
title: UX/UI Roundtable Audit — 2026-05-18
status: canonical
last-updated: 2026-05-18
parent: docs/
trigger: Master review — "parece todo hecho y usado por una maquina, no por los usuarios"
method: |
  Playwright walk → 27 screenshots (9 routes × 3 viewports: desktop 1440×900,
  iPad Pro landscape, iPhone 14) → 9 parallel general-purpose subagents, one
  per tab, each grounded in personas-jtbd.md + DESIGN.md + the relevant
  docs/ux/j*.md spec. Each agent ran a roundtable with 7 personas
  (UX/UI · PM · Software Architect + 4 tab-specific personas) producing
  severity-tagged flags + suggested concrete changes.
related:
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/ux/j6.md (Recall)
  - docs/ux/j9.md (Compliance export)
  - docs/ux/j10.md (HACCP)
  - docs/ux/j12.md (Photo-ingest review)
---

# UX/UI Roundtable Audit — 2026-05-18

Master directive (verbatim): _"con playwright revises tab por tab, evalues el
resultado con un roundtable de UX, product manager, arquitecto de software,
especialista en hosteleria, owner de negocio, auditor y cualquier otro user
persona valido para cada una de las tabs y me traigas esos resultados aqui,
por que veo muchisimos flags de UX/UI y diseño en general, vamos a tener que
repasar la Ui enormemente y hacer un lavado de cara profundo para que sea
amigable esto, parece todo hecho y usado por una maquina, no por los usuarios,
se supone que teniamos users, jtbd, journeys, etc y mil cosas definidas para
que esto estuviera correcto"_

---

## Executive synthesis

### 🩸 Diagnosis (1 sentence)

**Frontend está construido por backend.** Cada tab implementa el data layer +
un picker/form mínimo y omite las regiones que daban personalidad y guía al
usuario (status, severidad, progreso, citas, CTAs, drill-down, próximo paso).
Los `docs/ux/j*.md` que escribimos siguen siendo válidos — sólo no se completaron.

### 🔴 Patrones que aparecen en todos los tabs

| # | Patrón | Tabs afectados | Severidad |
|---|---|---|---|
| 1 | Mezcla EN/ES (`Owner dashboard`, `AI Observability`, `Cooling curve`, `Hot-hold`, `scope`, `bundle`, `MenuItems`). Seed data + enums de DB filtrándose a la UI. | Dashboard, HACCP, AI obs, Foto-ingestión, Compliance, Auditoría | **BLOCKER** |
| 2 | Nav top horizontal de 8 sustantivos de ingeniería (`AI obs`, `Cola revisión`) sin agrupar. Owner no sabe a qué entra. | Todos | **BLOCKER** |
| 3 | Nav rompe en móvil (`AI obs`, `Foto-ingestión`, `Cola revisión` hacen wrap a 2 líneas u overflow del viewport). Persona Owner = mobile-primary. | Todos | **BLOCKER** |
| 4 | Empty states son placeholders, no estados diseñados. Caja vacía + 1 línea de texto, sin CTA, sin onboarding, sin "qué hago ahora". | Dashboard, Recall, AI obs, Cola revisión, Foto-ingestión, HACCP | **BLOCKER** |
| 5 | Dev-speak filtrándose (banner OTLP `localhost:4318`, `audit_log capítulo 0`, enums `RECIPE_ALLERGENS_OVERRIDE_CHANGED`, `Scope`, `bundle`, `runway`). | AI obs, Foto-ingestión, Auditoría, Compliance | **BLOCKER** |
| 6 | No hay "próxima acción". Cada tab te describe estado, ninguno te dice qué hacer con él. (Falla 4 de 5 patrones en `reference_m3_ux_deep_revision_patterns.md`.) | Todos | MAJOR |
| 7 | Vacío vertical masivo (~60-90% del viewport). Sensación de "wireframe que se les olvidó terminar". | Dashboard, Recall, HACCP, Configuración | MAJOR |
| 8 | Sin timestamps / freshness / "as-of" en datos. Auditor lo flagea, Owner no se fía. | Dashboard, HACCP, AI obs | MAJOR |
| 9 | Sin codificación de severidad (verde/ámbar/rojo). HACCP es el caso más crítico — Carmen no distingue CCP cumplido vs vencido. | HACCP, Cola revisión, Auditoría | MAJOR |
| 10 | Sin multi-venue context. Owner persona explícitamente "multi-venue group CEO" — sin selector ni columna de sede. | Dashboard, HACCP, AI obs, Cola revisión | MAJOR |
| 11 | Drift vs spec j*.md. Recall, HACCP, Foto-ingestión, Compliance shipped 10-30% de lo escrito en sus mocks. | Recall (j6), HACCP (j10), Foto-ing (j12), Compliance (j9) | **BLOCKER** |
| 12 | Sin accesibilidad básica (focus rings UA por defecto, no aria-live, no role=tablist, atajos sin <kbd>, no escape de hotkeys conflictivos). | Todos | MAJOR |

### 🚨 Top-5 "vergüenzas" individuales

1. **Recall NO usa `CrisisLayout`.** Surface más diferenciador del producto (j6) shipped como búsqueda con nav normal — sin banner rojo, sin countdown 4h EU 178/2002, sin CTA "Detener servicio + Generar dossier". Cumple ~10% del spec.
2. **Compliance export es invisible desde el nav.** Owner llega solo si conoce la URL `/compliance/export`. El momento de máximo valor (inspector aparece sin avisar) requiere adivinar.
3. **HACCP CCPs están en spanglish** (`Cooling curve · cámara entrante`). Carmen (Line Cook, low tech) no entiende qué es `Hot-hold`. Plus: 2/3 filas no muestran última lectura ni overdue. Cumple ~10% de j10.
4. **AI obs muestra `http://localhost:4318` y "stream-ean también ahí"** a Owner+Manager — leak de infra dev a UI de cliente. Title en inglés "AI Observability" sobre UI española.
5. **Configuración tiene labels SCREAMING ALL-CAPS** ("NOMBRE DEL NEGOCIO", "URL DEL SERVIDOR IPP") — violación directa de DESIGN.md §3 anti-reflex. Plus IPP URL / Timeout (ms) / API key expuestos a una Owner WhatsApp-level.

### 📋 Backlog priorizado

#### Fase 0 — Cross-cutting (1 sprint)

Tocan todos los tabs. Sin estos, cualquier per-tab work se queda corto.

- **L0-1** Locale enforcement: seed data + CCP labels + nav + títulos respetan `Organization.defaultLanguage`. CI lint: cualquier seed cuyo label no esté en el locale del org → falla build.
- **L0-2** Nav redesign: 3 categorías (`Negocio` · `Operaciones` · `Configuración`) + hamburguesa en mobile + bottom-tab en mobile-first surfaces.
- **L0-3** Eliminar dev-speak: OTLP banner → `Configuración → Avanzado → Telemetría` detrás de `NEXANDRO_DEV=true`. `audit_log/capítulo 0` → reemplazar con párrafo j12.md §1. Enums → human verbs.
- **L0-4** Selector de sede (venue switcher) en header.
- **L0-5** Empty-state pattern unificado: icono + headline + 1 línea + CTA primario + CTA secundario.
- **L0-6** Sticky save bar + last-saved-at timestamp.

#### Fase 1 — Cerrar spec gaps (2 sprints)

- **L1-1** Recall `CrisisLayout` + banner 4px paprika + countdown 4h + CTA sticky "Detener servicio + Generar dossier" + `Reportar sin lote conocido` link (j6.md §28, §34, §38, §40, §82)
- **L1-2** HACCP per-CCP status row con última lectura + due-by + overdue badge + severity color (j10.md §2)
- **L1-3** HACCP daily progress strip + sticky out-of-spec warning (j10.md §9)
- **L1-4** Foto-ingestión three-column anatomy (PhotoViewer + ExtractedFieldList + Firmar CTA) + ConfidenceBandBadge + AiProvenanceChip — **EU AI Act Art. 13 compliance dependiente** (j12.md §2-4, §8)
- **L1-5** Compliance: añadir tab "Expediente APPCC" al nav + CTA "Generar expediente APPCC" en HACCP dashboard + ruta "Inspector aquí ahora" pre-fill (j9.md §Trigger)
- **L1-6** Compliance: añadir `pt-PT` locale (Phase 1 brand commitment), diseñar two-tier country→region picker (j9.md §3)
- **L1-7** Auditoría: render real table (últimos 50 default), filtros → drawer, drill-down `aggregate_id`/`correlation_id`/`actor` + cadena hash visible + diff before/after
- **L1-8** Dashboard real: header KPIs (ventas · coste · margen € · margen % vs sem. anterior) + `MenuItemRanker` con top-5/bottom-5 cards + menu-engineering quadrant (DESIGN.md §4)

#### Fase 2 — Onboarding + Settings IA (1 sprint)

- **L2-1** Settings shell: left-nav [Negocio · Sedes · Usuarios y permisos · Facturación · Integraciones · Etiquetas · Privacidad y datos · Auditoría]
- **L2-2** Renombrar nav "Configuración" → "Etiquetas" interim hasta que el shell exista
- **L2-3** Onboarding wizard de 5 pasos cableado (personas-jtbd.md §3): Org → Location → Taxonomy → Admin → First Ingredient
- **L2-4** Demo-data toggle ("Ver con datos de ejemplo") en empty states de Dashboard / Auditoría / AI obs / HACCP
- **L2-5** Fields legales del negocio (CIF/NIF/VAT, licencia, dirección fiscal vs operativa)

#### Fase 3 — Compliance hardening + Polish (continuo)

- **L3-1** GDPR/RGPD surfaces: DPO contact, retención, export/delete-org, audit log, 2FA, API keys. Blocker EU B2B.
- **L3-2** All-caps body labels → sentence case en Configuración (DESIGN.md §3 anti-reflex)
- **L3-3** ✅ Subir logo es file upload, no URL (DONE — PR #190+#191)
- **L3-4** Focus rings token-bound (3 px `--accent`) en todos los componentes
- **L3-5** Severity tokens (`--success` / `--warn-bg` / `--destructive`) aplicados a HACCP rows, Cola revisión, Auditoría
- **L3-6** Cadena hash visible como chip "✓ Verificado" por row en Auditoría + banner "Cadena íntegra desde…"
- **L3-7** Signed exports (PDF con SHA + JSON Lines con prev_hash/curr_hash); CSV pasa a secundario
- **L3-8** Drill-down en todas las KPI cards de AI obs → trace / span / capacidad concreta

### 💡 Insight estratégico

Los `docs/ux/j*.md` que escribimos son **buenos**. j6 (Recall) sobre todo es de manual — `CrisisLayout`, countdown legal, paprika rule, sticky CTA. El problema no es discovery — es **implementation discipline**:

- Cada slice cerró cuando el backend funcionaba + render mínimo pasaba el typecheck.
- Las "regiones" de los mocks (status/severity/progreso/CTAs/drill-down) no entraron en el scope del slice → quedaron pendientes → nunca volvieron.
- No hay gate "render-vs-mock visual diff" en CI (memoria `feedback_ux_mock_self_review.md` lo flageaba ya).

**Recomendación operativa:**

1. Antes de declarar "merge ready" un slice con UI, **screenshot headless contra el j*.md correspondiente + visual diff manual** (ya está en ai-playbook §17.1, no se aplicó).
2. Convertir las "regiones" de cada j*.md en checklist de acceptance en lugar de prosa.
3. Las Fases 0-1 probablemente cierran el 80% del lavado de cara. Fase 2-3 es product/compliance work.

---

## Roundtable per tab (full agent outputs)

The 9 outputs below are verbatim from the parallel general-purpose subagents that
ran the audit. Each section is self-contained: spec-vs-reality (where a j*.md
exists), top flags, per-persona findings, verdict, suggested changes.

---

(Continúa en docs/audit-2026-05-18-ux-roundtable-detail.md — los 9 outputs íntegros viven allí para mantener este resumen ejecutivo navegable.)
