# nexandro — Project Structure

## Monorepo Layout (Turborepo)

```
nexandro/
│
├── apps/
│   ├── web/                        # Next.js frontend (TypeScript + TailwindCSS)
│   │   ├── app/                    # Next.js App Router pages
│   │   │   ├── (dashboard)/        # Protected dashboard routes
│   │   │   │   ├── ingredients/    # Ingredient CRUD UI
│   │   │   │   ├── recipes/        # Escandallos / Costing UI
│   │   │   │   ├── haccp/          # Compliance checklists UI
│   │   │   │   └── operations/     # Inventory & orders UI
│   │   │   ├── (auth)/             # Login / Register pages
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                 # Primitive components (Button, Card, Input...)
│   │   │   └── modules/            # Feature-specific composed components
│   │   └── lib/                    # API client, utils, hooks
│   │
│   └── api/                        # NestJS backend (TypeScript)
│       └── src/
│           ├── main.ts             # Entry point (port 3001)
│           ├── app.module.ts       # Root module
│           │
│           ├── ingredients/        # Bounded Context: Ingredients
│           │   ├── domain/
│           │   │   ├── ingredient.entity.ts
│           │   │   ├── category.entity.ts
│           │   │   ├── supplier.entity.ts
│           │   │   └── uom.value-object.ts   # UoM conversion engine lives here
│           │   ├── application/
│           │   │   ├── use-cases/
│           │   │   │   ├── create-ingredient.use-case.ts
│           │   │   │   ├── convert-uom.use-case.ts
│           │   │   │   └── seed-categories.use-case.ts
│           │   │   └── ports/      # Repository interfaces (no DB coupling)
│           │   ├── infrastructure/
│           │   │   ├── persistence/
│           │   │   │   ├── ingredient.repository.ts  # Implements port
│           │   │   │   └── category.repository.ts
│           │   │   └── seeds/
│           │   │       └── default-categories.seed.ts
│           │   └── interface/
│           │       ├── ingredients.controller.ts
│           │       ├── suppliers.controller.ts
│           │       └── dto/
│           │           ├── create-ingredient.dto.ts
│           │           └── ingredient-response.dto.ts
│           │
│           ├── recipes/            # Bounded Context: Recipes & Escandallos (M2 — ADR-010)
│           │   └── cost/           #   InventoryCostResolver interface + M2DefaultCostResolver impl (ADR-011)
│           ├── menus/              # Bounded Context: MenuItems & Margin Reporting (M2 — ADR-010)
│           ├── labels/             # Bounded Context: EU 1169/2011 Label Generation (M2 — ADR-010, ADR-019)
│           ├── nutrition-catalog/  # Bounded Context: Open Food Facts mirror + lookup (M2 — ADR-012)
│           │   └── sync/           #   Weekly cron sync + active-passive table swap
│           ├── haccp/              # Bounded Context: HACCP / APPCC (M4)
│           ├── operations/         # Bounded Context: Inventory & Orders (M3)
│           │
│           └── shared/             # Cross-cutting concerns
│               ├── auth/           # JWT Authentication guards
│               ├── tenant/         # Multi-tenant middleware (organizationId injection)
│               ├── database/       # TypeORM / Prisma config, migrations
│               └── openapi/        # Swagger setup (MCP-ready docs)
│
├── packages/
│   ├── types/                      # Shared TypeScript types (DTOs used by web+api)
│   ├── uom-engine/                 # The UoM conversion library (publishable to npm)
│   ├── ui-kit/                     # M2: shadcn/ui-based shared component library (Storybook-curated per ai-playbook UX track v0.5.0)
│   ├── mcp-server/                 # M2: MCP standard server wrapping the API — separable Docker image, zero coupling to apps/api (ADR-013)
│   └── label-renderer/             # M2: @react-pdf/renderer EU 1169/2011 label components (ADR-019)
│
├── docs/
│   ├── prd-module-1-ingredients.md
│   ├── architecture-decisions.md
│   └── project-structure.md        # This file
│
├── _bmad/                          # BMAD-METHOD governance
│   └── _config/
│       └── agents/
│           └── ui_ux_architect.md  # Custom UX persona
│
├── turbo.json                      # Turborepo pipeline config
├── package.json                    # Root workspace package.json
├── .gitignore
├── LICENSE                         # AGPL-3.0
└── README.md
```

## Key Design Decisions Visualised

```
┌─────────────────────────────────────────────────────┐
│                   nexandro                        │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Next.js (web)    PWA / Tablet Mode          │   │
│  └──────────────────┬───────────────────────────┘   │
│                     │ REST + OpenAPI (MCP-ready)     │
│  ┌──────────────────▼───────────────────────────┐   │
│  │             NestJS (api)                      │   │
│  │  ┌──────────┐ ┌────────┐ ┌──────┐ ┌───────┐ │   │
│  │  │Ingredients│ │Costing│ │HACCP │ │ Ops   │ │   │
│  │  │  (M1) ✅  │ │ (M2)  │ │ (M3) │ │ (M4)  │ │   │
│  │  └──────────┘ └────────┘ └──────┘ └───────┘ │   │
│  │              shared: auth / tenant / db       │   │
│  └──────────────────┬───────────────────────────┘   │
│                     │                               │
│  ┌──────────────────▼───────────────────────────┐   │
│  │  PostgreSQL   Redis (cache)  MinIO (files)   │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  FastAPI / Python AI (optional microservice) │   │
│  │  Only called if AI_SERVICE_URL is set        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘

ENTERPRISE ONLY (Nexandro / Rancher):
  Hermes/OpenClaw Agent ── LangGraph ── Hindsight Memory
         │
  WhatsApp / Telegram (kitchen staff interface)
```
