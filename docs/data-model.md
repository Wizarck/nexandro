# Data Model — Entity Relationship Diagram (ERD)

**Project:** nexandro  
**Scope:** Module 1 (Foundation) + Shared Entities  
**Date:** 2026-04-19

---

## 1. Entity Relationship Diagram

```mermaid
erDiagram
    Organization ||--o{ Location : "has many"
    Organization ||--o{ User : "has many"
    Organization ||--o{ Ingredient : "has many"
    Organization ||--o{ Supplier : "has many"
    Organization ||--o{ Category : "has many"

    User }o--|| Organization : "belongs to"
    User }o--o{ Location : "assigned to (via UserLocation)"

    Location }o--|| Organization : "belongs to"

    Category ||--o{ Category : "parent → children (self-ref)"
    Category ||--o{ Ingredient : "classifies"

    Ingredient ||--o{ SupplierItem : "sourced via"
    Ingredient }o--|| Category : "belongs to"

    Supplier ||--o{ SupplierItem : "offers"

    Organization {
        uuid id PK
        string name
        string currencyCode "EUR, USD, etc. Immutable"
        string defaultLocale "es, en, fr..."
        string timezone
        datetime createdAt
        datetime updatedAt
    }

    Location {
        uuid id PK
        uuid organizationId FK
        string name
        string address
        enum type "RESTAURANT | BAR | DARK_KITCHEN | CATERING | CENTRAL_PRODUCTION"
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    User {
        uuid id PK
        uuid organizationId FK
        string name
        string email "unique per org"
        string passwordHash
        enum role "OWNER | MANAGER | STAFF"
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Category {
        uuid id PK
        uuid organizationId FK
        uuid parentId FK "nullable, self-referencing"
        string name
        string nameEs "translated name (Spanish)"
        string nameEn "translated name (English)"
        int sortOrder
        boolean isDefault "true = came from seed"
        datetime createdAt
        datetime updatedAt
    }

    Ingredient {
        uuid id PK
        uuid organizationId FK
        uuid categoryId FK
        string name
        string internalCode "auto-generated SKU, editable"
        enum baseUnitType "WEIGHT | VOLUME | UNIT — immutable after creation"
        float densityFactor "nullable — g/ml, required for cross-family conversion"
        string notes "nullable"
        boolean isActive "soft delete — default true"
        uuid createdBy FK
        uuid updatedBy FK
        datetime createdAt
        datetime updatedAt
    }

    Supplier {
        uuid id PK
        uuid organizationId FK
        string name
        string contactName "nullable"
        string email "nullable"
        string phone "nullable"
        string country
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    SupplierItem {
        uuid id PK
        uuid supplierId FK
        uuid ingredientId FK
        string purchaseUnit "display label e.g. '5 kg Box'"
        float purchaseUnitQty "e.g. 5"
        enum purchaseUnitType "must match ingredient baseUnitType family"
        decimal unitPrice "price per purchaseUnit in org currency"
        decimal costPerBaseUnit "auto-calculated: unitPrice / purchaseUnitQty converted to base"
        boolean isPreferred "default supplier for food cost calc"
        datetime createdAt
        datetime updatedAt
    }
```

---

## 2. Key Design Rules

### 2.1 Soft Delete
- Entities with `isActive` field are **never physically deleted**.
- Deactivated records:
  - Disappear from all default list views (filtered by `isActive = true`)
  - Remain visible in historical recipes and reports that reference them (shown greyed out with a "discontinued" badge)
  - Can be reactivated by an `OWNER` or `MANAGER`

### 2.2 Audit Fields
Every primary entity includes:
- `createdAt` (auto-set on insert)
- `updatedAt` (auto-set on every update)
- `createdBy` / `updatedBy` (FK → User, set by auth middleware)

This provides a basic **audit trail** for compliance. A full audit log table 
(storing field-level diffs) is reserved for Module 3 (HACCP) where regulatory 
traceability demands it.

### 2.3 Cascade & Referential Integrity

| Parent | Child | On Delete |
|---|---|---|
| Organization | Location, User, Ingredient, Supplier, Category | `CASCADE` (delete org = delete everything) |
| Category | Ingredient | `RESTRICT` (cannot delete a category that has ingredients) |
| Category | Category (children) | `RESTRICT` (cannot delete a parent with children) |
| Supplier | SupplierItem | `CASCADE` (delete supplier = delete its items) |
| Ingredient | SupplierItem | `CASCADE` (delete ingredient = delete its supplier links) |

### 2.4 Currency
- Currency is set at `Organization` level (`currencyCode` field, ISO 4217).
- **All monetary values** (`unitPrice`, `costPerBaseUnit`) are stored and displayed in the organization's currency.
- Multi-currency support (e.g. a supplier billing in USD to a EUR organization) is **out of scope for V1**. Reserved for future enhancement.

---

# Module 2 Extensions (added 2026-04-27 post-Gate-A approval of [PRD-2](./prd-module-2-recipes.md))

## 3. M2 Entity Relationship Diagram (additions)

```mermaid
erDiagram
    Organization ||--o{ Recipe : "has many"
    Organization ||--o{ MenuItem : "has many"

    Recipe ||--o{ RecipeIngredient : "has many"
    Recipe ||--o{ MenuItem : "is sold via"

    RecipeIngredient }o--|| Recipe : "belongs to"
    RecipeIngredient }o--o| Ingredient : "uses (one of either)"
    RecipeIngredient }o--o| Recipe : "uses sub-recipe (one of either)"

    MenuItem }o--|| Recipe : "wraps"
    MenuItem }o--|| Location : "served at"

    External_Food_Catalog ||--o{ Ingredient : "enriches via externalSourceRef"

    Recipe {
        uuid id PK
        uuid organizationId FK
        string name "i18n via org defaultLocale"
        string description "nullable"
        decimal wasteFactor "0.00-1.00 — cooking loss / evaporation"
        boolean isActive "soft delete — default true"
        uuid createdBy FK
        uuid updatedBy FK
        datetime createdAt
        datetime updatedAt
    }

    RecipeIngredient {
        uuid id PK
        uuid recipeId FK
        uuid ingredientId FK "nullable — exactly one of (ingredientId, subRecipeId) is set"
        uuid subRecipeId FK "nullable — references Recipe.id when this line is a sub-recipe"
        decimal quantity "in unitId"
        uuid unitId FK "must match ingredient baseUnitType family if ingredientId is set"
        decimal yieldPercentOverride "0.00-1.00, nullable — overrides ingredient default"
        string sourceOverrideRef "nullable — locks cost source (M2: SupplierItem id; M3: batch id)"
        int sortOrder
    }

    MenuItem {
        uuid id PK
        uuid organizationId FK
        uuid recipeId FK
        uuid locationId FK
        enum channel "DINE_IN | DELIVERY | CATERING | TAKE_AWAY (extensible)"
        decimal sellingPrice "in org currency"
        decimal targetMargin "0.00-1.00, target gross margin %"
        boolean isActive "soft delete — default true"
        uuid createdBy FK
        uuid updatedBy FK
        datetime createdAt
        datetime updatedAt
    }

    External_Food_Catalog {
        string off_product_code PK "e.g. OFF barcode"
        string name
        string brand
        jsonb nutrition "kcal, carbs, fat, protein, fiber, sugars, salt per 100g/ml"
        text_array allergens "EU 1169/2011 standardized tags"
        text_array dietFlags "vegan, vegetarian, gluten_free, halal, kosher, keto"
        datetime fetchedAt "for cache freshness check"
        string source "off | api-fallback"
    }
```

## 4. Ingredient extensions (M2 retrofit on M1's Ingredient table)

| Column | Type | Default | Purpose |
|---|---|---|---|
| `nutrition` | `jsonb` | `null` | macros per 100g/ml: `{kcal, carbs, fat, protein, fiber, sugars, salt}` (from OFF or manual) |
| `allergens` | `text[]` | `'{}'::text[]` | EU 1169/2011 standardized tags (from OFF or manual override) |
| `dietFlags` | `text[]` | `'{}'::text[]` | `vegan`, `vegetarian`, `gluten_free`, `halal`, `kosher`, `keto`, etc. |
| `brandName` | `varchar(120)` | `null` | separate from `name` (e.g. `name="Tomate triturado"`, `brandName="Heinz"`) |
| `externalSourceRef` | `varchar(64)` | `null` | OFF product code or barcode pointing to `external_food_catalog` |
| `yieldPercentDefault` | `decimal(4,3)` | `1.000` | default trim/yield factor (chef can override per RecipeIngredient line) |

All columns are additive (nullable / default-empty); migrations are non-breaking.

## 5. User retrofit (M2 prerequisite)

Add to `User` table:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `phoneNumber` | `varchar(20)` | `null` | E.164 format. Future use: WhatsApp routing (M2.x via WA-MCP allowlist). Nullable in M2 MVP. |

## 6. M2 Cascade & Referential Integrity (extends §2.3)

| Parent | Child | On Delete |
|---|---|---|
| Organization | Recipe, MenuItem | `CASCADE` (delete org = delete everything) |
| Recipe | RecipeIngredient | `CASCADE` (delete recipe = delete its ingredient lines) |
| Recipe | MenuItem | `RESTRICT` (cannot delete a Recipe referenced by an active MenuItem; soft-delete first) |
| Ingredient | RecipeIngredient | `RESTRICT` (per ADR-009 soft-delete pattern; deactivated ingredients show greyed in UI) |
| Recipe (sub-recipe) | RecipeIngredient (using it) | `RESTRICT` (prevents orphaning sub-recipe references) |
| Location | MenuItem | `RESTRICT` (cannot delete a Location with active MenuItems; deactivate first) |

## 7. M2 Key design rules

### 7.1 Cost precision (per [ADR-015](./architecture-decisions.md))
- All monetary fields use `numeric(18,4)` internally
- Display rounds to 2 decimals, half-even
- Sub-recipe rollup tolerance ≤0.01% accumulated error (5 levels × 30 ingredients)

### 7.2 Sub-recipe cycle detection (per [ADR-014](./architecture-decisions.md))
- Pre-commit graph walk
- Hard depth cap at 10 levels
- Error names both nodes + direction

### 7.3 Cost source resolution (per [ADR-011](./architecture-decisions.md))
- Stable `InventoryCostResolver` interface
- M2: returns preferred SupplierItem cost (or `sourceOverrideRef` if set on the line)
- M3: returns FIFO oldest-batch cost via the same signature

### 7.4 Allergen aggregation (per [ADR-017](./architecture-decisions.md))
- Conservative: ANY allergen on ANY ingredient bubbles up to Recipe-level
- Never auto-clear; chef can override with attribution + reason (Manager+ role)
- Recipe-level free-text "may contain traces of [allergen]" for cross-contamination

### 7.5 Diet-flag inference (per [ADR-017](./architecture-decisions.md))
- Conservative: a dietFlag is true at Recipe-level only if ALL ingredients carry it
  AND no contradicting allergen is present
- Manager+ role can override with explicit reason

### 7.6 OFF data sync (per [ADR-012](./architecture-decisions.md))
- `external_food_catalog` populated weekly from OFF dump
- API fallback on cache miss or stale (>30d)
- ODbL compliance: usage-OK, no-redistribution

