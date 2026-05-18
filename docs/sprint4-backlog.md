---
title: Sprint 4 backlog — close every gap from 2026-05-18 hidden-surfaces audit
status: in-progress
opened: 2026-05-18
parent: docs/
related:
  - docs/audit-2026-05-18-v3-roundtable.md (Sprint 2 audit)
  - docs/ux/j11.md (Procurement spec, partial in Sprint 3 Block C)
---

# Sprint 4 — close every gap

Audit (2026-05-18) found 23 distinct gaps after Sprint 3 (#216 + #217 + #218) landed. This file tracks them all to completion. Master directive: "atacalo todo, no dejes nada por fuera, ni siquiera las decisiones intencionales".

Order chosen by execution cost. Wave 1 is shippable in one session; Waves 2-4 are sequenced for subsequent sessions.

## Wave 1 — UI wires over existing backend (this session)

| # | Item | Pattern | PR |
|---|---|---|---|
| W1-1 | Ingredients management UI (listado + alta) | Mirror OwnerCatalogSection; backend `ingredients.controller` | — |
| W1-2 | Suppliers management UI (listado + alta) | Mirror OwnerLocationsSection; backend `suppliers.controller` | — |
| W1-3 | FSMS standards UI (read-only catalog) | Settings → Catálogo extension; backend `m3/haccp/fsms-standards.controller` | — |
| W1-4 | External catalog UI (browse / import) | New Settings sub-tab; backend `external-catalog.controller` | — |
| W1-5 | OnboardingWizard steps 2-5 wire to real surfaces | Replace placeholder targets: step 2 → `/owner-settings/sedes`, step 3 → `/owner-settings/catalogo`, step 4 → `/owner-settings/equipo`, step 5 → `/recipes` | — |
| W1-6 | AI obs un-hide (per Master directive override of audit v2 decision) | Add nav entry under Configuración → Avanzado | — |

## Wave 2 — backend + frontend, medium scope (next session)

| # | Item | New backend | UI |
|---|---|---|---|
| W2-1 | AgentCredentials BYO LLM key | New table `llm_api_keys` (org_id + provider + encrypted_key + last_tested_at) + encryption-at-rest service + test endpoint | Owner section: provider dropdown + masked key input + Test button |
| W2-2 | User invitation flow (real email) | New table `user_invitations` (token + role + invited_by + expires_at) + email send service + `POST /users/invitations/accept` | Owner section: invite form + pending list + revoke |
| W2-3 | Categories full taxonomy + CSV import | File upload endpoint + parse + dedupe service | Catálogo extension: "Importar CSV" CTA + preview + commit |

## Wave 3 — J11 full spec (multi-PR, multi-session)

All flagged as FOLLOWUP in PR #218. Spec: [docs/ux/j11.md](ux/j11.md).

| # | Item |
|---|---|
| W3-1  | PO detail drawer + edit-in-place + `Cancelar OC` / `Cerrar OC` ghost actions |
| W3-2  | GR line-by-line dock UX (tap to confirm; cantidad/lote/expiry inline edit) |
| W3-3  | Bulk-confirm CTA `Confirmar todo lo que coincida (N)` |
| W3-4  | Hermes invoice-photo pre-fill banner + low-confidence routing |
| W3-5  | Reconciliation aggregate (entity + repo + discrepancy detection service) |
| W3-6  | Resolution drawer (Aceptar / Nota crédito / Devolver) |
| W3-7  | Owner approval gate above `procurement_approval_threshold_eur` |
| W3-8  | Audit chip per row → `/audit-log?aggregate_id=` |
| W3-9  | Filter chips (location · proveedor · estado) above each tab |
| W3-10 | Tab counters (`Órdenes de compra (12) · Recepciones (3 pendientes) · …`) |
| W3-11 | `Nueva OC` primary CTA + 4-step create flow |
| W3-12 | Tablet-friendly large-tap rows (≥64 px) for the receiving dock |
| W3-13 | Offline mode + draft-resume on tablet |

## Wave 4 — design intent items (largest scope)

| # | Item |
|---|---|
| W4-1 | J5 WhatsApp recipe creation (Hermes + WhatsApp Business API integration) |

## Closed in Sprint 3 (no longer in backlog)

- ✅ J1 Recipe Builder promoted to `/recipes` + top-nav (PR #216)
- ✅ J2 Cost Investigation promoted to `/recipes/cost-drift` (PR #216)
- ✅ RecallTraceTreeScreen recovered + mounted at `/recall/trace` (PR #216)
- ✅ Agent credentials MCP attribution surface (PR #217) — partial; BYO LLM still pending in W2-1
- ✅ Locations management UI (PR #217)
- ✅ Users management UI with provisional-password banner (PR #217) — partial; real invitation flow still pending in W2-2
- ✅ Categories + UoM CRUD (PR #217) — partial; CSV import still pending in W2-3
- ✅ J11 Procurement minimum-viable shell (PR #218) — 3 read-only tabs + new top-nav group "Compras"

## Closure principle

Every PR landed in this Sprint 4 updates this file: marks the item with `✅` + PR link, moves it under "Closed in Sprint 4" section that gets appended on first close. Backlog stays the source of truth until the last item closes.
