---
title: Module 3 (HACCP + Inventory + Orders — Integrated Traceability) — OpenSpec slicing
date: 2026-05-14
approver: Master
prereq_gates:
  - Gate A — 2026-05-13 (PRD-M3 approved)
  - Gate B — 2026-05-14 (Architecture ↔ UX convergence)
status: approved  # Gate C approved 2026-05-14 by Master ("adelante")
runbook: .ai-playbook/specs/runbook-bmad-openspec.md §2.4
related:
  - _bmad-output/planning-artifacts/prd-m3.md
  - _bmad-output/planning-artifacts/architecture-m3.md
  - _bmad-output/planning-artifacts/gate-b-convergence-m3-2026-05-14.md
  - docs/ux/DESIGN.md
  - docs/ux/components.md
  - docs/ux/j6.md … j12.md
---

# Module 3 — OpenSpec slicing

PRD-M3 (46 FRs across 8 capability areas, 53 NFRs, 7 user journeys j6–j12) is sliced into **22 OpenSpec changes** following the runbook heuristics — 1 bounded context per change, ≤10 acceptance scenarios per change, write_paths bounded (max 2 dirs per slice), name ≤6 words. The slicing crosses 8 bounded contexts: `inventory.lots`, `inventory.cost-resolver`, `procurement`, `haccp`, `recall` (cross-cutting), `compliance.export`, `ai-observability` (new BC per ADR-030), `photo-ingestion` (subordinate to ai-observability). Foundation slice (`m3-lot-aggregate`) is the absolute blocker; cost / procurement / HACCP / recall fan out after it. Photo-ingest and AI-observability are isolated paths that can run in parallel from a much earlier point.

Cut from 23 candidates → 22 slices by deferring 1 item to M3.x followup:
- **ADR-029 archival CLI tool** → folds into existing `m3-audit-log-archival` followup (cold-storage retrieval CLI; deferrable until cold-storage volume hits threshold).
- **Email DI third provider (Postmark)** → ship MVP with SMTP + SendGrid (2 providers). Postmark adoption when a customer specifically requests it. (No slice cut, just narrower scope on slice #22.)

Slice #17 (`m3-photo-ingest-hitl-review`) was split into **#17a (backend) + #17b (UI)** per ai-playbook rule "write_paths > 2 directories → split" (the merged slice touched `apps/api/src/photo-ingestion/`, `apps/web/src/screens/j12/`, and `packages/ui-kit/`).

## Approved change list

| # | Change ID | Bounded context | FRs | Journeys | Components | Depends on |
|---|---|---|---|---|---|---|
| 1 | `m3-lot-aggregate` | inventory.lots | FR5 | (foundation) | — | — |
| 2 | `m3-lot-consumption-events` | inventory.lots | FR6 | (backend) | — | #1 |
| 3 | `m3-lot-expiry-alerts` | inventory.lots | FR8 | (Hermes) | — | #1 |
| 4 | `m3-inventory-cost-resolver-fifo-fefo` | inventory.cost-resolver | FR7 | (backend, M2 interface) | — | #1, #2 |
| 5 | `m3-cost-snapshot-persistence` | inventory.cost-resolver | FR7 | (backend) | — | #4 |
| 6 | `m3-po-aggregate` | procurement | FR1, FR2, FR3 | j11 (partial) | PoTable, PoDetailDrawer | #1 |
| 7 | `m3-gr-aggregate-reconciliation` | procurement | FR4, FR5 | j11 (partial) | GrLineList, GrLineDrawer | #1, #6 |
| 8 | `m3-procurement-ui` | procurement | FR1–FR4 | j11 | ReconciliationView, bulk-confirm CTA, supplier perf strip | #6, #7 |
| 9 | `m3-ccp-reading-aggregate` | haccp | FR9, FR10, FR12, FR13 | (backend) | — | #1 |
| 10 | `m3-haccp-ui` | haccp | FR9–FR13 | j10 | CcpPicker, ReadingInput, SpecRangeReadback, CorrectiveActionPicker, recent-readings, sticky-warn | #9 |
| 11 | `m3-incident-search-multi-anchor` | recall | FR14 | j6 (partial) | IncidentSearchField + autocomplete | #2, #10 |
| 12 | `m3-trace-tree-forward-reverse` | recall | FR15, FR16 | j6 (partial) | RecallTraceTree | #11 |
| 13 | `m3-recall-86-flag-dispatch` | recall | FR17–FR20, ADR-032/033 | j6 CTA + j7 | DispatchReceiptCard, chronology, SHA chain copy+verify | #12, #22 |
| 14 | `m3-appcc-export-bundle-service` | compliance.export | FR21, FR22, FR25, FR27 | (backend) | — | #2, #13 |
| 15 | `m3-appcc-i18n-ui` | compliance.export | FR21–FR27, ADR-035 | j9 | LocaleChipGroup, quick-export, bundles archive, transparency, configurar-manualmente | #14 |
| 16 | `m3-vision-llm-provider-di-otel` | ai-observability | FR28, FR43, ADR-030, ADR-038 | (backend) | — | — |
| 17a | `m3-photo-ingest-backend` | ai-observability.photo-ingest | FR28–FR31, FR44, ADR-034 | (backend) | — | #16 |
| 17b | `m3-photo-ingest-review-ui` | ai-observability.photo-ingest | FR29–FR32, FR43, FR44 | j12 | HitlQueue, PhotoViewer, ExtractedFieldList, ConfidenceBandBadge, AiProvenanceChip, drift banner, keyboard shortcuts, bounding boxes, compare-anterior pattern, `M3AggregateTypeChip` | #17a |
| 18 | `m3-photo-storage-lifecycle` | ai-observability.photo-ingest | FR33, ADR-037 | (backend) | — | #16 |
| 19 | `m3-ai-obs-budget-tier-emitter` | ai-observability | FR45, NFR-OBS-10, ADR-030 | (backend) | — | #16 |
| 20 | `m3-ai-obs-ui` | ai-observability | FR45, FR46 | j8 | 6-core widgets + anomaly chip + savings + blast radius + sparkline + OTLP banner + heatmap | #19 |
| 21 | `m3-audit-log-hash-chain-hardening` | audit-log (cross-cutting) | FR38–FR42, ADR-032, ADR-033 | (backend) | — | #1 |
| 22 | `m3-email-dispatch-di` | infra (cross-cutting) | FR19 (email half), ADR-039 | j7 receipt + j9 send | (uses existing receipt components) | — |

**ADR-030 BC compression note**: architecture-m3.md (line 234) called for 4 slices for the AI-observability BC (BC scaffold + OTel SDK init / rollup table+cron / dashboard UI / budget tier). This proposal compresses to 2 slices (#19 budget-tier-emitter, #20 dashboard UI) by absorbing BC scaffold + OTel SDK init into slice #16 (`m3-vision-llm-provider-di-otel`) and rollup table+cron into slice #19. If design-review reveals that OTel setup or rollup logic deserves dedicated slices, re-open Gate C and split → tracked as `m3-ai-obs-followup-May-2026` followup.

## Track structure (parallelism opportunities)

```
Track A (operational spine):
  #1 → #2 → ┬→ #4 → #5
            ├→ #6 → #7 → #8
            ├→ #9 → #10
            ├→ #11 → #12 → #13 → … (#13 depends on #22 for email)
            └→ #14 → #15

Track B (AI / observability, parallel from day one):
  #16 → ┬→ #17a → #17b
        ├→ #18
        └→ #19 → #20

Track C (cross-cutting, parallel):
  #3 (depends on #1)
  #21 (depends on #1, can run alongside any other slice)
  #22 (parallel, blocks #13 dispatch)
```

`#1 m3-lot-aggregate` is the absolute blocker (every operational slice needs Lot). Track B (`#16`) is **independent infra** and can start in parallel from day one — no dependency on lot lifecycle. `#22 m3-email-dispatch-di` is independent and only blocks `#13` (recall 86-flag dispatch needs email). After `#7` lands, blocks 4–9 can run in parallel with up to 5 concurrent slices.

## Parallelism guardrails

**Track B (slices 16–20 + 17a/17b) runs alongside Track A (slices 1–15)** with the following file-path + BC isolation:

- **Track B write paths**:
  - `apps/api/src/ai-observability/` (root BC + photo-ingest subpath + budget service + rollup + pricing + dashboard)
  - `apps/web/src/screens/{photo-ingest,ai-obs}/`
  - `packages/ui-kit/src/components/{ConfidenceBandBadge,AiProvenanceChip,M3AggregateTypeChip,…}`
- **Track A write paths**:
  - `apps/api/src/{inventory,procurement,haccp,recall,compliance}/`
  - `apps/web/src/screens/{j6,j7,j9,j10,j11}/`
  - `packages/ui-kit/src/components/{IncidentSearchField,RecallTraceTree,PoTable,GrLineList,CcpPicker,…}`
- **No shared write paths** between tracks. Workers can commit to separate branches without merge conflicts.
- **Shared read paths** (read-only for both tracks): `packages/db/migrations/` (numbered slots reserved below), `apps/api/src/audit-log/` (read-only consumer; #21 owns writes to this path).

**Rebase sequencing**: after `#7` (GR aggregate), Track A workers branching from main rebase atop `#7` before starting their applies. Track B does not rebase on Track A.

## Slot reservations

Per `.ai-playbook/specs/migration-slot-reservation.md` §3.1 — all slot allocations live here, claimed at Gate C. `openspec-propose` MUST cite the reserved slots verbatim.

Migration slot numbering starts at 025 (M2 ended at 022; ADR-032 reserved 023–024 for hash chain migrations — now claimed by slice #21).

| Slice ID | Migrations | Gotchas | ADR-INDEX |
|---|---|---|---|
| `m3-lot-aggregate` | 025–026 | 1–9 | — |
| `m3-lot-consumption-events` | 027 | 10–19 | ADR-031 (traversal indexes) |
| `m3-lot-expiry-alerts` | — | 20–29 | — |
| `m3-inventory-cost-resolver-fifo-fefo` | 028 | 30–39 | — |
| `m3-cost-snapshot-persistence` | 029 | 40–49 | — |
| `m3-po-aggregate` | 030–031 | 50–59 | — |
| `m3-gr-aggregate-reconciliation` | 032 | 60–69 | — |
| `m3-procurement-ui` | — | 70–79 | — |
| `m3-ccp-reading-aggregate` | 033–034 | 80–89 | — |
| `m3-haccp-ui` | — | 90–99 | — |
| `m3-incident-search-multi-anchor` | 035 | 100–109 | ADR-028 |
| `m3-trace-tree-forward-reverse` | 036 | 110–119 | — |
| `m3-recall-86-flag-dispatch` | — | 120–129 | — |
| `m3-appcc-export-bundle-service` | 037 | 130–139 | — |
| `m3-appcc-i18n-ui` | — | 140–149 | ADR-035 |
| `m3-vision-llm-provider-di-otel` | 038 | 150–159 | ADR-030, ADR-038 |
| `m3-photo-ingest-backend` | 039 | 160–169 | ADR-034 |
| `m3-photo-ingest-review-ui` | — | 170–179 | — |
| `m3-photo-storage-lifecycle` | 040 | 180–189 | ADR-037 |
| `m3-ai-obs-budget-tier-emitter` | 041–042 | 190–199 | — (consumes NFR-OBS-10) |
| `m3-ai-obs-ui` | — | 200–209 | — |
| `m3-audit-log-hash-chain-hardening` | 023–024 | 210–219 | ADR-032, ADR-033 |
| `m3-email-dispatch-di` | 043 | 220–229 | ADR-039 |

**Cross-slice gotcha ranges**: each slice owns its 10-slot range; overlapping ranges are forbidden per `migration-slot-reservation.md` §3.1. Hash-chain migrations 023–024 belong to slice #21 (`m3-audit-log-hash-chain-hardening`) — these were pre-reserved during the ADR-032 design phase but unclaimed until now.

## Volume estimate

22 changes × ~5–10 acceptance scenarios each ≈ 110–220 scenarios total in M3. Equivalent to ~4–5 months of implementation work at the current Wave 1.X cadence (~1 slice per ~5 working days, parallelizable 2-3 wide via Track A + B isolation).

Effort distribution:
- **S** (small): 2 slices (#3 lot-expiry, #18 photo-storage) — ~3–5 days each.
- **M** (medium): 11 slices (#1, #2, #5, #6, #9, #10, #11, #15, #16, #17a, #22) — ~7–10 days each.
- **L** (large): 8 slices (#4, #7, #8, #12, #13, #14, #19, #20) — ~12–18 days each.
- **XL eliminated** via #17 split. Largest remaining slices are #8 procurement-ui and #13 recall-86-flag-dispatch (both L, ~15 days each).

## Scope notes

(One paragraph per change. `openspec-propose` echoes these as initial framing. No `<TBD>` placeholders.)

### 1. `m3-lot-aggregate` — foundation (inventory.lots BC)
Lot entity definition with `supplier_id`, `received_at`, `expires_at`, `quantity_received`, `quantity_remaining`, `unit`, `metadata` jsonb. Indexed by `(organization_id, supplier_id, received_at DESC)` per ADR-031 for forward-trace performance. Lot is created via GR (slice #7) but the entity + repository + factory live here. Out of scope: consumption events (slice #2), expiry rules (slice #3), cost snapshots (slice #5). Foundation slice — every operational M3 slice depends on this.

### 2. `m3-lot-consumption-events`
Emit `LotConsumed` events on recipe production + menu-item shipping flows from M2. Traversal indexes for forward-trace (consumption graph) and reverse-trace (origin graph) per ADR-031. Read-only on M2 recipes + menu-items; write-only on audit_log. Out of scope: UI surfaces (slices #6, #10, #11 consume these events).

### 3. `m3-lot-expiry-alerts`
Backend rule that scans lots nightly and emits `LotExpiryNear` events at T-72h + T-24h. Routes to Hermes notifications (no first-party UI). Soft enforcement — alerts emit but don't block consumption. Out of scope: dedicated "expiring lots" dashboard (deferred to M3.x followup if operator demand emerges).

### 4. `m3-inventory-cost-resolver-fifo-fefo`
FIFO/FEFO algorithm closing the `InventoryCostResolver` interface seeded in M2. Property-based pricing CSV per Murat's pre-release validation (#step-10-nonfunctional). Snapshot persistence is slice #5. Out of scope: cost UI visualization.

### 5. `m3-cost-snapshot-persistence`
Snapshot persisted per lot at consumption time; audit envelope on every snapshot. Rollup drift INT test (Murat's pre-release ask). Out of scope: cost dashboard (lives in #20 ai-obs-ui, indirectly).

### 6. `m3-po-aggregate`
PurchaseOrder entity + state machine (`draft → sent → partially-received → received → closed`) + PoLine sub-entity. Components: `PoTable`, `PoDetailDrawer` (j11 partial). Out of scope: GR linking (#7), reconciliation UI (#8).

### 7. `m3-gr-aggregate-reconciliation`
GoodsReceipt entity + GrLine sub-entity linking PO lines to lots. Reconciliation events (`cantidad-mismatch`, `precio-mismatch`) emitted when received quantities/prices diverge from PO. Components: `GrLineList`, `GrLineDrawer` (j11 partial). Out of scope: reconciliation UI (#8), bulk-confirm CTA (#8).

### 8. `m3-procurement-ui`
j11 mock implemented end-to-end: ReconciliationView, bulk-confirm CTA, supplier perf strip (94 % / 97 % / 2-28 discrepancias), entregas-esperadas-hoy strip, Hermes chip tier system. Wires slices #6–#7 + queue + reconciliation actions. UI-only slice — no new backend.

### 9. `m3-ccp-reading-aggregate`
CcpReading entity + spec-range validator + FSMS reference linking. Validates readings against ranges from FSMS-2026 v2 (`hot-hold`, `cooling-curve`, `frozen`, etc). Out of scope: corrective action (slice #10 wires it).

### 10. `m3-haccp-ui`
j10 mock implemented: `CcpPicker`, `ReadingInput`, `SpecRangeReadback` (live), `CorrectiveActionPicker`, recent-readings list, sticky out-of-range warning, dual-CTA "Firmar lectura" + "Firmar + siguiente CCP →", dictado/foto-termómetro buttons. Wires slice #9 + corrective action linkage.

### 11. `m3-incident-search-multi-anchor`
Search backend across `lot / supplier / ingredient / symptom / aggregate-type`. Component: `IncidentSearchField` with autocomplete dropdown (proveedor reciente + lote/atún rojo suggestions). p95 < 500ms at 100k events per NFR-PERF-1. Out of scope: trace tree (#12), dispatch CTA (#13).

### 12. `m3-trace-tree-forward-reverse`
Traversal queries for consumption tree (forward — what was served from this lot) + origin tree (reverse — which lots fed this incident). Component: `RecallTraceTree` with mode-chip toggle. Reads `LotConsumed` events from slice #2.

### 13. `m3-recall-86-flag-dispatch`
Incident dossier generation + 86-flag dispatch to kitchen Hermes channels (WhatsApp/Telegram). j6 sticky CTA + j7 full surface (`DispatchReceiptCard`, chronology rail, SHA-256 chain copy + verify button, re-dispatch inline editor, view-only share link). Hash chain validation hardening folded in (validates audit_log chain integrity at dossier generation). Depends on email DI (#22) for SMTP/SendGrid dispatch.

### 14. `m3-appcc-export-bundle-service`
Bundle generator: raw audit_log as chapter 0 (sin editar per FR25) + derivative chapters (HACCP, Lot, Procurement, AI-cost) as PDF/CSV. SHA-256 hash of bundle + cold-storage routing for old bundles. Retention archival metric per NFR-OPS-3.

### 15. `m3-appcc-i18n-ui`
j9 mock implemented: quick-export 1-click card, `LocaleChipGroup` (es/ca/eu/gl — 4 chips), bundles-anteriores archive table, transparency banner, Configurar-manualmente collapsible. i18n templates per ADR-035.

### 16. `m3-vision-llm-provider-di-otel`
Vision-LLM provider DI extension (multiple providers swappable). OTel `gen_ai.*` semantic conventions emission on every call. Audit envelope per AI call. BC scaffold for `ai-observability` lives here. Out of scope: photo-ingest UX (#17a, #17b), photo storage (#18), budget enforcement (#19).

### 17a. `m3-photo-ingest-backend`
Vision-LLM extraction API + confidence-band classifier (0.85 ≥ auto-fill, 0.60–0.85 flag-for-review, < 0.60 manual per ADR-034). Queue state machine for HITL review items. IEEE 754 boundary float tests on confidence thresholds. Out of scope: review UI (#17b), photo storage (#18).

### 17b. `m3-photo-ingest-review-ui`
j12 mock implemented end-to-end: `HitlQueue`, `PhotoViewer` (rotated paper + bounding boxes), `ExtractedFieldList`, `ConfidenceBandBadge` (3-band visual), `AiProvenanceChip`, drift banner, keyboard shortcuts (j/k/↵/R), compare-anterior pattern, `M3AggregateTypeChip` for queue filters. Wires slice #17a + audit_log linking.

### 18. `m3-photo-storage-lifecycle`
Signed-URL photo storage + 90-day retention policy + audit_log linking + photo deletion job per ADR-037. Out of scope: ingestion flow (#17a) — this is purely storage lifecycle.

### 19. `m3-ai-obs-budget-tier-emitter`
Tag attribute pattern + budget tier system per NFR-OBS-10 (4-tier `info=50% / warn=75% / error=90% / fatal=100%`). LRU cache fallback for pricing lookups. `AI_BUDGET_TIER_CROSSED` event + `BudgetAlertDispatcher`. `BurnRateCalculator.daysUntilEmpty()`. Rollup cron job (absorbs the architecture's "+1 slice" for rollup table+cron). Soft enforcement (fatal emits, doesn't block).

### 20. `m3-ai-obs-ui`
j8 mock implemented: 6-core widgets (ErrorRate + CostTotal + BudgetStatus + CostByCapability + CostByModel + CostByTag + UsageHeatmap + Top5Failures) + Anomaly chip (3.2× sobre media 7d) + Savings opportunity + Blast radius widget + sparkline scale + OTLP banner + locale selector for Manager scope.

### 21. `m3-audit-log-hash-chain-hardening`
Hash chain migration consuming pre-reserved slots 023–024 per ADR-032. Actor attribution snapshot circuit breaker per ADR-033 (hard fail upstream on snapshot lookup failure). Multi-tenant isolation enforcement (FR41). Server timestamp + NTP validation (FR42). Cross-cutting slice — runs alongside any other Track A slice.

### 22. `m3-email-dispatch-di`
Email DI infrastructure (SMTP + SendGrid; Postmark deferred to M3.x followup). Dispatch path for recall dossier (j7) + APPCC export delivery (j9). Delivery-status receipt rendering. Independent slice — can start day one.

---

**Status**: 22 slices, dependency-ordered, slot-reserved. **Gate C APPROVED 2026-05-14** ([approval record](../_bmad-output/planning-artifacts/gate-c-approval-2026-05-14.md)). Cleared for `/opsx:propose` per slice. Recommended kickoff: slice #1 `m3-lot-aggregate`.
