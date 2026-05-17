## Why

Module 1 (PRD v2.0, approved 2026-04-19) is the foundation kernel — Ingredients, Categories, Units of Measurement, Suppliers, Currency, RBAC, i18n, soft-delete, audit, CSV import/export. Without a clean Ingredient master, no recipe can compute food cost (M2), no batch can be traced for HACCP (M3), no inventory count can balance (M4). The PRD has been signed off but the code is in scaffolding-only state: `apps/api/` has a Turborepo + NestJS + Swagger skeleton with `@nexandro/types` package and three controller stubs (categories, ingredients, suppliers) — no entities, no migrations, no services, no repositories, no DTOs, no tests. Master CI is now green (PR #48 landed eslint flat config + jest `--passWithNoTests`); branch protection is fully Profile A (1 review + 4 required checks). This change implements the 8 base entities + the 11 capability sections of PRD-M1 §4.1–4.10 (§4.11 Allergens superseded by M2 `m2-allergens-article-21`).

## What Changes

- **7 TypeORM entity classes** under `apps/api/src/<module>/domain/`:
  Organization, Location, User, Category (hierarchical), Ingredient, Supplier, SupplierItem — fields per [data-model.md §1](../../../docs/data-model.md), multi-tenant via `organizationId` (ADR-004), soft-delete via `isActive` (PRD §4.8 + ADR-009), audit via `createdBy`/`updatedBy`/`createdAt`/`updatedAt` (PRD §4.9 — applied to all primary entities; data-model.md ERD currently only depicts on Ingredient and is updated as part of this change).
- **1 join entity** `UserLocation` (M:N) per data-model.md §1 ERD ("User assigned to Location via UserLocation").
- **9 migration files** under `apps/api/src/migrations/000N_<entity>.ts` (monotonic numbering per release-management.md §6.4) — schema + indexes + cascade rules per data-model.md §2.3.
- **8 repositories** (TypeORM data-mapper pattern) + **8 application services / use-cases** orchestrating CRUD + invariants.
- **REST controllers + DTOs** for every CRUD operation, all typed against `@nexandro/types` (no `any`), with cursor-based pagination on list endpoints (ADR-002). `@ApiOperation` summary + description on every endpoint per the agent-readable rule.
- **UoM conversion module** (canonical units + pure-function conversion, NOT an entity) with 100% unit-test coverage (PRD NFR §5): WEIGHT family (kg/g/mg/lb/oz), VOLUME family (L/ml/cl/fl oz/gallon), UNIT family (pcs/dozen/box). Cross-family WEIGHT↔VOLUME blocked unless `densityFactor` set on the Ingredient; any↔UNIT cross-family always blocked.
- **`InventoryCostResolver` interface** (ADR-011, M2→M3 architectural seam) with M1 implementation that resolves cost-per-base-unit from the `isPreferred=true` SupplierItem. The interface is what M2 `m2-cost-rollup-and-audit` will consume; M1 ships the v1 implementation only.
- **Hierarchical Category tree** with `parentId` self-reference + recursive CTE query helper, `RESTRICT` cascade on delete (blocks deletion when children or linked Ingredients exist).
- **Pre-seeded default category taxonomy** (PRD §Appendix A) — 30+ nodes across Fresh / Dry / Beverages / Other branches, with `nameEs` + `nameEn` translation columns; seeded on `Organization.create` based on `defaultLocale`.
- **RBAC guards** OWNER / MANAGER / STAFF (ADR-006) — Owner+Manager full CRUD, Staff read-only on Ingredients (no prices, no supplier data).
- **Currency invariant** (ADR-007) — `Organization.currencyCode` set once at create, immutable thereafter; all monetary fields inherit.
- **i18n bundle** ES + EN (PRD §4.7) — `/locales/{es,en}.json` files for UI labels + error messages; backend error codes reference translation keys.
- **CSV Import / Export** (PRD §4.10) — Manager+ can upload CSV up to 10k rows for Ingredient bulk-create, with row-level validation + dry-run preview before commit; any list view exportable to CSV.
- **Auth middleware** that populates `createdBy`/`updatedBy` from the JWT token automatically.
- **Test discipline** — domain layer 100% unit-tested (TDD); application layer ≥ 80%; infrastructure tested via integration tests (real Postgres in Docker); interface E2E via supertest. Lint + no-explicit-any + no-unused-vars re-tightened from `warn` to `error` once stubs are gone.
- **Lint posture restored** — once real entities + DTOs replace stubs, the `apps/api/eslint.config.mjs` `warn` overrides are removed (rules go back to `error` per tseslint.recommended baseline).

## Out of Scope

- Allergens / dietary flags / nutrition data — superseded by M2 `m2-ingredients-extension` + `m2-allergens-article-21` (PRD-M1 §4.11 explicit deferral).
- Recipe / RecipeIngredient / MenuItem entities + cost rollup + label rendering — entire M2 module, separate slicing in [docs/openspec-slice-module-2.md](../../../docs/openspec-slice-module-2.md).
- Frontend `apps/web/` (Next.js 14) — admin surface in M1 is Swagger UI only; the chef-facing web UI is a later slice (separate Gate B once M1's API is consumed).
- Docker Compose / production deployment scripts — operational infra concern, not part of this slice.
- Multi-currency support (e.g. supplier invoicing in USD to a EUR org) — explicit V1 deferral per PRD §4.5.
- Field-level audit log (before/after diffs) — reserved for M3 HACCP per PRD §4.9.
- Real OpenID/OAuth flow — auth middleware in this slice consumes a JWT but does not issue one. A dev-only test-token endpoint is provided for development/testing; production JWT issuance (Auth0 / Clerk / self-hosted) is a separate post-M1 slice with its own Gate B decision.

## Prerequisites

- ✅ PRD-M1 v2.0 approved 2026-04-19 (Gate A).
- ✅ ADRs 1-9 approved 2026-04-19 (Gate B): DDD modular monolith (ADR-001), API-first (ADR-002), AI optional (ADR-003), multi-tenant (ADR-004), Enterprise reservation (ADR-005), RBAC (ADR-006), single-currency (ADR-007), i18n (ADR-008), soft-delete (ADR-009).
- ✅ `data-model.md` frozen for M1 entities — 8 base entities + cascade rules.
- ✅ Master CI green — PR #48 landed 2026-05-01 (eslint flat config + jest `--passWithNoTests` on `apps/api`).
- ✅ Branch protection upgraded to Profile A — 1 review + 4 required checks (Lint / Build / Test / Secrets scan).
- ✅ Project board #1 schema bootstrapped — Status / Risk / P&L / Branch / Base SHA fields.
- ✅ Slicing artefact at [docs/openspec-slice-module-1.md](../../../docs/openspec-slice-module-1.md) — Gate C 2026-05-01.

## Dependencies

- **Depends on**: — (foundation slice; no upstream OpenSpec change).
- **Unblocks**: M2 Wave 1 (`m2-data-model` + `m2-off-mirror` parallel) once this lands.
