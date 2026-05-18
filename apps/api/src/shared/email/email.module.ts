import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { LogEmailService } from './log-email.service';
import { SmtpEmailService } from './smtp-email.service';

/**
 * Sprint 4 W2-2a — Email module backing the invitation flow.
 *
 * Provider selection:
 *   - SMTP_HOST set (truthy) → `SmtpEmailService`
 *   - otherwise              → `LogEmailService` (default, dev/test safe)
 *
 * Consumers inject the abstract `EmailService` class:
 *
 *     constructor(private readonly email: EmailService) {}
 *
 * which Nest resolves to the impl chosen by the factory below.
 *
 * Followups (out of scope for W2-2a):
 *   - swap to the richer `EmailDispatchService` (ADR-039) once the
 *     invitation flow needs retries + multi-provider routing.
 *   - templated emails (i18n, brand mark) — currently inline strings.
 */
@Module({
  providers: [
    {
      provide: EmailService,
      useFactory: (): EmailService => {
        const smtpHost = (process.env.SMTP_HOST ?? '').trim();
        if (smtpHost.length > 0) {
          return new SmtpEmailService();
        }
        return new LogEmailService();
      },
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
