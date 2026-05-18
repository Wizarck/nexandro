import { Injectable, Logger } from '@nestjs/common';
import type { UserRole } from '../../iam/domain/user.entity';
import { EmailService } from './email.service';

/**
 * SMTP-backed `EmailService` selected by the factory in `EmailModule`
 * when `SMTP_HOST` is truthy. Uses `nodemailer` via dynamic require so
 * the file stays loadable even if the dep is missing (the constructor
 * throws instead) — keeps the LogEmailService path usable in pared-down
 * test images.
 *
 * Env contract:
 *   - SMTP_HOST      (required when this impl is selected)
 *   - SMTP_PORT      (default 587)
 *   - SMTP_SECURE    (default false; "true" → TLS on port 465 typically)
 *   - SMTP_USER      (optional)
 *   - SMTP_PASS      (optional)
 *   - SMTP_FROM      (required — From: header value)
 */
@Injectable()
export class SmtpEmailService extends EmailService {
  private readonly logger = new Logger(SmtpEmailService.name);
  private readonly transporter: { sendMail: (opts: Record<string, unknown>) => Promise<unknown> };
  private readonly from: string;

  constructor() {
    super();
    // Lazy-require so the file remains import-safe when nodemailer is not
    // installed (test minimal images). The throw at construction surfaces
    // a clear error during DI resolution rather than later mid-request.
    let nodemailer: { createTransport: (opts: Record<string, unknown>) => unknown };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      nodemailer = require('nodemailer');
    } catch {
      throw new Error(
        'SmtpEmailService requires `nodemailer` to be installed. Either `npm i nodemailer` in apps/api, or unset SMTP_HOST so the EmailModule factory picks LogEmailService.',
      );
    }

    const host = process.env.SMTP_HOST;
    const from = process.env.SMTP_FROM;
    if (!host) {
      throw new Error('SmtpEmailService requires SMTP_HOST to be set.');
    }
    if (!from) {
      throw new Error('SmtpEmailService requires SMTP_FROM to be set.');
    }
    this.from = from;

    const port = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
    const secure = String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const transportOpts: Record<string, unknown> = { host, port, secure };
    if (user && pass) {
      transportOpts.auth = { user, pass };
    }

    this.transporter = nodemailer.createTransport(transportOpts) as {
      sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
    };
  }

  async sendInvitation(
    to: string,
    acceptUrl: string,
    role: UserRole,
    orgName: string,
    invitedByName: string,
  ): Promise<void> {
    const subject = `${invitedByName} te ha invitado a ${orgName}`;
    const text = [
      `${invitedByName} te ha invitado a unirte a ${orgName} con el rol ${role}.`,
      '',
      `Acepta la invitación abriendo este enlace (caduca en 7 días):`,
      acceptUrl,
      '',
      'Si no esperabas esta invitación, ignora este correo.',
    ].join('\n');
    const html = `
      <p>${escapeHtml(invitedByName)} te ha invitado a unirte a <strong>${escapeHtml(orgName)}</strong> con el rol <strong>${escapeHtml(role)}</strong>.</p>
      <p>Acepta la invitación pulsando el siguiente enlace (caduca en 7 días):</p>
      <p><a href="${escapeAttr(acceptUrl)}">${escapeHtml(acceptUrl)}</a></p>
      <p style="color:#666">Si no esperabas esta invitación, ignora este correo.</p>
    `;

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });
    this.logger.log(`Sent invitation email to ${to} (role=${role}, org=${orgName})`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
