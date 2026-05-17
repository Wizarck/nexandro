---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - docs/prd-module-1-ingredients.md
  - docs/personas-jtbd.md
  - docs/architecture-decisions.md
  - docs/data-model.md
  - docs/project-structure.md
  - docs/runbook.md
workflowType: 'prd'
projectName: nexandro
moduleScope: 'Module 2 — Recipes / Escandallo + Nutritional Intelligence + Auto-Labels'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 6
isBrownfield: true
inheritedFrom: docs/prd-module-1-ingredients.md
classification:
  projectType: saas_b2b
  domain: hospitality_restaurant_operations
  domainMappedTo: general
  complexity: medium
  projectContext: brownfield
architecturalPillars:
  - decomposed_food_cost
  - composable_recipes
  - inventory_cost_resolver_interface
  - menu_item_decoupling
  - nutritional_intelligence_open_food_facts
  - agent_ready_agent_optional
scopeExpansions:
  - date: 2026-04-26
    change: 'Absorbed planned Module 5 (Nutrition & Labels) into M2 after user opted for full-feature implementation given 12-month tspoonlab subscription overlap. Forks resolved: allergens C (full M2 supersedes PRD-1 §4.11), labels A (in MVP), OFF integration C (hybrid local mirror + API fallback).'
  - date: 2026-04-26
    change: 'Added Architectural Pillar — Agent-Ready, Agent-Optional. App must function 100% standalone (zero agent dependency); MCP server is a separable add-on; any MCP-compatible agent can connect (Hermes, OpenCode, Claude Desktop, custom).'
---

# Product Requirements Document — nexandro

**Module:** 2 — Recipes / Escandallo (Recipe Engineering, Live Food Cost, Nutritional Intelligence, Auto-Labels)
**Author:** Master (facilitated by John, BMAD PM)
**Date:** 2026-04-26
**Status:** **Gate A APPROVED** by Master (PM) on 2026-04-27 per [.ai-playbook/specs/runbook-bmad-openspec.md](../.ai-playbook/specs/runbook-bmad-openspec.md) §5. Implicit gaps from readiness report (AI yield model, Recipe lifecycle, M2.x WhatsApp allowlist) deferred to architecture phase / future PRDs.

---

## Executive Summary

nexandro Module 2 turns the kitchen's recipe book into a live cost engine **and** a nutritional intelligence layer. A Head Chef builds an *escandallo* (recipe + sub-recipes + yields + waste factors); the system continuously computes food cost from current `SupplierItem` prices — with a clear path to FIFO batch costing once Module 3 (Inventory + Lots) lands. Each ingredient pulls macros, allergens, brand and diet flags from a local mirror of Open Food Facts (~3M branded products), so recipes auto-roll up kcal/macros per portion, aggregate allergens (with chef-overridable cross-contamination flag), and infer diet flags conservatively (vegan/gluten-free/halal/kosher/keto). The Owner reads margin through Menu Items that join recipe cost to selling price per location and channel, answering *"which dishes lost money this week?"* in seconds. M2 also ships **EU 1169/2011-compliant printable labels** rendering the rolled-up data in regulatory format.

The Module replaces tspoonlab as the kitchen's primary recipe + cost tool. It inherits Module 1's foundation (Organization → Location, RBAC, currency, i18n, audit, soft-delete, CSV import/export) and adds new entities — `Recipe`, `RecipeIngredient`, `MenuItem` plus nutrition/allergen/diet metadata on `Ingredient` — with a single architectural seam (`InventoryCostResolver`) that future modules plug into without rewrite.

### What Makes This Special

The product's bet is **decomposed food cost + open nutritional intelligence + agent-ready architecture**: every component of cost is auditable, every nutrition fact is sourced, and every JTBD is consumable both by humans clicking the UI and by any MCP-compatible agent.

1. **AI-suggested yields and waste factors with cited sources.** The system pre-fills `yieldPercent` (potato 80%) and `wasteFactor` (simmered sauce 20%) from real-world references, surfacing the URL (USDA FoodData Central, CIA Pro Chef, ICN guides) where the value came from. The chef edits with confidence, not guesswork.
2. **Composable recipes.** A recipe can contain ingredients *and* other recipes. Define "tomato sauce" once, use it in twelve dishes; cost rolls up automatically.
3. **`InventoryCostResolver` interface, not an integer.** Live cost in M2 reads from `SupplierItem.unitPrice`. In M3, the same interface returns FIFO-batch cost (oldest-batch-first, matching HACCP physical flow used by McDonald's, Sodexo, Aramark). Zero rewrite when batches arrive.
4. **`MenuItem` separates ficha técnica from selling price.** One Recipe → many MenuItems (per location × channel). Owner-side margin reporting joins cost to price without conflating the two concerns.
5. **AGPL multi-venue out of the box.** Closed-source competitors (tspoonlab et al.) gate multi-venue and integrations behind paid tiers; nexandro ships them as core.
6. **⭐ Nutritional intelligence + auto-labels via Open Food Facts.** Hybrid local mirror + API fallback of OFF's ~3M branded products. Each `Ingredient` carries `nutrition` + `allergens` + `dietFlags` + `brandName`. Recipes auto-roll-up macros and EU 1169/2011-compliant printable labels with allergens emphasised per Article 21. No commercial competitor combines AGPL + branded nutrition catalog + auto-label generation today.
7. **⭐ Agent-ready, agent-optional.** API is the contract. UI consumes it. Any MCP-compatible agent (Hermes, OpenCode, Claude Desktop, custom) consumes the same contract via a separable MCP server. Customers who refuse agents get full functionality via UI only; switching on agents = config change in <30 minutes.

The core insights:
- `food_cost = ingredient_price × yield × waste × batch_actual` — splitting those four factors apart is half the product.
- `recipe = data` and the data must be addressable by humans (UI), regulators (labels), and machines (API + MCP) interchangeably — that's the other half.

## Project Classification

| Attribute | Value |
|---|---|
| Project Type | `saas_b2b` (multi-tenant capable, RBAC, dashboard) |
| Domain | Hospitality / restaurant operations (mapped to `general` with raised complexity due to industry-specific math: yields, mermas, FIFO, cross-family unit conversion, EU regulatory) |
| Complexity | Medium-High (raised post-scope-expansion due to OFF integration + EU 1169/2011 compliance + agent-ready pillar) |
| Project Context | Brownfield — Module 1 PRD v2.0 approved; M1 implementation in flight |
| Inherits from | [docs/prd-module-1-ingredients.md](./prd-module-1-ingredients.md) v2.0 + supporting docs ([personas-jtbd.md](./personas-jtbd.md), [architecture-decisions.md](./architecture-decisions.md), [data-model.md](./data-model.md)) |
| Supersedes | PRD-1 §4.11 (allergens) — M2 now includes full allergen handling; partial PRD-1 §4.7 i18n locks (label rendering language follows org `defaultLocale` initially; multi-locale per print is M2.x) |
| Modules absorbed | Module 5 (Nutrition & Labels) — DELETED, folded into M2 |

---

## Architectural Pillar: Agent-Ready, Agent-Optional

This pillar is **transversal** to all of nexandro, not a Module 2 feature. M2 is the first module to formalise it; M1 retrofits to comply; future modules inherit.

### Principles

1. **The API is the contract.** UI consumes it, agents consume it, regulators consume it (via export endpoints). Every JTBD is end-to-end achievable via the API alone.
2. **API parity (NFR core).** Every action a UI user can take via clicks must be available via the REST API with equivalent semantics, RBAC, and audit. No UI-only flows.
3. **MCP server `nexandro` is separable.** Independent package + Docker image. The backend has zero dependency on it. Customer can run nexandro without ever installing the MCP layer.
4. **Web chat widget is feature-flagged.** `NEXANDRO_AGENT_ENABLED=false` (env) → widget hidden, no Hindsight bank initialisation, no `nexandro-agent` service-account creation. UI is fully usable without it.
5. **Endpoints tolerate partial state.** Recipes can be saved as `draft` with only a name; ingredients added later turn-by-turn. Responses include `nextRequired` / `missingFields` so an agent knows what to ask.
6. **Identity model = hybrid (when agent enabled).** Agent acts via service-account `nexandro-agent`; audit fields record `executedBy=human, viaAgent=true, agentName=<hermes|opencode|...>`.
7. **Hindsight bank naming = capability-based, not module-versioned.** Banks: `nexandro-recipes`, `nexandro-suppliers`, `nexandro-menus`, `nexandro-inventory` (M3+). No `m2`/`m3` prefix (capabilities outlive module numbers). No `orgId` suffix (single-tenant deployments are the norm; Nexandro Enterprise SaaS adds the suffix later).
8. **Recall in cascade**: capability bank (most relevant) → other nexandro banks → cross-cut `eligia-{org}` only for ELIGIA-transversal questions. Cap at 3 banks per turn to fit WhatsApp <5s SLA.
9. **Hindsight ≠ database.** Banks store *learnings* (patterns, past observations, conversational context). Live data (current stock, current price, current recipe definition) lives in PostgreSQL and is queried via the consolidated API.
10. **MCP standard, agent-agnostic.** The MCP server passes the official MCP protocol test suite. Hermes, OpenCode, Claude Desktop, ChatGPT-MCP-bridge, and any custom MCP client all work the same way.
11. **Internal DDD with bounded contexts.** `Recipes`, `Ingredients`, `Inventory`, `Suppliers`, `Menus` — separable later into microservices without touching the MCP client. Premature microservices are out of scope; one well-bounded monolith is the M2 deployment.
12. **Multimodal via small Gemma on OpenRouter** (when agent enabled): photo of handwritten recipe → structured ingredient list; voice "añade 2kg tomate al ragù" → ingredient line append.
13. **Concurrency = last-write-wins + alert.** No optimistic locking (it breaks multi-turn agent conversations mid-flow). Overwrites emit `entity.overwritten` event; first author is notified post-hoc with attribution.

### Two deployment modes (both must work and be tested)

| Mode | Components | Use case |
|---|---|---|
| **Standalone** | API + UI + DB + (LiteLLM only if AI yield-suggestions enabled, which is itself a feature flag) | Customer rejects agents OR uses agent we haven't integrated |
| **Agent-integrated** | Standalone + MCP server `nexandro` (separate container) + WebChat widget enabled in UI + Hindsight banks initialised + (Hermes/OpenCode/etc. on customer side) | Customer wants conversational JTBD execution |

Migration between modes = config change, no schema migration. Documented in operations runbook.

### WhatsApp deployment (deferred to M2.x)

M2 MVP enables the agent on **web chat in-platform only**. WhatsApp goes through the existing routing (per [ADR-012](C:/Projects/eligia-core/decisions/ADR-012-hermes-whatsapp-via-mcp-platform.md)) for the personal `personal_hermes` tag (Arturo only). Multi-user WhatsApp (Lourdes the chef, Roberto the owner via WhatsApp) lands in **M2.x** via the WA-MCP `allowedlist` mechanism that already exists — adding a chef = add their phone number to allowlist + set `User.phoneNumber` in M1. No OAuth flow or new Meta onboarding. Mapping `phoneNumber → userId` via the new `User.phoneNumber` field added to M1 (retrofit).

### Cross-cutting requirements added to M1 (retrofit)

- **`User.phoneNumber`** (E.164, nullable) — required for WhatsApp routing; safe to add now even though WhatsApp use lands in M2.x.

---

## Success Criteria

### User Success

**Head Chef (primary):**
- Creating a 10-ingredient recipe with 2 sub-recipes feels **subjectively faster than tspoonlab** (no baseline measurement available; chef-perceived).
- Live food cost updates **within 200ms** of any edit (ingredient added, qty changed, yield adjusted, supplier changed).
- AI-suggested yield/waste is accepted (or accepted-then-tweaked) on **≥ 70% of ingredients** — proxy for "the chef trusts the suggestions".
- Auditing a cost question (*"why is the bolognese €0.20 more this week?"*) **takes ≤ 30s** from clicking the recipe to identifying the responsible component.
- Searching for an ingredient by brand name (e.g. "Heinz tomate") returns the right OFF entry within **≤ 1s** with macros + allergens pre-filled.
- Printing a label for a finished recipe **takes ≤ 3 clicks** and yields a 1169/2011-compliant PDF without manual editing.

**Owner (secondary):**
- Reach the answer to *"which dishes lost money this week?"* in **≤ 3 clicks** from the dashboard, without manual export.
- Margin per MenuItem visible per location and per channel without manual filtering.
- Macro panel per MenuItem visible (kcal, carbs, fat, protein per portion) for menu-engineering decisions.

**Line Cook (tertiary):**
- Read-only recipe view loads in **≤ 1s** on a kitchen tablet on slow Wi-Fi.
- Allergen badges on the recipe view are unambiguously visible (visual emphasis matching label semantics).

### Business Success

- **Tspoonlab cancelled at Palafito before annual subscription renewal** (~10-11 months margin from M2 ship; replaces previous 60-day target). Tspoonlab cost €150/month + IVA = **~€2,178/year saved**.
- **100% of Palafito's existing tspoonlab recipes migrated** before that renewal date. Recipe count baseline measured at migration kickoff.
- **≥ 85% of Palafito's existing tspoonlab ingredients find a confident OFF match** at migration (the rest fall back to manual entry).
- **Zero data re-entry**: every M1 ingredient already in the system is selectable inside recipes without re-typing.
- **First external GitHub install** of nexandro within 6 months post-M2 (M2 is the first really differentiated module — the "stars" trigger).
- **M2 label template passes external legal review** for EU 1169/2011 compliance before launch.

### Technical Success

- **100% unit test coverage** on cost-calculation path (recipe rollup, sub-recipe recursion, yield × waste math, currency rounding) — matching PRD-1 §5 standard.
- **Cost recalculation** on a single supplier-price change propagates through all dependent recipes in **< 500ms** (regardless of sub-recipe depth, up to 5 levels).
- **`InventoryCostResolver` interface API-stable** between M2 ship and M3 launch — zero breaking changes when batch-aware implementation plugs in.
- **Cycle detection** on sub-recipe graph: any save attempt that would create a cycle (A uses B uses A) is rejected with a clear error before commit.
- **Recipe scaling math** accuracy: when a recipe is scaled, total cost scales linearly within **0.01%** rounding tolerance.
- **API pagination** identical to PRD-1 pattern (cursor-based, default 25).
- **Macro rollup math** accuracy: ±5% of hand-calculated macros on a curated 30-recipe eval set.
- **Diet flag inference precision** ≥ 95% (false-positive vegan / gluten-free are dangerous).
- **OFF mirror sync** runs weekly with zero downtime; lookup hit rate ≥ 85% on Palafito's catalog.
- **Dual-mode CI**: full E2E suite runs both standalone and agent-integrated; both must pass on every PR.
- **Switch-on time**: documented and measured. Standalone → agent-integrated must complete in **≤ 30 minutes** of operator time.
- **Zero-coupling lint**: `apps/api/` source code may not `import` anything from `hermes-*`, `claude-*`, `opencode-*` or any other agent vendor. Enforced at build time.
- **MCP protocol compliance**: the `nexandro` MCP server passes the official MCP test suite (not just "works with Hermes").

### Measurable Outcomes (Operational KPIs, post-launch)

| KPI | Target | Window |
|---|---|---|
| AI yield-suggestion acceptance rate | ≥ 70% | Rolling 30d |
| Recipe edit → cost update latency p95 | < 200ms | Always |
| Owner dashboard load time p95 | < 1.5s | Always |
| Failed cost calculations / total | < 0.1% | Rolling 7d |
| `InventoryCostResolver` interface breakage incidents | 0 | Until M3 ship |
| OFF lookup hit rate (Palafito catalog) | ≥ 85% | Rolling 30d |
| Macro rollup accuracy spot-check pass rate | ≥ 90% | Rolling 30d |
| Label print success (no manual edit needed) | ≥ 80% | Rolling 30d |
| Diet flag inference precision (manual audit) | ≥ 95% | Quarterly |
| Standalone-mode E2E suite pass rate | 100% | Every PR |
| Agent-integrated E2E suite pass rate | 100% | Every PR |
| WhatsApp agent reply latency p95 (M2.x) | < 5s | Always (Meta requirement) |
| tspoonlab subscription status (Palafito) | Cancelled | Before annual renewal |

## Product Scope

### MVP — Minimum Viable Product

**Recipe & cost engine:**
- `Recipe` CRUD with **composable sub-recipes** (cycle detection enforced)
- `RecipeIngredient` (ingredient + qty + unit + per-recipe `yieldPercent` override + nullable `sourceOverrideRef`)
- Recipe-level `wasteFactor`
- Live food cost via **`InventoryCostResolver`** interface (M2 implementation: returns `SupplierItem.unitPrice` of the **preferred** supplier item — `isPreferred = true` per PRD-1 §4.4)
- **AI yield/waste suggestions with cited URL** (one source minimum per suggestion; differentiator)
- `MenuItem` CRUD with `sellingPrice`, `targetMargin`, scoped to Location + Channel
- Basic margin report per MenuItem (cost, price, margin %, vs. target)
- Per-component cost-history drill-down (the "what changed?" view from Journey 2)

**Nutritional intelligence (NEW — absorbed from cancelled M5):**
- `Ingredient.externalSourceRef` (OFF product code; nullable)
- `Ingredient.brandName` (separated from `name`)
- `Ingredient.nutrition` (jsonb: kcal, carbs, fat, protein, fiber, sugars, salt — per 100g/ml)
- `Ingredient.allergens` (string[] of standardized EU 1169/2011 tags)
- `Ingredient.dietFlags` (string[] — vegan, vegetarian, gluten_free, halal, kosher, keto, …)
- OFF search in ingredient editor (by name, brand, barcode)
- **Hybrid OFF integration**: local mirror (SQLite/Postgres `external_food_catalog` seeded weekly from OFF dump) + REST API fallback for cache misses
- `Recipe.macroRollup` computed (kcal/macros per finished portion + per 100g)
- Recipe allergen aggregation with chef override (cross-contamination free-text flag at recipe level)
- Recipe diet-flag inference with conservative fallback (any allergen → not safe; missing data → never auto-clear)

**Labels (NEW):**
- Label generation engine (PDF, EU 1169/2011-compliant template)
- Mandatory fields: name, ingredients (descending mass per Article 18), allergens (emphasised per Article 21), net qty, kcal/macro panel, contact info (org-level config)
- Label language follows org `defaultLocale`
- Print flow (UI → render → download/print) in ≤ 3 clicks

**Agent-ready foundation (NEW pillar):**
- API REST with `missingFields` / `nextRequired` in responses
- MCP server `nexandro` packaged separately (Docker image + npm package; independent of backend)
- Web chat widget in UI with `NEXANDRO_AGENT_ENABLED` feature flag
- Health check `/api/health/agent-integration` reports MCP availability
- `nexandro-agent` service-account (created only when agent enabled)
- Hindsight bank reservations: `nexandro-recipes`, `nexandro-suppliers`, `nexandro-menus`
- Two-mode deployment documented (standalone vs agent-integrated)

**M1 retrofit:**
- `User.phoneNumber` field added (E.164, nullable) for future WhatsApp multi-user routing

**Inherited from PRD-1 (no new spec):**
- RBAC enforcement (Owner/Manager full CRUD; Staff read-only on recipes; allergen overrides require Manager+)
- Soft-delete on Recipe and MenuItem
- Audit fields (`createdBy`, `updatedBy`, timestamps)
- Multi-tenant isolation by `organizationId`
- i18n via `defaultLocale`

### Growth (post-MVP, M2.1+)

- WhatsApp multi-user routing via WA-MCP `allowedlist` (not OAuth, not new Meta number)
- Recipe versioning (keep prior version when published; MenuItem references can pin a version)
- Cooking-instructions field with multi-step procedures + photos
- Recipe scaling math with non-linear units (eggs as integer, "pinch" as flat)
- **Multi-supplier cost-resolution policies** beyond preferred-only — Paperclip integration as a configurable `SupplierItemSelector` strategy
- A4 print-out / kitchen-sheet PDF export (recipe sheet, not nutritional label)
- CSV import for bulk recipe migration (one-time migration tool)
- Per-recipe photo storage (S3 vs hostPath strategy TBD)
- Recipe categories taxonomy (separate from M1 ingredient categories or reused?)
- **Thermal printer driver integration** (Zebra, Brother) for in-kitchen label printing
- **QR code on labels** linking to digital recipe info / batch traceability
- **Multi-language label rendering** (one printout per locale)
- Voice-driven recipe entry on the kitchen tablet (multimodal Gemma)

### Vision (future modules)

- AI suggests new recipes from current inventory + dietary constraints (M3+M4 dependent)
- AI predicts margin impact when menu prices change
- Community recipe library (cross-organization sharing, opt-in)
- HACCP traceability with full lot-to-plate chain (M4)

### Module Roadmap (revised)

| Module | Scope | Status | Notes |
|---|---|---|---|
| M1 | Foundation: Ingredients, Categories, UoM, Suppliers, Org/Location | Approved v2.0; in flight | Retrofit: add `User.phoneNumber` |
| **M2** | **Recipes + Live Cost + Nutritional Intelligence + Auto-Labels + Agent-Ready foundation** | **This PRD** | **~5-7 months effort** (expanded from 60-day MVP after C/A/C scope expansion) |
| M2.1 | WhatsApp multi-user, recipe versioning, instructions + photos, thermal printers, QR labels | Post-MVP | ~2-3 months after M2 ship |
| M3 | Inventory + Batches + Receiving (foto OCR albaranes, NFC label readers) | Pushed | Was next; now post-M2.1 |
| M4 | HACCP / Traceability (full lot-to-plate audit) | Pushed | Original placement preserved |
| ~~M5~~ | ~~Nutrition & Labels~~ | **DELETED** | Absorbed into M2 (this PRD) |

---

## User Journeys

Personas inherited from PRD-1 ([personas-jtbd.md](./personas-jtbd.md)) — Owner / Manager / Staff. The following narratives are M2-specific and reveal the capabilities the module must deliver.

### Journey 1 — Head Chef builds a new recipe (happy path)

**Lourdes**, sous-chef at *Palafito Madrid Centro*, has used tspoonlab for two years. Today the head chef hands her a new dish: **tagliatelle with house bolognese ragù**. Before it goes on the menu, she needs the escandallo.

- She opens nexandro on her kitchen tablet, searches "ragù" — doesn't exist. Hits **+ New Recipe**.
- Adds **"Salsa de tomate"** as a sub-recipe — already exists in the system, created three months ago. Cost rolls up automatically into the parent.
- Adds ingredients via the M1 picker: crushed tomato (Heinz brand pulled from OFF mirror — macros + allergens auto-filled), onion, carrot, celery, ground beef, red wine.
- For each, nexandro pre-fills `yieldPercent` and `wasteFactor` with a citation: *"Onion 90% — source: USDA FoodData Central"*.
- For onion, Lourdes overrides 90% → **85%** (her kitchen peels aggressively). The system records the override + her user as the editor.
- For the recipe-level `wasteFactor` (cooking loss / evaporation), the system suggests **18%** based on stew-class recipes. She accepts.
- Live food cost appears: **€3.45 / kg of finished ragù**. Macro panel: **180 kcal / 8g protein / 14g carbs / 9g fat per 100g**. Allergens detected: *gluten* (from crushed tomato — Heinz product contains modified wheat starch). Diet flags: not vegan (beef), not gluten-free (gluten present), not halal (red wine).
- She creates a `MenuItem`: *"Tagliatelle Bolognesa"* → Location *Palafito Centro* / Channel *dine-in* / `sellingPrice` €18 / `targetMargin` 70%.
- Margin panel: cost **€3.45**, price **€18**, actual margin **80.8%** vs target **70%** ✅.
- Hits **"Generate label"** → PDF appears with name, ingredients (descending mass), gluten in **bold**, kcal/macro panel, Palafito contact info. ~5 minutes start to finished label.

**Capabilities revealed:** Recipe CRUD, sub-recipe selection (composability), M1 ingredient picker with OFF lookup, AI yield/waste suggestion with citation, override-with-attribution, live cost rollup, macro rollup, allergen aggregation, diet-flag inference, MenuItem CRUD scoped to Location+Channel, real-time margin display, label generation.

### Journey 2 — Head Chef investigates a cost spike (audit path)

Two weeks later. The owner calls: *"the bolognese is bleeding margin this week — why?"*

- Lourdes opens the *Tagliatelle Bolognesa* MenuItem. Cost has moved from €3.45 to **€4.12**. Margin: 80.8% → **77.0%**.
- Hits **"What changed?"** — nexandro shows the per-component delta over the last 14 days:
  - **Ground beef**: €0.85 → €1.08 (price change on the preferred supplier, "Carnicería X")
  - Crushed tomato: €0.30 → €0.32 (within noise)
  - All other components: stable
- 30 seconds, root cause identified. She notes it for Monday: renegotiate with Carnicería X or raise the menu price.

**Capabilities revealed:** Cost-history snapshot per recipe, per-component drill-down, price-change attribution to a specific `SupplierItem`, change timeline view.

### Journey 3 — Owner reads "which dishes lost money this week" (Sunday night)

**Roberto**, owner of Grupo Palafito. Sunday 22:00. Phone in hand on the sofa.

- Opens nexandro — dashboard shows the last 7d MenuItem ranking: top 5 earners + bottom 5 bleeders, all venues combined.
- **Bottom 5** highlights *Tartar de atún*: cost **€8.50**, price **€16**, margin **47%** vs target 65% ❌.
- Tap → sees the drill-down. Tuna jumped 15% on the current supplier batch.
- Decides: pull from menu until the price comes back down. Sends a WhatsApp to the chef. Closes the app.
- Total time: **under 3 clicks, under 60 seconds**, no spreadsheet, no export.

**Capabilities revealed:** Owner dashboard with margin ranking, mobile-first read-only view, supplier-batch drill-down (M2 standalone via `SupplierItem.unitPrice` history; richer in M3 with batches), notification-grade brevity.

### Journey 4 — Edge case: Head Chef accidentally creates a recipe cycle

Lourdes is editing *Salsa de tomate* — wants to add a "secret kick" sub-recipe. By mistake she selects *Ragù* itself (which already uses *Salsa de tomate*). Cycle.

- On **Save**, nexandro blocks the change with: *"Cycle detected: Ragù already uses Salsa de tomate. Cannot add it as a sub-recipe."*
- The error names both recipes and the dependency direction, so she understands instantly. Cancels, picks the correct sub-recipe, saves.

**Capabilities revealed:** Cycle detection on save (graph-walk pre-commit), clear error message naming both nodes and direction.

### Journey 5 — Future (M2.x): Chef creates a recipe via WhatsApp

*Forward-looking; depicts the M2.x state where WhatsApp multi-user is enabled. M2 MVP only delivers the foundation (web chat); this journey is appended as design intent so M2 architecture stays compatible.*

Lourdes, on the metro on her way home, remembers: she forgot to enter the *gambas al ajillo* she invented for tomorrow's lunch service.

- Opens WhatsApp (Palafito's nexandro number, which routes to Hermes via WA-MCP `allowedlist`).
- *"Quiero crear receta gambas al ajillo, 4 porciones"*.
- Agent: *"Vale. ¿Qué ingredientes y cantidades? Puedes dictarlos."*
- Lourdes (voice note): *"medio kilo de gambas, 4 dientes de ajo, 100ml aceite oliva virgen, perejil, guindilla"*.
- Agent transcribes (Gemma multimodal), pulls each ingredient from the M1 catalog (with OFF macros), suggests yields, computes preliminary cost.
- Agent: *"Coste estimado €11.20, alérgenos: crustáceos. ¿Lo guardo como `draft` para que lo revises mañana en el tablet?"*
- *"Sí"*. Done. 90 seconds total.
- Tomorrow morning Lourdes opens the tablet, sees the draft, polishes the yields, generates the label, publishes the MenuItem.

**Capabilities revealed:** API endpoints accepting partial state (Recipe `draft`), multimodal voice → structured ingredient list (Gemma vision/audio via OpenRouter), allergen rollup from OFF data over WhatsApp turn, agent picking up exactly where the human left off via Hindsight `nexandro-recipes` bank.

### Journey Requirements Summary

| Capability area | Journeys revealing it |
|---|---|
| Recipe CRUD with composable sub-recipes | J1, J4, J5 |
| M1 ingredient picker integration with OFF lookup | J1, J5 |
| AI yield/waste suggestion + citation | J1, J5 |
| Override-with-attribution (audit) | J1 |
| Live cost rollup through sub-recipe tree | J1, J2, J5 |
| Macro rollup at recipe level | J1 |
| Allergen aggregation + diet flags | J1, J5 |
| Label generation (EU 1169/2011 PDF) | J1 |
| MenuItem CRUD scoped to Location × Channel | J1 |
| Real-time margin calculation vs target | J1, J3 |
| Cost-history per recipe + per-component drill-down | J2, J3 |
| Cycle detection on save | J4 |
| Owner dashboard ranking (top/bottom margin) | J3 |
| Mobile-first read-only view | J3 |
| API endpoints accepting partial state (`draft`) | J5 |
| Multimodal voice/photo → structured input | J5 |
| Agent conversation continuity via Hindsight | J5 |

---

## Domain-Specific Requirements

### Compliance & Regulatory (M2 scope)

- **HACCP-aligned costing.** FIFO physical flow + FIFO costing is mandated by HACCP for spoilage control. The `InventoryCostResolver` interface is designed so the M3 implementation returns the **oldest batch's cost first**, preserving auditability of "which lot priced this dish on this date".
- **Auditability of cost factors.** Every cost on screen must be traceable to its source: `SupplierItem` reference + `unitPrice` snapshot timestamp + applied `yieldPercent` (with override attribution if non-default) + applied `wasteFactor`. Positions M2 to satisfy future regulatory audits (EU 178/2002 traceability, AESAN inspection requests) without re-architecting.
- **GDPR.** No personal data in M2 entities — Recipe / RecipeIngredient / MenuItem reference `User` only via `createdBy`/`updatedBy` (already covered by PRD-1 audit pattern). `User.phoneNumber` retrofit on M1 is the only personal data add; treated per PRD-1 audit pattern.
- **EU Regulation 1169/2011 (NEW — supersedes PRD-1 §4.11).** M2 implements full allergen handling end-to-end:
  - 14 major allergens stored as standardised tags pulled from OFF
  - Allergen tags displayed on recipe view, MenuItem view, and printed labels
  - On printed labels: allergen names emphasised per Article 21 (bold + contrast)
  - Ingredient list ordered by descending mass per Article 18
  - Mandatory label fields: name, ingredients, allergens, net qty, kcal/macro panel, contact info (org-level config)
  - Pre-launch external legal review of the label template
  - Chef can override any auto-detected allergen with attribution + reason (e.g., supplier change, product reformulation)
  - Recipe-level *"may contain traces of [allergen]"* free-text field for cross-contamination disclosure
  - Diet flags follow conservative inference: ANY allergen on ANY ingredient ⇒ recipe carries that allergen tag. Never auto-clear.

### Technical Constraints (domain-driven)

- **Cross-family unit conversion.** Inherited from PRD-1 §4.3: WEIGHT ↔ VOLUME requires `densityFactor`; UNIT ↔ anything is BLOCKED with no override. M2 honors the same rules.
- **Currency precision.** 4 decimal places internally, 2 for display (PRD-1 §5). Sub-recipe rollups must stay within the 0.01% tolerance defined in *Technical Success*.
- **Multi-tenant isolation.** Every entity scoped to `organizationId`. Inherited PRD-1 invariant.
- **i18n.** Recipe `name`, `description`, instructions follow `defaultLocale`. Multi-locale label rendering is Growth-tier (M2.x).
- **OFF data freshness.** Local mirror refreshed weekly via cron. API fallback used when local cache misses or returns stale (>30d) data. Mirror sync must complete with zero downtime (active-passive table swap).

### Ingredient Sourcing UX (locked design)

When the chef adds an ingredient line to a recipe, the system **does not pop a picker by default** — it silently selects the source per the FIFO rule and the cost shows up immediately in the live calculator. If the chef wants to override, an "**Edit source**" affordance opens a list:

| Column | M2 (no batches) | M3 (with batches) |
|---|---|---|
| Source name | `Supplier.name` (from `SupplierItem`) | `Supplier.name` of the **batch** |
| Expiry date | *— not shown (no batch context)* | `batch.expiryDate` |
| Cost | `costPerBaseUnit` in org currency, unit matching ingredient's `baseUnitType` | same, but per-batch (FIFO oldest at top) |
| Default selection | `isPreferred = true` SupplierItem (PRD-1 §4.4) | Oldest available batch (FIFO) |
| Sort order | preferred → `unitPrice` asc | `expiryDate` asc (oldest first) |

The override is stored on the `RecipeIngredient` line as a nullable `sourceOverrideRef`. When null (default), the live cost reflects whatever the resolver returns at read-time. When set, the cost is locked to that source until the chef clears it.

### Integration Requirements

- **M1 (Ingredients) — read-only consumer.** Recipes pick ingredients; never mutate them. Soft-deleted ingredients (M1 §4.8) appear greyed out with a "Discontinued" badge. M1 retrofitted with `User.phoneNumber` and OFF metadata fields on `Ingredient`.
- **`InventoryCostResolver` interface — internal contract.** Defined in M2, implemented in M2 (live `SupplierItem.unitPrice`, preferred-only) and reimplemented in M3 (FIFO oldest batch). Stable signature is a hard interface contract.
- **Open Food Facts (NEW) — hybrid integration:**
  - Local Postgres table `external_food_catalog` seeded weekly from OFF dump (~2-4 GB compressed)
  - REST API fallback (`world.openfoodfacts.org/api/v3`) for cache misses and freshly-released products
  - Background sync job (cron, weekly) refreshes from delta dump; active-passive swap for zero downtime
  - License: ODbL — usage compliant (we use the data, we don't redistribute the DB); `LICENSES.md` documents compliance
- **MCP server `nexandro` (NEW) — agent-facing contract.** Wraps the consolidated REST API as an MCP-standard server. Separable Docker image; backend has zero compile-time dependency on it. Compatible with any MCP client (Hermes, OpenCode, Claude Desktop, custom).
- **Paperclip — informational, not integrated.** Paperclip already produces a weekly supplier-analysis file with cheapest-source signals per ingredient. **M2 does NOT consume this file.** Documented here so a future M2.x can plug it into a `SupplierItemSelector` strategy slot (Growth-tier).
- **Future POS / delivery channels.** `MenuItem.channel` is an extensible enum (dine-in / delivery / catering / take-away — final list TBD in functional reqs). External integrations (Glovo/UberEats) are out of scope for M2.

### Risk Mitigations

| Risk | Mitigation |
|---|---|
| Sub-recipe cycle silently corrupts cost rollup | Cycle detection on save (graph walk pre-commit) — already in scope (J4) |
| Yield/waste suggestion goes stale or wrong | Citation URL stored alongside suggestion → user can verify; override-with-attribution preserves audit trail |
| Cost calculation drift from accumulated rounding | 100% test coverage on cost path + 0.01% tolerance budget |
| Chef expects historical accuracy from a "live" cost | UI label "Current cost" (uses live SupplierItem prices). Snapshot-at-order semantics arrive with M3. |
| `InventoryCostResolver` API breaks when M3 plugs in | Interface frozen at M2 ship; M3 implementation must conform |
| Multi-tenant data leak via crafted recipe queries | Repository-level org-scoping + integration tests mirror PRD-1's tenant-isolation pattern |
| Override picker UI confuses chef when M2 has no batches | M2 picker hides the "Expiry" column entirely (not greyed) when no batch context exists; reappears automatically once M3 lands |
| Paperclip data goes stale and informs decisions silently | Not integrated in M2 — chef sees only live SupplierItem data inside the picker |
| OFF data quality (gaps, errors) | Confidence indicator in UI; gaps fall back to manual entry; chef can override any OFF-pulled field with attribution |
| OFF brand-name mismatch | Fuzzy search + brand-aware ranking + chef confirmation step |
| ODbL share-alike clause (OFF data) | We use the data, we don't redistribute the DB. Compliance documented in `LICENSES.md` |
| OFF dump update breaks M2 lookup | Schema version pinning + integration tests; weekly refresh on CI before production rollout |
| Allergen false-negative (dish marked safe but contains allergen) | Conservative inference: ANY allergen tag on ANY ingredient ⇒ recipe carries that allergen tag. Chef override requires explicit reason + audit. Never auto-clear. |
| Label regulatory non-compliance (EU 1169/2011) | External legal review of template pre-launch. Allergen emphasis enforced in renderer (bold). Mandatory fields validated before print. |
| Cross-contamination not captured | Manual chef-override flag at recipe level: *"may contain traces of [allergen]"*. Audit-trailed. |
| Agent integration becomes coupled to backend code | Lint rule prohibits `import` from `hermes-*`/`claude-*`/`opencode-*` in `apps/api/`. Enforced at build time. |
| Standalone deployment regresses silently as agent features grow | Dual-mode CI runs full E2E in both modes on every PR. Agent-disabled E2E is the default smoke test. |
| Customer locked into Hermes specifically | MCP server passes the official MCP protocol test suite, not just "works with Hermes". Documented in operations runbook. |
| WhatsApp agent reply exceeds Meta's 5s timeout (M2.x) | Async-first design, reply-by-callback pattern documented in ADR-012; agent acknowledges immediately, follows up with full answer |
| Hindsight bank cross-tenant leak when Nexandro Enterprise multi-tenant lands | M2 reserves capability-based names; Nexandro Enterprise will add `-{orgId}` suffix as a clean migration |

---

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. AI-suggested yield/waste factors with cited sources.**
Existing escandallo tools ask the chef to invent the yield factor for every ingredient. nexandro pre-fills it from real data + surfaces the URL where the value came from (USDA FoodData Central, CIA Professional Chef, ICN cooking guides). Novel combination: **LLM-as-research-agent + structured kitchen factor + click-through citation**, executed inline at recipe-edit time.

**2. Decomposed food cost (4-factor model).**
Industry tooling collapses food cost into a single number per recipe. We split it into four explicit factors — `ingredient_price × yield × waste × batch_actual` — each auditable, configurable, source-cited. The chef answers *"why is the bolognese €0.20 more this week?"* in 30 seconds.

**3. Cost resolution as an interface, not an integer.**
The `InventoryCostResolver` seam in M2 returns `SupplierItem.unitPrice`. The same interface returns batch-FIFO cost in M3 with zero rewrite. Documented interface contract that survives a major module addition — uncommon in kitchen-management tooling that either ships full inventory from day one (heavyweight) or hardcodes a flat ingredient price (brittle).

**4. ⭐ Nutritional intelligence + auto-labels via Open Food Facts.**
M2 mirrors the Open Food Facts dataset (~3M branded products) into a hybrid local cache + API fallback. Each `Ingredient` carries `nutrition` + `allergens` + `dietFlags` + `brandName` pulled from OFF. Recipes auto-roll-up: kcal/macros per portion, allergen aggregation (with chef-overridable cross-contamination flag), diet inference (vegan if all ingredients vegan; gluten-free if no gluten anywhere). M2 ships **printable labels** rendering the rolled-up data in EU 1169/2011-compliant format (allergens emphasised per Article 21, ingredient list ordered by descending mass, kcal/macro panel). No commercial competitor combines AGPL + branded nutrition catalog + auto-label generation today.

**5. ⭐ Agent-ready, agent-optional architecture.**
The API is the contract; UI consumes it; any MCP-compatible agent (Hermes, OpenCode, Claude Desktop, ChatGPT-MCP-bridge, custom Python with the MCP SDK) consumes the same contract via a separable MCP server. Customers who refuse agents get full functionality via UI clicks; customers who want agents drop in their preferred one with a config change. Standalone-mode is tested in CI on every PR. Almost no other kitchen-management tooling treats agent compatibility as a first-class concern; those that ship "AI features" lock the customer into one specific provider's stack.

### Market Context & Competitive Landscape

| Aspect | tspoonlab / MarketMan / MarginEdge / Galley | nexandro M2 |
|---|---|---|
| Yield/waste suggestions | Manual entry; some have generic defaults, none cite sources | AI-suggested + URL provenance + chef override with attribution |
| Food cost transparency | Single rolled-up number per recipe | 4-factor decomposition with per-component drill-down |
| Multi-venue / channel | Paid feature (€€€) | Core, AGPL |
| Inventory-aware pricing | Tightly coupled to inventory module | Decoupled via `InventoryCostResolver` |
| **Branded ingredient catalog** | None (chef types name manually) | OFF mirror, ~3M products, barcode-ready |
| **Recipe macro rollup** | Premium tier in some (Galley); none in tspoonlab | Core, AGPL |
| **Auto-generated EU 1169/2011 labels** | None at this layer (or paid SaaS dedicated like Erudus) | Core, AGPL |
| **Agent / MCP compatibility** | None (proprietary AI features locked to vendor) | Standard MCP, any agent — or none |
| Open source | None at this layer | AGPL-3.0 |

The closest open-source competitor is **Stockd / MealMatrix / Galley**: enterprise focus, non-AGPL, no cited-source AI, no MCP layer. None decompose cost into 4 explicit factors. None ship dual-mode standalone/agent-integrated.

### Validation Approach

| Innovation | How we validate it works |
|---|---|
| AI yield/waste with citations | **Acceptance rate ≥ 70%** (Success KPI). Tracked per ingredient class. |
| AI source quality | **Pre-launch eval**: 50 hand-curated ingredients vs USDA / CIA. Disagreement > 5pp triggers prompt review. |
| Decomposed cost UX | **Audit-task time ≤ 30s** (Journey 2). In-app analytics. |
| `InventoryCostResolver` API stability | **Zero breaking changes** between M2 ship and M3 plug-in. |
| OFF integration coverage | **≥ 85% of Palafito's existing tspoonlab ingredients** find a confident OFF match on migration. |
| Macro rollup accuracy | **±5% of hand-calculated macros** on a sample of 30 recipes. Pre-launch eval. |
| Label compliance (1169/2011) | **External legal review** of the label template before MVP ship. |
| Diet flag inference accuracy | **≥ 95% precision** (false-positive vegan/gluten-free flags are dangerous). |
| Agent-ready dual mode | **CI dual-mode** test suite passes 100% on every PR (standalone E2E + agent-integrated E2E). |
| MCP protocol compliance | **MCP standard test suite** passes; tested against Hermes + OpenCode + Claude Desktop + raw Python MCP SDK (4 different consumers). |
| Switch-on simplicity | **Operator drill**: timed exercise turning standalone deployment into agent-integrated. Target ≤ 30 min. |

### Risk Mitigation (consolidated — see Domain §Risk Mitigations table for full list)

Key innovation-specific risks:
- LLM hallucinates a yield with no real source → hard requirement: every suggestion MUST carry a `citationUrl`. No source → no suggestion.
- OFF data quality / brand-name mismatch → confidence indicator + fuzzy search + chef override.
- Allergen false-negative → conservative inference, never auto-clear.
- Customer locked into one agent vendor → MCP standard, dual-mode CI, zero-coupling lint.

---

## SaaS B2B Specific Requirements

### Project-Type Overview

nexandro is a **multi-tenant capable, RBAC-driven, integration-rich SaaS B2B** kitchen operations platform. Module 2 extends a brownfield monolith (Turborepo + NestJS + TypeORM + PostgreSQL) with composable recipe engineering, live food costing, nutritional intelligence, EU 1169/2011-compliant labels, and an agent-ready API/MCP layer. Multi-tenancy is *capable* (every entity scoped to `organizationId`) but typical deployments are single-org self-hosted; Nexandro Enterprise SaaS edition activates true multi-tenancy.

### Technical Architecture Considerations

- **Stack lock**: Turborepo (apps/api NestJS, packages/types shared) + TypeORM + PostgreSQL — inherited from PRD-1 ADRs.
- **Internal DDD**: bounded contexts `Recipes`, `Ingredients`, `Inventory`, `Suppliers`, `Menus` separable later into microservices. M2 ships as one well-bounded monolith (premature microservices out of scope).
- **MCP server** packaged as a **separate Docker image / npm module**, independent of `apps/api`. Backend has zero compile-time dependency on it.
- **Background jobs**: OFF mirror sync (cron, weekly, active-passive table swap), recipe cost recalc on `SupplierItem.unitPrice` change.
- **Observability**: every API request, background job, and agent-tool call emits OTel spans; routed per `eligia-core` standard.

### Tenant Model

**See:** PRD-1 Organization → Location entity hierarchy + this PRD §Domain *"Multi-tenant isolation"* invariant.

M2 specifics: every M2 entity (`Recipe`, `RecipeIngredient`, `MenuItem`, plus retrofit `Ingredient.nutrition/allergens/dietFlags`) is scoped to `organizationId`. Repository-level org-filter mandatory. Integration tests assert no cross-org leak across all M2 endpoints.

Hindsight bank naming follows capability-based convention (`nexandro-recipes`, `nexandro-suppliers`, `nexandro-menus`) — single-tenant deployments share a bank per capability. Nexandro Enterprise SaaS will append `-{orgId}` suffix as a clean migration when needed.

### RBAC Matrix

**See:** PRD-1 [personas-jtbd.md](./personas-jtbd.md) §2 (RBAC matrix) — Owner / Manager / Staff with the canonical permission table.

M2 additions to the matrix:

| Action | Owner | Manager | Staff |
|---|:---:|:---:|:---:|
| Create / Edit / Delete Recipes | ✅ | ✅ | ❌ |
| Create / Edit / Delete MenuItems | ✅ | ✅ | ❌ |
| Override allergen tags (cross-contamination) | ✅ | ✅ | ❌ |
| Override OFF-pulled fields (nutrition, brand) | ✅ | ✅ | ❌ |
| Override AI yield/waste suggestions | ✅ | ✅ | ❌ |
| Print labels | ✅ | ✅ | ✅ |
| View recipes (read-only) | ✅ | ✅ | ✅ |
| Configure label template (org-level) | ✅ | ❌ | ❌ |

Allergen overrides require Manager+ because of regulatory implications (EU 1169/2011 cross-contamination disclosure).

### Subscription Tiers

Out of scope for M2. Documented in this PRD §Architectural Pillar end-note (Nexandro Enterprise three-tier model: Standalone AGPL / Standalone+Support / Standalone+Hermes-Managed) for forward planning, but no billing or entitlement enforcement ships in M2.

### Integration List

**See:** this PRD §Domain → Integration Requirements (full table). Summary:

| Integration | Direction | M2 status |
|---|---|---|
| M1 (Ingredients) | Read-only consumer | Active (with retrofit: `User.phoneNumber` + `Ingredient.nutrition/allergens/dietFlags/brandName/externalSourceRef`) |
| `InventoryCostResolver` interface | Internal contract (M3 plug-in point) | Defined + M2 implementation |
| Open Food Facts | Hybrid (local mirror + REST API fallback) | Active |
| MCP server `nexandro` | Agent-facing (any MCP client) | Active when agent enabled |
| Paperclip weekly supplier file | Informational only | Documented; not consumed |
| POS / delivery channels (Glovo, UberEats) | Out of scope | M2.x or later |

### Compliance Requirements

**See:** this PRD §Domain → Compliance & Regulatory (full detail). Summary:

- HACCP-aligned costing (FIFO physical + FIFO costing)
- EU 178/2002 traceability (audit-ready, not enforced in M2)
- GDPR — minimal PII (only `User.phoneNumber` retrofit; standard PRD-1 audit pattern)
- **EU Regulation 1169/2011 (NEW — M2 supersedes PRD-1 §4.11)**: full allergen handling, label rendering with Article 21 emphasis, Article 18 ingredient ordering, mandatory fields, pre-launch external legal review

### Implementation Considerations

- **Skip**: `cli_interface` (no CLI shipped with M2), `mobile_first` (responsive UI, not mobile-first — Owner mobile journey is read-only at launch)
- **Test pyramid**: unit → integration → E2E **dual mode** (standalone + agent-integrated, both required green on every PR)
- **Migrations**: TypeORM migrations versioned per release; M1-retrofit migrations (User, Ingredient extensions) ship as part of M2's initial migration set
- **Feature flags**: `NEXANDRO_AGENT_ENABLED`, `NEXANDRO_AI_YIELD_SUGGESTIONS_ENABLED`, `NEXANDRO_OFF_API_FALLBACK_ENABLED` — env vars, hot-swap on restart
- **DDD module boundaries enforced via lint** (no cross-module imports beyond declared interfaces)

---

## Functional Requirements

### Recipe Management

- **FR1**: Manager can create a Recipe with a name, description (i18n in org `defaultLocale`), and optional notes.
- **FR2**: Manager can compose a Recipe from any combination of Ingredients and other Recipes (sub-recipes).
- **FR3**: Manager can specify quantity and unit per RecipeIngredient line, validated against the ingredient's `baseUnitType` family per PRD-1 §4.3.
- **FR4**: Manager can override `yieldPercent` per RecipeIngredient line (default = ingredient-level value).
- **FR5**: Manager can specify a recipe-level `wasteFactor` (cooking loss / evaporation).
- **FR6**: System rejects any save that would create a sub-recipe cycle, naming both nodes and direction.
- **FR7**: Owner/Manager can soft-delete a Recipe; deleted Recipes appear in dependent MenuItem references with a "Discontinued" badge and are not selectable as new sub-recipes.
- **FR8**: Owner/Manager can view audit fields (`createdBy`, `updatedBy`, timestamps) on every Recipe.

### Cost Engineering

- **FR9**: System computes the live food cost of a Recipe by walking the sub-recipe tree and summing (ingredient cost × quantity × yield × (1 − waste)) per component.
- **FR10**: System resolves the cost-per-base-unit of every Ingredient at read time via a stable contract that can later be backed by batch-aware sources (M3) without changing callers.
- **FR11**: System uses the `isPreferred=true` SupplierItem as default cost source in M2.
- **FR12**: Manager can override the default cost source per RecipeIngredient line, choosing from the available sources for that Ingredient.
- **FR13**: Owner/Manager can view the per-component cost-history of a Recipe over a configurable window (default 14d), identifying the responsible source and price change.
- **FR14**: System recomputes dependent Recipe costs when any underlying SupplierItem price changes.
- **FR15**: System exposes a "what changed?" view — per-component delta of Recipe cost between two timestamps with attribution.

### AI-Assisted Authoring

- **FR16**: System suggests a `yieldPercent` for each Ingredient at first use, accompanied by a citation URL and a captured snippet of the source content (≤500 chars).
- **FR17**: System suggests a `wasteFactor` for a Recipe at creation, classified by recipe pattern (stew, sauté, grill, raw, etc.).
- **FR18**: Manager can accept, accept-then-tweak, or reject any AI suggestion; the override is recorded with attribution and (if rejected) the reason.
- **FR19**: System never produces an AI suggestion without a citation URL — if the model cannot cite, no suggestion is offered (manual entry only).

### Nutritional Intelligence (OFF-backed)

- **FR20**: System maintains a local mirror of the Open Food Facts catalog, refreshed periodically without service interruption.
- **FR21**: Manager can search Ingredients by name, brand, or barcode against the OFF mirror, with API fallback for cache misses.
- **FR22**: When an Ingredient is created from an OFF match, the system pre-fills `nutrition` (kcal + macros per 100g/ml), `allergens`, `dietFlags`, and `brandName`, recording `externalSourceRef`.
- **FR23**: Manager can override any OFF-pulled field with attribution + reason.
- **FR24**: System computes a Recipe's `macroRollup` (kcal and macros per finished portion AND per 100g) by summing ingredient macros × quantity × yield × (1 − waste).
- **FR25**: System aggregates allergens from all ingredients into a Recipe-level allergen list using conservative inference: ANY allergen in ANY ingredient bubbles up; never auto-clear.
- **FR26**: Manager can add a Recipe-level "may contain traces of [allergen]" cross-contamination note (free-text, audit-trailed).
- **FR27**: System infers Recipe-level `dietFlags` conservatively: a flag is true only if all ingredients carry it AND no contradicting allergen is present.
- **FR28**: Manager (Manager+ role only) can override aggregated allergens or inferred `dietFlags` with attribution and explicit reason.

### Menu & Pricing

- **FR29**: Manager can create a MenuItem linking exactly one Recipe to exactly one Location and exactly one Channel.
- **FR30**: Manager can set `sellingPrice` (in org currency) and `targetMargin` per MenuItem.
- **FR31**: System computes actual margin per MenuItem at read time as `sellingPrice − liveRecipeCost` and the percent vs `targetMargin`.
- **FR32**: Owner/Manager can view a margin report per MenuItem showing cost, sellingPrice, margin (absolute and %), and target-margin status.
- **FR33**: Owner can view a top/bottom MenuItem ranking by margin across all Locations and Channels for a configurable window (default 7d).

### Label Generation (EU 1169/2011)

- **FR34**: Manager can generate a printable label for any Recipe, rendering ingredients ordered by descending mass (Article 18), allergens visually emphasised (Article 21), the kcal/macro panel, net quantity, and org-configured contact info.
- **FR35**: System renders labels in the language matching the org `defaultLocale`.
- **FR36**: System refuses to print a label if any mandatory field is missing, naming the gap.
- **FR37**: Owner can configure org-level label fields (contact info, address, brand mark, postal address).

### Owner Reporting

- **FR38**: Owner can view a dashboard summarising the last 7d of MenuItem performance with top-5 / bottom-5 margin views.
- **FR39**: Owner can drill down from any MenuItem in the dashboard to its Recipe cost-history and per-component delta.
- **FR40**: Staff (read-only) can view any Recipe's ingredient list, allergens, dietFlags, and finished-portion macros.

### Agent-Ready Foundation

- **FR41**: System exposes every Recipe / MenuItem / Ingredient capability via a public API with parity to the UI — no UI-only actions exist.
- **FR42**: API responses include `missingFields` and `nextRequired` so a conversational caller can determine what's needed to complete a partial state.
- **FR43**: System can be deployed in standalone mode (no agent capability exposed) or agent-integrated mode (MCP server + web chat available); switching modes requires only configuration, not code changes.
- **FR44**: When agent-integrated, system exposes an MCP-standard server `nexandro` that any MCP-compatible client (Hermes, OpenCode, Claude Desktop, custom) can connect to.
- **FR45**: Agent actions are auditable — every action records `executedBy=<human user>, viaAgent=true, agentName=<…>` when invoked through the MCP layer; the human user retains responsibility per the hybrid identity model.

### Cross-Cutting (inherited from PRD-1, restated)

- **FR46**: Owner/Manager/Staff RBAC matrix is enforced on every Recipe/MenuItem/Ingredient action per PRD-1 personas-jtbd.md §2; allergen and OFF-field overrides require Manager+.
- **FR47**: Every entity is scoped to `organizationId`; cross-org reads or writes are rejected at repository level.
- **FR48**: Every entity carries `createdBy`, `updatedBy`, `createdAt`, `updatedAt` audit fields per PRD-1 pattern.

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP type: Platform-with-Differentiators.** This is *not* a single-problem MVP nor a revenue MVP (AGPL, no billing in M2). It's a foundational platform layer that makes future modules viable (M3, M4) **plus** ships clear user-facing differentiators (decomposed cost, nutritional intelligence, agent-ready architecture, EU 1169/2011 labels) that win the first customer (Palafito) and seed external adoption.

**MVP success = the union of three validations:**
1. **Tspoonlab cancellable** at Palafito by annual renewal date (the contractual win)
2. **Nutritional intelligence credible** — chef trusts AI yields ≥70%, OFF lookup hit ≥85%, labels pass legal review
3. **Architecture survives M3 plug-in** — `InventoryCostResolver` interface contract holds; standalone-mode CI never breaks

If all three trigger, M2 is a successful MVP regardless of GitHub-stars-style vanity metrics.

**Resource requirements (rough):**
- Backend: 1-2 devs (NestJS + TypeORM + PostgreSQL + MCP protocol experience)
- Frontend: 1 dev (React + shadcn/ui + responsive UI + label rendering — `react-pdf` or similar)
- PM/UX: part-time (Master + John as PM facilitator)
- External: 1 legal reviewer for label template (one-shot, pre-launch)
- Effort: **5-7 calendar months** for MVP, given the C/A/C scope expansion

### MVP Feature Set (Phase 1 = M2 MVP)

**Core user journeys supported (J1–J4 from User Journeys section):** Head Chef builds recipe with sub-recipes / AI yields / OFF macros / allergen rollup / label print; Head Chef investigates cost spike via per-component drill-down; Owner reads bottom-5 margin ranking; cycle detection on save. *(J5 — WhatsApp recipe creation — is documented as forward-looking design intent; M2.x delivers.)*

Must-have capabilities are deduplicated reference to **Product Scope §MVP** earlier in this PRD (the canonical list).

### Post-MVP Features

See **Product Scope → Module Roadmap** above for the canonical phase table (M2 → M2.1 → M3 → M4 with deleted M5). Phased grouping summary:

- **Phase 2 — Growth (M2.1, ~2-3 months post-M2)**: WhatsApp multi-user, recipe versioning, instructions+photos, scaling math, multi-supplier resolution, thermal printers, QR labels, multi-language labels, voice entry, photo storage.
- **Phase 3 — Expansion (M3, M4, post-M2.1)**: Inventory + Batches + Receiving (foto OCR, NFC); HACCP / Traceability; AI recipe suggestions from inventory; AI margin-impact predictions; community recipe library.

### Risk Mitigation Strategy

**Technical risks:**

| Risk | Mitigation |
|---|---|
| OFF integration complexity (data quality, schema drift, sync reliability) | Start with API-only fallback during dev; migrate to mirror before MVP. Schema-version pin + integration tests gate the weekly sync. |
| Label regulatory compliance (1169/2011) is binary — pass or fail | External legal review pre-launch. Renderer enforces emphasis + ordering at code level (not human-checked per print). |
| Agent-ready dual-mode CI doubles CI cost | Standalone is the default smoke; agent-integrated runs on PR-merge. Mock MCP server avoids needing live Hermes in CI. |
| Cost calculation accumulated rounding drift | ATDD before any cost code lands. 100% coverage on cost path. 0.01% tolerance budget. |
| Recipe cycle detection slow on deep graphs | Pre-commit graph walk capped at depth 10. Beyond → reject with clear error. |
| MCP protocol drift breaks integrations | Pin to a specific MCP spec version; upgrade in dedicated PRs with full agent-integrated suite green. |

**Market risks:**

| Risk | Mitigation |
|---|---|
| Palafito doesn't actually need full nutritional layer (over-engineering) | Validated: tspoonlab paid + chef explicitly wants this. First-user pain is real. |
| External adoption (GitHub stars) overhyped — won't materialise | KPI is loose (1 install in 6 months). MVP success doesn't depend on it. |
| Closed-source competitors clone the differentiators | AGPL + first-mover + Hermes ecosystem moat. MVP focus on Palafito; growth focuses on community. |
| Allergen mishap causes regulatory liability | External legal review + conservative inference (never auto-clear) + chef-override audit trail. |
| Open Food Facts shuts down or changes ODbL terms | Local mirror gives offline survival. Could pivot to USDA + CIQUAL (smaller, generic-only) as fallback. |

**Resource risks:**

| Risk | Mitigation |
|---|---|
| 5-7 month estimate slips past tspoonlab renewal | Renewal is ~10-11 months out → buffer of 3-5 months. Kill candidates ranked: web chat widget (defer to M2.x), hybrid OFF (could ship API-only as MVP), label template polish. |
| Solo dev on critical paths (cost calc + label rendering = regulatory-sensitive) | Pair on these two paths. ATDD reduces solo-dev risk by making intent explicit. |
| Legal reviewer unavailable / expensive | Identify reviewer in month 2 of build (not month 6). Have a generic compliant template as plan-B. |
| Hindsight banks not isolated → cross-tenant agent leak in Nexandro Enterprise SaaS | Naming convention reserved now (capability-only). Enterprise SaaS adds `-{orgId}` suffix as a clean migration when needed. |
| Agent integration becomes coupled to specific vendor (Hermes) | Lint rule `apps/api/` blocks `import` from agent vendors. Dual-mode CI runs standalone E2E on every PR. |

### Kill Criteria (when do we stop / pivot?)

- If OFF lookup hit rate at Palafito catalog is < 50% after 3 months of dev → drop OFF mirror, ship manual-entry-only with optional barcode lookup later
- If label legal review fails twice → ship M2 without label generation, label as M2.1 hard requirement
- If standalone-mode E2E becomes flaky for 2 consecutive weeks → freeze agent feature work until stable
- If Palafito chef rejects the AI yield UX (acceptance < 30% in first month) → drop the citation surface, fall back to plain manual yields with no suggestion (lower differentiator but ships faster)

---

## Non-Functional Requirements

### Performance

- Recipe edit → live cost update propagation: **< 200ms p95**
- Cost recalculation across all dependent recipes (5-level sub-recipe depth): **< 500ms p95**
- Owner dashboard load: **< 1.5s p95**
- Read-only recipe view on slow Wi-Fi: **< 1s p95**
- OFF lookup (local mirror hit): **< 100ms p95**
- OFF lookup (API fallback): **< 1s p95**
- Label PDF generation: **< 2s p95** (server-side render)
- WhatsApp agent reply (M2.x): **< 5s p95** end-to-end (Meta requirement)

### Reliability

- Failed cost calculations / total: **< 0.1%** rolling 7d
- OFF mirror sync: **zero downtime** (active-passive table swap)
- `entity.overwritten` event delivery: **at-least-once** within 30s of overwrite

### Testing

- Cost-calculation path: **100% unit test coverage**
- Recipe-cycle detection: covered by ATDD before any real recipe-cycle attempt is possible in production
- API parity: ATDD verifies every UI action has an equivalent API action
- Partial-state acceptance: ATDD verifies endpoints respond cleanly to draft / partial / over-specified inputs
- **Dual-mode E2E**: full E2E suite runs in standalone AND agent-integrated configurations on every PR
- MCP protocol compliance: official MCP test suite + integration tests against ≥ 3 distinct MCP clients
- Multi-tenant isolation: integration tests assert no cross-org data leak across all M2 endpoints
- Bank-id isolation (when agent enabled): tests assert recall on `nexandro-recipes` never returns records from `nexandro-suppliers` or other org banks

### Operability

- Two deployment modes (standalone, agent-integrated) documented in operations runbook
- Switch-on time (standalone → agent-integrated): **≤ 30 min** of operator time, measured by timed drill
- Health checks: `/api/health`, `/api/health/agent-integration`, `/api/health/off-mirror`
- Background jobs (OFF sync, cost recalc) emit OTel spans for observability

### Security

- API parity does not bypass RBAC: every endpoint enforces the PRD-1 RBAC matrix (Owner/Manager/Staff)
- Allergen overrides require Manager role minimum (regulatory implications)
- `User.phoneNumber` PII handled per PRD-1 audit pattern; never logged in plaintext
- MCP server, when enabled, requires authentication (token-based; tied to `nexandro-agent` service-account)
- Zero-coupling lint: `apps/api/` source code prohibited from importing `hermes-*`, `claude-*`, `opencode-*` packages

### Scalability

- Typical deployment: single-org self-hosted; ~50-100 concurrent users per deployment in MVP. No autoscaling assumed.
- OFF mirror: sustains ≥ 10,000 lookups/day with ≥ 85% local-cache hit rate. API fallback covers misses.
- Recipe graph depth: practical depth ≤ 5 levels; cycle detection rejects saves beyond depth 10 with clear error.
- Nexandro Enterprise SaaS (out of M2 scope) will require horizontal scaling; designed-for via stateless API + bank-id `-{orgId}` suffix migration path documented.

### Accessibility

- Kitchen UI (tablet-first): keyboard-navigable; color contrast ≥ WCAG-AA on critical screens (recipe view, label preview, Owner dashboard).
- Allergen badges and diet flags NEVER communicated by color alone — icon + text always (regulatory + accessibility).
- Customer-facing labels (PDF): WCAG-AA accessible-PDF export deferred to M2.x (Growth-tier).
- Screen-reader friendly error messages (cycle detection, validation, label-missing-fields) — explicit text, not just icons.

### Integration

- OFF mirror sync tolerates upstream OFF API outages — last-known cache used; warning emitted; sync retries on next cron tick.
- MCP server passes the official MCP protocol test suite **plus** conformance tests against ≥ 3 distinct clients (Hermes, OpenCode, Claude Desktop, raw Python MCP SDK).
- API contract semver-pinned; breaking changes require ≥ 1 minor version deprecation notice.
- M1 ingredient picker integration is strict read-only — M2 never mutates M1 data; tested at integration level.

### Maintainability

- Internal DDD with bounded contexts (`Recipes`, `Ingredients`, `Inventory`, `Suppliers`, `Menus`)
- `InventoryCostResolver` interface contract documented in `apps/api/src/recipes/cost/README.md` with stability guarantees
- ADR for every supersede of PRD-1 (e.g., the M2 supersede of §4.11 allergens lands as a new ADR)
- API contract version pinned (semver); breaking changes require deprecation cycle
- **UI component library curation.** Components developed first in **Storybook with stories** before integration into screens; **design review** required for any non-trivial component (criterion: ≥ 1 alternative explored per component). Promoted to `packages/ui-kit/` only after design review approval. Base = **shadcn/ui + Tailwind CSS**. nexandro-specific components (`RecipePicker`, `MacroPanel`, `AllergenBadge`, `LabelPreview`, `AgentChatWidget`) live in this package. **Storybook published in CI** for static review on every PR.

---
