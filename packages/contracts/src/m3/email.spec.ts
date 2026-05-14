import {
  EMAIL_DISPATCHED_EVENT_TYPE,
  EmailDispatchErrorCode,
  EmailDispatchInputSchema,
  EmailDispatchResultSchema,
  EmailDispatchedEventSchema,
  EmailProvider,
} from './email';

describe('EmailDispatchInputSchema', () => {
  const validBase = {
    to: ['recipient@example.com'],
    subject: 'Test subject',
    bodyText: 'hello',
    tag: 'test',
    organizationId: 'org-1',
  };

  it('accepts a valid input with bodyText', () => {
    const r = EmailDispatchInputSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it('accepts a valid input with bodyHtml', () => {
    const r = EmailDispatchInputSchema.safeParse({
      ...validBase,
      bodyText: undefined,
      bodyHtml: '<p>hello</p>',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty recipient list', () => {
    const r = EmailDispatchInputSchema.safeParse({ ...validBase, to: [] });
    expect(r.success).toBe(false);
  });

  it('rejects when neither bodyHtml nor bodyText is set', () => {
    const r = EmailDispatchInputSchema.safeParse({
      to: ['a@b.c'],
      subject: 'X',
      tag: 'test',
      organizationId: 'org-1',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/bodyHtml.*bodyText/);
    }
  });

  it('rejects missing organizationId', () => {
    const r = EmailDispatchInputSchema.safeParse({
      ...validBase,
      organizationId: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('EmailDispatchResultSchema', () => {
  it('accepts a success result', () => {
    const r = EmailDispatchResultSchema.safeParse({
      status: 'success',
      providerMessageId: 'abc-123',
      deliveredAt: new Date(),
      provider: EmailProvider.SMTP,
      attempts: 1,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a failure result', () => {
    const r = EmailDispatchResultSchema.safeParse({
      status: 'failure',
      error: {
        code: EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
        message: 'all retries exhausted',
        attempts: 3,
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown discriminator', () => {
    const r = EmailDispatchResultSchema.safeParse({
      status: 'pending',
      providerMessageId: 'x',
    });
    expect(r.success).toBe(false);
  });
});

describe('EmailDispatchedEventSchema', () => {
  it('round-trips with required fields', () => {
    const r = EmailDispatchedEventSchema.safeParse({
      organizationId: 'org-1',
      aggregateType: 'email_dispatch',
      aggregateId: 'msg-1',
      eventType: EMAIL_DISPATCHED_EVENT_TYPE,
      actorUserId: null,
      actorKind: 'system',
      payloadAfter: {
        to: ['a@b.c'],
        subject: 'subj',
        provider: EmailProvider.SMTP,
        providerMessageId: 'msg-1',
        deliveredAt: new Date(),
        attempts: 1,
        tag: 'm3.recall.dossier_dispatch',
      },
    });
    expect(r.success).toBe(true);
  });
});
