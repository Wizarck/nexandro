# Tasks — m3-recall-86-flag-dispatch (Wave 2.5, slice #13/22)

## §1 Recall BC scaffold

- [x] Create `apps/api/src/recall/recall.module.ts` (or extend the slice #11 version when present).
- [x] Create `apps/api/src/recall/domain/constants.ts` with `RECALL_TRACE_MAX_DEPTH`, `RECALL_INCIDENT_AGGREGATE_TYPE`, `RECALL_LEGAL_DEADLINE_HOURS`, `RECALL_INCIDENT_CODE_PREFIX`.
- [x] Create `apps/api/src/recall/types.ts` with inline `TraceNode`, `IncidentSearchHit`, `ChronologyEntry`, `IncidentReceipt`, `DispatchRecipient` shapes.
- [x] Create `apps/api/src/recall/domain/incident.ts` with `IncidentStatus`, `Incident` interface, supporting types.

## §2 Incident service + code generator

- [x] `apps/api/src/recall/incident/incident.service.ts` — `openIncident`, `getIncident`, `attachAddendum`, `closeIncident`. Reads chronology from `AuditLogService.query()`.
- [x] `apps/api/src/recall/incident/incident-code-generator.ts` — `IR-YYYY-NNNN` counter via audit-log count.
- [x] Unit specs: `incident.service.spec.ts`, `incident-code-generator.spec.ts`.

## §3 Dossier service + PDF renderer

- [x] `apps/api/src/recall/dossier/dossier.service.ts` — chain validation gate; chronology + lot graph projection; signature block.
- [x] `apps/api/src/recall/dossier/pdf-renderer.ts` — dynamic-import `@react-pdf/renderer` consumer with inline `RecallDossier` React component.
- [x] Unit spec: `dossier.service.spec.ts` covering chain-broken handling, signature block content, chronology projection. (Renderer test deferred — see §Deferred.)

## §4 Recall dispatch service

- [x] `apps/api/src/recall/dispatch/recall-dispatch.service.ts` — `dispatch86Flag`, `dispatchDossier`, `redispatchDossier`.
- [x] Per-recipient event emission per ADR-DISPATCH-PER-RECIPIENT-AUDIT.
- [x] Unit spec: `recall-dispatch.service.spec.ts` covering event shape, email invocation, retry-then-fail rollup.

## §5 REST controller

- [x] `apps/api/src/recall/incident/incident.controller.ts` — 6 endpoints, `@Roles('OWNER', 'MANAGER')`.
- [x] `apps/api/src/recall/incident/dto/` — DTOs for open / dispatch / redispatch / addendum / response.
- [x] Unit spec: `incident.controller.spec.ts` covering RBAC + validation + error mapping.

## §6 Audit subscriber + types extension

- [x] Extend `apps/api/src/audit-log/application/types.ts`:
  - 5 new `AuditEventType` constants + `AuditEventTypeName` entries,
  - 5 new entries in `RETENTION_BY_EVENT_NAME` (all `'regulatory'`).
- [x] Extend `apps/api/src/audit-log/application/audit-log.subscriber.ts` with 5 new `@OnEvent` handlers (envelope shape, `persistEnvelope`).
- [x] Extend `apps/api/src/audit-log/application/types.spec.ts` — assert presence of the 5 new types + retention class mapping.
- [x] Extend `apps/api/src/audit-log/application/audit-log.subscriber.spec.ts` — emit each of the 5 event types, assert persistence.

## §7 MCP capabilities

- [x] `packages/mcp-server-nexandro/src/capabilities/write/recall.ts` — `RECALL_WRITE_CAPABILITIES` (2 entries).
- [x] Update `packages/mcp-server-nexandro/src/capabilities/write/index.ts` — spread `RECALL_WRITE_CAPABILITIES` into `WRITE_CAPABILITIES`.
- [x] Unit spec: `recall.spec.ts` covering shape + restPathTemplate + restBodyExtractor.

## §8 Wire RecallModule into AppModule

- [x] Uncomment / add `RecallModule` import in `apps/api/src/app.module.ts`.

## §9 Frontend — ui-kit components (7 components)

- [x] `packages/ui-kit/src/components/RecallActionBar/` — sticky single-CTA bar.
- [x] `packages/ui-kit/src/components/RecallConfirmationStrip/` — inline confirm + ghost-back.
- [x] `packages/ui-kit/src/components/DispatchReceiptCard/` — recipient delivery status rows.
- [x] `packages/ui-kit/src/components/DossierPreview/` — iframe PDF preview + plain-text fallback.
- [x] `packages/ui-kit/src/components/AddendumComposer/` — textarea + file attach + immutability.
- [x] `packages/ui-kit/src/components/IncidentChronologyRail/` — vertical strip (laptop sidebar / phone drawer).
- [x] `packages/ui-kit/src/components/RecipientList/` — checkboxes for redispatch picker.
- [x] Each folder has `<Name>.tsx`, `<Name>.types.ts`, `<Name>.test.tsx`, `<Name>.stories.tsx`, `index.ts`.
- [x] Re-export from `packages/ui-kit/src/index.ts`.

## §10 Frontend — screens, layouts, hooks, api

- [x] `apps/web/src/layouts/CrisisLayout.tsx` — chrome-stripped layout for `/recall/investigate*`.
- [x] `apps/web/src/screens/RecallInvestigateJ6Screen.tsx` — j6 host shell with sticky CTA + confirmation strip.
- [x] `apps/web/src/screens/RecallDossierJ7Screen.tsx` — j7 host shell composing all 7 components.
- [x] `apps/web/src/api/recall.ts` — REST client adapters.
- [x] `apps/web/src/hooks/useRecallIncident.ts` — `useIncident`, `useDispatch86Flag`, `useRedispatch`, `useAttachAddendum`, `useCountdownToDeadline`.

## §11 Documentation artifacts

- [x] `openspec/changes/m3-recall-86-flag-dispatch/proposal.md`.
- [x] `openspec/changes/m3-recall-86-flag-dispatch/design.md` with 5 ADRs.
- [x] `openspec/changes/m3-recall-86-flag-dispatch/specs/recall/spec.md` with 12 ACs.
- [x] `openspec/changes/m3-recall-86-flag-dispatch/.openspec.yaml`.

## §Deferred (followup)

- [ ] **INT spec** with testcontainers for the full email + audit envelope flow. Blocked on slices #11 + #12 landing at master + a real SMTP fake harness. Target: a follow-up "m3-recall-int-harness" slice landing after the trace/search slices merge.
- [ ] **PDF renderer unit test** (renders the `RecallDossier` React tree to a `Buffer`). Defer because `@react-pdf/renderer` is ESM-only and adds non-trivial Jest configuration; the renderer is exercised end-to-end via the controller spec's mocked path.
- [ ] **Cold-storage archival of as-dispatched PDF bytes.** Currently the PDF is regenerable from chronology + lot graph. A future ADR-029 follow-up may persist the as-dispatched bytes for regulator byte-exact reproducibility years later.
- [ ] **Recipient address book BC.** This slice consumes a `recipientList[]` body parameter on each dispatch; the address book that pre-populates it is a separate BC (`organizations.recall_contacts` config — already partially scoped in j6.md edge cases). Land as a follow-up.
- [ ] **Cryptographic signature over dossier root.** M4+ regulatory follow-up.
- [ ] **WhatsApp / Telegram Hermes surface tests.** Slice #13 ships the MCP capability registration; the agent-surface acceptance tests land with the Hermes platform integration slice (currently pending).
