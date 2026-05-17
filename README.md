# 🍷 nexandro

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/nexandro/nexandro/pulls)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.x-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)

> **The Open Source Back-of-House (BOH) & Kitchen Traceability Operating System.**  
> Built to kill the grey, bloated ERP. Designed for modern kitchens.

nexandro is a modern, **AI-ready**, open-source restaurant management and food costing 
platform. It covers everything that happens **behind the kitchen door**: ingredient 
costing, recipe engineering (escandallos), supplier management, HACCP/APPCC compliance, 
and inventory operations.

---

## ✨ Why nexandro?

The Back-of-House software market is dominated by **closed-source, expensive SaaS** 
(Apicbase, MarketMan, tSpoonLab) and **legacy ERPs** that look like they were designed 
in 1998. Chefs deserve better.

| Problem | nexandro Solution |
|---|---|
| SaaS costs €90-300/month per venue | **Free & self-hosted** (AGPL-3.0) |
| ERPs are grey, bloated, confusing | **Beautiful, minimal interface** (TailwindCSS, mobile-first) |
| No open-source HACCP/APPCC tool exists | **Built-in compliance module** (checklists, lot tracking, label printing) |
| Vendor lock-in with proprietary APIs | **API-First design** (OpenAPI/Swagger, MCP-ready for AI agents) |

---

## 🧩 Modules

nexandro is built as a **modular monolith**. Each module is independently useful:

| Module | Description | Status |
|---|---|---|
| **M1: Foundation** | Ingredients, categories, UoM conversions, suppliers & pricing | 🟢 In Progress |
| **M2: Food Costing** | Nested sub-recipes, yield/waste calculations, dynamic margin analysis | 🟡 Planned |
| **M3: HACCP/APPCC** | Batch tracking, traceability logs, digital checklists, label printing | 🟠 Planned |
| **M4: Operations** | Inventory counts, purchase orders, par-stock alerts, blind stock taking | 🔴 Planned |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, React, TypeScript, TailwindCSS |
| **Backend** | NestJS, TypeScript, Domain-Driven Design (DDD) |
| **Database** | PostgreSQL |
| **Cache** | Redis |
| **File Storage** | MinIO / S3 |
| **AI (optional)** | Python FastAPI microservice (invoice OCR, demand forecasting) |
| **Governance** | BMAD-METHOD (Discovery) + OpenSpec (Implementation) |
| **Monorepo** | Turborepo |

---

## 🚀 Quick Start

nexandro ships as a single omnibus Docker image (per [ADR-028](docs/architecture-decisions.md)) that bundles the API, the web SPA, and all required runtimes. Same pattern as GitLab CE, Mattermost, n8n.

```bash
# Clone + configure
git clone https://github.com/Wizarck/nexandro.git
cd nexandro
cp .env.example .env       # then edit POSTGRES_PASSWORD

# Start
docker compose up -d

# Open the app
open http://localhost:3000
```

The compose pulls the public image `ghcr.io/wizarck/nexandro:latest` (no GitHub auth required). Migrations run automatically on first start; the `/health` endpoint reports DB connectivity once ready.

For deployment behind cloudflared / Traefik / nginx with loopback-only bind, see [deploy/README.md](deploy/README.md).

---

## 📖 Documentation

| Document | Description |
|---|---|
| [PRD — Module 1](docs/prd-module-1-ingredients.md) | Product requirements for ingredients, categories & UoM |
| [Architecture Decisions (ADRs)](docs/architecture-decisions.md) | All architectural decisions with rationale |
| [Data Model (ERD)](docs/data-model.md) | Entity relationship diagram and database design rules |
| [User Personas & JTBD](docs/personas-jtbd.md) | User archetypes, RBAC matrix, and onboarding flow |
| [Project Structure](docs/project-structure.md) | Full monorepo directory layout |

---

## 🤝 Contributing

We welcome contributions from developers, chefs, and food-tech enthusiasts!

1. **Fork** this repository
2. **Create a branch** (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to your branch (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

Please read our [Architecture Decisions](docs/architecture-decisions.md) before 
writing code to understand the design constraints.

### Commit Convention
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code restructuring without behavior change
- `test:` — Adding/updating tests

---

## 🗺️ Roadmap

- [x] Project scaffolding & governance (BMAD + OpenSpec)
- [x] PRD & Architecture for Module 1
- [ ] Module 1: Ingredients, Categories, UoM, Suppliers
- [ ] Module 2: Recipe Engine & Food Costing (Escandallos)
- [ ] Module 3: HACCP / APPCC Compliance
- [ ] Module 4: Inventory & Purchase Operations
- [ ] Nexandro Enterprise: AI Agent layer (Hermes/OpenClaw + WhatsApp/Telegram)

---

## 💼 nexandro vs Nexandro Enterprise

| Feature | nexandro (Free) | Nexandro (Enterprise) |
|---|:---:|:---:|
| Ingredients & Recipes | ✅ | ✅ |
| HACCP Compliance | ✅ | ✅ |
| Inventory & Orders | ✅ | ✅ |
| Self-hosted | ✅ | ✅ |
| AI-powered invoice scanning | ❌ | ✅ |
| AI purchase forecasting | ❌ | ✅ |
| WhatsApp/Telegram assistant | ❌ | ✅ |
| Multi-venue dashboards | ❌ | ✅ |
| Managed cloud hosting | ❌ | ✅ |
| Priority support & SLA | ❌ | ✅ |

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.  
See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ for kitchens that deserve better software.
</p>
