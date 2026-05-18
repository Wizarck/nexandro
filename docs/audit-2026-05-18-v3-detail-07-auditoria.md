---
title: "Auditoría — Detail Audit v3 (post Sprint 1 deploy 2026-05-18)"
status: canonical
last-updated: 2026-05-18
parent: docs/audit-2026-05-18-v3-roundtable.md
baseline: docs/audit-2026-05-18-v2-detail-07-auditoria.md
shipped-since-v2:
  - "PR #203 B-1 — humanizeEventType wired to AuditLogFilters checkboxes (raw enum in title= for power users)"
  - "PR #206 A5 — AuditLogTable empty state migrated to EmptyStateCard with FileSearch icon + headline + body"
  - "PR #204 A1 — Fraunces serif on h1 Auditoría"
not-shipped-since-v2:
  - "B-3 — real demo seed data (deferred)"
  - "Per-row ✓ Verificado hash-chain chip"
  - "Render real table (últimos 50 default)"
  - "Filtros → drawer lateral"
  - "Drill-down aggregate_id / correlation_id / actor"
  - "Diff before/after en row expansion"
  - "Signed PDF + JSON Lines exports"
  - "EventCategory grouping (8 buckets de PR #196 sin colapsar en UI)"
screenshots:
  - docs/audit-2026-05-18-v3-screenshots/07-auditoria-desktop.png
  - docs/audit-2026-05-18-v3-screenshots/07-auditoria-mobile.png
related:
  - docs/personas-jtbd.md
  - docs/ux/DESIGN.md
  - docs/audit-2026-05-18-v2-detail-07-auditoria.md
  - docs/audit-2026-05-18-ux-roundtable.md
---

# Auditoría — Detail Audit v3 (post Sprint 1 deploy 2026-05-18)

## 0. TL;DR

Sprint 1 cierra **dos quick-wins visibles** sobre v2:

1. **B-1 humanización SÍ aterrizó.** Los checkboxes del filtro `Tipo de evento` ahora
   muestran *"Receta · alérgenos sobrescritos"*, *"Agente · acción ejecutada"*,
   *"IA · sugerencia aceptada"* en lugar del `RECIPE_ALLERGENS_OVERRIDE_CHANGED` /
   `AGENT_ACTION_EXECUTED` UPPER_SNAKE_CASE de v2. Lectura para Owner Roberto baja de
   "intimidante" a "comprensible en español". Quedan 4 labels sin traducir (`Recipe source
   override changed`, `Recipe ingredient updated`, `Supplier price updated`,
   `IA · sugerencia rechazada` parcial) que rompen la consistencia visual del bloque.

2. **A5 empty state SÍ aterrizó.** El placeholder dasheado de v2 fue reemplazado por un
   `EmptyStateCard` con icono `FileSearch` aged-turquoise + headline serif *"Sin eventos
   para estos filtros"* + body explicativo *"Prueba ampliando la ventana temporal o
   quitando filtros. La auditoría empieza a llenarse cuando alguien crea recetas, registra
   HACCP, despacha recalls, etc."* Esto sí es útil — explica QUÉ llenaría la tabla, no
   solo "no hay datos".

Lo que NO aterrizó: tabla real, drawer de filtros, drill-down por aggregate/correlation/actor,
**chip ✓ Verificado por row, banner cadena íntegra, diff before/after, exports firmados.**

**Cobertura L1-7: ~22-25%** (sube de ~15-20% v2). El delta viene SOLO de humanización
+ empty state. El backlog feature (`[F]` en v2 §3.3) sigue intacto.

---

## 1. Top-5 flags

| # | Severidad | Flag | Persona que lo dispara |
|---|---|---|---|
| 1 | **BLOCKER** | **Cadena hash invisible** (heredado de v2 #4, sin movimiento). L1-7 + L3-6 piden chip "✓ Verificado" por row + banner "Cadena íntegra desde…". Feature backend ADR-030 está mergeado desde M3 — la UI no expone nada. Sin esto la pantalla **no tiene valor legal**, solo de búsqueda. Es el moat "audit-as-feature" (memoria `project_nexandro_positioning_vs_eventual_claude_eu.md`) regalado. | Forensic auditor, Lawyer |
| 2 | **BLOCKER** | **No hay tabla** (heredado de v2 #2, sin movimiento). L1-7 explícitamente pide "render real table (últimos 50 default)". Sin seed data (B-3 deferred), sin server-side ejemplos, sin demo-data toggle, sin estado-loaded. Roberto aterriza tras un incidente del jueves y ve formulario + empty state — no puede empezar la investigación forense en ningún lado. | Owner Roberto post-incidente, PM, UX/UI |
| 3 | **BLOCKER** | **Humanización incompleta — 4 enums siguen en inglés/UPPER_SNAKE.** PR #203 B-1 traduce 6 de 10 labels visibles pero `Recipe source override changed`, `Recipe ingredient updated`, `Supplier price updated` y un cuarto quedan en inglés camelcase. El mix ES + EN en el mismo bloque rompe la confianza ("¿es bug? ¿hay traducciones a medias?") y delata el `humanizeEventType` map incompleto. | Owner Roberto, Carmen Inspectora, UX/UI |
| 4 | **BLOCKER** | **Sin agrupación por EventCategory** (heredado de v2 #3, sin movimiento). Las 8 buckets de PR #196 (`RECIPE`, `INGREDIENT`, `SUPPLIER`, `AGENT`, `AI_SUGGESTION`, `COST`, `OVERRIDE`, `SECURITY`) existen en código pero el fieldset los lista en grid 3×4 plano. Roberto post-incidente quiere "todo lo que toque alérgenos" — tiene que escanear 10 checkboxes y marcar manualmente los relevantes. | Owner Roberto, PM, Forensic auditor |
| 5 | **MAJOR** | **Sin drill-down + sin diff before/after** (heredado de v2 #5 + secondary). Sin tabla no hay celdas pivot, sin diff no hay forma de saber qué cambió en un `RECIPE_INGREDIENT_UPDATED`. Para el auditor forense que necesita pivotar entre los 3-5 eventos de la misma transacción (correlation_id) o ver "antes: [gluten]" → "después: [gluten, lácteos]", la pantalla es ciega. | Forensic auditor, Lawyer, Owner Roberto |

Severidades secundarias (no top-5 pero registradas):

- **MAJOR** — Sin exports firmados (CSV plano sin sello, sin prev/curr hash inline). Lawyer no puede defender CSV en juicio.
- **MAJOR** — Fieldsets HTML nativos siguen igual que v2 (border 1px black, legend absoluta) — look formulario 1998. PR #206 sólo tocó el empty-state, no el chrome de filtros.
- **MAJOR** — Sin contexto multi-sede (selector de venue ausente).
- **MAJOR** — Sin freshness indicator ("última actualización: hace 5 s · auto-refresh").
- **MINOR** — `Aplicar` sigue sin parecer botón (sin border, sin background); `Reset` y `Exportar CSV` sí lo parecen. Inconsistencia visual heredada de v2.
- **MINOR** — Layout vertical infinito (>800px solo de filtros antes de la tabla). L1-7 pide drawer lateral; sigue sin existir.
- **MINOR** — Mobile: 10 checkboxes apilados + 2 dropdowns + 2 date pickers + search + 3 botones antes del empty state. Scroll de ~1.5 viewports antes de "Exportar CSV".

---

## 2. Roundtable per persona

### 2.1 Owner Roberto post-incidente — *"Viernes 14:00, cliente se quejó del jueves. ¿Puedo investigar?"*

> **Veredicto: NO puede empezar la investigación aquí.**

JTBD escenario: viernes 14:00, email de cliente reporta reacción alérgica con plato del
jueves. Roberto abre `/audit-log` y:

1. **No ve la tabla.** Aterriza en filtros + empty state. La pregunta "¿qué eventos
   pasaron el jueves?" no tiene respuesta visible — tendría que aplicar filtros a ciegas
   sobre algo que no sabe que existe. Sin seed/demo data (B-3 deferred), la pantalla es
   un dead-end ante el incidente real. **Falla #1 del JTBD.**

2. **Sí puede leer los nombres de eventos.** Mejora real de v2 — *"Receta · alérgenos
   sobrescritos"* es comprensible. Hace clic en ese checkbox + en *"Ingrediente ·
   sobrescrito"* + en *"Receta · coste recalculado"*. Buena UX hasta ahí.

3. **Pero NO puede agrupar.** Quiere "todo lo que toque la receta del plato del jueves"
   — son 4-5 tipos de evento dispersos en el grid 3×4. Sin EventCategory `RECIPE`
   colapsable con master-checkbox, escanea uno a uno. Roberto WhatsApp-level se cansa
   al tercer checkbox. **Falla parcial del JTBD.**

4. **Filtra por fecha del jueves.** Date-range picker existe — bien. Pero al pulsar
   `Aplicar` (que no parece botón) y obtener *"Sin eventos para estos filtros"*, no sabe
   si es porque (a) no hay datos seed, (b) el rango de filtros es incorrecto, (c) la
   query falló silenciosamente. El nuevo empty state copy ayuda con (c) pero no resuelve
   (a). **Falla #2 del JTBD.**

5. **Cae al final:** no hay tabla → no hay row para hacer drill-down → no puede
   exportar nada útil → no puede mandar dossier al abogado. **Falla terminal del JTBD.**

**Movimiento desde v2:** la humanización (B-1) le quita el muro de la jerga
SCREAMING_SNAKE; el empty state (A5) le explica qué llenaría la tabla. Pero el journey
post-incidente sigue muriendo en el mismo paso 2 que v2: sin tabla real con seed data,
no hay forensic search desde aquí.

### 2.2 Forensic auditor — *"¿Esto se sostiene como evidencia?"*

> **Veredicto: NO (sin cambios vs v2).**

Lo que el auditor forense necesita ver para defender la cadena:

1. **Prueba de integridad por row** — chip "✓ Verificado" con tooltip `prev_hash` +
   `curr_hash`. **HOY: invisible.** Feature backend ADR-030 cerrado desde M3, UI no
   expone NADA. Una tabla sin chip de integridad es ofimática, no evidencia.

2. **Banner global "Cadena íntegra desde 2026-01-15 hasta hoy"** — confirma append-only,
   no tampered. **HOY: ausente.**

3. **Botón "Verificar integridad ahora"** — re-calcula hashes server-side, devuelve
   OK/FAIL con timestamp. Da poder forense activo. **HOY: ausente.**

4. **Trazabilidad por correlation_id** — pivotar entre los 3-5 eventos de "el agente IA
   sugirió → encargado aprobó → precio cambió → coste recalculado". **HOY: imposible
   sin tabla y sin drill-down.**

5. **Diff inmutable before/after** — `Receta · alérgenos sobrescritos` (humanizado, ok)
   pero ¿qué alérgenos? `[gluten]` → `[gluten, lácteos]` debería ser visible en row
   expansion. **HOY: ausente.**

6. **Export firmado** — `Exportar CSV` sigue siendo single button sin firma. CSV no se
   sostiene en juicio. Necesita PDF sellado o JSON Lines con cadena hash inline. **HOY:
   solo CSV plano.**

**Severidad legal:** identica a v2. Sprint 1 no movió un milímetro de la dimensión
forense. El moat "audit-as-feature" (memoria positioning vs eventual Claude SMB EU)
sigue regalado — backend M3 ADR-030 está listo, la UI no lo materializa.

**Lo único que mejora:** los nombres de evento humanizados ayudan al auditor a leer
filtros sin glosario interno — pero el auditor ya conoce los enums. Ganancia marginal
para esta persona; cero ganancia legal.

### 2.3 UX/UI designer — *"Densidad, scannability, consistencia"*

> **Veredicto: dos fixes aterrizan, tres fallos estructurales siguen.**

**Lo que funciona ahora (vs v2):**

1. **B-1 humanización legible.** 6/10 labels en español natural. La densidad visual del
   bloque mejora — los renglones son más cortos y más uniformes. El `title=` con el
   enum raw es un buen power-user affordance (hover para inspector dev).

2. **A5 empty state con `EmptyStateCard`.** Icono `FileSearch` en accent-soft turquoise,
   headline serif Fraunces *"Sin eventos para estos filtros"*, body con copy útil. Esto
   sí cumple el unified empty-state pattern de L0-5. Subió de "caja dasheada genérica" a
   "componente intencional".

3. **A1 Fraunces en h1 `Auditoría`** — visible y bien escalado. Continuidad tipográfica
   con el resto de pantallas que ya tienen el serif.

**Fallos estructurales que siguen (de v2):**

1. **Fieldsets HTML nativos** (border 1px black, legend en posición absoluta). PR #206
   tocó SOLO el empty-state — el chrome de `Tipo de evento`, `Agregado / Actor`,
   `Ventana temporal`, `Búsqueda de texto (FTS)` sigue con UA default. Look formulario
   1998. Debería ser `Card` con título h3 + padding DESIGN.md tokens.

2. **Checkbox grid plano sin agrupación.** 10 checkboxes en grid 3×4 todos al mismo
   nivel visual. Las 8 EventCategory de PR #196 existen en código pero no se exponen
   como agrupación visual. Necesita `CheckboxGroup` con headers por categoría + master
   checkbox.

3. **Layout vertical infinito.** Filtros + filtros + filtros + filtros + búsqueda + 3
   botones + empty state. >800px de altura solo para filtros antes de cualquier dato.
   L1-7 explícitamente pide drawer lateral. Sigue sin existir.

**Inconsistencia nueva detectada en v3:** el mix de labels ES + EN dentro del MISMO
bloque (`Receta · alérgenos sobrescritos` junto a `Recipe source override changed`) es
peor que "todo en EN" o "todo en ES". Da sensación de feature a medio terminar. Si B-1
shippeó, debió shippearse completo — el `humanizeEventType` map quedó parcial.

**Mobile específico:** sin cambios desde v2. 10 checkboxes apilados + dropdowns + date
pickers + search + botones — scroll ~1.5 viewports antes del CTA principal. La
humanización ayuda a leer pero no resuelve la densidad.

### 2.4 PM — *"L1-7 spec coverage v2 → v3"*

L1-7 verbatim: *"Auditoría: render real table (últimos 50 default), filtros → drawer,
drill-down `aggregate_id`/`correlation_id`/`actor` + cadena hash visible + diff
before/after"*

| Sub-spec | v1 | v2 | v3 | Notas |
|---|---|---|---|---|
| Render real table (últimos 50 default) | ❌ | ❌ | ❌ | B-3 (seed data) deferred. Sin seed → sin tabla |
| Filtros → drawer | ❌ | ❌ | ❌ | Sigue layout vertical sin drawer |
| Drill-down `aggregate_id` | ❌ | ❌ | ❌ | Sin tabla → sin cells linkables |
| Drill-down `correlation_id` | ❌ | ❌ | ❌ | Idem |
| Drill-down `actor` | ❌ | ❌ | ❌ | Dropdown filter ≠ drill-down |
| Cadena hash visible (chip + banner) | ❌ | ❌ | ❌ | Backend M3 ADR-030 listo; UI ausente |
| Diff before/after | ❌ | ❌ | ❌ | No expuesto |
| **(bonus) humanización labels** | ❌ | ✅ código / ❌ UI | ✅✅ UI (parcial 6/10) | PR #203 B-1 |
| **(bonus) agrupación EventCategory** | ❌ | ✅ código / ❌ UI | ✅ código / ❌ UI | Sin movimiento |
| **(bonus) empty state pattern unified** | ❌ | ❌ | ✅ | PR #206 A5 EmptyStateCard + FileSearch icon |
| **(bonus) Fraunces h1** | ❌ | ❌ | ✅ | PR #204 A1 |

**Cobertura L1-7: 0/7 sub-items core shipped + 3/4 bonuses parcial-completo.**

Pre-L1-7 lo que SÍ existe (filtros básicos por tipo + actor + ventana temporal + FTS box
+ export CSV crudo + empty state unified + h1 Fraunces + 6/10 labels humanizados) +
los 3 bonuses parciales suben Auditoría a **~22-25% del spec total** (de ~15-20% v2).

El delta v2→v3 es **+5-7 puntos porcentuales SOLO por humanización + empty state +
serif h1.** Sin movimiento en el backlog `[F]` (tabla, drawer, drill-down, hash UI,
diff, exports firmados).

### 2.5 Lawyer — *"Chain-of-custody quality"*

> **Veredicto: identica a v2 — backend listo, UI ausente.**

Para que un audit log se sostenga como evidencia (GDPR Art. 5(1)(f) "integridad y
confidencialidad" + EU AI Act Art. 12 logging + futura NIS2/eIDAS2), la UI tiene que:

1. **Mostrar** que la cadena es íntegra (chip por row + banner global). **HOY: 0/2.**
2. **Permitir verificar** (botón re-calcule hashes con OK/FAIL). **HOY: ausente.**
3. **Exportar con firma** (PDF con sello tiempo + JSON Lines con prev/curr hash). **HOY:
   sólo CSV plano.**
4. **Demostrar inmutabilidad** (no edit, no delete, evidencia append-only). **HOY: no
   surface UI.**

**0/4 expuestos** — mismo número que v2.

El feature backend (ADR-030) está listo y mergeado desde M3. La diferencia entre
"tenemos audit log" y "esto vale como evidencia GDPR + AI Act" es exactamente esos 4
elementos UI. Sprint 1 priorizó quick-wins de copy + empty state (correcto para el
universo Owner) pero no movió la aguja legal.

**Severidad para el caso de uso "post-incidente food safety":**

JTBD lawyer dice *"output: signed CSV/PDF for legal"*. Hoy el output es CSV plano sin
firma. Si llega un caso real (cliente con shock anafiláctico por alérgeno mal declarado),
el dossier que sale de esta pantalla **no se sostiene en sala**. Necesita PDF con sello
de tiempo + cadena hash inline o el abogado defensor (de la parte demandante) destruye
la cadena de custodia en 2 minutos.

**Severidad para posicionamiento competitivo:** memoria
`project_nexandro_positioning_vs_eventual_claude_eu.md` lista "audit-as-feature" como
1 de los 4 vectores de moat cuando Anthropic lance EU. Hoy ese moat está construido en
backend (M3 ADR-030) y completamente invisible en UI. Es la fricción más cara de
mantener sin movimiento — cada sprint que pasa sin chip "✓ Verificado" + banner es un
sprint donde el moat es invisible para el comprador (DPO, compliance officer,
inspector).

---

## 3. Suggested changes

Tag legend:

- `[V]` — **Visual only** (CSS, tokens, copy). No backend change.
- `[I]` — **Information architecture** (re-grouping, drill-down structure, new components, layout shift).
- `[F]` — **Feature** (requires backend or new API surface).

### 3.1 Quick wins (`[V]`, 1-2 días)

- `[V]` **Completar `humanizeEventType` map para los 4 enums restantes.**
  `RECIPE_SOURCE_OVERRIDE_CHANGED` → "Receta · proveedor sobrescrito",
  `RECIPE_INGREDIENT_UPDATED` → "Receta · ingrediente actualizado",
  `SUPPLIER_PRICE_UPDATED` → "Proveedor · precio actualizado",
  `AI_SUGGESTION_REJECTED` → "IA · sugerencia rechazada" (consistente con la aceptada).
  Cierra BLOCKER #3 directamente.
- `[V]` **Cambiar `<fieldset>` HTML nativos a `Card` con título h3** + padding DESIGN.md
  tokens (`--space-lg` 24px, border `--border`). Heredado del v2 §3.1 sin tocar.
- `[V]` **Botones consistentes** — `Aplicar` debe parecer botón primario (`--accent`
  bg + `--accent-fg`); `Reset` ghost; `Exportar CSV` secondary. Heredado v2.
- `[V]` **Renombrar labels técnicos del filtro de agregado/actor**: `TIPO DE AGREGADO`
  → "¿Qué se cambió?" / `TIPO DE ACTOR` → "¿Quién lo cambió?" (Owner-friendly). Heredado
  v2.
- `[V]` **Botón "Datos de ejemplo"** en empty state (placeholder hasta que B-3 aterrice
  con seed real). Click → carga 20 rows mock. Bridge para mostrar la tabla aunque sea
  con datos demo.

### 3.2 IA changes (`[I]`, 1 sprint)

- `[I]` **Agrupar `Tipo de evento` por EventCategory** (8 buckets de PR #196). Un
  `CheckboxGroup` colapsable por categoría con master-checkbox. Reduce 10 checkboxes
  planos a 8 grupos colapsados + "Select all in category". Cierra BLOCKER #4.
- `[I]` **Mover filtros a drawer lateral** (L1-7 spec verbatim). La pantalla principal
  queda: header "Eventos (últimos 50)" + chip "Cadena íntegra desde X" + botón "Filtros"
  + tabla a pantalla completa.
- `[I]` **Layout responsivo mobile**: filtros van detrás de bottom-sheet, no
  stackeados arriba. El primer viewport mobile debería ser "header + tabla" no
  "header + 800px de filtros".
- `[I]` **Reordenar checkboxes por frecuencia de uso** (mientras no haya agrupación):
  los más usados arriba (`Receta · alérgenos sobrescritos`, `Receta · coste recalculado`),
  los IA en bloque al final. Reduce scan time en uso real post-incidente.

### 3.3 Feature work (`[F]`, 2 sprints)

**Prioridad legal (cierra BLOCKER #1):**

- `[F]` **Chip "✓ Verificado" por row + banner "Cadena íntegra desde…"** (sub-spec L1-7
  #6 + L3-6). Chip verde con icono lock + tooltip `prev_hash` + `curr_hash` (truncados
  con copy-button). Banner sticky top con timestamp última verificación. **Este es el
  fix #1 priority para el moat audit-as-feature.**
- `[F]` **Botón "Verificar integridad ahora"** en header. Re-calcula hashes server-side,
  muestra OK/FAIL con timestamp + duración. Poder forense visible.
- `[F]` **Export firmado** (L3-7). Reemplazar `Exportar CSV` por dropdown:
  - PDF firmado (recomendado para inspección)
  - JSON Lines (con cadena hash)
  - CSV (sin firma, sólo análisis)

**Prioridad usabilidad (cierra BLOCKER #2 + #5):**

- `[F]` **Render real table** (sub-spec L1-7 #1) con B-3 seed data. 5 columnas mínimas:
  timestamp, Tipo (humanizado), Actor, Aggregate (link), chip "✓ Verificado". Densidad:
  12 rows visibles a 1440×900 sin scroll.
- `[F]` **Drill-down**: cada cell de `aggregate_id` / `correlation_id` / `actor` es un
  link que filtra la tabla a "todos los eventos relacionados". Sub-spec L1-7 #3-5.
- `[F]` **Row expansion con diff before/after** (sub-spec L1-7 #7). Click en row →
  expandir inline con JSON diff coloreado (verde added, rojo removed).

**Prioridad contexto operativo:**

- `[F]` **Multi-venue selector** en header (L0-4 cross-cutting).
- `[F]` **Freshness indicator** ("Última actualización: hace 5 s · auto-refresh cada
  30 s") + botón refresh manual.

---

## 4. Veredicto final

Sprint 1 entrega **dos quick-wins reales y visibles** (B-1 humanización 6/10 + A5 empty
state EmptyStateCard) que mejoran la pantalla en la dimensión "comprensibilidad para
Owner Roberto pre-incidente". La cobertura sube de ~15-20% a ~22-25% del spec L1-7.

**Lo que NO movió Sprint 1 es lo que más importa para el JTBD post-incidente real:**

1. **La tabla sigue ausente.** Sin seed data (B-3 deferred), Roberto post-incidente
   aterriza en un dead-end. No puede empezar la investigación forense desde aquí.

2. **La cadena hash sigue invisible.** Backend M3 ADR-030 listo, UI 0/4 elementos
   expuestos. El moat audit-as-feature (positioning vs eventual Claude SMB EU) sigue
   regalado en UI por tercer sprint consecutivo.

3. **La humanización es parcial** — 4 labels en inglés CamelCase rompen la consistencia
   del bloque que B-1 intentó cerrar. Fix de 30 minutos extra que debió ir en el mismo
   PR #203.

**El patrón se repite vs v2:** quick-wins de copy y empty-state aterrizan rápido (bien),
pero los `[F]` que requieren tabla + chip de integridad + drill-down + diff + exports
firmados siguen intactos por tercer sprint. La memoria
`feedback_ux_mock_self_review.md` aplica de nuevo: cerrar slices visibles sin moverse al
trabajo `[F]` que materializa el feature backend ya pagado.

**Recomendación para Sprint 2:** priorizar **un solo** `[F]` de la dimensión legal —
**chip "✓ Verificado" por row + banner cadena íntegra** — incluso si la tabla aún no
existe (puede aterrizar con seed data demo). Materializa el moat más caro de mantener
invisible. Quick wins `[V]` (completar humanización + cards en lugar de fieldsets +
botones consistentes + copy de labels) son ~3 días y cierran 2 BLOCKERs heredados sin
backend work.
