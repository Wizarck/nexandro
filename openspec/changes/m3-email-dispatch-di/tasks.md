## 1. Dependencies + package.json

- [ ] 1.1 Add to `apps/api/package.json`:
  - `nodemailer` (SMTP adapter)
  - `@types/nodemailer` (devDep)
  - `@sendgrid/mail` (SendGrid adapter; bundled in Enterprise build)
  - `postmark` (Postmark adapter; lazy-imported via dynamic `import()`, no static dep on import resolution)
- [ ] 1.2 Run `pnpm install` + commit lockfile change
- [ ] 1.3 Add `mailpit` to `docker-compose.test.yml` (INT test SMTP capture)

## 2. EmailDispatch module + DI surface

- [ ] 2.1 Create directory `apps/api/src/shared/email-dispatch/`
- [ ] 2.2 `email-dispatch.module.ts` — NestJS module exporting `EmailDispatchService` DI token + factory; imports `NotificationsModule` from M2 for failure alerter
- [ ] 2.3 `email-dispatch.service.interface.ts`:
  - Export `EmailDispatchService` DI token (`InjectionToken<EmailDispatchService>`)
  - Export interface with `dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult>` + `verifyConnection(): Promise<boolean>` signatures
- [ ] 2.4 `errors.ts`:
  - `UnknownEmailProviderError` (factory throws on unknown env value at bootstrap)
  - `EmailDispatchError` (returned in failure result)
  - `EmailValidationError` (Zod validation failure)

## 3. SMTP adapter (default, AGPL build)

- [ ] 3.1 `smtp-email.adapter.ts`:
  - Uses `nodemailer.createTransport({ host, port, auth, pool: true, maxConnections })`
  - Reads env: `OPENTRATTOS_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`, `_POOL_SIZE` (default 5)
  - `dispatch()` builds message + sends via transport
  - `verifyConnection()` calls `transport.verify()`
  - Maps `nodemailer` errors to `EmailDispatchError` (no nodemailer types leak)
- [ ] 3.2 `smtp-email.adapter.spec.ts`:
  - Happy path: `dispatch()` returns success with valid `providerMessageId`
  - Pool reuse: 10 dispatches use ≤5 distinct connections (instrumented via transport listener)
  - Connection refused: maps to retryable `EmailDispatchError`
  - 4xx response (e.g. 535 auth failure): maps to fail-fast `EmailDispatchError`

## 4. SendGrid adapter (Enterprise bundled)

- [ ] 4.1 `sendgrid-email.adapter.ts`:
  - Uses `@sendgrid/mail` (static import; bundled in Enterprise build)
  - Reads env: `OPENTRATTOS_SENDGRID_API_KEY`
  - `dispatch()` calls `sgMail.send()` with mapped input
  - Maps SendGrid errors (4xx vs 5xx) to `EmailDispatchError` with `retryable` flag
- [ ] 4.2 `sendgrid-email.adapter.spec.ts`:
  - Happy path: `dispatch()` returns success
  - 401 unauthorized: fail-fast `EmailDispatchError`
  - 5xx response: retryable `EmailDispatchError`
  - 429 rate-limited: fail-fast `EmailDispatchError` (NOT retryable; backoff is provider's responsibility)

## 5. Postmark adapter (alternative Enterprise; lazy-imported)

- [ ] 5.1 `postmark-email.adapter.ts`:
  - Lazy-import via `await import('postmark')` inside constructor (NOT static import)
  - Reads env: `OPENTRATTOS_POSTMARK_SERVER_TOKEN`
  - `dispatch()` calls `postmarkClient.sendEmail()` with mapped input
  - Maps Postmark errors to `EmailDispatchError`
- [ ] 5.2 `postmark-email.adapter.spec.ts`:
  - Happy path: `dispatch()` returns success
  - Bundle assertion: when `OPENTRATTOS_EMAIL_PROVIDER=smtp`, `postmark` package NOT in `require.cache` (assert via test setup)

## 6. Factory + retry policy

- [ ] 6.1 `email-dispatch.factory.ts`:
  - `onModuleInit()` reads `OPENTRATTOS_EMAIL_PROVIDER` (default `smtp`)
  - Resolves to one of 3 adapter instances (lazy-import Postmark when selected)
  - Throws `UnknownEmailProviderError` on unknown value
- [ ] 6.2 `email-retry.policy.ts`:
  - Pure function `withRetry<T>(attempt: () => Promise<T>, shouldRetry: (err) => boolean, options?: { maxAttempts?: number, delays?: number[] }): Promise<T>`
  - Default `maxAttempts=3`, `delays=[1000, 4000, 16000]` ms
  - Default `shouldRetry`: 5xx + network timeout + connection-refused = retry; 4xx + sender-rejected = no retry
- [ ] 6.3 `email-dispatch.factory.spec.ts`:
  - Default selects SMTP adapter
  - Env override selects SendGrid / Postmark
  - Unknown env throws at bootstrap (not first call)
- [ ] 6.4 `email-retry.policy.spec.ts`:
  - 1st-attempt success: no delay, no retry
  - 5xx then 200: 1s delay, total 1 retry
  - 3× 5xx: ~21s total, fails with `attempts=3`
  - 4xx fails fast: 0 retries

## 7. Failure alerter (cascade to M2 notifications)

- [ ] 7.1 `email-failure-alerter.ts`:
  - Constructor injects `NotificationsService` from M2
  - `alertOwner(input, error)`:
    - Looks up Owner of `input.organizationId` via `UsersRepository.findOwnerByOrg(orgId)`
    - Calls `notificationsService.send({ type: 'EMAIL_DISPATCH_FAILURE', userId: ownerId, payload: { recipient: input.to[0], subject: input.subject, errorMessage: error.message, providerError: error.providerError } })`
    - On alerter failure (DB unreachable), logs at `error` level with structured fields; does NOT re-throw
- [ ] 7.2 `email-failure-alerter.spec.ts`:
  - Happy path: failed dispatch → `NotificationsService.send` called with correct payload
  - Owner not found: logs `warn` (org without Owner; rare data integrity case) and does NOT throw
  - `NotificationsService.send` fails: caught + logged at `error`; no exception propagates

## 8. Contracts package — typed Zod schemas

- [ ] 8.1 `packages/contracts/src/m3/email.ts`:
  - `EmailAttachment` Zod schema (`{ filename, contentType, contentBase64 }`)
  - `EmailDispatchInput` schema (`{ to: string[].nonempty(), cc?, bcc?, subject, bodyHtml?, bodyText?, attachments?, tag: OpenTrattOsTagAttribute, organizationId }` with `.refine` for body-required)
  - `EmailDispatchResult` discriminated union: success (`{ providerMessageId, deliveredAt, provider }`) | failure (`{ error: EmailDispatchError, attempts }`)
  - `EmailDispatchedEvent` typed envelope (`aggregateType='email_dispatch'`, `eventType='EMAIL_DISPATCHED'`)
- [ ] 8.2 `packages/contracts/src/index.ts` re-exports from `m3/email.ts`
- [ ] 8.3 `email.spec.ts`:
  - `EmailDispatchInput.safeParse({ to: ['a@b.c'], subject: 'X', bodyText: 'hi', tag: 'test', organizationId: 'org' })` → success
  - `EmailDispatchInput.safeParse({ to: [], ... })` → failure (empty `to`)
  - `EmailDispatchInput.safeParse({ to: ['a'], subject: 'X', tag: 'test', organizationId: 'org' })` → failure (no body)

## 9. Static analysis smoke (no controller imports)

- [ ] 9.1 `apps/api/test/smoke/no-controller-imports-email-dispatch.spec.ts`:
  - Glob-scans `apps/api/src/**/*.controller.ts`
  - Grep for `EmailDispatchService` imports
  - Asserts zero matches in controller files
  - Allows imports in `*.subscriber.ts`, `*.job.ts`, `*.task.ts` files

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

- [ ] 11.1 `apps/api/src/app.module.ts` — import `EmailDispatchModule`
- [ ] 11.2 Smoke test: API boots with `OPENTRATTOS_EMAIL_PROVIDER=smtp` against mailpit dev container; `EmailDispatchService.verifyConnection()` returns true
- [ ] 11.3 `.env.example` — add 5 new env vars with inline comments (per ADR-039)

## 12. Documentation + handoff

- [ ] 12.1 `apps/api/src/shared/email-dispatch/README.md` — public surface, provider selection contract, retry policy, failure alerter cascade, NO-controller-imports smoke
- [ ] 12.2 `docs/operations/email-deliverability.md` — runbook for DKIM/SPF/DMARC config, mailpit local dev usage, staging SMTP credentials, troubleshooting Owner-banner failures
- [ ] 12.3 `docs/architecture-decisions.md` — add ADR-EMAIL-PROVIDER-FACTORY, ADR-EMAIL-RETRY-POLICY, ADR-EMAIL-FAILURE-ALERTER, ADR-EMAIL-AUDIT-EVENT-REGISTERED-NOT-EMITTED, ADR-EMAIL-NO-TEMPLATE-ENGINE, ADR-EMAIL-OWNER-DASHBOARD-FALLBACK (extending architecture-m3.md decisions into canonical ADR doc)

## 13. CI + PR hygiene

- [ ] 13.1 `pnpm -w typecheck` passes
- [ ] 13.2 `pnpm -w lint` passes
- [ ] 13.3 `pnpm -w test` passes (unit + INT with mailpit)
- [ ] 13.4 `openspec validate m3-email-dispatch-di` returns 0
- [ ] 13.5 PR description cites the slice contract row, the 0 migration slots claimed (no schema), and the gotcha range claimed (220-229) per ai-playbook conventions
- [ ] 13.6 Gate D review: human reviewer confirms proposal.md + design.md + specs/email-dispatch/spec.md + tasks.md are coherent before invoking `/opsx:apply`
