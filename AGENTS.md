---
schema: agents-md/v1
version: 1.0.0
inherits_from:
  - github.com/Wizarck/ai-playbook@v0.12.0
skills_sources:
  - Wizarck/ai-playbook@v0.12.0
  - Wizarck/eligia-skills@v0.3.0
updated: 2026-05-12
project: openTrattOS
owner: arturo6ramirez@gmail.com
capabilities_map: true
---

# openTrattOS — AGENTS.md

> Project dispatcher. Lean. For universal norms see `.ai-playbook/specs/*`.

## 0 Bootstrap directive

Before responding to ANY task:

1. Read `.ai-playbook/specs/dispatcher-chain.md` — universal norms and override semantics.
2. Consult `.claude/injected-context.md` — populated by the SessionStart hook from `hindsight.recall(query="openTrattOS <topic>")` against bank `opentrattos`. If absent or showing `DEGRADED_CONTEXT`, announce + proceed without prior recall.
3. Check `openspec/changes/*/` for active work on the topic. If a change is live and open, extend it — don't start parallel work.
4. Only then respond.

## 1 Project identity

openTrattOS — open-source **Back-of-House (BOH) and kitchen traceability OS** for restaurants. Replaces closed-source incumbents (Apicbase, MarketMan, tSpoonLab, Gstock).

- Business model: **open-core**. Community (this repo) = AGPL-3.0, Docker-self-hosted. Enterprise (separate private repo) = paid SaaS with AI agents, WhatsApp/Telegram bot, managed cloud.
- Repo: https://github.com/Wizarck/openTrattOS.
- Tech: Turborepo (npm workspaces) + Next.js 14 + NestJS (DDD modular monolith) + PostgreSQL (TypeORM) + Redis + MinIO.

Module roadmap:

| Module | Scope | Status |
|---|---|---|
| M1 Foundation | Ingredients, hierarchical categories, UoM conversions, suppliers & pricing | 🟢 In progress |
| M2 Food costing | Nested sub-recipes (escandallos), yield/waste, margin analysis | 🟡 Planned |
| M3 HACCP / APPCC | Batch tracking, traceability, digital checklists, label printing (ES compliance) | 🟠 Planned |
| M4 Operations | Inventory counts, purchase orders, par-stock alerts, blind stock takes | 🔴 Planned |

## 2 Dispatcher index

| Topic | Pointer |
|---|---|
| **How to make a change in this project (canonical entry point)** | [.ai-playbook/docs/development-flow.md](.ai-playbook/docs/development-flow.md) |
| PRD (M1 Ingredients) | [docs/prd-module-1-ingredients.md](docs/prd-module-1-ingredients.md) |
| Architecture decisions (9 ADRs) | [docs/architecture-decisions.md](docs/architecture-decisions.md) |
| Data model (ERD + cascade rules) | [docs/data-model.md](docs/data-model.md) |
| Personas + RBAC matrix + onboarding | [docs/personas-jtbd.md](docs/personas-jtbd.md) |
| Directory map | [docs/project-structure.md](docs/project-structure.md) |
| Runbook (BMAD + OpenSpec flow) | [docs/runbook.md](docs/runbook.md) |
| BMAD agents (custom ROCTTOC UI/UX) | [_bmad/_config/agents/](_bmad/_config/agents/) |
| Active OpenSpec change | [openspec/changes/module-1-ingredients-implementation/](openspec/changes/module-1-ingredients-implementation/) |
| Legacy pre-T02 context | [docs/archive/CLAUDE.md.pre-t02](docs/archive/CLAUDE.md.pre-t02) |

## 3 Active work

**M1 Ingredients — in progress.** OpenSpec change `module-1-ingredients-implementation`:

- `proposal.md` is the next artifact to write. After approval, `design.md` + `specs/*.md` unlock, then `tasks.md`, then `openspec apply`.
- `apps/api/` scaffolded with Turborepo + NestJS, Swagger wired, `@opentrattos/types` complete. Domain entities / use-cases / TypeORM repositories are empty shells (TODO comments).
- `apps/web/` (Next.js 14 frontend) — not yet created.
- `npm install` not yet run locally.
- Docker Compose not yet created.

See `openspec/changes/module-1-ingredients-implementation/` for artifact status.

## 4 Project hard rules

These extend (do not duplicate) universal norms in `.ai-playbook/specs/*`.

**Architecture:**
- **Modular monolith with DDD (ADR-001).** Each bounded context (`ingredients`, `costing`, `haccp`, `operations`) lives under `apps/api/src/<ctx>/` with `domain/ | application/ | infrastructure/ | interface/`. Cross-module communication via published interfaces only; **never** direct entity imports.
- **API-first for MCP agents (ADR-002).** Every endpoint: semantic name (no `/process`, `/handle`), `@ApiOperation` summary + description, explicitly typed DTOs from `@opentrattos/types` (**no `any` ever**), cursor-based pagination on list endpoints. Design so an LLM can pick the tool from name + description alone.
- **Multi-tenant from day one (ADR-004).** Every table carries `organizationId` FK.
- **RBAC (ADR-006)**: three roles — `OWNER | MANAGER | STAFF`. Full permission matrix in `docs/personas-jtbd.md`.
- **Single currency per org (ADR-007).** `currencyCode` set once on org creation, immutable after.
- **i18n (ADR-008).** UI via JSON files (`es.json`, `en.json`). Category seeds carry `nameEs` + `nameEn`.
- **Soft delete (ADR-009).** `isActive` boolean; no physical deletes. Categories use `RESTRICT` (cannot delete if children or linked ingredients exist).

**Domain:**
- **Money.** 4 decimals internally; 2 decimals for display.
- **UoM conversions.** Same-family = automatic; cross-family `WEIGHT ↔ VOLUME` = blocked unless `densityFactor` set; any ↔ `UNIT` = always blocked.

**Process:**
- **TDD per layer (ADR-TBD)**: `domain/` TDD mandatory; `application/` recommended; `infrastructure/` integration > unit; `interface/` E2E. Every `Scenario: WHEN/THEN` in a spec has ≥1 test.
- **Never edit `openspec/specs/*.md` manually** — changes only land via `openspec archive` of a completed change.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- **Dual repo strategy (ADR-010).** GitHub Issues = community (this AGPL-3.0 repo, `@opentrattos/*` npm packages). Jira (private) = enterprise (TrattOS closed-source, consumes via `npm update`). No ticket mirroring.

## 5 Capability map

| Need | Tool / skill | Where |
|---|---|---|
| Prior decisions | `hindsight.recall` | MCP |
| Persist a lesson | `hindsight.retain` | MCP |
| OpenSpec ops | `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore` | `.claude/commands/` |
| BMAD discovery agents | `bmad-create-prd`, `bmad-create-architecture`, `bmad-create-ux-design`, `bmad-create-epics-and-stories`, `bmad-create-story`, `bmad-agent-*` | `.claude/skills/` |
| Parallel code review (3-layer) | `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor) | `.claude/skills/` |
| Edge-case hunter (orthogonal) | `bmad-review-edge-case-hunter` | `.claude/skills/` |
| Adversarial critique | `bmad-review-adversarial-general` | `.claude/skills/` |
| Implementation readiness | `bmad-check-implementation-readiness` | `.claude/skills/` |
| Validate OpenSpec change | `python .ai-playbook/scripts/openspec_validate.py` | playbook |
| Render MCP configs | `python .ai-playbook/scripts/mcp/render.py --project openTrattOS` | playbook |
| Secrets scan | `python .ai-playbook/scripts/secrets_scan.py` | playbook |
| Schema-validate this file | `python .ai-playbook/scripts/schema_validate.py AGENTS.md` | playbook |
| Refresh projects registry | `python .ai-playbook/scripts/discover_projects.py` | playbook |

## 6 MCP sources (SSOT pointer)

Snapshot (≤10 lines):

- `hindsight` — project memory. `bank_id: opentrattos`.
- `atlassian-geeplo` — Jira tenant for enterprise side; this community repo is read-only on that side.
- Planned: `guardrails-mcp` (T10 + Phase 5 T26), `opentrattos-api` (when enterprise MCP lands).

Full source of truth: `mcp-servers.yaml` (project layer) merged with `.ai-playbook/mcp-servers-base.yaml` + personal layer via `python .ai-playbook/scripts/mcp/render.py --project openTrattOS`. See `.ai-playbook/specs/mcp-servers-schema.md`.

## 7 Overrides inherited from playbook

None at v1.0.0. Add here with a **Why:** line if and when a universal rule needs a project-specific relaxation.

## 8 Gotchas

Empty at v1.0.0. Populate as operational knowledge accrues. Format: `- YYYY-MM-DD — <one-sentence gotcha> (rationale or link).`

## Appendix — Enterprise vision (context only, DO NOT IMPLEMENT)

TrattOS Enterprise (separate private repo, paid SaaS) will add:
- AI agents (Hermes / OpenClaw) consuming this API via MCP tools.
- Hindsight memory for contextual conversations.
- WhatsApp / Telegram bot for kitchen staff.
- LangGraph orchestration for complex workflows.
- Rancher / k3s managed-cloud deployment.

This is **why ADR-002** (MCP-ready API) exists. Every endpoint should be designed as if an LLM will read its Swagger description and decide whether to call it. But enterprise features themselves live in the private repo; community stays lean.
