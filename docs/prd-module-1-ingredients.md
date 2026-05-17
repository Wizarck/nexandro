# PRD: Module 1 — Foundation (Ingredients, Categories & UoM)

**Status:** Approved by Product Owner  
**Version:** 2.0 (Revised after PM SaaS Review)  
**Author:** BMAD PM Agent + Claude PM Review  
**Date:** 2026-04-19

---

## 1. Problem Statement

A professional kitchen cannot calculate food cost or HACCP traceability without a clean, 
accurate master of its ingredients. This module is the single source of truth for all 
raw materials used across recipes, orders and compliance logs.

---

## 2. User Personas (Reference)

Full persona definitions, JTBD, and RBAC matrix are documented in 
[personas-jtbd.md](./personas-jtbd.md). The three primary roles are:

- **Owner** (`OWNER`): Dashboard consumer, org admin
- **Head Chef** (`MANAGER`): Power user — creates ingredients, recipes, manages suppliers
- **Line Cook** (`STAFF`): Read-only on ingredients, fills checklists

---

## 3. User Stories

- **As a Head Chef**, I want to create ingredients with categories so I can quickly find 
  any product in my kitchen without scrolling through a flat unstructured list.
- **As a Kitchen Manager**, I want the system to block invalid unit conversions 
  (e.g. kg to unidades) so my food cost is never corrupted by a bad recipe entry.
- **As an nexandro Admin (multi-venue)**, I want a pre-seeded category tree when I 
  first install the system so I don't start from a blank page.
- **As an Owner**, I want to set my organization's currency once during setup, 
  so all cost calculations are consistent across all my venues.
- **As a Head Chef migrating from Excel**, I want to import my existing ingredient list 
  from a CSV file so I don't have to re-type hundreds of items manually.
- **As an Owner**, I want to see who last modified an ingredient and when, 
  so I can audit unexpected price changes.

---

## 4. Functional Requirements

### 4.1 Ingredient Entity
Each ingredient must capture:
- `name` (string, required)
- `internalCode` (auto-generated SKU, editable)
- `baseUnitType` (enum: WEIGHT | VOLUME | UNIT — required, set at creation, **immutable**)
- `categoryId` (FK → Category, required)
- `densityFactor` (float, nullable — g/ml ratio, required only for cross-family WEIGHT↔VOLUME conversion)
- `notes` (string, optional)
- `isActive` (boolean, default true — see §4.8 Soft Delete)
- `createdBy`, `updatedBy` (FK → User — see §4.9 Audit Trail)
- `createdAt`, `updatedAt` (timestamps, auto-managed)

### 4.2 Category System (Hierarchical Tags)
- Categories form a **parent → child tree** with unlimited nesting depth (self-referencing `parentId`).
- The system ships with a **pre-seeded default taxonomy** (see Appendix A).
- Default categories are **translated** based on the organization's `defaultLocale` (see §4.7 i18n).
- Users can:
  - Use the default taxonomy as-is
  - Delete unused branches (blocked if ingredients exist under them)
  - Add custom categories at any level
  - Rename any node
- An ingredient can have **one primary category** (not multi-tag, kept simple in V1).

### 4.3 Unit of Measurement (UoM) Engine
- System ships with canonical unit definitions:
  - **WEIGHT family:** kg, g, mg, lb, oz
  - **VOLUME family:** L, ml, cl, fl oz, gallon
  - **UNIT family:** pcs, dozen, box (user-customizable quantity per box)
- **Conversions within the same family are automatic** and require no user input.
- **Cross-family conversions (WEIGHT ↔ VOLUME) are BLOCKED by default.**
  - If a recipe tries to use a WEIGHT ingredient in VOLUME units, the system surfaces a 
    "Density factor required" prompt.
  - The user must then provide a `densityFactor` on the ingredient (e.g. g/ml).
  - This is stored on the ingredient and applied universally across all recipes using it.
- **Cross-family conversions (any ↔ UNIT) are always BLOCKED.** 
  There is no mathematical bridge. Period.

### 4.4 Supplier & Supplier Items
- A `Supplier` entity stores: name, contact info, country, isActive.
- A `SupplierItem` links a `Supplier` + `Ingredient` with:
  - `purchaseUnit` (e.g. "5 kg Box")
  - `purchaseUnitQty` (e.g. 5) + `purchaseUnitType` (must match ingredient's baseUnitType family)
  - `unitPrice` (decimal, required — in the organization's `currencyCode`)
  - The system **auto-calculates and stores `costPerBaseUnit`** (e.g. €0.002/g)
- One ingredient can have multiple SupplierItems (multi-supplier support).
- One SupplierItem can be flagged as `isPreferred` (used as default for food cost).

### 4.5 Currency
- Currency is defined at the `Organization` level (`currencyCode`, ISO 4217).
- Set **once during onboarding** and is **immutable** after creation.
- All monetary fields (`unitPrice`, `costPerBaseUnit`, future recipe costs) inherit the org currency.
- Multi-currency support (e.g. supplier invoicing in USD to a EUR org) is **out of scope for V1**.

### 4.6 Access Control (RBAC)
- Full RBAC matrix defined in [personas-jtbd.md](./personas-jtbd.md).
- Module 1 summary:
  - `OWNER` / `MANAGER`: Full CRUD on Ingredients, Categories, Suppliers.
  - `STAFF`: Read-only on Ingredients. Cannot modify prices or supplier data.

### 4.7 Internationalization (i18n)
- The UI language is determined by the organization's `defaultLocale` field.
- Supported locales for V1: `es` (Spanish), `en` (English).
- Category seeds have dedicated translation columns (`nameEs`, `nameEn`). 
  The UI displays the column matching the org locale.
- All UI labels, error messages, and tooltips use translation files (`/locales/es.json`, `/locales/en.json`).
- Additional locales (fr, pt, it, de) can be added via community contributions.

### 4.8 Soft Delete
- Entities with `isActive = false` are **never physically deleted** from the database.
- **Default list views** filter by `isActive = true` (deactivated items are hidden).
- **Historical references** (e.g. a recipe that used a now-deactivated ingredient) show 
  the item greyed out with a "Discontinued" badge.
- `OWNER` or `MANAGER` can reactivate any soft-deleted entity.
- Category deletion is `RESTRICT`: blocked if it has child categories or linked ingredients.

### 4.9 Audit Trail
- Every primary entity stores `createdBy`, `updatedBy` (FK → User), and `createdAt`, `updatedAt`.
- These fields are auto-populated by the auth middleware (from the JWT token).
- This provides a **basic audit** ("who changed this price?").
- A full field-level audit log (storing before/after diffs) is reserved for Module 3 (HACCP) 
  where regulatory traceability demands it.

### 4.10 Import / Export
- **CSV Import**: Users with `MANAGER` or `OWNER` role can upload a CSV file to bulk-create ingredients.
  - Required columns: `name`, `categoryPath` (e.g. "Fresh > Vegetables > Leafy Greens"), `baseUnitType`
  - Optional columns: `internalCode`, `notes`
  - The system validates each row and presents a preview with errors highlighted before committing.
  - Duplicate detection by `name` within the same organization (warns, does not auto-merge).
- **CSV Export**: Any ingredient list view can be exported to CSV with a single click.

### 4.11 Allergens (DEFERRED)
Allergen tagging is **out of scope for Module 1**. Reserved for Module 3 (HACCP/APPCC).

---

## 5. Non-Functional Requirements
- API responses for ingredient list must be paginated (default 25 per page, cursor-based).
- Category tree must load in a single query (no N+1 problems — use recursive CTE or materialized path).
- UoM conversion logic must be unit-tested with **100% coverage** before any other module builds on it.
- All monetary calculations use **4 decimal places** internally, rounded to 2 for display.
- CSV import must handle files up to **10,000 rows** without timeout.

---

## 6. Data Model (Reference)

Full ERD, cascade rules, and field-level definitions are documented in 
[data-model.md](./data-model.md).

---

## Appendix A: Default Category Seed (Taxonomy)

Shown below in English. Spanish translations are provided in the `nameEs` column 
of the seed file and displayed automatically based on the organization's locale.

```
├── Fresh (Fresco)
│   ├── Vegetables (Verduras)
│   │   ├── Leafy Greens (Verduras de Hoja)
│   │   ├── Root Vegetables (Tubérculos)
│   │   └── Nightshades (Solanáceas)
│   ├── Fruits (Frutas)
│   ├── Herbs & Aromatics (Hierbas y Aromáticas)
│   ├── Meat & Poultry (Carnes y Aves)
│   │   ├── Beef (Vacuno)
│   │   ├── Pork (Cerdo)
│   │   ├── Poultry (Aves)
│   │   └── Game (Caza)
│   ├── Seafood (Pescados y Mariscos)
│   │   ├── Fish (Pescado)
│   │   └── Shellfish (Marisco)
│   └── Dairy & Eggs (Lácteos y Huevos)
│       ├── Milk & Cream (Leche y Nata)
│       ├── Cheese (Quesos)
│       └── Eggs (Huevos)
├── Dry & Pantry (Secos y Despensa)
│   ├── Flours & Starches (Harinas y Almidones)
│   ├── Grains & Rice (Cereales y Arroz)
│   ├── Legumes (Legumbres)
│   ├── Sugar & Sweeteners (Azúcares y Edulcorantes)
│   ├── Spices & Seasonings (Especias y Condimentos)
│   ├── Oils & Vinegars (Aceites y Vinagres)
│   └── Canned & Preserved (Conservas y Encurtidos)
├── Beverages (Bebidas)
│   ├── Wine & Spirits (Vinos y Licores)
│   ├── Beer & Cider (Cerveza y Sidra)
│   ├── Soft Drinks (Refrescos)
│   └── Non-Alcoholic (Sin Alcohol)
└── Other (Otros)
    ├── Packaging Materials (Material de Embalaje)
    └── Cleaning Supplies (Productos de Limpieza)
```
