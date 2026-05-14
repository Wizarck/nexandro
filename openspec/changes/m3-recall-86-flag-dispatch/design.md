# Design — m3-recall-86-flag-dispatch (Wave 2.5, slice #13/22)

## Context

This slice closes Gap A of the M3 architecture (FR17–FR20, ADR-028) by adding the 86-flag dispatch + dossier generation + email-pipeline path. The companion read surfaces (incident search, trace tree) are in flight as slices #11 and #12; this slice neither imports from nor blocks them.

Three pre-locked decisions from architecture-m3.md (ADR-028 + ADR-039) constrain the design:

1. **Recall is a dedicated BC** at `apps/api/src/recall/` with read-only access to `audit_log` for chronology, lot graph traversal (slice #12), and incident search (slice #11). Writes go exclusively through the in-process event bus → audit-log subscriber.
2. **Dossier PDF reuses the `packages/label-renderer/` pattern**, NOT a new package. `@react-pdf/renderer` is dynamically imported so apps/api Jest runners don't pull the ESM-only dependency tree on every test boot.
3. **Email dispatch goes via `EMAIL_DISPATCH_SERVICE` DI** (slice #22, ADR-039). The dispatch service exposes a Result-style discriminated union; the recall dispatch service must NEVER throw on transport failure — every per-recipient outcome becomes its own audit_log row.

## ADRs

### ADR-RECALL-INCIDENT-VIA-AUDIT-LOG

**Decision.** The recall incident is NOT a separate aggregate with its own table. It is the cluster of `audit_log` envelopes sharing the same `aggregate_id` (a UUID minted at incident-open time). The five new event types (`RECALL_INVESTIGATION_OPENED`, `RECALL_86_FLAG_DISPATCHED`, `RECALL_DOSSIER_GENERATED`, `RECALL_DOSSIER_REDISPATCHED`, `RECALL_ADDENDUM_ATTACHED`) all carry `aggregate_type = 'recall_incident'`. Reads project by `aggregate_id` over `ix_audit_log_aggregate`.

**Rationale.**

- Slice #13's reserved migration slot list (`docs/openspec-slice-module-3.md` line 119) is empty — the slice was designed to fit inside the existing audit_log substrate.
- A separate `incidents` table would diverge from the regulator-facing chain: the regulator reads `audit_log`; an "operational mirror" creates a drift surface. Single source of truth = single chain.
- `audit_log` already carries `actor_user_id`, `actor_kind`, `created_at`, `payload_after`, `reason`, `citation_url`, `snippet` — every field a recall incident needs.
- Slice #21's hash chain (merged) makes the chain tamper-evident. A side table would NOT participate in the chain, leaving an attack surface where an attacker could rewrite recall history without breaking `audit_log`. Pinning the canonical record to `audit_log` is the regulator-correct choice.
- ZERO new migration consumed. Slot range 120–129 stays available for follow-ups.

**Alternatives considered.**

- *New `incidents` + `incident_recipients` + `incident_addenda` tables.* Rejected: see drift + chain-coverage reasoning above. Also, ~190 LOC of migration code, three repository classes, and an INT spec to keep the projection in sync with the chain — pure overhead.
- *Materialised view over `audit_log`.* Rejected: managed-cloud SUPERUSER fricción (same reason ADR-029 rejected materialised views). Postgres also caches the `ix_audit_log_aggregate`-driven query well enough — chronology reads are typically <50 ms at 100 entries.

**Trade-offs.**

- The `IncidentService.getIncident(id)` call does one `AuditLogService.query()` and one in-memory projection. At >1000 chronology entries per incident the projection cost rises; mitigation = stream via `streamRows()` if the chronology grows large. MVP scale (one regulator audit per year per tenant) keeps us safely below the bound.
- Status transitions (`open → dispatched → closed`) are derived from envelope timestamps + presence of `RECALL_DOSSIER_GENERATED` / `closeIncident()` markers. There is no row to UPDATE; status is a *projection*. This is unusual but matches the event-sourcing posture the audit_log was always meant to support.

### ADR-DOSSIER-PDF-RENDERER-LOCAL

**Decision.** A local `apps/api/src/recall/dossier/pdf-renderer.ts` consumes `@react-pdf/renderer` directly with an inline `RecallDossier` React component. This module is NOT under `packages/label-renderer/` (which is the EU 1169/2011 ingredient-label renderer); ADR-028's "reuse the pattern, not the package" wording is followed literally.

**Rationale.**

- The label renderer's `LabelData` shape and the recall dossier shape diverge significantly (ingredient table vs. chronology + lot tree + signature block). Stuffing them into one package would force a discriminated-union LabelData that bloats the existing API.
- The pattern reused is the *dynamic-import discipline* documented in `packages/label-renderer/src/render.ts` — `@react-pdf/renderer` is loaded lazily so apps/api Jest tests don't transitively pull the ESM-only dependency at import time. The module signature is `renderRecallDossierToPdf(data: RecallDossierShape): Promise<Buffer>`.
- If a future slice wants to move the renderer into `@opentrattos/recall-renderer`, the local module is one file (≤300 LOC). The move would be a follow-up.

**Alternatives considered.**

- *Add a `dossier/` sub-package to `@opentrattos/label-renderer`.* Rejected: package fan-out + a release cut of `@opentrattos/label-renderer` for a recall change. Both touch SemVer for the wrong reasons.
- *Inline-PDF via pdfkit/jspdf.* Rejected: tooling sprawl. `@react-pdf/renderer` already exists in the workspace and the patterns are battle-tested.

**Trade-offs.**

- A future "shared PDF runtime" effort is one extra file to consolidate. Acceptable.

### ADR-HASH-CHAIN-VALIDATION-PRE-SEAL

**Decision.** Before the dossier is sealed (signature block written, PDF generated), `DossierService` calls into the slice #21 audit-log hash chain validator over the chronology rows. If the chain is broken, the dossier carries a `chainBroken: true` flag in the metadata + the signature block includes the `firstBrokenRowId` so the regulator sees the discontinuity. The dispatch still proceeds — the regulator deadline (FR20 ≤4 h) overrides perfect record integrity.

**Rationale.**

- ADR-032 + slice #21 already established hash-chain-broken = surfaceable error, not blocking. Slice #21's `record()` throws `HashChainBrokenError` on broken-chain APPEND; READING a broken chain is informational. We follow the same posture: surface but do not block.
- The regulator's response-time budget is unforgiving. Blocking dispatch on a chain break would let an attacker who breaks the chain ALSO break compliance — a textbook denial-of-service via integrity tampering.
- The dossier as-dispatched carries the broken-chain notation, so the regulator's eventual review sees both the discontinuity and the dispatch metadata.

**Alternatives considered.**

- *Block dispatch on broken chain.* Rejected: see DoS reasoning above.
- *Skip validation entirely.* Rejected: a Manager dispatching a dossier without realising the chain is broken is the worst case — the regulator finds the discontinuity later, the operator loses defensibility.

**Trade-offs.**

- Adds one chain-validation call (≤5 ms p95 per slice #21 ADR-HASH-CHAIN-VALIDATION-PER-WRITE budget) to the dossier-generation path. Negligible at MVP scale.

### ADR-DISPATCH-PER-RECIPIENT-AUDIT

**Decision.** Each email recipient produces its own `RECALL_DOSSIER_GENERATED` envelope (or `RECALL_DOSSIER_REDISPATCHED` for re-sends). Per-recipient failures via the slice #22 retry-then-fail cascade produce a `RECALL_DOSSIER_GENERATED` envelope carrying `payload_after.deliveryStatus = 'failed'` + the `EmailDispatchError`.

**Rationale.**

- The j7 mock requires recipient-level delivery status in `DispatchReceiptCard`. Folding all recipients into a single envelope hides the per-recipient outcome from `audit_log` projections.
- Re-dispatch to a subset (j7 region #5) needs to produce its OWN audit rows so the chain shows the operator's deliberate re-action. Folding re-dispatch into the original envelope would lose that.

**Alternatives considered.**

- *One envelope with `recipients[]`.* Rejected: re-dispatch ambiguity + j7 surface requirement.

**Trade-offs.**

- More envelopes per incident (typically 2–3 recipients × 1–2 dispatches = 4–6 rows). Negligible at MVP scale.

### ADR-CRISIS-LAYOUT-DEDICATED

**Decision.** Routes `/recall/investigate*` mount on `apps/web/src/layouts/CrisisLayout.tsx` — no top nav, no sidebar, no global notifications. J7's `/recall/incidents/:id` mounts on the standard `AppLayout`.

**Rationale.**

- j6.md is explicit: the crisis surface is the whole page. Putting the standard chrome around it would dilute the "one decision in front of you" affordance the persona requires.
- J7 is post-crisis; the operator is reading, not reacting. Standard chrome restores context.

**Trade-offs.**

- Two layouts to maintain. Both are ≤80 LOC. Acceptable.

### ADR-MCP-RECALL-CAPABILITIES

**Decision.** `recall.dispatch-86-flag` + `recall.generate-dossier` MCP capabilities both proxy to `POST /m3/recall/incidents/:id/dispatch`. The latter is a thin alias: ADR-MCP-W-REGISTRY allows multiple capability names to share a REST handler when the handler is idempotent (which `dispatch` is, via the standard `Idempotency-Key` middleware). Hermes calls from WhatsApp / Telegram surface the same endpoint as the j6 sticky CTA.

**Rationale.** Matches the architecture-m3.md sub-decision under MCP namespacing: `recall.{search-incident, trace-forward, trace-reverse, dispatch-86-flag, generate-dossier}`. This slice ships the last two; the first three land with slices #11 + #12.

**Alternatives considered.** Two separate endpoints (one for 86-flag only, one for dossier only). Rejected: the j6 mock's single CTA makes the combined operation the canonical happy path.

## Module wiring

```
RecallModule (apps/api/src/recall/recall.module.ts)
├── controllers: [IncidentController]
├── providers:
│   ├── IncidentService           (consumes AuditLogService + EventEmitter2)
│   ├── IncidentCodeGenerator     (consumes AuditLogService for counter)
│   ├── DossierService            (consumes AuditLogService for chain + chronology)
│   ├── RecallDispatchService     (consumes EmailDispatchService + EventEmitter2)
│   └── recall-pdf-renderer.ts    (no DI; pure async fn)
├── imports:
│   ├── AuditLogModule            (exports AuditLogService)
│   └── EmailDispatchModule       (exports EMAIL_DISPATCH_SERVICE)
└── exports: [IncidentService, RecallDispatchService]
```

`AppModule` adds `RecallModule` to the imports list (the existing `// RecallModule, // M3 — Recall (slices #11-13)` placeholder gets activated).

## Event flow

```
J6 sticky CTA tap
  → POST /m3/recall/incidents
      → IncidentService.openIncident()
          → EventEmitter2.emit('recall.investigation-opened', envelope)
          → AuditLogSubscriber.onRecallInvestigationOpened → audit_log row
      → 201 Created + { incidentId, incidentCode, legalDeadline }

  → POST /m3/recall/incidents/:id/dispatch (body: { lotIds, locationIds, recipientList })
      → RecallDispatchService.dispatch86Flag()
          → EventEmitter2.emit('recall.86-flag-dispatched', envelope)
          → AuditLogSubscriber.onRecall86FlagDispatched → audit_log row
      → DossierService.generate()
          → HashChainValidator.validate(orgId)   (per slice #21)
          → composeChronology / lotProvenance / consumptionChain
          → renderRecallDossierToPdf()            (async PDF buffer)
      → For each recipient r in recipientList:
          → EmailDispatchService.dispatch({ to: [r], ..., attachments: [pdfBytes] })
          → EventEmitter2.emit('recall.dossier-generated', envelope-per-recipient)
          → AuditLogSubscriber.onRecallDossierGenerated → audit_log row
      → 200 OK + { dispatchedAt, recipientReceipts[] }

J7 surface render
  → GET /m3/recall/incidents/:id
      → IncidentService.getIncident(id)
          → AuditLogService.query({ aggregateId: id, aggregateType: 'recall_incident' })
          → project to { incident, chronology[], recipientReceipts[], dossierMeta }
      → 200 OK + IncidentResponseDto

J7 addendum confirm
  → POST /m3/recall/incidents/:id/addenda (body: { text, attachments[] })
      → IncidentService.attachAddendum()
          → EventEmitter2.emit('recall.addendum-attached', envelope)
          → AuditLogSubscriber.onRecallAddendumAttached → audit_log row
      → 200 OK

J7 redispatch confirm
  → POST /m3/recall/incidents/:id/redispatch (body: { recipientList })
      → RecallDispatchService.redispatchDossier(subset)
          → For each recipient r in subset:
              → EmailDispatchService.dispatch(...)
              → EventEmitter2.emit('recall.dossier-redispatched', envelope)
              → AuditLogSubscriber.onRecallDossierRedispatched → audit_log row
      → 200 OK
```

## Test posture

- **Unit (apps/api)**: services + controller mocked against `AuditLogService` + `EmailDispatchService`. `EventEmitter2` provided real; subscribers asserted via `await app.init()` + bus-emit pattern from slice #21.
- **Unit (ui-kit)**: RTL render + interactions. Addendum component asserts immutability — after confirm, the textarea is `disabled` and the file picker disappears.
- **Defer to follow-up**: integration test with real SMTP fake, real slice #11 / #12 services, end-to-end dispatch. Listed in `tasks.md §Deferred`.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Slice #11 or #12 lands first and the recall module scaffold conflicts | Conditional scaffolding logic in `recall.module.ts` claims; merge resolves at rebase time. |
| `@react-pdf/renderer` ESM-only breaks apps/api Jest | Dynamic-import pattern from `packages/label-renderer/src/render.ts` |
| Email transport unavailable at dispatch time | Slice #22 EmailFailureAlerter cascade; the recall envelope captures `deliveryStatus='failed'` so j7 surfaces it. |
| Hash chain validation slow at large chronology | Slice #21 bounds lookback to 100 rows; if chronology >100, only the tail is validated (matches slice #21's design). |
| Owner Manager confuses the j6 destructive CTA with j7 ghost CTA | j6.md decision: destructive paprika bg only on j6 CTA; j7 addendum is accent ghost. Tested at the component level. |
| Operator dispatches without configured recipients | Endpoint validates `recipientList` non-empty before dispatch; failure surfaces as 400 with `RECALL_RECIPIENTS_NOT_CONFIGURED`. The fallback (sanitary-authority only, when insurer absent) is captured in the spec ACs. |

## Slot reservation

- Migration slots: **NONE consumed.** Slot range 120–129 remains available for any follow-up that needs to add a recall-specific table (e.g. a future "recall_recipients_cache" if perf demands it).
- Gotcha range: 120–129 reserved for slice #13 follow-ups; the proposal pre-empts no slot.
