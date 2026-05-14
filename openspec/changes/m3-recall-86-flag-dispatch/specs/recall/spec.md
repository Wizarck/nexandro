# Spec — recall (m3-recall-86-flag-dispatch, slice #13/22, Wave 2.5)

## Capability

The recall BC accepts an Owner or Manager request to open an incident, dispatch an 86-flag + dossier (the j6 sticky CTA), re-dispatch to a subset of recipients (j7), and attach addenda to an immutable record. All evidence persists to `audit_log` as the canonical chain; status is projected from the envelope sequence.

## Acceptance criteria

### AC-RECALL-1 — Open an incident

Given an authenticated Owner / Manager,
when they POST to `/m3/recall/incidents` with `{ lotIds[], locationIds[], reason? }`,
the API:

1. mints a UUID `incidentId`,
2. computes the `incidentCode` (`IR-YYYY-NNNN` where `NNNN` is `count(RECALL_INVESTIGATION_OPENED) for the org year-to-date + 1`),
3. computes the `legalDeadline` (now + 4 h, matching FR20),
4. emits `RECALL_INVESTIGATION_OPENED` with `aggregate_type='recall_incident'`, `aggregate_id=incidentId`, `payload_after = { incidentCode, lotIds, locationIds, legalDeadline, openedAt }`,
5. returns `201` with `{ incidentId, incidentCode, legalDeadline, status: 'open' }`.

The audit-log subscriber persists the row with `retention_class='regulatory'`.

### AC-RECALL-2 — Dispatch 86-flag + dossier in one call

Given an open incident with `lotIds[]` and `locationIds[]`,
when an Owner / Manager POSTs to `/m3/recall/incidents/:id/dispatch` with `{ recipientList[] }`,
the API:

1. emits `RECALL_86_FLAG_DISPATCHED` carrying the lot + location list,
2. generates the dossier (chronology + lot provenance + consumption chain + signature block),
3. for each recipient in `recipientList`, calls `EmailDispatchService.dispatch({ to: [r], subject: 'Incident dossier <incidentCode>', bodyText, attachments: [pdf], tag: 'm3.recall.dossier_dispatch', organizationId })` AND emits `RECALL_DOSSIER_GENERATED` carrying `payload_after = { recipient, deliveryStatus, providerMessageId?, error? }`,
4. returns `200` with `{ dispatchedAt, incidentStatus: 'dispatched', recipientReceipts[] }`.

If the dossier PDF generation fails, the 86-flag envelope is still persisted (the flag is already dispatched to kitchens via the bus) and the response is `200` with `{ dispatchedAt, incidentStatus: 'dispatched', dossierError: { code, message }, recipientReceipts: [] }`. The dossier-generation failure is surfaced via the receipt strip in J6.

### AC-RECALL-3 — Hash chain integrity is checked before sealing the dossier

When `DossierService.generate()` runs, it calls into the slice #21 audit-log hash chain validator over the incident's chronology rows.

- If the chain is intact, the signature block records `chainBroken: false` and the dossier is sealed as normal.
- If the chain is broken, the signature block records `chainBroken: true` + `firstBrokenRowId` AND the dispatch still proceeds; the broken-chain status appears in the dossier metadata + in the `RECALL_DOSSIER_GENERATED` envelope's `payload_after.chainBroken` field.

The dispatch is NEVER blocked on a chain break — the regulator deadline (FR20) trumps perfect integrity.

### AC-RECALL-4 — RBAC

Owner and Manager both have full access to every endpoint in this BC (`POST /m3/recall/incidents`, `POST /m3/recall/incidents/:id/dispatch`, `GET /m3/recall/incidents/:id`, `GET /m3/recall/incidents/:id/dossier.pdf`, `POST /m3/recall/incidents/:id/redispatch`, `POST /m3/recall/incidents/:id/addenda`). Staff is rejected at 403 by the global RolesGuard. Cross-org access is rejected at 403 by the organization scoping.

### AC-RECALL-5 — Get incident projection for J7

Given an incident with audit_log rows of types `RECALL_INVESTIGATION_OPENED`, `RECALL_86_FLAG_DISPATCHED`, `RECALL_DOSSIER_GENERATED` (one per recipient), `RECALL_ADDENDUM_ATTACHED` (zero or more),
when an Owner / Manager GETs `/m3/recall/incidents/:id`,
the API returns `200` with `{ incident, chronology[], recipientReceipts[], addenda[], dossierMeta, legalWindowStatus }` where:

- `incident.status` is projected from the envelope sequence: `'dispatched'` once at least one `RECALL_DOSSIER_GENERATED` row exists; `'closed'` once an explicit close marker is recorded; else `'open'`.
- `chronology[]` is the audit_log rows ordered ASC by `created_at`.
- `recipientReceipts[]` is one row per `RECALL_DOSSIER_GENERATED` envelope.
- `addenda[]` is the `RECALL_ADDENDUM_ATTACHED` rows (newest first per j7.md §7).
- `legalWindowStatus` is `'within_deadline'` if `firstDispatchedAt ≤ legalDeadline`, else `'over_deadline'`.

### AC-RECALL-6 — Re-dispatch to a subset of recipients

Given a dispatched incident,
when an Owner / Manager POSTs to `/m3/recall/incidents/:id/redispatch` with `{ recipientList[] }` (a subset of the original list, OR a manually-typed override),
the API for each recipient:

1. calls `EmailDispatchService.dispatch(...)`,
2. emits `RECALL_DOSSIER_REDISPATCHED` carrying `payload_after = { recipient, deliveryStatus, providerMessageId?, error?, attempt: N }` where `N` is the count of prior `RECALL_DOSSIER_GENERATED` + `RECALL_DOSSIER_REDISPATCHED` envelopes for this `(incidentId, recipient)` pair + 1,
3. returns `200` with `{ dispatchedAt, recipientReceipts[] }`.

Each re-dispatch row is its own audit_log envelope — never an UPDATE of a prior row (chain immutability).

### AC-RECALL-7 — Attach an addendum (immutable extension)

Given a dispatched incident,
when an Owner / Manager POSTs to `/m3/recall/incidents/:id/addenda` with `{ text, attachments? }` (where `attachments` is a list of `{ filename, contentType, contentBase64 }` per the email-dispatch attachment shape),
the API:

1. validates `text` length ≤ 10 000 chars,
2. validates each attachment ≤ 50 MB,
3. emits `RECALL_ADDENDUM_ATTACHED` with `payload_after = { addendumId, text, attachmentMetadata[], attachedByUserId, attachedAt }`,
4. returns `201` with `{ addendumId, attachedAt }`.

Once attached, the addendum is immutable — there is no PUT, PATCH, or DELETE endpoint for addenda. Edits to the original dossier are NOT supported at all (per j7.md decision: "the original dossier is never re-edited").

### AC-RECALL-8 — Recipient list validation

When dispatching or redispatching, `recipientList` MUST be non-empty AND every entry MUST satisfy the email-dispatch input schema (`min(3).max(320)`).

- Empty list → 400 with `{ code: 'RECALL_RECIPIENTS_NOT_CONFIGURED' }`.
- Invalid email → 422 with `{ code: 'INVALID_RECIPIENT', invalidEntry: '<entry>' }`.

If only the sanitary-authority recipient is configured (insurer missing), dispatch proceeds with that one recipient (per j6.md edge case "Insurer contact list not configured"); the missing-insurer state is surfaced in the response as a mute warning string, not a blocking error.

### AC-RECALL-9 — Dossier PDF endpoint

When an Owner / Manager GETs `/m3/recall/incidents/:id/dossier.pdf`,
the API:

1. regenerates the dossier from the chronology + lot graph (the PDF is derived, not stored — see ADR-DOSSIER-PDF-RENDERER-LOCAL),
2. responds with `Content-Type: application/pdf` + `Content-Disposition: attachment; filename="dossier-<incidentCode>.pdf"` + the PDF bytes.

If PDF rendering fails, the API responds `503` with `{ code: 'DOSSIER_PDF_RENDER_FAILED', fallbackUrl: '/m3/recall/incidents/:id' }`. The fallback URL drives J7's plain-text rendering path.

### AC-RECALL-10 — Audit envelope shape and retention class

Every envelope emitted by this BC has:

- `aggregate_type = 'recall_incident'`,
- `aggregate_id = incidentId`,
- `actor_user_id = req.user.id`,
- `actor_kind = 'user'` (or `'agent'` when the call comes via Hermes MCP),
- a `payload_after` carrying the event-specific shape.

All five new event types are mapped to `retention_class='regulatory'` via the slice #21 `RETENTION_BY_EVENT_NAME` map. The mapping is asserted in unit test `audit-log/application/types.spec.ts`.

### AC-RECALL-11 — Concurrent dispatch idempotency

When two requests with the same `Idempotency-Key` header POST to `/m3/recall/incidents/:id/dispatch`, the second is served from the idempotency middleware cache — it returns the same response as the first WITHOUT re-emitting any envelopes or re-sending emails. (Inherits the existing `IdempotencyMiddleware` behaviour from Wave 1.13.)

### AC-RECALL-12 — MCP capabilities

`recall.dispatch-86-flag` and `recall.generate-dossier` are registered in the WRITE_CAPABILITIES registry. Each respects the per-capability env flag (`OPENTRATTOS_AGENT_RECALL_DISPATCH_86_FLAG_ENABLED`, `OPENTRATTOS_AGENT_RECALL_GENERATE_DOSSIER_ENABLED`) — when the flag is `false`, the AgentCapabilityGuard rejects with 403 even if the agent is otherwise authorised.

Both capabilities proxy to `POST /m3/recall/incidents/:id/dispatch`. The web sticky CTA, the WhatsApp Hermes path, and the Telegram Hermes path all route to the same handler — there is one canonical dispatch path per ADR-MCP-RECALL-CAPABILITIES.
