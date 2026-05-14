## 1. Dependencies + package.json

- [x] 1.1 Add to `apps/api/package.json`:
  - `nodemailer` (SMTP adapter)
  - `@types/nodemailer` (devDep)
  - `@sendgrid/mail` (SendGrid adapter; bundled in Enterprise build)
  - `postmark` (Postmark adapter; lazy-imported via dynamic `import()`, no static dep on import resolution)
- [ ] 1.2 Run `pnpm install` + commit lockfile change — DEFERRED to CI (local disk constraint)
- [ ] 1.3 Add `mailpit` to `docker-compose.test.yml` (INT test SMTP capture) — DEFERRED with Group 10

## 2. EmailDispatch module + DI surface

- [x] 2.1 Create directory `apps/api/src/shared/email-dispatch/`
- [x] 2.2 `email-dispatch.module.ts` — NestJS module exporting `EmailDispatchService` DI token + factory; imports `NotificationsModule` from M2 for failure alerter — NotificationsModule does not yet exist in M2; failure alerter logs at error level with TODO marker per slice instructions
- [x] 2.3 `email-dispatch.service.interface.ts`:
  - Export `EmailDispatchService` DI token (`EMAIL_DISPATCH_SERVICE`)
  - Export interface with `dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult>` + `verifyConnection(): Promise<boolean>` signatures
- [x] 2.4 `errors.ts`:
  - `UnknownEmailProviderError` (factory throws on unknown env value at bootstrap)
  - `EmailAdapterError` (thrown inside adapters; classified retryable/permanent)
  - `EmailValidationError` (Zod validation failure)

## 3. SMTP adapter (default, AGPL build)

- [x] 3.1 `smtp-email.adapter.ts`:
  - Uses `nodemailer.createTransport({ host, port, auth, pool: true, maxConnections })`
  - Reads env: `OPENTRATTOS_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`, `_POOL_SIZE` (default 5)
  - `dispatch()` builds message + sends via transport
  - `verifyConnection()` calls `transport.verify()`
  - Maps `nodemailer` errors to `EmailAdapterError` → `EmailDispatchError` (no nodemailer types leak)
- [x] 3.2 `smtp-email.adapter.spec.ts`:
  - Happy path: `dispatch()` returns success with valid `providerMessageId`
  - Connection refused: maps to retryable `EmailAdapterError`, exhausts to RETRYABLE_TRANSIENT
  - 4xx response (e.g. 535 auth failure): maps to fail-fast PERMANENT_AUTH_OR_VALIDATION
  - Pool reuse INT-style assertion deferred to mailpit suite (Group 10)

## 4. SendGrid adapter (Enterprise bundled)

- [x] 4.1 `sendgrid-email.adapter.ts`:
  - Uses `@sendgrid/mail` (static import; bundled in Enterprise build)
  - Reads env: `OPENTRATTOS_SENDGRID_API_KEY`
  - `dispatch()` calls `sgMail.send()` with mapped input
  - Maps SendGrid errors (4xx vs 5xx) to `EmailAdapterError` with `retryable` flag
- [x] 4.2 `sendgrid-email.adapter.spec.ts`:
  - Happy path: `dispatch()` returns success
  - 401 unauthorized: fail-fast `PERMANENT_AUTH_OR_VALIDATION`
  - 5xx response: retryable, exhausts to `RETRYABLE_TRANSIENT`
  - 429 rate-limited: fail-fast (NOT retryable; backoff is provider's responsibility)

## 5. Postmark adapter (alternative Enterprise; lazy-imported)

- [x] 5.1 `postmark-email.adapter.ts`:
  - Lazy-import via `await import('postmark')` inside `init()` (NOT static import); `import type` only at top
  - Reads env: `OPENTRATTOS_POSTMARK_SERVER_TOKEN`
  - `dispatch()` calls `postmarkClient.sendEmail()` with mapped input
  - Maps Postmark errors to `EmailAdapterError`
- [x] 5.2 `postmark-email.adapter.spec.ts`:
  - Happy path: `dispatch()` returns success
  - Bundle assertion: when no adapter is constructed, `postmark` package NOT in `require.cache`

## 6. Factory + retry policy

- [x] 6.1 `email-dispatch.factory.ts`:
  - `onModuleInit()` reads `OPENTRATTOS_EMAIL_PROVIDER` (default `smtp`)
  - Resolves to one of 3 adapter instances (lazy-import Postmark when selected)
  - Throws `UnknownEmailProviderError` on unknown value
  - Factory IS the `EmailDispatchService` (proxy pattern — sidesteps Nest lifecycle race)
- [x] 6.2 `email-retry.policy.ts`:
  - Pure function `withRetry<T>(attempt, options): Promise<{ value, attempts }>`
  - Default `maxAttempts=3`, `delays=[1000, 4000, 16000]` ms
  - Default `shouldRetry`: `EmailAdapterError.retryable=true` + ECONNREFUSED/ETIMEDOUT/EAI_AGAIN/ENOTFOUND/ECONNRESET/EPIPE = retry; everything else = no retry
- [x] 6.3 `email-dispatch.factory.spec.ts`:
  - Default selects SMTP adapter
  - Env override selects SendGrid; Postmark when SDK is present (test accepts MODULE_NOT_FOUND otherwise)
  - Unknown env throws `UnknownEmailProviderError` at bootstrap (not first call)
- [x] 6.4 `email-retry.policy.spec.ts`:
  - 1st-attempt success: no delay, no retry
  - 5xx then 200: 1 retry, attempts=2
  - 3× 5xx: exhausts and re-throws after attempts=3
  - 4xx fails fast: 0 retries

## 7. Failure alerter (cascade to M2 notifications)

- [x] 7.1 `email-failure-alerter.ts`:
  - M2 `notifications` BC does not yet exist; per slice instructions, logs at `error` level with structured fields (`event=email_dispatch_failed, recipient, organizationId, errorCode, ...`); TODO marker covers Owner lookup + `NotificationsService.send` call once BC ships.
  - Never re-throws (defensive double-fault swallowed and logged with `alerter_failed=true`).
- [x] 7.2 `email-failure-alerter.spec.ts`:
  - Happy path: emits structured error log with all canonical fields
  - Synthetic JSON.stringify failure: caught, fallback `alerter_failed=true` log emitted, NO exception propagates

## 8. Contracts package — typed Zod schemas

- [x] 8.1 `packages/contracts/src/m3/email.ts`:
  - `EmailAttachmentSchema` (`{ filename, contentType, contentBase64 }`)
  - `EmailDispatchInputSchema` (`{ to (non-empty), cc?, bcc?, subject, bodyHtml?, bodyText?, attachments?, tag, organizationId }`; `.refine` for body-required)
  - `EmailDispatchResultSchema` discriminated union: success (`{ providerMessageId, deliveredAt, provider, attempts }`) | failure (`{ error: EmailDispatchError }`)
  - `EmailDispatchedEventSchema` typed envelope (`aggregateType='email_dispatch'`, `eventType='EMAIL_DISPATCHED'`)
- [x] 8.2 `packages/contracts/src/index.ts` re-exports from `m3/email.ts`
- [x] 8.3 `email.spec.ts`:
  - `safeParse({ to: ['a@b.c'], subject: 'X', bodyText: 'hi', tag: 'test', organizationId: 'org' })` → success
  - `safeParse({ to: [], ... })` → failure (empty `to`)
  - `safeParse({ ... no body })` → failure (no body)

## 9. Static analysis smoke (no controller imports)

- [x] 9.1 `apps/api/src/shared/email-dispatch/no-controller-imports.spec.ts`:
  - Walks `apps/api/src/**/*.controller.ts`
  - Asserts zero matches for `EMAIL_DISPATCH_SERVICE` / `EmailDispatchService` / `shared/email-dispatch` imports
  - Lives next to the BC so `pnpm test` exercises it as part of the same suite

## 10. INT tests — mailpit

- [ ] 10.1 `docker-compose.test.yml`: add `mailpit/mailpit:latest` container exposing 1025 (SMTP) + 8025 (HTTP API)
- [ ] 10.2 `packages/test-fixtures/src/mailpit-container.ts` — helper to acquire mailpit container in INT tests (analogous to `postgres-container.ts`)
- [ ] 10.3 `apps/api/test/smtp-adapter.int-spec.ts`:
  - Spin up mailpit
  - Dispatch a test email via `SmtpEmailAdapter`
  - Query mailpit HTTP API; assert message received within 2s with correct subject + recipient + body
- [ ] 10.4 `apps/api/test/email-attachment.int-spec.ts`:
  - Dispatch with a PDF attachment (base64-encoded; small fixture)
  - Retrieve email from mailpit; decode attachment; assert SHA-256 hash matches original

## 11. AppModule wiring

- [x] 11.1 `apps/api/src/app.module.ts` — import `EmailDispatchModule`
- [x] 11.2 Module exposes boot probe via `onApplicationBootstrap()` calling `factory.getService().verifyConnection()`; failures are logged at `warn` and do NOT block boot. Live-mailpit verification deferred to Group 10 INT suite.
- [x] 11.3 `apps/api/.env.example` — added `OPENTRATTOS_EMAIL_PROVIDER`, `_EMAIL_FROM`, `_SMTP_HOST`, `_SMTP_PORT`, `_SMTP_USER`, `_SMTP_PASS`, `_SMTP_POOL_SIZE`, `_SENDGRID_API_KEY`, `_POSTMARK_SERVER_TOKEN` with inline comments per ADR-039

## 12. Documentation + handoff

- [ ] 12.1 `apps/api/src/shared/email-dispatch/README.md` — public surface, provider selection contract, retry policy, failure alerter cascade, NO-controller-imports smoke
- [ ] 12.2 `docs/operations/email-deliverability.md` — runbook for DKIM/SPF/DMARC config, mailpit local dev usage, staging SMTP credentials, troubleshooting Owner-banner failures
- [ ] 12.3 `docs/architecture-decisions.md` — add ADR-EMAIL-PROVIDER-FACTORY, ADR-EMAIL-RETRY-POLICY, ADR-EMAIL-FAILURE-ALERTER, ADR-EMAIL-AUDIT-EVENT-REGISTERED-NOT-EMITTED, ADR-EMAIL-NO-TEMPLATE-ENGINE, ADR-EMAIL-OWNER-DASHBOARD-FALLBACK (extending architecture-m3.md decisions into canonical ADR doc)

## 13. CI + PR hygiene

- [ ] 13.1 `pnpm -w typecheck` passes — VALIDATED ON CI (local pnpm install skipped per disk constraint)
- [ ] 13.2 `pnpm -w lint` passes — VALIDATED ON CI
- [ ] 13.3 `pnpm -w test` passes (unit + INT with mailpit) — INT deferred to Group 10 follow-up
- [ ] 13.4 `openspec validate m3-email-dispatch-di` returns 0
- [ ] 13.5 PR description cites the slice contract row, the 0 migration slots claimed (no schema), and the gotcha range claimed (220-229) per ai-playbook conventions
- [x] 13.6 Gate D review: completed by main-agent (slice instructions confirm picks; this agent applied)
