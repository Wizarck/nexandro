import { Logger } from '@nestjs/common';
import { EmailDispatchErrorCode } from './types';
import { EmailFailureAlerter } from './email-failure-alerter';

const validInput = {
  to: ['insurer@aseguradora.es'],
  subject: 'Recall dossier',
  bodyText: 'see attached PDF',
  tag: 'm3.recall.dossier_dispatch',
  organizationId: 'org-XYZ',
};

const sampleError = {
  code: EmailDispatchErrorCode.RETRYABLE_TRANSIENT as const,
  message: 'all retries exhausted',
  attempts: 3,
  providerError: 'SMTP 503',
};

describe('EmailFailureAlerter.alertOwner', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('emits a structured error log on failed dispatch', async () => {
    const alerter = new EmailFailureAlerter();
    await alerter.alertOwner(validInput, sampleError);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(payload.event).toBe('email_dispatch_failed');
    expect(payload.recipient).toBe('insurer@aseguradora.es');
    expect(payload.organizationId).toBe('org-XYZ');
    expect(payload.errorCode).toBe(EmailDispatchErrorCode.RETRYABLE_TRANSIENT);
    expect(payload.attempts).toBe(3);
    expect(payload.alerter_failed).toBe(false);
  });

  it('does not throw when input contains non-serialisable providerError', async () => {
    const alerter = new EmailFailureAlerter();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const badError = {
      ...sampleError,
      // Cast to string so the type lines up; the test injects a
      // problematic stringification path via the JSON.stringify call
      // inside the alerter — but since `providerError` is typed as
      // `string | undefined`, the only way to reach the catch branch is
      // a hostile JSON.stringify monkeypatch. We simulate that here.
      providerError: 'normal-string',
    };
    const stringifySpy = jest
      .spyOn(JSON, 'stringify')
      .mockImplementationOnce(() => {
        throw new Error('synthetic serialiser failure');
      });
    await expect(alerter.alertOwner(validInput, badError)).resolves.toBeUndefined();
    // Two calls: the failed JSON.stringify, then the fallback string log.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(
      /alerter_failed=true.*synthetic serialiser failure/,
    );
    stringifySpy.mockRestore();
  });
});
