---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
inputDocuments:
  - docs/prd-module-2-recipes.md
  - docs/prd-module-1-ingredients.md
  - docs/personas-jtbd.md
  - docs/architecture-decisions.md
  - docs/data-model.md
  - docs/project-structure.md
  - _bmad-output/planning-artifacts/implementation-readiness-report-2026-04-27.md
workflowType: 'architecture'
project_name: nexandro
user_name: Master
date: '2026-04-27'
moduleScope: 'Module 2 — Recipes / Escandallo + Nutritional Intelligence + Auto-Labels'
gateContext: 'Phase 2 (post-Gate-A) of BMAD+OpenSpec runbook v0.5.0; UX Track running in parallel'
inheritedADRs: 'M1 stack lock — Turborepo + NestJS + TypeORM + PostgreSQL'
canonicalTargets:
  - docs/architecture-decisions.md (APPEND new ADRs)
  - docs/data-model.md (EXTEND with M2 entities)
explicitGapsToResolve:
  - 'AI yield-suggestion model selection (gpt-oss-20b-rag vs claude-haiku-hermes vs other)'
  - 'Recipe lifecycle states (draft / published / archived semantics)'
  - 'Label generation engine (PDF library choice)'
  - 'M2.x WhatsApp allowlist policy (likely defer to M2.x PRD)'
---

# Architecture Decision Document — nexandro Module 2

**Module:** 2 — Recipes / Escandallo + Nutritional Intelligence + Auto-Labels
**Author:** Master (facilitated by Winston, BMAD Architect)
**Date:** 2026-04-27
**Status:** Draft — In progress, post-Gate-A approval (PM signoff 2026-04-27)
**Workflow:** `bmad-create-architecture` step 4 of 8 complete (steps 2-3 consolidated as light ceremony)

---

## Architecture decisions written

10 ADRs appended to canonical [docs/architecture-decisions.md](../../docs/architecture-decisions.md):

| ADR | Title | Decided |
|---|---|---|
| ADR-010 | M2 DDD Bounded Contexts (Recipes / Menus / Labels / Nutritional Catalog) | direct from PRD |
| ADR-011 | InventoryCostResolver as M2→M3 architectural seam | direct from PRD |
| ADR-012 | Open Food Facts hybrid integration (local mirror + API fallback) | direct from PRD |
| ADR-013 | MCP-server is Community core; agent runtimes stay BYO/Enterprise (clarifies ADR-005) | direct from PRD |
| ADR-014 | Cycle detection on sub-recipe save (graph walk pre-commit, depth cap 10) | direct from PRD |
| ADR-015 | Cost calculation precision (4 decimal internal, 2 display, ≤0.01% tolerance) | direct from PRD |
| ADR-016 | No formal Recipe lifecycle states in MVP (versioning is Growth-tier) | Master confirmed Fork 3 |
| ADR-017 | Full EU 1169/2011 allergen handling (supersedes PRD-1 §4.11) | direct from PRD |
| ADR-018 | AI yield-suggestion model — `gpt-oss-20b-rag` via OpenRouter, abstracted behind `YieldSuggestionModel` interface | Master confirmed Fork 1.A |
| ADR-019 | Label generation via `@react-pdf/renderer` (Storybook-previewable components) | Master confirmed Fork 2.A |

## Data-model extension written

Appended to canonical [docs/data-model.md](../../docs/data-model.md):

- New entities: `Recipe`, `RecipeIngredient` (with `ingredientId|subRecipeId` polymorphism), `MenuItem`
- New table: `external_food_catalog` (OFF mirror)
- Ingredient extensions: 6 new columns (`nutrition`, `allergens`, `dietFlags`, `brandName`, `externalSourceRef`, `yieldPercentDefault`)
- User retrofit: `phoneNumber` (E.164, nullable) for future WhatsApp routing
- Cascade rules + design-rules sections cross-reference the new ADRs

## Forks resolved

- **Fork 1 (AI yield-suggestion model)**: A = `gpt-oss-20b-rag` via OpenRouter (already wired, cheapest, Hindsight-validated). Abstracted behind `YieldSuggestionModel` interface for future swap.
- **Fork 2 (PDF library for labels)**: A = `@react-pdf/renderer` (same React stack as UI, Storybook-previewable). Puppeteer documented as fallback if CSS limitations bite.
- **Fork 3 (Recipe lifecycle states)**: NO formal states in MVP. Versioning is Growth-tier. FR42 missingFields/nextRequired covers conversational partial-state UX.

## Gaps still open (deferred to later modules / phases)

- M2.x WhatsApp allowlist policy (Owner+Manager only? all roles opt-in? org-level toggle?) — resolves in M2.x PRD when WhatsApp multi-user lands.

---

## Step 5 — Implementation Patterns (consolidated, light ceremony)

The patterns that prevent AI agent (and human) implementation drift in M2 are **inherited from M1** + **made explicit in M2 ADRs**. No new patterns invented here; cross-references below.

| Pattern | Source | Purpose |
|---|---|---|
| Modular monolith with DDD bounded contexts | ADR-001 (M1) + ADR-010 (M2) | Separable-to-microservices later; cross-context calls go through ports |
| API-first with OpenAPI/Swagger | ADR-002 (M1) | All endpoints atomic, semantically named, MCP-tool-ready |
| Multi-tenant by `organizationId` | ADR-004 (M1) | Repository-level org filter; integration tests assert no cross-org leak |
| RBAC per-endpoint via NestJS guards | ADR-006 (M1) | `@Roles('OWNER', 'MANAGER')` decorator; allergen overrides require `Manager+` |
| Soft-delete with `isActive` | ADR-009 (M1) | "Discontinued" badges in UI; reactivation by Owner/Manager |
| Port + Adapter (`InventoryCostResolver`) | ADR-011 (M2) | M2→M3 seam; M2DefaultCostResolver swappable by M3FifoBatchResolver without refactor |
| Pre-commit graph walk for sub-recipe cycles | ADR-014 (M2) | DFS, depth cap 10, error names both nodes |
| `numeric(18,4)` + half-even display rounding | ADR-015 (M2) | ≤0.01% rollup tolerance; 100% test coverage on cost path |
| Conservative allergen aggregation | ADR-017 (M2) | ANY allergen on ANY ingredient bubbles up; never auto-clear |
| AI suggestion REQUIRES citation | ADR-018 (M2) + PRD FR19 | If model can't cite, no suggestion offered |
| Storybook-first UI component curation | ai-playbook UX track v0.5.0 | Components live in `packages/ui-kit/`; design review for non-trivial |
| Zero-coupling lint (`apps/api/` → no agent vendors) | ADR-013 (M2) | `eslint-plugin-import` `no-restricted-paths` |
| Dual-mode CI (standalone + agent-integrated) | ADR-013 (M2) | E2E suite runs both configurations on every PR |

## Step 6 — Project Structure (M2 additions)

Updated [docs/project-structure.md](../../docs/project-structure.md) with:

**New backend bounded contexts** (under `apps/api/src/`):
- `recipes/` (with `cost/` for InventoryCostResolver)
- `menus/`
- `labels/`
- `nutrition-catalog/` (with `sync/` for weekly OFF cron)

**New monorepo packages** (under `packages/`):
- `ui-kit/` (shadcn/ui-based shared components, Storybook-curated)
- `mcp-server/` (separable MCP server, ADR-013)
- `label-renderer/` (`@react-pdf/renderer` EU 1169/2011 components, ADR-019)

**Frontend** (`apps/web/`): inherits the existing dashboard structure; Module 2 adds routes for Recipes, Menus, Labels, and the optional WebChat widget (feature-flagged per ADR-013).

## Step 7 — Validation (checklist)

| Check | Result |
|---|---|
| Every PRD FR has an architectural home | ✅ FR1-FR48 mapped to ADR-010 contexts |
| Every PRD NFR has architectural support | ✅ Performance (ADR-015), Reliability (ADR-014), Testing (ADR-013 dual-mode + ADR-015 100% coverage), Operability (ADR-013 standalone+agent modes), Security (ADR-006 RBAC + ADR-013 zero-coupling), Scalability (ADR-014 depth cap), Accessibility (UX track), Integration (ADR-011 + ADR-012 + ADR-013), Maintainability (ADR-010 DDD + ADR-019 Storybook) |
| Architectural Pillar (Agent-Ready, Agent-Optional) reflected | ✅ ADR-013 supersedes ADR-005's MCP scope; standalone-mode dual CI; zero-coupling lint |
| 3 explicit gaps from readiness check | ✅ AI yield model (ADR-018), Recipe lifecycle (ADR-016), WhatsApp allowlist (deferred to M2.x — documented above) |
| OFF integration ODbL compliance | ✅ ADR-012 documents license posture |
| EU 1169/2011 supersede | ✅ ADR-017 explicitly supersedes PRD-1 §4.11 |
| `InventoryCostResolver` API-stability contract | ✅ ADR-011 + Technical Success KPI |
| No new tech bets without ADR | ✅ All 10 ADRs cover M2's irreversible choices |
| Inheritance from PRD-1 + M1 ADRs | ✅ Cross-referenced; no duplication |
| Brownfield consistency | ✅ Stack lock unchanged (NestJS + TypeORM + PostgreSQL); patterns inherited |

**No critical issues found.** The architecture is internally consistent, fully traces to PRD requirements, and respects the inheritance from M1.

## Step 8 — Completion & Handoff

**Architecture phase complete.** Outputs:

| Artefact | Location |
|---|---|
| ADRs 010-019 (10 new) | [docs/architecture-decisions.md](../../docs/architecture-decisions.md) |
| M2 entity definitions + ERD | [docs/data-model.md](../../docs/data-model.md) |
| M2 directory structure | [docs/project-structure.md](../../docs/project-structure.md) |
| Workflow trail (BMAD step audit) | this file |

**Next gate:** **Gate B** — PM/Architect (Master) approves the tech bets + UX coherence. Per the ai-playbook v0.5.0 runbook, Gate B waits on **both Architecture and UX**.

**UX track**: not yet started for M2 — that's the next phase, can run via `bmad-create-ux-design` either in parallel (if Master wants) or after Architecture sign-off.

**After Gate B**: slicing into ~10 OpenSpec changes (per readiness-report Step 5 preliminary slice + recommended adjustments) → Gate C → per-change `/opsx:propose` → `/opsx:apply` → `/opsx:archive`.
