## Context

Module 1 shipped 8 base entities (Organization, Location, User, Ingredient, Category, UoM, Supplier, SupplierItem) per `docs/data-model.md`. M2 adds Recipes / Escandallo / Nutritional Intelligence and needs three new entities + extensions to two existing ones. Current state: PostgreSQL via TypeORM, multi-tenant via `organizationId`, soft-delete via `isActive` flag, audit fields on every row. Stakeholders: every M2 slice (`#2`–`#11` in `docs/openspec-slice-module-2.md`) reads from this schema.

## Goals / Non-Goals

**Goals:**
- Atomic migration that introduces all M2 schema changes at once, so downstream slices land against a stable contract.
- Multi-tenant invariant preserved: `organizationId` foreign-key on every new table; cascade per ADR-010.
- Audit fields (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`) on every new entity.
- Sub-recipe composition representable: `RecipeIngredient.componentId` polymorphic over `Ingredient` OR `Recipe` so the cycle-detection algorithm in #2 can walk it.
- OFF integration: Ingredient gains `nutrition` jsonb + `allergens` text[] + `dietFlags` text[] + `brandName` + `externalSourceRef`.
- M2.x WhatsApp foundation: `User.phoneNumber` (E.164 nullable) so future routing can land without a second migration.

**Non-Goals:**
- Service logic: no service / controller / repository implementation in this slice. Pure schema.
- Cycle-detection algorithm: lives in `#2 m2-recipes-core`. This slice only ships the structure that supports it.
- Cost-resolver interface: lives in `#3 m2-cost-rollup-and-audit`.

## Decisions

- **Polymorphic `RecipeIngredient.componentId`** vs separate `ingredientId` + `subRecipeId` columns. **Decision**: separate nullable FKs (`ingredientId` nullable + `subRecipeId` nullable, exactly one non-null), enforced by CHECK constraint. **Rationale**: TypeORM does not handle polymorphic associations cleanly; separate FKs keep referential integrity at the DB layer and let cycle detection in #2 walk a typed graph. Alternative considered: single `componentId` + `componentType` discriminator — rejected because it sacrifices FK integrity for schema neatness.
- **`yieldPercentOverride` and `sourceOverrideRef` on `RecipeIngredient`** vs storing overrides on a separate `RecipeOverride` table. **Decision**: inline columns (nullable). **Rationale**: overrides are 1:1 with the line and rarely sparse; a separate table doubles the JOIN cost on the live-cost path (NFR <200ms). Alternative considered: separate table — rejected for performance.
- **`nutrition` as jsonb** vs columnar (`kcal`, `proteinG`, `carbG`, `fatG`, etc.). **Decision**: jsonb. **Rationale**: OFF schema evolves (sugar / fiber / sodium / micronutrients added over time); jsonb absorbs additions without migrations. Read patterns are "render the whole macro panel" not "filter recipes where kcal > X". Alternative considered: columnar with periodic ALTERs — rejected for migration churn.
- **Cascade rules**: `RecipeIngredient` → `Recipe` is `ON DELETE CASCADE`. `MenuItem.recipeId` → `Recipe` is `ON DELETE RESTRICT` (a Recipe with active MenuItems cannot be hard-deleted; soft-delete is the path). `Ingredient → RecipeIngredient` is `ON DELETE RESTRICT` for the same reason.
- **`User.phoneNumber` nullable now**, even though no M2 feature uses it. **Rationale**: schema retrofit is cheap now (single column, low row count); doing it later under WhatsApp pressure means risking a migration during user-facing rollout.

## Risks / Trade-offs

- [Risk] Polymorphic-via-nullable-FKs CHECK constraint is dialect-specific (PostgreSQL syntax). **Mitigation**: nexandro is PostgreSQL-only per ADR-001; if that ever changes, the CHECK becomes an application-level guard.
- [Risk] `nutrition` jsonb makes ad-hoc queries harder ("find all recipes where kcal/100g < 200"). **Mitigation**: M2 has no requirement for that query; if it appears in M3+, add a generated column or a search index.
- [Risk] Adding `phoneNumber` now without a use case looks like premature design. **Mitigation**: documented in this slice and in PRD-M2 §M2.x WhatsApp; nullable, no default, zero-cost.

## Migration Plan

Steps:
1. TypeORM migration generates `CREATE TABLE recipe`, `CREATE TABLE recipe_ingredient`, `CREATE TABLE menu_item` plus `ALTER TABLE ingredient ADD COLUMN ...` (5 columns) and `ALTER TABLE "user" ADD COLUMN phone_number`.
2. Indexes: `recipe(organizationId, isActive)`, `recipe_ingredient(recipeId)`, `recipe_ingredient(subRecipeId)`, `menu_item(organizationId, locationId)`, `menu_item(recipeId)`.
3. Cascade: `recipe_ingredient.recipeId → recipe(id) ON DELETE CASCADE`. `menu_item.recipeId → recipe(id) ON DELETE RESTRICT`.
4. Deploy to staging; verify table counts, FK integrity, sample insert/select round-trip.
5. Deploy to prod during a low-traffic window; M1 reads/writes unaffected (additive schema).

Rollback strategy: TypeORM down-migration drops the 3 tables + 5 columns (no data loss because no service has written to them yet — this is foundation, not feature).

## Open Questions

(none. PRD + ADRs cover the schema decisions in full.)
