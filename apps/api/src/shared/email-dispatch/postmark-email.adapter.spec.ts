import { EmailDispatchErrorCode } from './types';
import {
  PostmarkClientLike,
  PostmarkEmailAdapter,
} from './postmark-email.adapter';

interface FakeState {
  sendCalls: number;
}

function makeFakeClient(
  state: FakeState,
  behaviour:
    | { kind: 'success' }
    | { kind: 'permanent-auth-via-error-code' }
    | { kind: 'transient-via-error-code' },
): PostmarkClientLike {
  return {
    sendEmail: async () => {
      state.sendCalls += 1;
      if (behaviour.kind === 'success') {
        return { MessageID: 'pm-msg-1', ErrorCode: 0 };
      }
      if (behaviour.kind === 'permanent-auth-via-error-code') {
        return { MessageID: '', ErrorCode: 10, Message: 'Bad token' };
      }
      // transient-via-error-code
      return { MessageID: '', ErrorCode: 500, Message: 'Server error' };
    },
  };
}

function makeAdapter(
  state: FakeState,
  behaviour: Parameters<typeof makeFakeClient>[1],
): PostmarkEmailAdapter {
  return new PostmarkEmailAdapter({
    serverToken: 'pm-test-token',
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

describe('PostmarkEmailAdapter.dispatch', () => {
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
    const state: FakeState = { sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'success' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('success');
    if (r.status === 'success') {
      expect(r.providerMessageId).toBe('pm-msg-1');
      expect(r.provider).toBe('postmark');
    }
  });

  it('fails fast on permanent auth ErrorCode', async () => {
    const state: FakeState = { sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'permanent-auth-via-error-code' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(
        EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
      );
    }
    expect(state.sendCalls).toBe(1);
  });

  it('exhausts retries on transient ErrorCode ≥300', async () => {
    const state: FakeState = { sendCalls: 0 };
    const adapter = makeAdapter(state, { kind: 'transient-via-error-code' });
    const r = await adapter.dispatch(validInput);
    expect(r.status).toBe('failure');
    if (r.status === 'failure') {
      expect(r.error.code).toBe(EmailDispatchErrorCode.RETRYABLE_TRANSIENT);
    }
    expect(state.sendCalls).toBe(3);
  });
});

describe('PostmarkEmailAdapter lazy bundle assertion', () => {
  it('postmark package is NOT loaded when no adapter is constructed', () => {
    // Walk require.cache for any key ending in '/postmark/.../index.js'.
    // The adapter file itself uses `import type` (compile-time only)
    // plus dynamic `import('postmark')` inside `init()` which we do NOT
    // call in this test.
    const cachedPostmark = Object.keys(require.cache).find((k) =>
      /[\\/]node_modules[\\/]postmark[\\/]/.test(k),
    );
    expect(cachedPostmark).toBeUndefined();
  });
});
