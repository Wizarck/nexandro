import { EmailDispatchErrorCode } from './types';
import type { Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { SmtpEmailAdapter } from './smtp-email.adapter';

interface FakeTransporterCalls {
  sendCalls: number;
  verifyCalls: number;
}

function makeFakeTransporter(
  state: FakeTransporterCalls,
  behaviour:
    | { kind: 'success' }
    | { kind: 'fail-once-then-success' }
    | { kind: 'always-fail-transient-4xx' }
    | { kind: 'always-fail-535' }
    | { kind: 'always-econnrefused' },
): Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options> {
  let attempt = 0;
  const sendMail = jest
    .fn()
    .mockImplementation(async (): Promise<SMTPTransport.SentMessageInfo> => {
      state.sendCalls += 1;
      attempt += 1;
      if (behaviour.kind === 'success') {
        return makeSentInfo();
      }
      if (behaviour.kind === 'fail-once-then-success') {
        if (attempt === 1) {
          // SMTP 421 = Service not available (transient, retryable per RFC 5321 §4.5.3.2.2)
          throw Object.assign(new Error('Service not available'), {
            responseCode: 421,
          });
        }
        return makeSentInfo();
      }
      if (behaviour.kind === 'always-fail-transient-4xx') {
        // SMTP 4xx = transient failure → retry until exhaustion
        throw Object.assign(new Error('Service not available'), {
          responseCode: 421,
        });
      }
      if (behaviour.kind === 'always-fail-535') {
        throw Object.assign(new Error('Authentication failed'), {
          responseCode: 535,
        });
      }
      // always-econnrefused
      throw Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      });
    });
  const verify = jest.fn().mockImplementation(async () => {
    state.verifyCalls += 1;
    return true;
  });
  // Cast — we only need the two methods we exercise in tests.
  return {
    sendMail,
    verify,
    close: jest.fn(),
    isIdle: jest.fn().mockReturnValue(true),
    use: jest.fn(),
    on: jest.fn(),
    set: jest.fn(),
  } as unknown as Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;
}

function makeSentInfo(): SMTPTransport.SentMessageInfo {
  return {
    accepted: ['recipient@example.com'],
    rejected: [],
    envelopeTime: 1,
    messageTime: 1,
    messageSize: 1,
    response: '250 OK',
    envelope: { from: 'from@example.com', to: ['recipient@example.com'] },
    messageId: 'msg-1@example.com',
  } as unknown as SMTPTransport.SentMessageInfo;
}

function makeAdapter(
  state: FakeTransporterCalls,
  behaviour: Parameters<typeof makeFakeTransporter>[1],
): SmtpEmailAdapter {
  return new SmtpEmailAdapter({
    host: 'localhost',
    port: 1025,
    user: undefined,
    pass: undefined,
    poolSize: 5,
    from: 'notifications@example.com',
    transport: makeFakeTransporter(state, behaviour),
  });
}

const validInput = {
  to: ['recipient@example.com'],
  subject: 'INT test',
  bodyText: 'hello',
  tag: 'm3.test',
  organizationId: 'org-1',
};

describe('SmtpEmailAdapter.dispatch (unit)', () => {
  // The retry policy uses real timers by default; we skip them by setting
  // jest.useFakeTimers and replacing setTimeout where it bites. Easier:
  // shave the per-attempt wait down with a jest spy on global setTimeout.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => {
      (cb as () => void)();
      // Return a Timeout-shaped stub.
      return 0 as unknown as NodeJS.Timeout;
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns success on first-attempt send', async () => {
    const state: FakeTransporterCalls = { sendCalls: 0, verifyCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'success' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.providerMessageId).toBe('msg-1@example.com');
      expect(r.provider).toBe('smtp');
      expect(r.attempts).toBe(1);
    }
    expect(state.sendCalls).toBe(1);
  });

  it('retries on transient 4xx and succeeds on attempt 2', async () => {
    const state: FakeTransporterCalls = { sendCalls: 0, verifyCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'fail-once-then-success' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('success');
    expect(state.sendCalls).toBe(2);
  });

  it('exhausts retries on persistent 4xx and returns RETRYABLE_TRANSIENT failure', async () => {
    const state: FakeTransporterCalls = { sendCalls: 0, verifyCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'always-fail-transient-4xx' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(EmailDispatchErrorCode.RETRYABLE_TRANSIENT);
      expect(r.error.attempts).toBe(3);
    }
    expect(state.sendCalls).toBe(3);
  });

  it('fails fast on 535 auth failure (PERMANENT_AUTH_OR_VALIDATION)', async () => {
    const state: FakeTransporterCalls = { sendCalls: 0, verifyCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'always-fail-535' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(
        EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
      );
      expect(r.error.attempts).toBe(1);
    }
    expect(state.sendCalls).toBe(1);
  });

  it('classifies ECONNREFUSED as retryable + exhausts to RETRYABLE_TRANSIENT', async () => {
    const state: FakeTransporterCalls = { sendCalls: 0, verifyCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'always-econnrefused' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(EmailDispatchErrorCode.RETRYABLE_TRANSIENT);
    }
    expect(state.sendCalls).toBe(3);
  });

  it('returns INPUT_VALIDATION failure on bad input (no body)', async () => {
    const state: FakeTransporterCalls = { sendCalls: 0, verifyCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'success' });
    // Force bypass TS — runtime validation is the contract.
    const r = await adapter.dispatch({
      to: ['a@b.c'],
      subject: 'X',
      tag: 't',
      organizationId: 'org-1',
    } as unknown as Parameters<typeof adapter.dispatch>[0]);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(EmailDispatchErrorCode.INPUT_VALIDATION);
    }
    expect(state.sendCalls).toBe(0);
  });
});

describe('SmtpEmailAdapter.verifyConnection', () => {
  it('returns true when transport.verify resolves', async () => {
    const state: FakeTransporterCalls = { sendCalls: 0, verifyCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'success' });
    await expect(adapter.verifyConnection()).resolves.toBe(true);
    expect(state.verifyCalls).toBe(1);
  });
});
