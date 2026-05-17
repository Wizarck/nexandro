## Context

Three M3 surfaces need outbound email:

| Caller | Slice | Use case | SLA |
|---|---|---|---|
| Recall dossier dispatch | #13 (`m3-recall-86-flag-dispatch`) | Owner emails insurer + sanitary-authority contact lists in ≤4h legal window (FR19, FR20) | EU 178/2002 mandated |
| APPCC export delivery | #15 (`m3-appcc-i18n-ui`) | Owner emails quarterly APPCC bundle to inspector | quarterly cadence, low pressure |
| AI budget tier alert | #19 (`m3-ai-obs-budget-tier-emitter`) | `BudgetService` emails Owner when org crosses 50/75/90/100% tiers | hourly cron cadence |

ADR-039 specifies a single `EmailDispatchService` DI token with three adapters (SMTP / SendGrid / Postmark), env-selected, with 3-retry exponential backoff and Owner dashboard alert on final failure. This slice ships the infrastructure; the three callers consume it.

There is no email infrastructure in M2. Wave 1.x AI-suggestion notifications surface via in-app banners. This is a greenfield slice with no migration coupling.

## Goals / Non-Goals

**Goals:**

- Single `EmailDispatchService` DI token, provider-agnostic, consumable from any NestJS service via constructor injection.
- 3 adapters: SMTP (AGPL community default), SendGrid (Enterprise bundled), Postmark (alternative Enterprise; bundled but unimported until env selects it — avoids hard dependency on the `postmark` SDK in the AGPL build).
- Factory selects active adapter at module init via `NEXANDRO_EMAIL_PROVIDER` env. No per-request branching.
- 3-retry exponential backoff (1s, 4s, 16s delays) for 5xx HTTP responses + network timeouts. 4xx responses (auth failure, recipient rejected) fail-fast without retry.
- Final failure surfaces to Owner via M2 `notifications` BC + dashboard alert banner (visual "your last email to X failed; check inbox/spam or update SMTP credentials").
- Zod schemas for `EmailDispatchInput` + `EmailDispatchResult` exported from contracts package for consumer type-safety.
- Synchronous `dispatch()` API — caller awaits result. Async fire-and-forget is the caller's responsibility (every consumer is expected to invoke from `@OnEvent` subscribers, not request handlers).

**Non-Goals:**

- Email template rendering (Handlebars / MJML / EJS). Each caller renders to HTML/text strings before invoking `dispatch()`. Justification: 3 callers, 3 different rendering needs (PDF attachment + body for dossier; CSV attachment + body for APPCC; text-only for budget alerts) — shared template engine would be over-engineering at 3 templates.
- Open / click tracking. Not a compliance need; defer to `m3-email-engagement-tracking` followup if marketing requests.
- Inbound email handling (DSN bounce processing). Out of M3 MVP scope.
- Persistent outbound delivery-receipt table. Synchronous result return + per-caller audit envelope per ADR-028.
- Postmark as default. Architecture-m3.md ADR-039 keeps SMTP as default for AGPL build.
- Multi-region failover. Single SMTP relay / SendGrid endpoint / Postmark server token per deploy.

## Decisions

### ADR-EMAIL-PROVIDER-FACTORY — three adapters, env-selected at module init

`EmailDispatchFactory` reads `NEXANDRO_EMAIL_PROVIDER` (default `smtp`) at `onModuleInit()` and resolves:

| Env value | Adapter | SDK | Bundled in |
|---|---|---|---|
| `smtp` (default) | `SmtpEmailAdapter` | `nodemailer` | AGPL community + Enterprise |
| `sendgrid` | `SendGridEmailAdapter` | `@sendgrid/mail` | Enterprise only (gated by feature flag at build time) |
| `postmark` | `PostmarkEmailAdapter` | `postmark` | Enterprise only (lazy import via `import()` so the SDK is not pulled into AGPL bundle) |

**Why lazy-import for Postmark only and not SendGrid?** SendGrid is the default Enterprise adapter — bundling its SDK is acceptable. Postmark is the *alternative* Enterprise — most customers won't use it; bundling adds ~400 KB. Lazy import keeps AGPL bundle slim AND keeps SendGrid bundle slim when SendGrid is selected.

**Rejected alternative**: per-org provider selection (`organizations.email_provider` column). Reason: deployment-level concern; the AGPL operator chooses one provider for their tenant cluster. Per-org override deferred to `m3-email-per-org-provider` followup.

### ADR-EMAIL-RETRY-POLICY — 3 retries, exponential backoff, 4xx fail-fast

The retry policy lives in `email-retry.policy.ts` as a pure function `withRetry<T>(attempt: () => Promise<T>, shouldRetry: (err) => boolean): Promise<T>`. Default `shouldRetry`:

| Error condition | Retry? |
|---|---|
| 5xx HTTP response from provider | yes |
| Network timeout (default 30s per attempt) | yes |
| Connection refused / DNS failure | yes |
| 4xx HTTP response (`401 Unauthorized`, `400 Bad Request`, `422 Unprocessable`, `429 Rate Limited`) | **no** — fail-fast |
| Sender rejected (e.g. unverified domain) | **no** — fail-fast |

Delays: 1s, 4s, 16s (geometric ×4). Worst-case total latency: ~21s. Acceptable since callers invoke from `@OnEvent` subscribers (non-request-path).

**Why exponential, not linear?** SMTP transient failures cluster (e.g. brief MTA queue saturation). Exponential gives the upstream time to recover; linear retries hammer.

**Why 3 retries, not 5?** Architecture-m3.md NFR-REL-2 sets the SLO at "≥99% successful delivery within 5 minutes". 3 retries achieves this for transient errors; permanent errors don't benefit from more.

### ADR-EMAIL-FAILURE-ALERTER — surface final failure to Owner via M2 notifications

After all 3 retries exhaust, the adapter calls `EmailFailureAlerter.alertOwner(input, error)`. The alerter:

1. Looks up the Owner of the `organizationId` from `EmailDispatchInput`.
2. Calls M2 `NotificationsService.send({ type: 'EMAIL_DISPATCH_FAILURE', userId: ownerId, payload: { to: input.to, subject: input.subject, error: error.message } })`.
3. M2 `notifications` BC writes a dashboard-banner record that surfaces in the Owner's next session.

**No retry on the alerter call itself.** If the alerter fails (DB unreachable), the log entry is the only signal; the alerter logs at `error` level with structured fields. Ops monitors filter on `event=email_dispatch_failed && alerter_failed=true` for the rare double-fault case.

### ADR-EMAIL-AUDIT-EVENT-REGISTERED-NOT-EMITTED — slice #21 wires AuditLogSubscriber

Following the same pattern as slice #1 (`m3-lot-aggregate`) and slice #16: this slice DEFINES the `EMAIL_DISPATCHED` event shape in `packages/contracts/src/m3/email.ts` but does NOT register an `@OnEvent` subscriber in `apps/api/src/audit-log/audit-log.subscriber.ts`. Slice #21 (`m3-audit-log-hash-chain-hardening`) batches all M3 event registrations after hash-chain migration 023+024 lands, avoiding double-write risk.

Consumers (slices #13/#15/#19) call `eventEmitter.emit('EMAIL_DISPATCHED', envelope)` after a successful `dispatch()` — the subscriber will pick this up once slice #21 registers it.

### ADR-EMAIL-NO-TEMPLATE-ENGINE — callers render their own bodies

Each consumer renders to `{ bodyHtml, bodyText, attachments }` before calling `dispatch()`. This slice does NOT ship a template engine. Justification:

| Slice | Body content | Attachments | Template flavour |
|---|---|---|---|
| #13 recall dossier | Spanish-locale text + signed-PDF attachment + tracking link | PDF (`label-renderer` extension) | structured per ADR-028 |
| #15 APPCC export | Spanish/Catalan/Basque/Galician-locale text + CSV attachment | CSV bundle (`label-renderer` extension) | i18n per ADR-035 |
| #19 budget alert | Spanish-locale text + cost-by-tag breakdown | none | terse alert |

Three callers, three different rendering needs (PDF rendering pipeline vs CSV serialization vs plain alert). A shared engine would be over-engineering. If a 4th caller emerges with template overlap, file `m3-email-template-engine` followup.

### ADR-EMAIL-OWNER-DASHBOARD-FALLBACK — failure visibility, not just logs

When 3 retries exhaust and the alerter fires, the Owner sees a paprika banner on next dashboard load: "Your last email to `<recipient>` failed; check inbox/spam or update SMTP credentials". The banner persists until Owner clicks "Dismiss" or a subsequent successful email to the same recipient overwrites it.

**Why dashboard banner, not just email?** A failed email cannot be reported via... email. Banner is the only path that survives the failure mode.

## Risks / Trade-offs

- **[Risk]** SMTP `nodemailer` connection pool may exhaust under high-rate budget-alert bursts (e.g. many orgs cross the 75% tier in the same hour). **Mitigation**: pool size configurable via `NEXANDRO_SMTP_POOL_SIZE` env (default 5); slice #19 cron batches per-org alerts.
- **[Risk]** Postmark lazy import may break in some bundlers (Vite, esbuild) that don't support dynamic `import()` of optional dependencies. **Mitigation**: `apps/api` uses `tsc` (no bundler at runtime); tested on the CI pipeline. If web-side or worker process needs Postmark, file `m3-email-postmark-bundling` followup.
- **[Risk]** Retry policy adds up to 21s latency per failed dispatch. **Mitigation**: callers must invoke from non-request-path; smoke test asserts no controller-level handler imports `EmailDispatchService` directly.
- **[Risk]** `EmailFailureAlerter` cascades into M2 `notifications` BC; if `notifications` schema changes, this slice's smoke test breaks. **Mitigation**: contract test mocks the `NotificationsService` API; broken integration surfaces immediately in CI.
- **[Trade-off]** No template engine = 3 separate rendering paths. **Trade-off**: prevents premature abstraction. Acceptable at 3 callers; revisit at 5+.
- **[Trade-off]** SMTP keeps a persistent connection pool (latency win) but uses long-lived sockets (resource win). SendGrid + Postmark use HTTPS one-shot (no pool, no socket leaks but ~50ms TLS-handshake cost per call).

## Migration Plan

1. **Stage 1 — Schema + module wiring** (this PR):
   - `EmailDispatchModule` registered in `AppModule`.
   - All 3 adapters present; default SMTP works against `mailpit` (test mode) on local dev.
   - `.env.example` documents the 5 new env vars.
   - INT test suite uses `mailpit` (Postgres testcontainer pattern adapted for SMTP) — captures sent emails for assertion.
2. **Stage 2 — Staging validation**:
   - Set `NEXANDRO_SMTP_HOST=smtp.your-tenant.example` + creds on staging.
   - Trigger a manual dispatch via test endpoint (`POST /admin/test-email-dispatch`, Owner-only).
   - Assert email arrives + `EMAIL_DISPATCHED` event fires (visible in M2 audit_log AFTER slice #21 wires subscriber registration).
3. **Stage 3 — Consumer slice integration**:
   - Slice #13's PR adds the dossier dispatch path; slice #15's PR adds APPCC delivery; slice #19's PR adds budget tier alerts.
   - Each consumer imports `EmailDispatchService` from this slice's module.
4. **Rollback strategy**:
   - Removing the module reverts the AppModule import + deletes the directory; no schema, no data.
   - Consumer slices that imported `EmailDispatchService` would fail to build — but they haven't merged yet, so rollback is clean.

## Open Questions

- **Postmark vs alternative Enterprise default**: ADR-039 keeps SMTP as the AGPL default and SendGrid as the bundled Enterprise default. Should Postmark be promoted to first-class Enterprise default? **Proposed answer**: no, per ADR-039. First customer ask triggers `m3-postmark-default-provider` followup.
- **DKIM / SPF / DMARC configuration**: provider-side concern (SendGrid + Postmark handle their own). For SMTP, depends on the tenant's mail server config. Should we ship a `docs/operations/email-deliverability.md` runbook? **Proposed answer**: yes, but as a follow-up doc commit on this PR — not a blocker for code merge.
- **Per-org SMTP credentials override**: an Enterprise customer might want their org's emails sent via their own SMTP relay (e.g. for branded sender domains). The current env-based config is process-global. **Proposed answer**: process-global for MVP. Per-org override (`organizations.smtp_host`, `organizations.smtp_user`, encrypted creds) deferred as `m3-email-per-org-provider` followup; trigger when first Enterprise customer requests branded sender.
