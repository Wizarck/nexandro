import { EmailDispatchErrorCode } from './types';
import {
  SendGridClientLike,
  SendGridEmailAdapter,
  SendGridResponseLike,
} from './sendgrid-email.adapter';

interface FakeClientState {
  setApiKeyCalls: string[];
  sendCalls: number;
}

function makeFakeClient(
  state: FakeClientState,
  behaviour:
    | { kind: 'success' }
    | { kind: 'fail-once-then-success' }
    | { kind: 'always-fail-5xx' }
    | { kind: 'always-fail-401' }
    | { kind: 'always-fail-429' }
    | { kind: 'network-error-then-success' },
): SendGridClientLike {
  let attempt = 0;
  const send = jest
    .fn()
    .mockImplementation(async (): Promise<SendGridResponseLike> => {
      state.sendCalls += 1;
      attempt += 1;
      if (behaviour.kind === 'success') {
        return { statusCode: 202, headers: { 'x-message-id': 'sg-msg-1' } };
      }
      if (behaviour.kind === 'fail-once-then-success') {
        if (attempt === 1) {
          throw {
            code: 503,
            response: { statusCode: 503, body: { errors: [{ message: '5xx' }] } },
            message: 'Service Unavailable',
          };
        }
        return { statusCode: 202, headers: { 'x-message-id': 'sg-msg-2' } };
      }
      if (behaviour.kind === 'always-fail-5xx') {
        throw {
          code: 503,
          response: { statusCode: 503, body: { errors: [{ message: '5xx' }] } },
          message: 'Service Unavailable',
        };
      }
      if (behaviour.kind === 'always-fail-401') {
        throw {
          code: 401,
          response: {
            statusCode: 401,
            body: { errors: [{ message: 'Unauthorized' }] },
          },
          message: 'Unauthorized',
        };
      }
      if (behaviour.kind === 'always-fail-429') {
        throw {
          code: 429,
          response: {
            statusCode: 429,
            body: { errors: [{ message: 'Rate limit' }] },
          },
          message: 'Rate limit',
        };
      }
      // network-error-then-success
      if (attempt === 1) {
        throw Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
      }
      return { statusCode: 202, headers: { 'x-message-id': 'sg-msg-3' } };
    });
  return {
    setApiKey: (key: string) => {
      state.setApiKeyCalls.push(key);
    },
    send,
  };
}

function makeAdapter(
  state: FakeClientState,
  behaviour: Parameters<typeof makeFakeClient>[1],
): SendGridEmailAdapter {
  return new SendGridEmailAdapter({
    apiKey: 'SG.test',
    from: 'sender@example.com',
    client: makeFakeClient(state, behaviour),
  });
}

const validInput = {
  to: ['recipient@example.com'],
  subject: 'Test',
  bodyHtml: '<p>hi</p>',
  tag: 'm3.test',
  organizationId: 'org-1',
};

describe('SendGridEmailAdapter.dispatch', () => {
  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => {
      (cb as () => void)();
      return 0 as unknown as NodeJS.Timeout;
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns success on happy path', async () => {
    const state: FakeClientState = { setApiKeyCalls: [], sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'success' });
    const r = await adapter.dispatch(validInput);
    expect(state.setApiKeyCalls).toEqual(['SG.test']);
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.providerMessageId).toBe('sg-msg-1');
      expect(r.provider).toBe('sendgrid');
    }
  });

  it('retries on 5xx then succeeds (attempts=2)', async () => {
    const state: FakeClientState = { setApiKeyCalls: [], sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'fail-once-then-success' });
    const r = await adapter.dispatch(validInput);
    expect(state.sendCalls).toBe(2);
    expect(r.status).toBe('success');
    if (r.status === 'success') expect(r.attempts).toBe(2);
  });

  it('exhausts retries on persistent 5xx', async () => {
    const state: FakeClientState = { setApiKeyCalls: [], sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'always-fail-5xx' });
    const r = await adapter.dispatch(validInput);
    expect(state.sendCalls).toBe(3);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(EmailDispatchErrorCode.RETRYABLE_TRANSIENT);
    }
  });

  it('fails fast on 401 unauthorized', async () => {
    const state: FakeClientState = { setApiKeyCalls: [], sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'always-fail-401' });
    const r = await adapter.dispatch(validInput);
    expect(state.sendCalls).toBe(1);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(
        EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
      );
    }
  });

  it('fails fast on 429 (rate limit is provider responsibility)', async () => {
    const state: FakeClientState = { setApiKeyCalls: [], sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'always-fail-429' });
    const r = await adapter.dispatch(validInput);
    expect(state.sendCalls).toBe(1);
    expect(r.status).toBe('failure');
  });

  it('retries on network error then succeeds', async () => {
    const state: FakeClientState = { setApiKeyCalls: [], sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'network-error-then-success' });
    const r = await adapter.dispatch(validInput);
    expect(state.sendCalls).toBe(2);
    expect(r.status).toBe('success');
  });
});
