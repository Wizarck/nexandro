---
title: "Auditoría — Detail Audit v2 (post PR #193-200)"
status: canonical
last-updated: 2026-05-18
parent: docs/audit-2026-05-18-v2-roundtable.md
baseline: docs/audit-2026-05-18-ux-roundtable.md
shipped-since-v1:
  - "PR #196 — humanizeEventType.ts (~50 enum→ES labels + 8 EventCategory buckets)"
not-shipped-since-v1:
  - "L1-7 backlog (real table, filters drawer, drill-down, cadena hash, diff before/after)"
screenshots:
  - docs/audit-2026-05-18-v2-screenshots/07-auditoria-desktop.png
  - docs/audit-2026-05-18-v2-screenshots/07-auditoria-mobile.png
related:
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/audit-2026-05-18-ux-roundtable.md
---

# Auditoría — Detail Audit v2 (post-deploy 2026-05-18)

## 0. TL;DR

Lo que cambió en v2 frente a v1 baseline = **nada visible**. La función `humanizeEventType.ts`
que entró en PR #196 con ~50 traducciones ES + 8 categorías existe en código pero **no se
está aplicando a los checkboxes del filtro `Tipo de evento`**, que es la única zona donde un
usuario ve nombres de eventos en un viewport vacío (0 de 0 eventos). El resultado para Owner
Roberto y Carmen Inspectora es idéntico a la baseline: `RECIPE_ALLERGENS_OVERRIDE_CHANGED`
en monospace UPPER_SNAKE_CASE, sin agrupar por categoría, sin descripción humana.

El backlog L1-7 (tabla real + drawer de filtros + drill-down por aggregate_id /
correlation_id / actor + cadena hash visible + diff before/after) **no se ha tocado**.
La tabla sigue sin existir — sólo el placeholder "No hay eventos para los filtros aplicados".

**Auditoría cubre ~15-20% del spec L1-7** (sube de ~10% a ~15-20% porque el FTS box, el
date-range picker y el export CSV están presentes — pero sin tabla y sin humanización
visible, no es 30%).

---

## 1. Top-5 flags

| # | Severidad | Flag | Persona que lo dispara |
|---|---|---|---|
| 1 | **BLOCKER** | `humanizeEventType.ts` shipped en #196 pero **no se aplica a los labels de los checkboxes**. Owner sigue viendo `RECIPE_ALLERGENS_OVERRIDE_CHANGED` UPPER_SNAKE_CASE. El fix está hecho a nivel de utility pero no está cableado al `<label>` del FilterFieldset. | Owner Roberto, Carmen Inspectora, Forensic auditor |
| 2 | **BLOCKER** | **No hay tabla.** L1-7 explícitamente pide "render real table (últimos 50 default)". Sin seed data, sin server-side ejemplos, sin demo-data toggle, sin estado-loaded — el usuario que aterriza ve filtros + empty state y no entiende qué se supone que verá si aplica filtros. | Owner Roberto, PM, UX/UI |
| 3 | **BLOCKER** | **Sin agrupación por EventCategory.** PR #196 trae 8 buckets (`RECIPE`, `INGREDIENT`, `SUPPLIER`, `AGENT`, `AI_SUGGESTION`, `COST`, `OVERRIDE`, `SECURITY`?) pero el fieldset `Tipo de evento` los lista en un grid 3×4 plano sin agrupar. Owner busca "todo lo que toque alérgenos" y tiene que escanear 10 checkboxes idénticos. | Owner Roberto, PM |
| 4 | **BLOCKER** | **Cadena hash invisible.** L1-7 + L3-6 piden chip "✓ Verificado" por row + banner "Cadena íntegra desde…". No hay ni hash, ni indicador de integridad, ni link a "verify chain". Sin esto, la pantalla **no tiene valor legal**, sólo de búsqueda. | Forensic auditor, Lawyer |
| 5 | **MAJOR** | **Sin drill-down.** L1-7 pide pivot por `aggregate_id` / `correlation_id` / `actor`. No hay forma de decir "todos los eventos que tocaron esta receta" o "todo lo que hizo este actor en esta sesión". Sin tabla no se puede ni evaluar — pero el spec exige que cada celda relevante sea un link. | Forensic auditor, Lawyer, Owner Roberto |

Severidades secundarias (no top-5 pero registradas):

- **MAJOR** — Sin diff before/after. L1-7 lo pide; sin él no hay forma de saber qué cambió en un `RECIPE_INGREDIENT_UPDATED` sin abrir la receta.
- **MAJOR** — Sin contexto multi-sede (selector de venue ausente, igual que en v1).
- **MAJOR** — Sin "última actualización / freshness" (timestamp de la consulta).
- **MAJOR** — Filtros como `<fieldset>` con border negro 1px → look formulario administrativo años 90 (no DESIGN.md tokens).
- **MINOR** — Botón `Aplicar` no parece botón (sin border, sin background); `Reset` sí lo parece (borde + bg). Inconsistencia visual.
- **MINOR** — `Exportar CSV` (single button) pero L3-7 ya pide signed PDF + JSON Lines como primarios, CSV secundario.
- **MINOR** — Empty state es texto centrado en caja con borde dasheado — no usa el unified empty-state pattern de L0-5.

---

## 2. Roundtable per persona

### 2.1 Forensic auditor — *"¿Esto se sostiene en un juicio?"*

> **Veredicto: NO.**

Lo que esta pantalla **debería** dar a un auditor forense (interno o externo) es:

1. **Prueba de integridad de la cadena** (`prev_hash` + `curr_hash`, o al menos un sello
   "verificado hoy 14:23"). Hoy: invisible. El backend lo tiene (cadena hash es feature
   M3 cerrado, ADR-030), pero la UI no expone NADA. Para un auditor, una tabla sin chip
   de integridad es ofimática, no evidencia.
2. **Trazabilidad por correlation_id.** Cuando investiga "qué pasó cuando el agente
   IA aceptó esta sugerencia y cambió el precio del proveedor", necesita pivotar entre
   los 3-5 eventos de la misma transacción. Sin drill-down, tiene que filtrar a ojo por
   timestamp y rezar.
3. **Diff inmutable.** `RECIPE_ALLERGENS_OVERRIDE_CHANGED` no le sirve — necesita ver
   "antes: [gluten]" → "después: [gluten, lácteos]" con timestamps y actor.
4. **Export firmado.** CSV no se sostiene en juicio (mutable, sin firma). Necesita PDF
   sellado o JSON Lines con la cadena hash inline.

**Flag clave (severidad BLOCKER):** El feature backend de cadena hash (M3 ADR-030, fully
shipped) está sin exposición UI. Es la diferencia entre "tenemos audit log" y "tenemos
prueba forense". Hoy mismo el feature es invisible al usuario que más lo valora.

### 2.2 Owner Roberto — *"¿Cuándo abro esto yo?"*

> **Veredicto: nunca, hasta que algo vaya mal.**

Roberto (Dueño, low-tech, WhatsApp+IG+Excel) no abre Auditoría como rutina. La abre cuando:

- Recibe un email de Hacienda / inspector / cliente quejándose.
- Sospecha que un encargado modificó precios sin avisar.
- El AI agente sugirió algo y quiere verificar qué hizo.

En esos 3 escenarios:

1. **Hacienda / inspector** — necesita exportar un dossier firmado de un rango de
   fechas. Hoy: Exportar CSV (no firmado). **Falla.**
2. **Encargado modificó algo** — necesita filtrar por actor + ver qué cambió. Hoy:
   filtro de actor existe (dropdown "tipo de actor"), pero sin tabla y sin diff no
   puede investigar nada. **Falla.**
3. **Agente IA hizo algo raro** — necesita ver cadena completa: sugerencia → aprobación →
   cambio aplicado. Hoy: drill-down por correlation_id no existe. **Falla.**

**Adicional Owner-specific:** los nombres de evento en UPPER_SNAKE_CASE son intimidantes
para un Owner WhatsApp-level. `RECIPE_ALLERGENS_OVERRIDE_CHANGED` no le dice nada útil.
"Cambio en alérgenos de receta" sí.

### 2.3 UX/UI designer — *"Densidad, scannability, jerarquía"*

> **Veredicto: tres fallos estructurales.**

1. **Fieldsets HTML nativos** (border 1px black, legend en posición absoluta). Esto NO
   es DESIGN.md tokens — es CSS UA default. Da look formulario 1998. Debería ser una
   `Card` con título h3, padding generoso (32px), border `--border-subtle`.

2. **Checkbox grid plano sin agrupación.** 10 checkboxes en grid 3×4 todos al mismo
   nivel visual. Sin las 8 EventCategory de PR #196 expuestas, el usuario no puede
   "seleccionar todos los eventos de RECIPE de un click". Necesita un patrón de
   `CheckboxGroup` con headers por categoría + master checkbox.

3. **Layout vertical infinito.** Filtros + filtros + filtros + filtros + búsqueda + botones
   + empty state. Más de 800px de altura sólo para filtros. Debería ser **drawer lateral
   o top-bar colapsable** (es lo que L1-7 explícitamente pide: "filtros → drawer"). La
   tabla debería ocupar el 70% del viewport, no el 0%.

**Mobile específico:** mejor que v1 (todo stackeado, sin overflow), pero igual de
inservible — 10 checkboxes apilados verticalmente + 2 dropdowns + 2 date pickers +
search + 2 botones. Antes de que el usuario llegue a "Exportar CSV" ya hizo scroll de
1.5 viewports.

### 2.4 PM — *"L1-7 spec coverage"*

L1-7 verbatim del baseline: *"Auditoría: render real table (últimos 50 default), filtros
→ drawer, drill-down `aggregate_id`/`correlation_id`/`actor` + cadena hash visible +
diff before/after"*

| Sub-spec | Estado v1 | Estado v2 | Notas |
|---|---|---|---|
| Render real table (últimos 50 default) | ❌ | ❌ | Sin seed data, sin demo-data toggle, sin estado |
| Filtros → drawer | ❌ | ❌ | Sigue en layout vertical sin drawer |
| Drill-down `aggregate_id` | ❌ | ❌ | No hay tabla → no hay cells linkables |
| Drill-down `correlation_id` | ❌ | ❌ | Idem |
| Drill-down `actor` | ❌ | ❌ | Dropdown filter existe pero no es drill-down |
| Cadena hash visible | ❌ | ❌ | Feature backend listo, UI ausente |
| Diff before/after | ❌ | ❌ | No expuesto |
| **(bonus) humanización de labels** | ❌ | ❌ funcional / ✅ código | PR #196 trae la utility pero no la aplica al fieldset |
| **(bonus) agrupación EventCategory** | ❌ | ❌ funcional / ✅ código | Idem |

**Cobertura L1-7: 0/7 sub-items shipped + 2/2 bonuses están en código pero no cableados.**

Sumando lo que SÍ existe pre-L1-7 (filtros básicos por tipo + actor + ventana temporal +
FTS box + export CSV crudo + empty state genérico), Auditoría va en **~15-20% del spec
total**. La subida desde ~10% (v1) viene de tener PR #196 mergeado en código aunque no
visible.

### 2.5 Lawyer — *"Chain-of-custody quality"*

> **Veredicto: la cadena de custodia EXISTE en backend pero la UI no la materializa.**

Para que un audit log se sostenga como evidencia (GDPR Art. 5(1)(f) "integridad y
confidencialidad" + EU AI Act Art. 12 logging, + futura NIS2/eIDAS2 trust services), la
UI tiene que:

1. **Mostrar** que la cadena es íntegra (chip por row + banner global "cadena íntegra
   desde 2026-01-15 hasta hoy").
2. **Permitir verificar** la cadena (botón "Verificar integridad" que recalcule hashes y
   muestre OK/FAIL con timestamp).
3. **Exportar con firma** (PDF con sello tiempo + JSON Lines con prev/curr hash inline).
4. **Demostrar inmutabilidad** (no edit, no delete, evidencia de append-only).

Hoy, **0/4 de lo anterior está expuesto**. El feature backend (ADR-030) está listo y
mergeado desde M3. La diferencia entre "tenemos audit log" y "esto vale como evidencia
GDPR + AI Act" es exactamente esos 4 elementos UI.

**Severidad legal:** si Nexandro se vende a una panadería de tamaño SMB en España, esto
es importante. Si se vende a una cadena con DPO o se posiciona contra el eventual Claude
for SMB EU (per memoria `project_nexandro_positioning_vs_eventual_claude_eu.md`, el
"audit-as-feature" es uno de los 4 vectores de moat), **es indispensable**. Hoy el moat
está construido en backend y regalado en UI.

---

## 3. Suggested changes

Tag legend:

- `[V]` — **Visual only** (CSS, tokens, copy). No backend change.
- `[I]` — **Information architecture** (re-grouping, drill-down structure, new components, layout shift).
- `[F]` — **Feature** (requires backend or new API surface).

### 3.1 Quick wins (`[V]`, 1-2 días)

- `[V]` **Cablear `humanizeEventType.ts` al fieldset `Tipo de evento`.** PR #196 ya
  trae la función; solo falta `humanizeEventType(eventType)` en lugar de `{eventType}`
  como label del `<input type=checkbox>`. Esto baja BLOCKER #1 inmediato.
- `[V]` **Cambiar `<fieldset>` HTML nativos a `Card` con título h3 + padding DESIGN.md
  tokens.** Quita el look 1998 sin tocar la lógica.
- `[V]` **Botones consistentes** (`Aplicar` debe parecer botón; `Reset` y `Exportar CSV`
  deben parecer la misma familia visual con `--primary` vs `--secondary`).
- `[V]` **Copy del empty state**: en lugar de "No hay eventos para los filtros aplicados"
  → "Sin eventos en este rango. Prueba a ampliar la ventana temporal o ver con datos de
  ejemplo." + CTA "Ver datos de ejemplo".
- `[V]` **Renombrar labels técnicos** del campo `TIPO DE AGREGADO` / `TIPO DE ACTOR` →
  "¿Qué se cambió?" / "¿Quién lo cambió?" (Owner-friendly).

### 3.2 IA changes (`[I]`, 1 sprint)

- `[I]` **Agrupar `Tipo de evento` por EventCategory** (8 buckets de PR #196). Un
  `CheckboxGroup` colapsable por categoría con master-checkbox. Esto reduce los 10
  checkboxes planos a 8 grupos colapsados + "Select all in category".
- `[I]` **Mover filtros a drawer lateral** (L1-7 spec). La pantalla principal queda:
  header con "Eventos (últimos 50)" + chip "Cadena íntegra desde X" + botón "Filtros" +
  tabla a pantalla completa.
- `[I]` **Demo-data toggle** ("Ver con datos de ejemplo") en empty state global. L2-4
  del baseline. Sin esto, primera impresión de la pantalla es siempre "0 de 0 eventos".
- `[I]` **Layout responsivo**: en mobile, filtros van detrás de bottom-sheet, no
  stackeados arriba.

### 3.3 Feature work (`[F]`, 2 sprints)

- `[F]` **Render real table** (sub-spec L1-7 #1). 5 columnas mínimas: timestamp,
  Tipo (humanizado), Actor, Aggregate (link), chip "✓ Verificado". Densidad: 12 rows
  visibles a 1440×900 sin scroll.
- `[F]` **Drill-down**: cada cell de `aggregate_id` / `correlation_id` / `actor` es un
  link que filtra la tabla a "todos los eventos relacionados". Sub-spec L1-7 #3-5.
- `[F]` **Row expansion con diff before/after** (sub-spec L1-7 #7). Click en row →
  expandir inline con JSON diff coloreado (verde added, rojo removed). Usar
  `react-diff-viewer` o equivalente del stack.
- `[F]` **Chip "✓ Verificado" por row + banner "Cadena íntegra desde…"** (sub-spec L1-7
  #6 + L3-6). Color verde con icono lock. Tooltip al hover: `prev_hash` + `curr_hash`
  (truncados con copy-button).
- `[F]` **Botón "Verificar integridad ahora"** en header. Re-calcula hashes server-side,
  muestra OK/FAIL con timestamp + duración. Esto da poder forense visible.
- `[F]` **Export firmado** (L3-7). Reemplazar `Exportar CSV` por dropdown:
  - `📄 PDF firmado (recomendado para inspección)`
  - `🧾 JSON Lines (con cadena hash)`
  - `📊 CSV (sin firma, sólo análisis)`
- `[F]` **Multi-venue context**: añadir selector de sede en header (L0-4 cross-cutting).
- `[F]` **Freshness indicator**: "Última actualización: hace 5 s · auto-refresh cada 30 s"
  + botón refresh manual.

---

## 4. Veredicto final

Auditoría es **el caso de "feature backend campeón, surface UI ausente"** más claro de
toda la app. M3 ADR-030 + cadena hash + immutable append-only + 8 EventCategory + ~50
enum→ES translations son trabajo serio cerrado en código. Nada de ello es visible al
usuario que aterriza.

PR #196 es **necesario pero no suficiente** — añade la utility de humanización pero no
la cablea al sitio donde el usuario la ve (los labels del fieldset). Esto cuenta como
"merge-ready en código, no en UI" — exactamente el patrón que la memoria
`feedback_ux_mock_self_review.md` y `feedback_subagent_apply_typing_fix_cascade.md`
flagean: cerrar slices sin verificar render.

Con un sprint de cableo (`[V]` + `[I]` arriba) Auditoría pasaría a ~40% del spec L1-7.
Para llegar a 100% se necesitan los 7 items `[F]` arriba, ~2 sprints más + ADR-Sign para
exports firmados.

**Lo que NO se puede defender** es la situación actual: tener M3 ADR-030 cerrado en
backend y que un Owner abra Auditoría y vea sólo un formulario administrativo con
nombres en SCREAMING_SNAKE_CASE sin tabla. Es regalar el moat más diferenciador
(audit-as-feature, per memoria positioning vs eventual Claude SMB EU).
