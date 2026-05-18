import { Test } from '@nestjs/testing';
import { EmailModule } from './email.module';
import { EmailService } from './email.service';
import { LogEmailService } from './log-email.service';
import { SmtpEmailService } from './smtp-email.service';

describe('EmailModule factory', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  async function resolveEmailService(): Promise<EmailService> {
    const mod = await Test.createTestingModule({ imports: [EmailModule] }).compile();
    return mod.get(EmailService);
  }

  it('returns LogEmailService when SMTP_HOST is unset', async () => {
    delete process.env.SMTP_HOST;
    const svc = await resolveEmailService();
    expect(svc).toBeInstanceOf(LogEmailService);
  });

  it('returns LogEmailService when SMTP_HOST is empty string', async () => {
    process.env.SMTP_HOST = '   ';
    const svc = await resolveEmailService();
    expect(svc).toBeInstanceOf(LogEmailService);
  });

  it('returns SmtpEmailService when SMTP_HOST is truthy', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'no-reply@example.com';
    const svc = await resolveEmailService();
    expect(svc).toBeInstanceOf(SmtpEmailService);
  });

  it('SmtpEmailService construction throws when SMTP_FROM is missing', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    delete process.env.SMTP_FROM;
    await expect(resolveEmailService()).rejects.toThrow(/SMTP_FROM/);
  });
});
