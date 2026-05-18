import type { UserRole } from '../../iam/domain/user.entity';

/**
 * Sprint 4 W2-2a invitation flow email contract.
 *
 * Deliberately narrow — the only consumer today is the invitation accept
 * email. The richer, multi-provider `EmailDispatchService` in
 * `apps/api/src/shared/email-dispatch/` (ADR-039) is reserved for
 * transactional flows triggered by domain events (recall dossier, APPCC
 * export, AI budget). This abstraction stays tiny on purpose so the
 * invitation surface doesn't drag the retry / alerter / provider matrix
 * into its DI graph.
 *
 * Implementations:
 *   - `LogEmailService`  (default; logs to stdout, used in dev/test when
 *     `SMTP_HOST` is unset).
 *   - `SmtpEmailService` (selected when `SMTP_HOST` is truthy; uses
 *     `nodemailer`).
 */
export abstract class EmailService {
  /**
   * Send a single invitation email to `to`.
   *
   * Implementations MUST NOT throw on transport failure for the
   * LogEmailService default path; the production SmtpEmailService MAY
   * throw and the controller's caller handles failure surface. The
   * `acceptUrl` already encodes the bearer token in its query string —
   * implementations must NEVER log/transmit the token via any side
   * channel.
   */
  abstract sendInvitation(
    to: string,
    acceptUrl: string,
    role: UserRole,
    orgName: string,
    invitedByName: string,
  ): Promise<void>;
}
