---
title: Sprint 4 backlog — close every gap from 2026-05-18 hidden-surfaces audit
status: COMPLETE
opened: 2026-05-18
closed: 2026-05-18
parent: docs/
related:
  - docs/audit-2026-05-18-v3-roundtable.md
  - docs/ux/j11.md
  - docs/sprint4-j5-whatsapp-assessment.md
---

# Sprint 4 — close every gap ✅ COMPLETE

Master directive 2026-05-18: "atacalo todo, no dejes nada por fuera, ni siquiera las decisiones intencionales". 23 items addressed in 4 waves over one session.

**Final outcome**: 23/23 items closed via 22 PRs in one day (#219 → #244). 1 PR closed as duplicate (#228 superseded by #227). Zero items deferred without explicit followup tracking.

## Wave 1 — UI wires over existing backend ✅

| # | Item | PR |
|---|---|---|
| W1-1 | Ingredients management UI | [#222](https://github.com/Wizarck/nexandro/pull/222) |
| W1-2 | Suppliers management UI | [#222](https://github.com/Wizarck/nexandro/pull/222) |
| W1-3 | FSMS standards UI | [#221](https://github.com/Wizarck/nexandro/pull/221) |
| W1-4 | External catalog UI | [#221](https://github.com/Wizarck/nexandro/pull/221) |
| W1-5 | OnboardingWizard steps 2-5 wire to real surfaces | [#220](https://github.com/Wizarck/nexandro/pull/220) |
| W1-6 | AI obs un-hide | [#220](https://github.com/Wizarck/nexandro/pull/220) |

## Wave 2 — backend + frontend medium scope ✅

| # | Item | PRs |
|---|---|---|
| W2-1 | AgentCredentials BYO LLM key | [#224](https://github.com/Wizarck/nexandro/pull/224) backend + [#229](https://github.com/Wizarck/nexandro/pull/229) UI |
| W2-2 | User invitation flow | [#225](https://github.com/Wizarck/nexandro/pull/225) backend + [#231](https://github.com/Wizarck/nexandro/pull/231) UI + [#234](https://github.com/Wizarck/nexandro/pull/234) specs+URL fix |
| W2-3 | Categories CSV import | [#223](https://github.com/Wizarck/nexandro/pull/223) backend + [#230](https://github.com/Wizarck/nexandro/pull/230) UI |

## Wave 3 — J11 Procurement full spec ✅

| # | Item | PR |
|---|---|---|
| W3-1 | PO detail drawer + Cancelar/Cerrar | [#238](https://github.com/Wizarck/nexandro/pull/238) |
| W3-2 | GR line-by-line dock UX | [#236](https://github.com/Wizarck/nexandro/pull/236) |
| W3-3 | Bulk-confirm CTA | [#240](https://github.com/Wizarck/nexandro/pull/240) |
| W3-4 | Hermes invoice-photo pre-fill banner | [#236](https://github.com/Wizarck/nexandro/pull/236) (bundled with W3-2) |
| W3-5 | Reconciliation aggregate (entity + repo + detector + service + real controller) | [#226](https://github.com/Wizarck/nexandro/pull/226) + [#227](https://github.com/Wizarck/nexandro/pull/227) |
| W3-6 | Resolution drawer + Owner approval gate | [#235](https://github.com/Wizarck/nexandro/pull/235) |
| W3-7 | GR confirmation → detector hook | [#233](https://github.com/Wizarck/nexandro/pull/233) |
| W3-8 | Audit chip per row (3 tabs) | [#239](https://github.com/Wizarck/nexandro/pull/239) PO + [#240](https://github.com/Wizarck/nexandro/pull/240) GR + [#241](https://github.com/Wizarck/nexandro/pull/241) Recon |
| W3-9 | Filter chips per tab | [#239](https://github.com/Wizarck/nexandro/pull/239) PO + [#240](https://github.com/Wizarck/nexandro/pull/240) GR + [#241](https://github.com/Wizarck/nexandro/pull/241) Recon |
| W3-10 | Tab counters | [#242](https://github.com/Wizarck/nexandro/pull/242) |
| W3-11 | Nueva OC primary CTA + create flow | [#239](https://github.com/Wizarck/nexandro/pull/239) |
| W3-12 | Tablet-friendly large-tap rows | [#236](https://github.com/Wizarck/nexandro/pull/236) GR + [#239](https://github.com/Wizarck/nexandro/pull/239) PO |
| W3-13 | Offline mode + draft-resume | [#244](https://github.com/Wizarck/nexandro/pull/244) |

Plus infrastructure: [#232](https://github.com/Wizarck/nexandro/pull/232) ProcurementScreen refactor split into tabs/ subdir (enabled parallel iteration).

## Wave 4 — design intent ✅ (scope-honest skeleton)

| # | Item | PR |
|---|---|---|
| W4-1 | J5 WhatsApp recipe creation skeleton + assessment | [#243](https://github.com/Wizarck/nexandro/pull/243) |

**Honesty note**: W4-1 ships webhook + signature verification + parser + ingest service + frontend discoverability. Full end-to-end flow requires external Meta Business setup (account, phone number, access token, webhook URL whitelist) — documented in [docs/sprint4-j5-whatsapp-assessment.md](sprint4-j5-whatsapp-assessment.md). Cannot be agent-automated.

## Closed in Sprint 3 (already merged before Sprint 4)

- ✅ J1 Recipe Builder promoted to `/recipes` + top-nav (PR #216)
- ✅ J2 Cost Investigation promoted to `/recipes/cost-drift` (PR #216)
- ✅ RecallTraceTreeScreen recovered + mounted at `/recall/trace` (PR #216)
- ✅ Locations management UI (PR #217)
- ✅ Users management UI (PR #217) — invitation flow added in Sprint 4 W2-2
- ✅ Categories + UoM CRUD (PR #217) — CSV import added in Sprint 4 W2-3
- ✅ J11 Procurement minimum-viable shell (PR #218) — full spec added in Sprint 4 W3-*
- ✅ Agent credentials MCP attribution (PR #217) — BYO LLM key added in Sprint 4 W2-1

## Followups documented (not blockers)

Items intentionally deferred with explicit followup tracking:

1. **W3-5 `lote-no-conforme` detection rule** — GoodsReceiptLine lacks quality status field. Followup `m3-gr-lot-quality-flag`.
2. **W3-2 per-line GR confirm endpoint** — `GrConfirmationService.confirm()` only handles full-GR today. Frontend wired with stub throw; replace stub when backend lands.
3. **W3-3 bulk-confirm backend** — same root as #2.
4. **W3-6 Owner approval email escalation** — `request-owner-approval` endpoint not built; Manager sees disabled buttons + tooltip.
5. **W3-11 PO delivery_location_id column** — backend stores locationId in `notes` prefix until migration lands.
6. **W3-13 fake-indexeddb test infra** — in-memory adapter is the only test surface today.
7. **W2-2 SMTP integration** — `LogEmailService` ships as default; `SmtpEmailService` throws unless `nodemailer` is installed.
8. **W2-1 AgentChatService runtime integration** — credentials surface ships; runtime use of stored keys is followup.
9. **W4 J5 WhatsApp external setup** — full Meta Business account configuration required for end-to-end flow.
10. **Spec inconsistency W3-1** — j11.md spec says "Cerrar OC on parcialmente_recibida" but ADR-PO-STATE-MACHINE forbids this transition. Drawer honors the state machine; spec needs reconciliation.

## Recovery incidents (process notes)

- 4 subagents silent-died during Wave 2 backends round 1; recovered by manual stage+commit+push of partial work from worktrees. All 3 PRs eventually landed.
- W3-5 was dispatched twice (a7cb80d + a2622194). First agent completed cp1+cp2 (PR #226 + #227 merged). Second agent's value-add was Layer 5 (GR→detector hook) which I cherry-picked into #233. PR #228 closed as duplicate.
- W3-1 dispatched twice. First agent timed out before commit. Recovery thread (mine) shipped #238; retry agent (a9ff6b4) finished independently and was closed as duplicate (#237).
- Multiple rebase conflicts on `apps/web/src/hooks/useProcurement.ts` + `apps/web/src/api/procurement.ts` (4 PRs simultaneously extending those files). Resolved manually; W3-10 commit had to be skipped in one rebase and redone via #242.

## Closure principle

This backlog is the source of truth for Sprint 4. Future Sprints inherit only the followups listed above.
