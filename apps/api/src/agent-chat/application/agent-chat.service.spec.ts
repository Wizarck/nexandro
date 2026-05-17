import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import { AgentChatService } from './agent-chat.service';

function makeOrg(id: string, name: string): unknown {
  return { id, name };
}

function makeRepo(org: unknown | null): OrganizationRepository {
  return {
    findOneBy: jest.fn().mockResolvedValue(org),
  } as unknown as OrganizationRepository;
}

function makeEvents(): EventEmitter2 {
  return {
    emitAsync: jest.fn().mockResolvedValue([]),
  } as unknown as EventEmitter2;
}

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('AgentChatService — feature flag + bank id', () => {
  beforeEach(() => {
    delete process.env.NEXANDRO_AGENT_ENABLED;
    delete process.env.NEXANDRO_HERMES_BASE_URL;
    delete process.env.NEXANDRO_HERMES_AUTH_SECRET;
  });

  it('isEnabled() returns false by default', () => {
    const svc = new AgentChatService(makeRepo(null), makeEvents());
    expect(svc.isEnabled()).toBe(false);
  });

  it('isEnabled() honours truthy values', () => {
    const svc = new AgentChatService(makeRepo(null), makeEvents());
    for (const v of ['true', 'TRUE', '1', 'yes', 'Yes']) {
      process.env.NEXANDRO_AGENT_ENABLED = v;
      expect(svc.isEnabled()).toBe(true);
    }
    process.env.NEXANDRO_AGENT_ENABLED = 'false';
    expect(svc.isEnabled()).toBe(false);
  });

  it('resolveBankId derives slug from organization name', async () => {
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme Trattoria')), makeEvents());
    expect(await svc.resolveBankId(ORG_ID)).toBe('nexandro-acme-trattoria');
  });

  it('resolveBankId handles diacritics + non-ASCII', async () => {
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Restaurante La Bohème')), makeEvents());
    expect(await svc.resolveBankId(ORG_ID)).toBe('nexandro-restaurante-la-boheme');
  });

  it('resolveBankId truncates slug to 32 chars', async () => {
    const longName = 'A Very Long Restaurant Name That Exceeds The Limit Surely';
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, longName)), makeEvents());
    const id = await svc.resolveBankId(ORG_ID);
    expect(id).toMatch(/^nexandro-/);
    const slug = id.replace('nexandro-', '');
    expect(slug.length).toBeLessThanOrEqual(32);
  });

  it('resolveBankId falls back to hash when org name slugifies to empty', async () => {
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, '!!!')), makeEvents());
    const id = await svc.resolveBankId(ORG_ID);
    expect(id).toMatch(/^nexandro-[0-9a-f]{8}$/);
  });

  it('resolveBankId falls back to hash when org cannot be loaded', async () => {
    const svc = new AgentChatService(makeRepo(null), makeEvents());
    const id = await svc.resolveBankId(ORG_ID);
    expect(id).toMatch(/^nexandro-[0-9a-f]{8}$/);
  });
});

describe('AgentChatService — stream() guards', () => {
  beforeEach(() => {
    delete process.env.NEXANDRO_AGENT_ENABLED;
    delete process.env.NEXANDRO_HERMES_BASE_URL;
    delete process.env.NEXANDRO_HERMES_AUTH_SECRET;
  });

  it('throws NotFoundException when flag is off', () => {
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), makeEvents());
    expect(() =>
      svc.stream(
        { message: { type: 'text', content: 'hi' } },
        { userId: USER_ID, organizationId: ORG_ID },
      ),
    ).toThrow(NotFoundException);
  });

  it('throws ServiceUnavailable when Hermes base URL missing', () => {
    process.env.NEXANDRO_AGENT_ENABLED = 'true';
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), makeEvents());
    expect(() =>
      svc.stream(
        { message: { type: 'text', content: 'hi' } },
        { userId: USER_ID, organizationId: ORG_ID },
      ),
    ).toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailable when auth secret missing', () => {
    process.env.NEXANDRO_AGENT_ENABLED = 'true';
    process.env.NEXANDRO_HERMES_BASE_URL = 'http://hermes:8644';
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), makeEvents());
    expect(() =>
      svc.stream(
        { message: { type: 'text', content: 'hi' } },
        { userId: USER_ID, organizationId: ORG_ID },
      ),
    ).toThrow(ServiceUnavailableException);
  });
});

describe('AgentChatService — Hermes call via mocked fetch', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.NEXANDRO_AGENT_ENABLED = 'true';
    process.env.NEXANDRO_HERMES_BASE_URL = 'http://hermes:8644';
    process.env.NEXANDRO_HERMES_AUTH_SECRET = 's3cret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NEXANDRO_AGENT_ENABLED;
    delete process.env.NEXANDRO_HERMES_BASE_URL;
    delete process.env.NEXANDRO_HERMES_AUTH_SECRET;
  });

  function fakeSseResponse(frames: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  it('forwards bank_id + auth header + session id to Hermes', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      fakeSseResponse(['event: token\ndata: {"chunk":"hi"}\n\n', 'event: done\ndata: {"finishReason":"stop"}\n\n']),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme Trattoria')), makeEvents());
    const events$ = svc.stream(
      { message: { type: 'text', content: 'hola' }, sessionId: 'sess-X' },
      { userId: USER_ID, organizationId: ORG_ID, displayName: 'Lourdes' },
    );
    const events = await lastValueFrom(events$.pipe(toArray()));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://hermes:8644/web/sess-X');
    expect((init.headers as Record<string, string>)['x-web-auth-secret']).toBe('s3cret');
    const body = JSON.parse(init.body);
    expect(body.bank_id).toBe('nexandro-acme-trattoria');
    expect(body.user_attribution).toEqual({ user_id: USER_ID, display_name: 'Lourdes' });
    expect(body.message).toEqual({ type: 'text', content: 'hola' });

    expect(events.map((e) => e.event)).toEqual(['token', 'done']);
    if (events[0].event === 'token') {
      expect(events[0].data.chunk).toBe('hi');
    }
  });

  it('emits a synthetic error event when Hermes returns non-2xx', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), makeEvents());
    const events$ = svc.stream(
      { message: { type: 'text', content: 'x' } },
      { userId: USER_ID, organizationId: ORG_ID },
    );
    const first = await firstValueFrom(events$);
    expect(first.event).toBe('error');
    if (first.event === 'error') {
      expect(first.data.code).toBe('HERMES_HTTP_ERROR');
    }
  });

  it('emits a transport error event when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), makeEvents());
    const events$ = svc.stream(
      { message: { type: 'text', content: 'x' } },
      { userId: USER_ID, organizationId: ORG_ID },
    );
    const first = await firstValueFrom(events$);
    expect(first.event).toBe('error');
    if (first.event === 'error') {
      expect(first.data.code).toBe('HERMES_TRANSPORT_ERROR');
      expect(first.data.message).toContain('ECONNREFUSED');
    }
  });

  it('derives a deterministic session id when client omits one', async () => {
    let capturedUrl = '';
    global.fetch = (jest.fn() as jest.Mock).mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(fakeSseResponse(['event: done\ndata: {"finishReason":"stop"}\n\n']));
    }) as unknown as typeof fetch;

    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), makeEvents());
    await lastValueFrom(
      svc
        .stream(
          { message: { type: 'text', content: 'x' } },
          { userId: USER_ID, organizationId: ORG_ID },
        )
        .pipe(toArray()),
    );
    expect(capturedUrl).toMatch(/\/web\/web-[0-9a-f]{8}$/);

    capturedUrl = '';
    await lastValueFrom(
      svc
        .stream(
          { message: { type: 'text', content: 'y' } },
          { userId: USER_ID, organizationId: ORG_ID },
        )
        .pipe(toArray()),
    );
    // Same user+org → same session id
    expect(capturedUrl).toMatch(/\/web\/web-[0-9a-f]{8}$/);
  });
});

describe('AgentChatService — turn audit emission', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.NEXANDRO_AGENT_ENABLED = 'true';
    process.env.NEXANDRO_HERMES_BASE_URL = 'http://hermes:8644';
    process.env.NEXANDRO_HERMES_AUTH_SECRET = 's3cret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.NEXANDRO_AGENT_ENABLED;
    delete process.env.NEXANDRO_HERMES_BASE_URL;
    delete process.env.NEXANDRO_HERMES_AUTH_SECRET;
  });

  function fakeSseResponse(frames: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }

  it('emits exactly one AGENT_ACTION_FORENSIC row at stream completion', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      fakeSseResponse([
        'event: token\ndata: {"chunk":"Hola "}\n\n',
        'event: token\ndata: {"chunk":"Lourdes"}\n\n',
        'event: done\ndata: {"finishReason":"stop"}\n\n',
      ]),
    ) as unknown as typeof fetch;

    const events = makeEvents();
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), events);
    await lastValueFrom(
      svc
        .stream(
          { message: { type: 'text', content: 'hi' }, sessionId: 'sess-1' },
          { userId: USER_ID, organizationId: ORG_ID },
        )
        .pipe(toArray()),
    );

    expect((events.emitAsync as jest.Mock)).toHaveBeenCalledTimes(1);
    const [eventName, envelope] = (events.emitAsync as jest.Mock).mock.calls[0];
    expect(eventName).toBe('agent.action-forensic');
    expect(envelope).toMatchObject({
      organizationId: ORG_ID,
      aggregateType: 'chat_session',
      actorUserId: USER_ID,
      actorKind: 'agent',
      agentName: 'hermes-web',
      payloadBefore: null,
      reason: 'chat.message',
    });
    // aggregate_id is a fresh UUID per turn (the audit_log column is
    // UUID-typed; sessionIds are free-form). The chat sessionId is
    // captured in payloadAfter.sessionId.
    expect(envelope.aggregateId).toMatch(/^[0-9a-f-]{36}$/);
    expect(envelope.payloadAfter).toMatchObject({
      sessionId: 'sess-1',
      finishReason: 'stop',
      replyChars: 'Hola Lourdes'.length,
      messageType: 'text',
    });
    expect(typeof envelope.payloadAfter.messageDigest).toBe('string');
    expect(envelope.payloadAfter.messageDigest).toHaveLength(64);
  });

  it('still emits one audit row when Hermes returns a transport error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const events = makeEvents();
    const svc = new AgentChatService(makeRepo(makeOrg(ORG_ID, 'Acme')), events);
    await lastValueFrom(
      svc
        .stream(
          { message: { type: 'text', content: 'hi' }, sessionId: 'sess-err' },
          { userId: USER_ID, organizationId: ORG_ID },
        )
        .pipe(toArray()),
    );
    expect((events.emitAsync as jest.Mock)).toHaveBeenCalledTimes(1);
    const envelope = (events.emitAsync as jest.Mock).mock.calls[0][1];
    expect(envelope.payloadAfter.errorCode).toBe('HERMES_TRANSPORT_ERROR');
  });
});

describe('AgentChatService — cacheableTextForIdempotency', () => {
  it('concatenates token chunks + captures finishReason', () => {
    const svc = new AgentChatService(makeRepo(null), makeEvents());
    const result = svc.cacheableTextForIdempotency([
      { event: 'token', data: { chunk: 'Hola, ' } },
      { event: 'tool-calling', data: { tool: 'recipes.read' } },
      { event: 'token', data: { chunk: 'Lourdes' } },
      { event: 'done', data: { finishReason: 'stop' } },
    ]);
    expect(result).toEqual({ kind: 'sse-replay', text: 'Hola, Lourdes', finishReason: 'stop' });
  });

  it('defaults finishReason to "stop" when missing', () => {
    const svc = new AgentChatService(makeRepo(null), makeEvents());
    const result = svc.cacheableTextForIdempotency([{ event: 'token', data: { chunk: 'x' } }]);
    expect(result.finishReason).toBe('stop');
  });
});
