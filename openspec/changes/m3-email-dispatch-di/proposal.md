## Why

M3 introduces two surfaces that must send email:
1. **Recall dossier dispatch** (FR19, slice #13) — Owner emails the incident dossier PDF to insurer + sanitary-authority contact lists. SLA: response within 4 h legal window (FR20).
2. **APPCC export delivery** (slice #15) — Owner emails the quarterly APPCC bundle to the inspector contact, optionally on a scheduled cron (architecture-m3.md j9 design).
3. **AI budget tier alerts** (NFR-OBS-10, slice #19) — `BudgetService` emits `AI_BUDGET_TIER_CROSSED` events that route through `BudgetAlertDispatcher` → email to Owner contact when the org crosses 50/75/90/100% spend tiers.

M2 has no email infrastructure today. Wave 1.x AI-suggestion notifications surface via in-app banners only. Without this slice, slices #13, #15, and #19 each need to bring their own email integration — three duplicate-with-drift implementations.

Architecture-m3.md **ADR-039** specifies the contract: a single `EmailDispatchService` DI token in `apps/api/src/shared/email-dispatch/` with three adapters (`SmtpEmailAdapter` AGPL default, `SendGridEmailAdapter` Enterprise, `PostmarkEmailAdapter` alternative Enterprise). Factory selects by env `NEXANDRO_EMAIL_PROVIDER`. 3-retry exponential backoff on 5xx + network timeouts. Final failure surfaces to Owner via dashboard alert.

This slice ships the **dispatch infrastructure only** — provider DI surface + retry/backoff + outbound delivery-status receipt model. It is **independent** (no `Depends on`) and can launch day-1 in parallel with slices #1 (`m3-lot-aggregate`) and #16 (`m3-vision-llm-provider-di-otel`). Slices #13, #15, and #19 consume the `EmailDispatchService` DI token from here.

## What Changes

- **`apps/api/src/shared/email-dispatch/`** new infrastructure module:
  - `email-dispatch.module.ts` (NestJS module exporting `EmailDispatchService` DI token + factory)
  - `email-dispatch.service.interface.ts` — `EmailDispatchService` interface with `dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult>` signature
  - `smtp-email.adapter.ts` (default, AGPL community build; uses `nodemailer` with SMTP transport)
  - `sendgrid-email.adapter.ts` (Enterprise bundled; uses `@sendgrid/mail` SDK)
  - `postmark-email.adapter.ts` (alternative Enterprise; uses `postmark` SDK; bundled but un-imported by default — only constructed when env selects it)
  - `email-dispatch.factory.ts` — factory class with `onModuleInit()` reading `NEXANDRO_EMAIL_PROVIDER` (default `smtp`), resolves to one of 3 adapter instances
  - `email-retry.policy.ts` — 3-retry exponential backoff helper (delays 1s, 4s, 16s; total worst-case ~21s before giving up)
  - `email-failure-alerter.ts` — surfaces final failures to Owner via existing M2 `notifications` BC + dashboard alert banner
- **`packages/contracts/src/m3/email.ts`** new module:
  - `EmailDispatchInput` Zod schema (`{ to: string[], cc?: string[], bcc?: string[], subject: string, bodyHtml?: string, bodyText?: string, attachments?: EmailAttachment[], tag: OpenTrattOsTagAttribute, organizationId: string }`)
  - `EmailDispatchResult` Zod schema (`{ providerMessageId: string, deliveredAt: timestamptz, provider: 'smtp' | 'sendgrid' | 'postmark' }` on success; `{ error: EmailDispatchError, attempts: number }` on failure)
  - `EmailAttachment` Zod schema (`{ filename: string, contentType: string, contentBase64: string }`)
- **`.env.example`** — 5 new env vars:
  - `NEXANDRO_EMAIL_PROVIDER` (default `smtp`; one of `smtp` / `sendgrid` / `postmark`)
  - `NEXANDRO_EMAIL_FROM` (sender address, e.g. `notifications@your-tenant.example`)
  - `NEXANDRO_SMTP_HOST` / `NEXANDRO_SMTP_PORT` / `NEXANDRO_SMTP_USER` / `NEXANDRO_SMTP_PASS` (when `smtp`)
  - `NEXANDRO_SENDGRID_API_KEY` (when `sendgrid`)
  - `NEXANDRO_POSTMARK_SERVER_TOKEN` (when `postmark`)
- **No tables in this slice** — delivery-status receipts are returned synchronously to the caller; persistent receipt storage (for j7 `DispatchReceiptCard` rendering) is delegated to slice #13's own audit_log envelope per ADR-028 reuse pattern.
- **No OTel emission in this slice** — slice #16 (`m3-vision-llm-provider-di-otel`) provides the OTel scaffold; email dispatch will gain spans automatically via the global `SpanEnricherInterceptor` once #16 lands. This slice's tests use OTel mock helpers from #16 (not strictly a dependency since #16 ships independently; if #16 hasn't merged yet, the mock helpers stub no-op).
- **BREAKING**: none. No existing M2 caller sends email; this is purely additive.

## Capabilities

### New Capabilities

- `email-dispatch`: provider-agnostic `EmailDispatchService` DI surface + 3 adapters + retry/backoff + failure alerter. Consumed by slices #13 (recall dossier dispatch), #15 (APPCC export delivery), #19 (budget tier alerts).

### Modified Capabilities

- None. Email is a new infrastructure capability.

## Impact

- **Prerequisites**: M2 wave 1.19 merged (existing `notifications` BC available for `email-failure-alerter` to call). No M3 prerequisites — slice has no `Depends on` in the canonical slice doc.
- **Code**:
  - `apps/api/src/shared/email-dispatch/` (new module: ~450 LOC across 7 files + tests)
  - `packages/contracts/src/m3/email.ts` (~70 LOC Zod schemas)
  - `.env.example` (5 new env var entries with inline comments)
  - Tests: ~25 new unit + INT tests (factory selection, adapter contracts, retry policy, failure alerter handoff, Zod schema validation)
- **Performance**:
  - `dispatch()` calls are awaited (synchronous to caller); MUST be called from non-request-blocking contexts (background jobs, post-commit hooks). Slices #13/#15/#19 enforce this by calling email-dispatch from `@OnEvent` subscribers (not request handlers).
  - 3-retry policy worst-case latency: 1 + 4 + 16 = 21s before final failure surfaces. Acceptable for non-request-path use cases.
  - SMTP keeps a persistent connection pool (nodemailer default pool size 5); SendGrid + Postmark use HTTPS one-shot.
- **Storage**: 0 in this slice. Delivery receipts return synchronously; consumers persist their own audit envelopes per ADR-028.
- **Audit**: every successful dispatch emits an `EMAIL_DISPATCHED` event on the M2 event bus; subscriber registration claimed by slice #21 (`m3-audit-log-hash-chain-hardening`) for the same reason as slice #1's `LOT_CREATED` — avoid double-write before hash-chain hardening lands.
- **Rollback**: removing the BC reverts the module import; no schema, no data to migrate. Failure-alerter cascade (M2 `notifications` BC integration) is the only outgoing dependency; if rolled back, slices that imported this would fail to build.
- **Out of scope** (claimed by other slices or M3.x):
  - Recall dossier email dispatch path → `m3-recall-86-flag-dispatch` (slice #13)
  - APPCC export email delivery path → `m3-appcc-i18n-ui` (slice #15)
  - Budget tier alert email path → `m3-ai-obs-budget-tier-emitter` (slice #19)
  - Email template rendering (Handlebars / MJML / etc) → consumers ship their own templates per slice (no shared template engine in this slice; each consumer renders to HTML/text strings before calling `dispatch()`).
  - Email open / click tracking — not a compliance need; deferred to a hypothetical `m3-email-engagement-tracking` followup if marketing ever requests it.
  - Inbound email handling (DSN, bounce processing) — relevant for marketing; out of M3 MVP scope.
  - Postmark adapter as default in MVP. Architecture-m3.md ADR-039 explicitly defers Postmark to "alternative Enterprise" status; first customer ask triggers `m3-postmark-default-provider` followup.
- **Parallelism**: this slice has **no `Depends on`** (independent infra). It writes exclusively to `apps/api/src/shared/email-dispatch/` + `packages/contracts/src/m3/email.ts` + `.env.example`. Track A (operational), Track B (AI-obs slice #16), and Track C (slices #3, #21, this one) are all file-path disjoint. Slices #1, #16, and #22 can run **fully in parallel from day one**.
