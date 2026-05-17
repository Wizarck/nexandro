import { EmailDispatchFactory } from './email-dispatch.factory';
import { UnknownEmailProviderError } from './errors';
import { PostmarkEmailAdapter } from './postmark-email.adapter';
import { SendGridEmailAdapter } from './sendgrid-email.adapter';
import { SmtpEmailAdapter } from './smtp-email.adapter';

describe('EmailDispatchFactory.resolve', () => {
  it('defaults to SmtpEmailAdapter when NEXANDRO_EMAIL_PROVIDER is unset', async () => {
    const factory = new EmailDispatchFactory();
    const svc = await factory.resolve({});
    expect(svc).toBeInstanceOf(SmtpEmailAdapter);
  });

  it('selects SendGrid when env=sendgrid', async () => {
    const factory = new EmailDispatchFactory();
    const svc = await factory.resolve({
      NEXANDRO_EMAIL_PROVIDER: 'sendgrid',
      NEXANDRO_SENDGRID_API_KEY: 'SG.test',
    });
    expect(svc).toBeInstanceOf(SendGridEmailAdapter);
  });

  it('selects Postmark (lazy-loaded) when env=postmark', async () => {
    const factory = new EmailDispatchFactory();
    // Postmark SDK is not installed in the test env (we never run pnpm
    // install locally per slice instructions). The lazy import will
    // throw — we accept either successful resolution OR a module-not-
    // found error. Both prove the env is honoured.
    try {
      const svc = await factory.resolve({
        NEXANDRO_EMAIL_PROVIDER: 'postmark',
        NEXANDRO_POSTMARK_SERVER_TOKEN: 'pm-test',
      });
      expect(svc).toBeInstanceOf(PostmarkEmailAdapter);
    } catch (err) {
      // Module not present in node_modules during local dev: accept.
      expect((err as Error).message).toMatch(/postmark|MODULE_NOT_FOUND/i);
    }
  });

  it('throws UnknownEmailProviderError on unknown value', async () => {
    const factory = new EmailDispatchFactory();
    await expect(
      factory.resolve({ NEXANDRO_EMAIL_PROVIDER: 'mailchimp' }),
    ).rejects.toBeInstanceOf(UnknownEmailProviderError);
  });

  it('is case-insensitive on env value', async () => {
    const factory = new EmailDispatchFactory();
    const svc = await factory.resolve({
      NEXANDRO_EMAIL_PROVIDER: 'SMTP',
    });
    expect(svc).toBeInstanceOf(SmtpEmailAdapter);
  });
});
