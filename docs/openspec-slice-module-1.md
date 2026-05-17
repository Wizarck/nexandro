---
title: Module 1 (Foundation — Ingredients, Categories, UoM, Suppliers, Currency, RBAC) — OpenSpec slicing
date: 2026-05-01
approver: Master
prereq_gates:
  - Gate A — 2026-04-19 (PRD-1 v2.0 approved)
  - Gate B — 2026-04-19 (M1 ADRs 1-9 approved; data-model.md frozen for M1 entities)
status: approved
runbook: .ai-playbook/specs/runbook-bmad-openspec.md §2.4
related:
  - docs/prd-module-1-ingredients.md
  - docs/architecture-decisions.md
  - docs/data-model.md
  - docs/personas-jtbd.md
  - docs/project-structure.md
---

# Module 1 — OpenSpec slicing

PRD-M1 v2.0 (Foundation: Ingredients / Categories / UoM / Suppliers + Currency + RBAC + i18n + soft-delete + audit + import/export) was approved 2026-04-19 and `apps/api/` was scaffolded with Turborepo + NestJS + Swagger + `@nexandro/types`, but domain entities, use-cases, TypeORM repositories, and tests are still empty shells. The slicing artefact for M1 is **a single OpenSpec change** because the module is structurally one bounded context (the shared kernel) and the PRD's 11 capability sections (§4.1–4.11) form one cohesive deliverable that does not split cleanly into shippable sub-units. The change-ID matches the existing folder slot at `openspec/changes/module-1-ingredients-implementation/`.

Pre-condition: master CI must be green (`fix/apps-api-lint-and-test` chore PR merged) before this slice opens. That fix installs ESLint flat config + Jest config (`--passWithNoTests` until tests land) so this slice's first task commit can pass CI. The chore PR is NOT a slice — it is bootstrap tooling per [release-management.md §2.2](../.ai-playbook/specs/release-management.md), excluded from the OpenSpec slicing model.

## Approved change list

| # | Change ID | Bounded context | PRD sections | Journeys | Components | Depends on |
|---|---|---|---|---|---|---|
| 1 | `module-1-ingredients-implementation` | shared kernel | §4.1–4.10 (4.11 Allergens deferred to M2 #7) | (admin only — CRUD) | — | — |

## Scope notes

### 1. `module-1-ingredients-implementation` — Foundation kernel implementation

In scope: implementation of the 8 base entities approved in PRD-M1 §4.1–4.10 — `Organization`, `Location`, `User`, `Category` (hierarchical), `UoM`, `Ingredient`, `Supplier`, `SupplierItem` — with TypeORM entities, migrations, repositories, application use-cases, REST controllers, DTOs, validators, and unit + integration tests. Multi-tenant invariant via `organizationId` on every table (ADR-004). RBAC OWNER / MANAGER / STAFF (ADR-006) via guards on controllers. Single-currency-per-org immutable after creation (ADR-007). Soft-delete via `isActive` flag (PRD §4.8). Audit fields `createdBy`/`updatedBy`/`createdAt`/`updatedAt` on every row (PRD §4.9). UoM conversion engine that blocks invalid conversions (e.g. kg→unidades) per PRD §4.3 user story. Hierarchical Category tags with seed tree on org creation (PRD §4.2). Supplier + SupplierItem with `isPreferred` flag (PRD §4.4) — the data the M2 cost rollup will consume via `InventoryCostResolver` (ADR-014). i18n bundle ES + EN (PRD §4.7). CSV import / export endpoint per PRD §4.10. Cursor-based pagination on list endpoints (ADR-002). API-first / agent-ready: every endpoint with `@ApiOperation` summary + DTOs from `@nexandro/types` (no `any`).

Out of scope: Allergens / dietary flags / nutrition data — explicitly deferred to M2 `m2-ingredients-extension` + `m2-allergens-article-21` (PRD-1 §4.11 marker; superseded by PRD-M2). Recipes / MenuItems / cost rollup / labels — all M2. Frontend `apps/web/` — separate slicing when the UX phase ramps for M1 (currently the M1 surface is admin-only via Swagger UI). Docker Compose / production deployment — operational concerns, not part of this slice.

UI: none in this slice. Surface is REST API + Swagger explorer.

Anti-collision contract: this is the foundation slice — no parallel slices exist yet at Wave 0. When M2 starts (post-merge), every M2 slice will read from this schema; M2 slices declare their own write paths that do not overlap with M1 entities.

## Track structure

Single slice. No parallelism within M1.

```
Wave 0 (sequential, single):  module-1-ingredients-implementation
                                       │
                                       ▼
                              M2 Wave 1 unblocked
                              (m2-data-model + m2-off-mirror, parallel)
```

## Cross-references

- [PRD-M1](prd-module-1-ingredients.md) — capability source of truth.
- [Architecture decisions](architecture-decisions.md) — ADRs 1-9 cover M1 (stack, DDD, multi-tenant, RBAC, currency, i18n, soft-delete, audit).
- [Data model](data-model.md) — entity definitions for the 8 M1 entities + indexes + cascade rules.
- [Personas + RBAC matrix](personas-jtbd.md) — Owner / Manager / Staff role permissions.
- [Project structure](project-structure.md) — directory map for `apps/api/src/<bounded-context>/`.
- [M2 slicing](openspec-slice-module-2.md) — downstream module that reads from M1 schema.

## Stewardship

This file is approved at Gate C (2026-05-01). Re-slicing (e.g. if M1 splits mid-implementation) is a new revision: `git mv docs/openspec-slice-module-1.md docs/_archive/openspec-slice-module-1-2026-05-01.md` and write the new one. Never edit silently mid-implementation.

`openspec-propose <change-id>` reads this file at start. Multi-module repos disambiguate via `--slice-file <path>` or mtime fallback (most-recent-first). For M1, invoke as `openspec-propose module-1-ingredients-implementation --slice-file docs/openspec-slice-module-1.md` (explicit) or rely on mtime fallback if this is the most-recent slice file.
