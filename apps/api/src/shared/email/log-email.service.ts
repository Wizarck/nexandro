import { Injectable, Logger } from '@nestjs/common';
import type { UserRole } from '../../iam/domain/user.entity';
import { EmailService } from './email.service';

/**
 * Default `EmailService` impl used in dev / test / any environment where
 * `SMTP_HOST` is unset. Logs the recipient + the accept URL to stdout via
 * the Nest logger so a developer running the API locally can copy the
 * link straight from the console. No transport, no retries, no
 * side-effects.
 *
 * Production deployments MUST set `SMTP_HOST` so the factory in
 * `EmailModule` swaps in `SmtpEmailService` instead — otherwise the
 * invitation flow is best-effort.
 */
@Injectable()
export class LogEmailService extends EmailService {
  private readonly logger = new Logger(LogEmailService.name);

  async sendInvitation(
    to: string,
    acceptUrl: string,
    role: UserRole,
    orgName: string,
    invitedByName: string,
  ): Promise<void> {
    this.logger.log(
      `[email] To: ${to}, accept at: ${acceptUrl} (role=${role}, org=${orgName}, invitedBy=${invitedByName})`,
    );
  }
}
