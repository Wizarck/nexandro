# User Personas & Jobs-to-be-Done (JTBD)

**Project:** nexandro  
**Version:** 1.0  
**Date:** 2026-04-19

---

## 1. User Personas

### 1.1 👔 The Owner / General Manager ("El Dueño")

| Attribute | Description |
|---|---|
| **Who** | Restaurant owner or multi-venue group CEO |
| **Tech comfort** | Low. Uses WhatsApp, Instagram and maybe Excel |
| **Primary goal** | Know if each venue is making or losing money |
| **Uses the app** | 2-3 times per week, mostly on mobile |
| **Key screens** | Dashboard (margins, top/bottom dishes), P&L summary |
| **Permission level** | `OWNER` — Full read access, limited write (delegates operations) |

**JTBD:** *"When I open the app on Sunday night, I want to see at a glance which dishes 
lost money this week, so I can decide what to remove from the menu on Monday."*

---

### 1.2 👨‍🍳 The Head Chef / Kitchen Manager ("El Jefe de Cocina")

| Attribute | Description |
|---|---|
| **Who** | Head chef, sous chef or kitchen operations manager |
| **Tech comfort** | Medium. Comfortable with tablets and structured apps |
| **Primary goal** | Engineer recipes for maximum margin and minimum waste |
| **Uses the app** | Daily, on a tablet in the kitchen or office PC |
| **Key screens** | Ingredients CRUD, Recipe/Escandallo builder, Supplier orders, Inventory |
| **Permission level** | `MANAGER` — Full CRUD on ingredients, recipes, suppliers. Cannot change organization settings or billing |

**JTBD:** *"When I create a new dish, I want to build the recipe step by step, see the 
cost per portion update in real-time, and know immediately if the margin is above 
my target (e.g. 70% gross margin) so I can adjust portions before it hits the menu."*

---

### 1.3 🧑‍🍳 The Line Cook / Kitchen Staff ("El Cocinero de Línea")

| Attribute | Description |
|---|---|
| **Who** | Line cooks, prep cooks, dishwashers with compliance duties |
| **Tech comfort** | Low-to-Medium. Comfortable with WhatsApp/social media, not enterprise software |
| **Primary goal** | Follow instructions and log compliance data without friction |
| **Uses the app** | Multiple times per day, on a shared wall-mounted tablet |
| **Key screens** | HACCP checklists (temperatures), Receiving log (batch/lot entry), Label printer |
| **Permission level** | `STAFF` — Can only fill checklists, log received goods, view recipes (read-only). Cannot edit prices, ingredients, or supplier data |

**JTBD:** *"When the fish delivery arrives at 7 AM, I want to scan the invoice or type 
the batch number and expiry date in under 30 seconds so I can get back to prep 
without the chef yelling at me."*

---

## 2. Role-Based Access Control (RBAC) Matrix

All permissions are scoped to `organizationId`. A user can belong to one Organization 
and have one Role per Location.

| Action | `OWNER` | `MANAGER` | `STAFF` |
|---|:---:|:---:|:---:|
| View Dashboard (margins, P&L) | ✅ | ✅ | ❌ |
| Create/Edit/Delete Ingredients | ✅ | ✅ | ❌ |
| Create/Edit/Delete Recipes | ✅ | ✅ | ❌ |
| Manage Suppliers & Prices | ✅ | ✅ | ❌ |
| View Recipes (read-only) | ✅ | ✅ | ✅ |
| Fill HACCP Checklists | ✅ | ✅ | ✅ |
| Log Received Goods (batch/lot) | ✅ | ✅ | ✅ |
| Perform Inventory Count | ✅ | ✅ | ✅ |
| Manage Users & Roles | ✅ | ❌ | ❌ |
| Manage Organization Settings | ✅ | ❌ | ❌ |
| Manage Locations | ✅ | ❌ | ❌ |
| Change Billing (Enterprise) | ✅ | ❌ | ❌ |

---

## 3. Onboarding Flow (First Run Experience)

When a user installs nexandro for the first time (self-hosted) or signs up 
(Nexandro Enterprise), the system guides them through a 5-step wizard:

### Step 1: Create Organization
- Organization name (e.g. "Grupo Palafito")
- Base currency (EUR, USD, GBP, MXN...) — **set once, immutable**
- Default language (es, en, fr, pt, it, de)
- Timezone

### Step 2: Create First Location (Venue)
- Location name (e.g. "Palafito Madrid Centro")
- Address
- Type: Restaurant | Bar | Dark Kitchen | Catering | Central Production

### Step 3: Choose Category Taxonomy
- **Use default taxonomy** (pre-seeded, translated to selected language)
- **Start empty** (power users who will build their own)
- **Import from CSV/Excel** (restaurants migrating from spreadsheets)

### Step 4: Create Admin User
- Name, email, password
- Automatically assigned `OWNER` role on the organization

### Step 5: Quick Win — Add Your First Ingredient
- Guided walkthrough: create 1 ingredient + 1 supplier + 1 price
- Shows the auto-calculated "cost per gram" immediately
- Celebration animation 🎉 (engagement hook)

After onboarding, the user lands on an **empty-state Dashboard** with clear CTAs:
- "Add 10 ingredients to unlock your first recipe"
- "Invite your Head Chef"
- "Connect a supplier"
