## ADDED Requirements

### Requirement: EmailDispatchService DI surface is provider-agnostic

The system SHALL provide an `EmailDispatchService` DI token in `apps/api/src/shared/email-dispatch/` that exposes a single async method `dispatch(input: EmailDispatchInput): Promise<EmailDispatchResult>`. The interface SHALL NOT leak provider-specific types (no `SendGridResponse`, no `nodemailer.SentMessageInfo`). Three adapter classes SHALL implement the interface: `SmtpEmailAdapter`, `SendGridEmailAdapter`, `PostmarkEmailAdapter`.

#### Scenario: Consumer imports DI token without provider knowledge
- **WHEN** slice #13 (`m3-recall-86-flag-dispatch`) imports `EmailDispatchService` and injects it via `@Inject(EmailDispatchService)`
- **THEN** the injected instance exposes only `dispatch()` and `verifyConnection()` methods; no provider-specific API is visible to the consumer

#### Scenario: Result type does not leak provider response
- **WHEN** `dispatch()` returns successfully
- **THEN** the result conforms to `EmailDispatchResult` Zod schema (`{ providerMessageId, deliveredAt, provider }`); no SendGrid / nodemailer / Postmark response object is exposed

### Requirement: Factory selects adapter at module init via NEXANDRO_EMAIL_PROVIDER env

The system SHALL provide `EmailDispatchFactory` that reads `NEXANDRO_EMAIL_PROVIDER` env at `onModuleInit()`. The default value SHALL be `smtp`. Allowed values: `smtp`, `sendgrid`, `postmark`. Unknown values SHALL throw `UnknownEmailProviderError` at bootstrap (NOT at first call).

#### Scenario: Default selects SMTP adapter
- **WHEN** the API process starts without `NEXANDRO_EMAIL_PROVIDER` env set
- **THEN** the factory resolves `EmailDispatchService` to `SmtpEmailAdapter`

#### Scenario: Env override selects SendGrid
- **WHEN** the API starts with `NEXANDRO_EMAIL_PROVIDER=sendgrid`
- **THEN** the factory resolves `EmailDispatchService` to `SendGridEmailAdapter`

#### Scenario: Env override selects Postmark (lazy-imported)
- **WHEN** the API starts with `NEXANDRO_EMAIL_PROVIDER=postmark`
- **THEN** the factory lazy-imports the `postmark` SDK via dynamic `import('postmark')` and resolves to `PostmarkEmailAdapter`; the `postmark` package is NOT in the AGPL build's runtime dependency closure when SMTP is selected

#### Scenario: Unknown provider throws at bootstrap
- **WHEN** the API starts with `NEXANDRO_EMAIL_PROVIDER=mailchimp` (not a known adapter)
- **THEN** `EmailDispatchFactory.onModuleInit()` throws `UnknownEmailProviderError('mailchimp; expected one of: smtp, sendgrid, postmark')`; the API does NOT start

### Requirement: 3-retry exponential backoff for retryable failures, fail-fast for permanent errors

The system SHALL apply a 3-retry exponential backoff policy to every `dispatch()` call when the underlying adapter throws a retryable error. Delays SHALL be 1s, 4s, 16s. Retryable errors: 5xx HTTP responses, network timeouts, connection-refused / DNS failures. Permanent errors SHALL NOT retry: 4xx HTTP responses (`400`, `401`, `422`, `429`), sender-rejected (e.g. unverified domain).

#### Scenario: 5xx response triggers retry
- **WHEN** SendGrid responds `503 Service Unavailable` on attempt 1
- **THEN** the adapter waits 1s, retries; if attempt 2 returns `200 OK`, the final result is success with `attempts=2`

#### Scenario: 401 response fails fast
- **WHEN** SendGrid responds `401 Unauthorized` (invalid API key)
- **THEN** the adapter does NOT retry; `dispatch()` returns failure result immediately; the `EmailFailureAlerter` is invoked

#### Scenario: All 3 retries exhausted on persistent 5xx
- **WHEN** SendGrid returns `503` on all 3 attempts (worst case ~21s total wait)
- **THEN** `dispatch()` returns `{ error: EmailDispatchError, attempts: 3 }`; the `EmailFailureAlerter` is invoked to surface to Owner

#### Scenario: Network timeout retries
- **WHEN** the underlying HTTP call times out after 30s on attempt 1
- **THEN** the adapter waits 1s + retries; the per-attempt timeout is 30s independent of the retry backoff delay

### Requirement: Final failure surfaces to Owner via M2 notifications BC + dashboard banner

When 3 retries are exhausted, the system SHALL invoke `EmailFailureAlerter.alertOwner(input, error)`. The alerter SHALL look up the Owner of the `organizationId` from `EmailDispatchInput` and call M2 `NotificationsService.send({ type: 'EMAIL_DISPATCH_FAILURE', userId: ownerId, payload: { ... } })`. The Owner SHALL see a paprika-coloured dashboard banner on next session load: "Your last email to `<recipient>` failed; check inbox/spam or update SMTP credentials".

#### Scenario: Failed dispatch surfaces banner to Owner
- **WHEN** 3 dispatch retries fail for `to=insurer@aseguradora.es, organizationId=org-XYZ`
- **THEN** an M2 `notifications` row is created for the Owner of `org-XYZ`; on next dashboard load the paprika banner displays naming the recipient + suggested next step

#### Scenario: Alerter failure logged but not re-thrown
- **WHEN** the underlying `notifications` DB call fails during alerter invocation
- **THEN** the alerter logs at `error` level with structured fields `event=email_dispatch_failed, alerter_failed=true, recipient, organizationId, errorMessage`; no exception propagates upward

### Requirement: Contracts package exports M3 email Zod schemas

The system SHALL export the following Zod schemas from `packages/contracts/src/m3/email.ts`:
- `EmailDispatchInput` (`{ to, cc?, bcc?, subject, bodyHtml?, bodyText?, attachments?, tag, organizationId }`; at least one of `bodyHtml` / `bodyText` required via `.refine`; `to` array non-empty)
- `EmailDispatchResult` (success | failure discriminated union)
- `EmailAttachment` (`{ filename, contentType, contentBase64 }`)
- `EmailDispatchError` (`{ code, message, attempts, providerError? }`)

#### Scenario: Downstream consumer imports resolve
- **WHEN** slice #13 imports `import { EmailDispatchInput, EmailDispatchResult } from '@nexandro/contracts/m3/email'`
- **THEN** the imports resolve; Zod schemas are usable for runtime validation; TS types are inferred

#### Scenario: Input requires body content
- **WHEN** `EmailDispatchInput.safeParse({ to: ['a@b.c'], subject: 'X', organizationId: 'org-1', tag: 'test' })` is called (neither bodyHtml nor bodyText)
- **THEN** the result is `{ success: false, error: ... }` with an error message naming the missing body requirement

#### Scenario: Empty recipient list rejected
- **WHEN** `EmailDispatchInput.safeParse({ to: [], subject: 'X', bodyText: 'hi', organizationId: 'org-1', tag: 'test' })` is called
- **THEN** the result is `{ success: false, error: ... }` with a non-empty-array constraint error

### Requirement: EMAIL_DISPATCHED event registered but NOT emitted by AuditLogSubscriber

The system SHALL declare the `EMAIL_DISPATCHED` event type in `packages/contracts/src/m3/email.ts` (typed `AuditEventEnvelope` with `aggregateType='email_dispatch'`). Consumers (slices #13/#15/#19) SHALL emit this event on the in-process bus after a successful `dispatch()` call. This slice SHALL NOT register the event with the M2 `AuditLogSubscriber` — that registration is claimed by slice #21 (`m3-audit-log-hash-chain-hardening`).

#### Scenario: Event type is exported from contracts package
- **WHEN** a downstream consumer imports `import { EmailDispatchedEvent } from '@nexandro/contracts/m3/email'`
- **THEN** the import resolves; the type includes `eventType='EMAIL_DISPATCHED'`, `aggregateType='email_dispatch'`, `aggregateId` (provider message ID), and the typed payload

#### Scenario: Subscriber registration is NOT in this slice
- **WHEN** a test consumer emits an `EMAIL_DISPATCHED` event after this slice's merge (and before slice #21's merge)
- **THEN** no `audit_log` row is written; the smoke test asserts the absence of the row for this slice's INT suite

### Requirement: SMTP adapter uses nodemailer with connection pool

The `SmtpEmailAdapter` SHALL use `nodemailer` (no per-provider SDK) with a persistent connection pool. Pool size SHALL be configurable via `NEXANDRO_SMTP_POOL_SIZE` env (default `5`). The adapter SHALL emit a `connection-error` log entry at `warn` level when the pool fails to acquire a connection within 5s.

#### Scenario: Pool reuses connections across calls
- **WHEN** 10 consecutive `dispatch()` calls run within 10s against the same SMTP server
- **THEN** at most 5 distinct SMTP connections are opened (pool size 5); no per-call TCP handshake cost

#### Scenario: Pool exhaustion surfaces as warning
- **WHEN** 20 concurrent `dispatch()` calls saturate the pool of 5
- **THEN** calls 6-20 wait up to 5s for a free connection; if no connection frees in 5s, the adapter logs `warn` with `event=smtp_pool_acquire_timeout`

### Requirement: SendGrid + Postmark adapters use HTTPS one-shot

The `SendGridEmailAdapter` SHALL use `@sendgrid/mail` SDK. The `PostmarkEmailAdapter` SHALL use `postmark` SDK lazy-imported via dynamic `import('postmark')`. Both SHALL make one HTTPS request per `dispatch()` call (no persistent connection pool — HTTPS handshake amortizes to ~50ms p99).

#### Scenario: SendGrid lazy-loaded only when selected
- **WHEN** the AGPL build runs with `NEXANDRO_EMAIL_PROVIDER=smtp`
- **THEN** the `@sendgrid/mail` package is NOT in the runtime require cache; only the SMTP adapter's nodemailer dependency is loaded

#### Scenario: Postmark lazy-imported on first call
- **WHEN** `NEXANDRO_EMAIL_PROVIDER=postmark` is set and the API boots
- **THEN** the `postmark` SDK is loaded via `await import('postmark')` inside the factory; bundle size measurement shows the AGPL-default build does NOT include postmark

### Requirement: INT tests use mailpit for SMTP delivery assertion

The system SHALL provide INT tests that run against a `mailpit` test container (analogous to the Postgres testcontainer pattern from M2). Tests SHALL assert that emails sent via `SmtpEmailAdapter.dispatch()` arrive at mailpit + have the correct `to`, `subject`, `bodyText` / `bodyHtml`, and attachments. Tests SHALL run on every PR via the project CI pipeline.

#### Scenario: Dispatched email arrives at mailpit
- **WHEN** the INT test calls `SmtpEmailAdapter.dispatch({ to: ['test@inbox.local'], subject: 'INT test', bodyText: 'hello', ... })`
- **THEN** the test queries mailpit's HTTP API and finds the message with matching subject + recipient + body within 2s

#### Scenario: Attachment integrity preserved through dispatch
- **WHEN** the INT test dispatches with a PDF attachment (base64-encoded)
- **THEN** the email retrieved from mailpit has the attachment intact; SHA-256 hash of decoded attachment matches the original

### Requirement: No controller imports EmailDispatchService directly (smoke test)

The system SHALL include a static analysis smoke test that grep-scans `apps/api/src/**/*.controller.ts` for imports of `EmailDispatchService`. The test SHALL fail if any controller imports the service. Rationale: `dispatch()` may take up to 21s in worst case (3 retries × 16s); calling from a request handler would block the request beyond p99 SLO.

#### Scenario: Controller import flagged in CI
- **WHEN** a developer adds `import { EmailDispatchService } from '...'` to any `*.controller.ts` file
- **THEN** the static analysis smoke test fails CI with a clear message: "EmailDispatchService must be called from @OnEvent subscribers or background jobs, never from controllers"

#### Scenario: Subscriber import is allowed
- **WHEN** the test scans `*.subscriber.ts` files
- **THEN** imports of `EmailDispatchService` are allowed (subscribers are the canonical caller pattern)
