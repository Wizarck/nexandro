---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentInventory:
  prd:
    canonical: docs/prd-module-2-recipes.md
    workflowArtifact: _bmad-output/planning-artifacts/prd.md
    siblingPRDs:
      - docs/prd-module-1-ingredients.md
  architecture:
    moduleScope: Module 1 only (no Module 2 ADRs yet)
    files:
      - docs/architecture-decisions.md
  epics:
    files: []
    status: not-yet-created (post-Gate-B per runbook)
  uxDesign:
    files: []
    status: not-yet-created (planned for between Gate A and Gate C, per option 2 of UX track design)
date: 2026-04-27
project: nexandro
moduleScope: Module 2 — Recipes / Escandallo + Nutritional Intelligence + Auto-Labels
contextFromCaller: |
  Brownfield project; M1 in flight; M2 PRD just completed.
  Architecture/UX/Epics for M2 do NOT yet exist — they come AFTER Gate A approval per .ai-playbook/specs/runbook-bmad-openspec.md.
  Validate the PRD ALONE; don't flag missing UX/Architecture/Epics as failures (they're expected gaps).
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-27
**Project:** nexandro
**Scope:** Module 2 — Recipes / Escandallo + Nutritional Intelligence + Auto-Labels

## Step 1 — Document Discovery

### PRD documents found

| Path | Role | Notes |
|---|---|---|
| `docs/prd-module-2-recipes.md` | **Canonical M2 PRD** (assessment target) | 831 lines, 12 ## sections, 48 FRs, status: pending Gate A |
| `_bmad-output/planning-artifacts/prd.md` | Workflow artifact (BMAD step-1→12 trail) | Mirror of canonical with `../../docs/` relative paths and full BMAD frontmatter |
| `docs/prd-module-1-ingredients.md` | Sibling — M1 PRD (already approved v2.0) | M2 inherits from this; not the assessment target |

**Duplicate handling**: The two M2 files are not a problematic duplicate — by design, `_bmad-output/` keeps the workflow trail (BMAD step audit) while `docs/` holds the project-canonical. Assessment uses `docs/prd-module-2-recipes.md`.

### Architecture documents found

| Path | Role | Notes |
|---|---|---|
| `docs/architecture-decisions.md` | M1 ADRs | M2 adds NEW ADRs (OFF integration, MCP separability, label PDF library, agent-ready dual-mode CI) — pending Gate B |

### Epics & Stories documents

**None found.** Expected per the runbook (epics created post-Gate B; user stories per OpenSpec change post-Gate C).

### UX Design documents

**None found** for M2. Expected — the project's UX track lands between Gate A and Gate C per Option 2 of the UX-design track decision.

The file `_bmad-output/research/ai-playbook-ux-skills-analysis.md` matched the search pattern but is unrelated (it's the 5-repo skill curation research, not M2 UX mocks).

### Critical issues

✅ **No blocking duplicates**. The PRD copy at `_bmad-output/planning-artifacts/prd.md` is the workflow artifact; `docs/prd-module-2-recipes.md` is canonical.

⚠️ **Expected gaps** (NOT blockers per the runbook gate sequence):
- Architecture/Data-model extension for M2 → produced by `bmad-create-architecture` post-Gate A.
- Epics & Stories for M2 → produced post-Gate B per runbook §3.
- UX Design for M2 → produced between Gate A and Gate C (Option 2 of UX-track design).

These gaps will be skipped (not flagged as failures) in subsequent assessment steps per the caller's explicit guidance.

## Step 2 — PRD Analysis

The full PRD is at [`docs/prd-module-2-recipes.md`](../../docs/prd-module-2-recipes.md). Requirements summary below; all FRs/NFRs are referenced rather than copied (PRD is source of truth, report is index).

### Functional Requirements (48 total, 8 capability areas)

| Capability area | FR range | Count | Coverage source |
|---|---|---|---|
| Recipe Management | FR1–FR8 | 8 | Journey 1, Journey 4, Domain §Compliance |
| Cost Engineering | FR9–FR15 | 7 | Journey 1, Journey 2, Innovation pillar 2-3 |
| AI-Assisted Authoring | FR16–FR19 | 4 | Innovation pillar 1, Domain §Risk Mitigations |
| Nutritional Intelligence (OFF-backed) | FR20–FR28 | 9 | Innovation pillar 4, Journey 1, EU 1169/2011 §Compliance |
| Menu & Pricing | FR29–FR33 | 5 | Journey 1, Journey 3, Owner JTBD |
| Label Generation (EU 1169/2011) | FR34–FR37 | 4 | Innovation pillar 4, Domain §Compliance |
| Owner Reporting | FR38–FR40 | 3 | Journey 3, Owner JTBD |
| Agent-Ready Foundation | FR41–FR45 | 5 | Architectural Pillar, Journey 5 (forward-looking) |
| Cross-Cutting (PRD-1 inheritance) | FR46–FR48 | 3 | RBAC, multi-tenancy, audit (inherited from PRD-1) |

**Total: 48 FRs.** Each follows the format `[Actor] can [capability]`, implementation-agnostic. Verbatim list is in [`docs/prd-module-2-recipes.md` §Functional Requirements](../../docs/prd-module-2-recipes.md#functional-requirements).

### Non-Functional Requirements (9 categories)

| Category | Source section in PRD | Coverage |
|---|---|---|
| Performance | NFR §Performance | 8 latency targets (cost update, dashboard, OFF lookup, label PDF, WhatsApp) |
| Reliability | NFR §Reliability | Failed-cost-calc <0.1%, OFF zero-downtime, entity-overwritten event delivery |
| Testing | NFR §Testing | 100% cost-path coverage, ATDD, dual-mode E2E, MCP protocol compliance, multi-tenant + bank-id isolation |
| Operability | NFR §Operability | 2 deployment modes, switch-on ≤30 min, health checks, OTel |
| Security | NFR §Security | RBAC parity, Manager+ allergen overrides, phoneNumber PII, MCP auth, zero-coupling lint |
| Scalability | NFR §Scalability | Single-org self-hosted typical; OFF mirror ≥10K lookups/day; recipe depth ≤5; Enterprise SaaS migration path |
| Accessibility | NFR §Accessibility | Tablet-first WCAG-AA on critical screens; allergen badges never color-only; screen-reader friendly errors |
| Integration | NFR §Integration | OFF outage tolerance; MCP test suite + 3-client conformance; semver pinning; M1 strict read-only |
| Maintainability | NFR §Maintainability | DDD bounded contexts, interface contract docs, ADRs per supersede, **UI library curation (Storybook + design review)** |

### Additional Requirements & Constraints

- **Architectural pillar (Agent-Ready, Agent-Optional)**: 13 principles formalised in dedicated section; spans FRs 41-45 + NFRs Testing/Operability/Maintainability.
- **Locked design — Ingredient Sourcing UX**: per-row "Edit source" picker with M2 (no batches) vs M3 (with batches) column behaviour explicitly tabulated. PRD §Domain.
- **Inheritance from PRD-1**: explicit list (Organization → Location, RBAC, currency, i18n, audit, soft-delete, CSV import/export pattern). PRD §Project Classification.
- **Supersedes**: PRD-1 §4.11 (allergens, fully expanded in M2). Documented in Project Classification table.
- **Module 5 absorption**: planned "Nutrition & Labels" module deleted; absorbed into M2 with full justification in scopeExpansions frontmatter.
- **Risk Mitigations**: 16-row consolidated table in Domain §Risk Mitigations + Innovation §Risk Mitigation (with cross-ref to avoid duplication) + Project Scoping §Risk Mitigation Strategy (organised by Technical/Market/Resource).
- **Kill criteria**: 4 explicit pivot triggers documented in Project Scoping §Kill Criteria.

### PRD Completeness Assessment

**Initial verdict (deeper analysis follows in steps 3-6):**

✅ **Capability contract complete** — 48 FRs cover every JTBD, every Innovation pillar, every MVP scope item.
✅ **Capability traceability** — every FR traces back to at least one User Journey, Innovation pillar, or Domain requirement.
✅ **NFR coverage** — all 5 BMAD-recommended categories present (Performance, Security, Scalability, Accessibility, Integration) plus 4 additional (Reliability, Testing, Operability, Maintainability).
✅ **Inherited from PRD-1** — explicitly cross-referenced; no PRD-1 content duplicated; supersedes documented.
✅ **No `❓ CLARIFICATION NEEDED` markers** present in the PRD.
✅ **Architectural pillar (Agent-Ready) self-contained** — 13 principles + 2 deployment modes + dual-mode CI requirement.

⚠️ **Implicit gaps** (assessed in steps 3-5):
- `gpt-oss-20b` LiteLLM alias is referenced in inherited M1 RAG context but not formally adopted as M2's AI yield-suggestion model — could be a polish gap.
- Recipe versioning is in Growth scope but FR1-FR8 don't define version semantics for the MVP draft state — may need explicit "draft entity has no version, becomes v1 on publish".
- M2.x WhatsApp routing references the WA-MCP `allowedlist` but doesn't enumerate which roles get auto-allowlisted at deployment time.

These will be assessed concretely in step 3+ against the architecture/UX/epics gap (caller has approved that we won't fail on missing artifacts).

### Auto-proceeding to Step 3 — Epic Coverage Validation

Per step-2 spec, no menu — auto-proceed.

## Step 3 — Epic Coverage Validation

**Status: SKIPPED — out of scope per caller guidance.**

The runbook ([.ai-playbook/specs/runbook-bmad-openspec.md](../../.ai-playbook/specs/runbook-bmad-openspec.md) §3) places epic creation AFTER Gate B (architecture approved). M2 has not yet passed Gate A; there are zero epics or OpenSpec changes to validate.

This is the canonical state at this point in the workflow:
- ✅ PRD complete (Gate A pending)
- ❌ Architecture/ADRs not started (Gate A blocks)
- ❌ Epics/Stories not started (Gate B blocks)
- ❌ OpenSpec changes not started (Gate C blocks)

When epics are eventually created (post-Gate-B-and-C), running this skill again will populate the Coverage Matrix and Missing Requirements sections. For now, the section is intentionally empty.

### Coverage Statistics (deferred)

- Total PRD FRs: **48** (from Step 2)
- FRs covered in epics: **N/A — epics not yet created**
- Coverage percentage: **N/A — assessment deferred to post-Gate-C re-run**

### Auto-proceeding to Step 4 — UX Alignment

## Step 4 — UX Alignment

### UX Document Status

**Not found for M2** — and that is **expected**, not a failure.

- The agreed UX track (Option 2 from the M2 PRD discovery) places UX design between Gate A and Gate C, AFTER PRD approval and BEFORE OpenSpec slicing. M2 has not yet passed Gate A.
- The PRD heavily implies UI: kitchen tablet UI, Owner mobile dashboard, web chat widget, label preview, recipe editor, source override picker, dashboard ranking, allergen badges, etc.
- 5 distinct User Journeys are documented in the PRD (J1-J4 MVP, J5 forward-looking) → ≥4 mock surfaces will be needed during the UX track.
- Component library curation already documented in NFR §Maintainability (Storybook + `packages/ui-kit/` + design review for non-trivial components).

### Alignment Issues

**Cannot assess alignment yet.** UX-vs-PRD and UX-vs-Architecture gaps will be checked once `bmad-create-ux-design` runs (post-Gate-A).

What CAN be validated now is that the PRD provides enough capability detail to drive the UX track:

✅ **Sufficient capability detail for UX track** — every Journey reveals named capabilities (Recipe CRUD, sub-recipe selection, override-with-attribution, live cost rollup, macro panel, allergen badges, label preview, MenuItem CRUD, margin display, dashboard ranking, source override picker). The Journey Requirements Summary table cross-references journeys → capabilities.

✅ **Locked design — Ingredient Sourcing UX** is documented at the field level (M2 vs M3 column behaviour table) — the picker UX is partially locked already in the PRD itself, easing the UX track.

✅ **Component candidates pre-named in PRD** — `RecipePicker`, `MacroPanel`, `AllergenBadge`, `LabelPreview`, `AgentChatWidget` are explicitly listed in NFR §Maintainability for the future `packages/ui-kit/` package.

⚠️ **Tone / interaction feel** — the PRD focuses on capability and structure. Brand voice, micro-interaction patterns, motion language are not specified. The UX track will need to define these (per Option 2 of the UX-track design, or per Impeccable / taste-skill / awesome-design-md DESIGN.md format from the research doc).

### Warnings

| Warning | Severity | Owner |
|---|---|---|
| UX track output format not yet locked (DESIGN.md per awesome-design-md? MASTER.md per ui-ux-pro-max? Inline mocks per Impeccable?) | ⚠️ Medium | To resolve in the ai-playbook upstream PR (todo item below) |
| Tone/voice/motion guidelines absent from PRD | ⚠️ Low | UX track will define; not a PRD gap |
| `AgentChatWidget` and `LabelPreview` are flagship components but no design review checklist defined yet | ⚠️ Low | To define in the UX track once started |

### Auto-proceeding to Step 5 — Epic Quality Review

## Step 5 — Epic Quality Review

**Status: SKIPPED (no epics yet) + forward-looking slice review.**

Epics are created post-Gate-B per the runbook. This step would normally check user-value focus, epic independence, story dependencies, sizing, and acceptance criteria. None of those exist for M2 yet.

However, the PRD discovery surfaced a **preliminary slicing** of M2 into ~8 OpenSpec changes (see PM/John conversation log). Apply BMAD epic best-practices early to that preliminary slice as a sanity check:

### Preliminary M2 OpenSpec change list (forward-looking review)

| # | Proposed change ID | User-value focus? | Independent? | Bounded context? | Sizing concern? |
|---|---|---|---|---|---|
| 1 | `module-1-retrofit-user-phonenumber-ingredient-nutrition` | ⚠️ Mostly enabler (M2 prerequisite) | ✅ | Cross (Users + Ingredients) | OK — small additive migration |
| 2 | `module-2-recipe-cost-engine` | ✅ Head Chef can build escandallo | ✅ | Recipes | ⚠️ Could be 10+ ACs (sub-recipes + cycle detection + InventoryCostResolver) — split candidate |
| 3 | `module-2-ai-yield-suggestions` | ✅ Chef trusts AI yields with citations | ✅ (after #2) | Recipes (+ External AI) | OK |
| 4 | `module-2-off-nutritional-integration` | ✅ Auto-fill macros + allergens at ingredient level | ✅ (depends on #1 retrofit) | Ingredients (+ External OFF) | OK if mirror sync is a separate sub-task |
| 5 | `module-2-recipe-macro-rollup-allergens` | ✅ Recipe shows macros + allergens | ⚠️ Hard-depends on #4 | Recipes | OK |
| 6 | `module-2-menuitems-margin-reporting` | ✅ Owner sees margin by venue+channel | ✅ (after #2) | Menus | OK |
| 7 | `module-2-eu-1169-label-generation` | ✅ Manager prints regulatory label | ✅ (after #5 for allergens, #4 for macros) | Labels (new context) | OK — depends on legal review |
| 8 | `module-2-mcp-server-agent-ready` | ⚠️ Architectural pillar — user value indirect | ✅ | API + Agent layer | OK — could be split into "API parity" + "MCP server scaffolding" |

### Preliminary findings

**🔴 Critical violations: 0** — No technical-only epics. Even #1 (retrofit) has a clear M2 prerequisite framing.

**🟠 Major issues:**
- **Change #2 (recipe-cost-engine) risks oversize.** Sub-recipes + cycle detection + InventoryCostResolver + live cost rollup is potentially > 10 acceptance scenarios. **Split candidate** when slicing is formalised at Gate C: `module-2-recipe-crud-with-subrecipes`, `module-2-cost-engine-rollup`, `module-2-inventory-cost-resolver-interface` (3 changes instead of 1).
- **Change #5 forward-dependency on #4.** Macro rollup needs OFF data on Ingredient. If both are slated for the same sprint, OK. If decoupled, #5 needs to gracefully handle ingredients with no OFF data (already covered by FR23 chef override pattern).

**🟡 Minor concerns:**
- **Change #8 (MCP server) user-value framing**. Architectural pillars don't deliver user value directly. Reframe as: *"Manager can converse with the recipe assistant via web chat"* — that's the user-facing slice. The MCP server scaffolding is the implementation.
- **Change #1 (M1 retrofit) lives outside M2 scope** technically. Either gates as Module-1 follow-up or M2-prerequisite. Recommend filing under M1 lifecycle for clean traceability — `module-1-retrofit-for-m2-prerequisites`.

### Acceptance criteria readiness

**Cannot assess yet** — ACs are written in `specs/*.md` per OpenSpec change, post-Gate-C. The PRD provides enough capability detail (48 FRs) to author ACs cleanly later.

**Format guidance for the upcoming OpenSpec specs**: each FR maps to ≥1 `## Scenario: WHEN/THEN` per the [.ai-playbook runbook §3.1](../../.ai-playbook/specs/runbook-bmad-openspec.md). Acceptance Auditor QA layer will verify every FR has a Scenario before approving the spec.

### Best Practices Compliance (preliminary)

| Practice | Compliance | Notes |
|---|---|---|
| Each change delivers user value | 6/8 ✅ + 2/8 ⚠️ (changes #1, #8 borderline) | Reframe #1 as M1 retrofit, #8 as user-facing chat |
| Changes function independently | 7/8 ✅ + 1/8 ⚠️ (change #5 hard-depends on #4) | Sequence at Gate-C |
| Changes ≤10 ACs | 7/8 ✅ + 1/8 ⚠️ (change #2 oversized) | Split into 3 |
| No forward references | TBD (no specs yet) | Audit at QA verdict per change |
| DB tables created when needed | ✅ Aligned with M1 retrofit pattern | Each change carries its own migration |
| Traceability to FRs | TBD (no specs yet) | Acceptance Auditor enforces post-Gate-C |
| Bounded context discipline | ✅ All 8 map to a clear context (Recipes / Ingredients / Menus / Labels / Agent layer) | DDD-clean |

### Recommendation for Gate C slicing session

When you go to slice formally (post-Gate-B), apply these adjustments:
1. **Split #2 into 3** changes (CRUD with sub-recipes / cost engine rollup / cost resolver interface).
2. **Reframe #1** as `module-1-retrofit-for-m2-prerequisites` (lives in M1's lifecycle, not M2's).
3. **Reframe #8** with user-value title (`module-2-conversational-recipe-assistant` or similar) and split MCP server scaffolding into a sub-task within it.

Final change count post-adjustment: **~10 changes** (was 8). Still tractable, more BMAD-clean.

### Auto-proceeding to Step 6 — Final Assessment

## Step 6 — Final Assessment

### Overall Readiness Status

**🟢 READY for Gate A approval** with 3 minor implicit gaps to resolve (none blocking).

The PRD is structurally complete, capability-comprehensive (48 FRs in 8 areas), well-traced to journeys/innovation/domain, with NFRs covering all 5 BMAD-recommended categories plus 4 additional. Inheritance from PRD-1 is explicit; supersedes are documented; scope expansions (Module 5 absorption, Architectural Pillar) are formalised in frontmatter.

Architecture / Epics / UX **not existing yet is NOT a failure** — they're sequenced AFTER Gate A per the runbook. This validation deliberately did not flag them as issues per the caller's explicit guidance.

### Critical Issues Requiring Immediate Action

**🔴 None.**

### Major Issues to Address Before or During Gate A

**🟠 3 minor implicit gaps surfaced in PRD analysis (Step 2):**

1. **`gpt-oss-20b` LiteLLM alias formal adoption.** Inherited M1 RAG context references this alias but the M2 PRD does not formally pick the AI model for yield suggestions. Options:
   - (a) Adopt `gpt-oss-20b-rag` (already wired in M1 LiteLLM config — cheapest, fastest)
   - (b) Use `claude-haiku-hermes` (richer reasoning, paid Anthropic key already provisioned per per-consumer isolation)
   - (c) Defer: pick at architecture phase
   - **Recommendation**: option (c). Architecture phase decides the model based on the eval against USDA/CIA gold-set. PRD doesn't need to lock model.

2. **Recipe versioning semantics for MVP draft state.** FR1-FR8 don't define what happens when a Recipe is saved in `draft` state mid-conversation (per Journey 5 / agent flow). Options:
   - (a) Draft has no version; first publish = v1
   - (b) Draft has version 0; publish increments
   - (c) Draft / Published / Archived states with an explicit lifecycle
   - **Recommendation**: option (a). Simplest, matches "versioning is Growth-tier" from Product Scope. Confirm in architecture phase as part of Recipe lifecycle ADR.

3. **M2.x WhatsApp routing — role/allowlist enumeration.** Architectural Pillar §WhatsApp deployment notes "Multi-user WhatsApp via WA-MCP allowedlist in M2.x" but doesn't specify which roles are auto-allowlisted. Options:
   - (a) `Owner` + `Manager` only (Staff stays UI-only)
   - (b) All roles, individually opt-in via UI
   - (c) Org-level toggle (whole org on/off)
   - **Recommendation**: option (b). Most flexible, respects RBAC. Defer specifics to M2.x PRD.

These can stay open through Gate A; architecture/M2.x will close them naturally.

### Minor Concerns

**🟡** PRD Polish Step (Step 11) deduplicated the Module Roadmap (single source of truth in Product Scope). One residual partial duplication remains: Risk Mitigation appears in 3 sections (Domain table 16 rows, Innovation cross-ref, Project Scoping by category). They are organised differently and complementary; documented as intentional rather than a defect.

**🟡** Star counts in research doc (`_bmad-output/research/ai-playbook-ux-skills-analysis.md`) for impeccable / ui-ux-pro-max / awesome-design-md are agent-reported (22k, 70k, 66k). These look high for niche AI skill repos — manual verification recommended before citing in the upstream ai-playbook PR.

### Recommended Next Steps (in order)

1. **Resolve or accept the 3 implicit gaps** above (most can be deferred — none block Gate A).
2. **Approve Gate A** explicitly: *"PRD M2 — problem framed correctly; KPIs are the right ones; scope expansion to absorb Module 5 is sound; architectural pillar (Agent-Ready, Agent-Optional) is approved."*
3. **Run `bmad-create-architecture`** with the M2 PRD as input to produce:
   - New ADRs (OFF integration, MCP separability, label PDF library, agent-ready dual-mode CI, Recipe lifecycle, AI yield model)
   - `docs/data-model.md` extension (Recipe, RecipeIngredient, MenuItem entities + Ingredient extensions)
4. **Run `bmad-create-ux-design`** in parallel (Option 2 of UX track design) for mocks per journey using the curated skills (impeccable as drop-in; awesome-design-md format pattern; ui-ux-pro-max-skill as adapt candidate).
5. **Approve Gate B** after Architecture + UX done.
6. **Apply slicing adjustments from Step 5** at the Gate-C session: split #2 (recipe-cost-engine) into 3, reframe #1 (M1 retrofit) and #8 (MCP server → conversational recipe assistant).
7. **Approve Gate C**, then per-change OpenSpec workflow begins.

### Forward-looking work (parallel to Gate A path)

- **Synthesize 5-repo UX skill analysis** (parked at `_bmad-output/research/ai-playbook-ux-skills-analysis.md`) into a coherent upstream PR design.
- **Verify star counts manually** for impeccable / ui-ux-pro-max / awesome-design-md (sanity check agent reports).
- **PR upstream to ai-playbook**: formalise UX track between Gate A and Gate C + Storybook component-library curation pattern + curated skill recommendations. This work happens outside the M2 critical path but informs how M2 itself executes its UX phase.

### Final Note

This assessment identified **0 critical issues**, **3 minor implicit gaps** (deferable), and **2 minor concerns** (one polish residual, one external verification). The PRD is **READY for Gate A approval**.

**Workflow complete. Master, the floor is yours.**

---

**Assessment date:** 2026-04-27
**Assessor:** John (BMAD PM facilitator) via `bmad-check-implementation-readiness` skill
**Next gate:** Gate A — PM (Master) approves PRD framing + KPIs explicitly

---

## ✅ Gate A — APPROVED

**Approver:** Master (PM role)
**Approval date:** 2026-04-27
**Approval scope:** PRD problem framing + KPIs + scope expansion (Module 5 absorption) + Architectural Pillar (Agent-Ready, Agent-Optional)
**3 implicit gaps explicitly deferred:** AI yield-suggestion model selection (→ architecture phase), Recipe lifecycle ADR (→ architecture phase), M2.x WhatsApp allowlist policy (→ M2.x PRD)
**Status:** Architecture phase unblocked. UX track unblocked.
