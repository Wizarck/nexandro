import { generateKeyPairSync, sign } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AgentCredential } from '../../agent-credentials/domain/agent-credential.entity';
import { AgentCredentialRepository } from '../../agent-credentials/infrastructure/agent-credential.repository';
import {
  AgentSignatureMiddleware,
  buildEnvelope,
} from './agent-signature.middleware';

const ORG_A = '11111111-1111-4111-8111-111111111111';

function makeRepo(rows: AgentCredential[] = []): jest.Mocked<AgentCredentialRepository> {
  return {
    findById: jest.fn().mockImplementation(async (id: string) =>
      rows.find((r) => r.id === id) ?? null,
    ),
  } as unknown as jest.Mocked<AgentCredentialRepository>;
}

function makeReq(opts: {
  headers?: Record<string, string | undefined>;
  user?: { userId: string; organizationId: string; role: string };
  method?: string;
  url?: string;
  body?: unknown;
}): Request {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    if (v !== undefined) headers[k.toLowerCase()] = v;
  }
  return {
    headers,
    method: opts.method ?? 'POST',
    originalUrl: opts.url ?? '/recipes',
    body: opts.body ?? {},
    user: opts.user,
  } as unknown as Request;
}

function generateAgent(): { publicKey: string; privateKey: import('node:crypto').KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey,
  };
}

function makeCredential(id: string, agentName: string, publicKey: string, opts: {
  organizationId?: string;
  revoked?: boolean;
} = {}): AgentCredential {
  const row = AgentCredential.create({
    organizationId: opts.organizationId ?? ORG_A,
    agentName,
    publicKey,
    role: 'OWNER',
  });
  row.id = id;
  if (opts.revoked) row.revoke();
  return row;
}

function signRequest(
  privateKey: import('node:crypto').KeyObject,
  method: string,
  url: string,
  body: unknown,
  ts: string,
  nonce: string,
): string {
  const envelope = buildEnvelope(method, url, ts, nonce, body);
  return sign(null, envelope, privateKey).toString('base64');
}

describe('AgentSignatureMiddleware', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED;
    delete process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED;
    } else {
      process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED = originalEnv;
    }
  });

  it('passes through when no signature headers + flag-off (legacy 3a path)', async () => {
    const repo = makeRepo();
    const middleware = new AgentSignatureMiddleware(repo);
    const req = makeReq({});
    const next = jest.fn();
    await middleware.use(req, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.agentContext).toBeUndefined();
  });

  it('rejects with AGENT_SIGNATURE_REQUIRED when flag-on + viaAgent claim + missing headers', async () => {
    process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED = 'true';
    const repo = makeRepo();
    const middleware = new AgentSignatureMiddleware(repo);
    const req = makeReq({
      headers: { 'x-via-agent': 'true' },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
    });
    await expect(middleware.use(req, {} as never, jest.fn())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('passes through unsigned when flag specifies a different org', async () => {
    process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED = '99999999-9999-4999-8999-999999999999';
    const repo = makeRepo();
    const middleware = new AgentSignatureMiddleware(repo);
    const req = makeReq({
      headers: { 'x-via-agent': 'true', 'x-agent-name': 'hermes' },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
    });
    const next = jest.fn();
    await middleware.use(req, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.agentContext).toBeUndefined();
  });

  it('verifies a valid signature and stamps req.agentContext from the credential', async () => {
    const { publicKey, privateKey } = generateAgent();
    const cred = makeCredential('cred-1', 'hermes', publicKey);
    const repo = makeRepo([cred]);
    const middleware = new AgentSignatureMiddleware(repo);
    const ts = new Date().toISOString();
    const nonce = 'nonce-123';
    const body = { message: 'hi' };
    const sig = signRequest(privateKey, 'POST', '/recipes', body, ts, nonce);
    const req = makeReq({
      headers: {
        'x-agent-id': 'cred-1',
        'x-agent-signature': sig,
        'x-agent-timestamp': ts,
        'x-agent-nonce': nonce,
      },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
      body,
    });
    const next = jest.fn();
    await middleware.use(req, {} as never, next);
    expect(next).toHaveBeenCalled();
    expect(req.agentContext).toEqual({
      viaAgent: true,
      agentName: 'hermes',
      capabilityName: null,
      signatureVerified: true,
    });
  });

  it('rejects when the X-Agent-Name header tries to spoof a different agent than the credential id', async () => {
    // Even if X-Agent-Name says "evil", the agentName comes from the credential row.
    const { publicKey, privateKey } = generateAgent();
    const cred = makeCredential('cred-1', 'hermes', publicKey);
    const repo = makeRepo([cred]);
    const middleware = new AgentSignatureMiddleware(repo);
    const ts = new Date().toISOString();
    const nonce = 'nonce-999';
    const sig = signRequest(privateKey, 'POST', '/recipes', {}, ts, nonce);
    const req = makeReq({
      headers: {
        'x-agent-id': 'cred-1',
        'x-agent-signature': sig,
        'x-agent-timestamp': ts,
        'x-agent-nonce': nonce,
        'x-agent-name': 'evil',
      },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
    });
    await middleware.use(req, {} as never, jest.fn());
    expect(req.agentContext?.agentName).toBe('hermes');
  });

  it('rejects with AGENT_SIGNATURE_INVALID for tampered body', async () => {
    const { publicKey, privateKey } = generateAgent();
    const cred = makeCredential('cred-1', 'hermes', publicKey);
    const repo = makeRepo([cred]);
    const middleware = new AgentSignatureMiddleware(repo);
    const ts = new Date().toISOString();
    const nonce = 'tamp-nonce';
    const sig = signRequest(privateKey, 'POST', '/recipes', { intent: 'good' }, ts, nonce);
    const req = makeReq({
      headers: {
        'x-agent-id': 'cred-1',
        'x-agent-signature': sig,
        'x-agent-timestamp': ts,
        'x-agent-nonce': nonce,
      },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
      body: { intent: 'EVIL' },
    });
    await expect(middleware.use(req, {} as never, jest.fn())).rejects.toMatchObject({
      response: { code: 'AGENT_SIGNATURE_INVALID' },
    });
  });

  it('rejects with AGENT_SIGNATURE_EXPIRED for stale timestamp', async () => {
    const { publicKey, privateKey } = generateAgent();
    const cred = makeCredential('cred-1', 'hermes', publicKey);
    const repo = makeRepo([cred]);
    const middleware = new AgentSignatureMiddleware(repo);
    const ts = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const nonce = 'old-nonce';
    const sig = signRequest(privateKey, 'POST', '/recipes', {}, ts, nonce);
    const req = makeReq({
      headers: {
        'x-agent-id': 'cred-1',
        'x-agent-signature': sig,
        'x-agent-timestamp': ts,
        'x-agent-nonce': nonce,
      },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
    });
    await expect(middleware.use(req, {} as never, jest.fn())).rejects.toMatchObject({
      response: { code: 'AGENT_SIGNATURE_EXPIRED' },
    });
  });

  it('rejects with AGENT_SIGNATURE_NONCE_REPLAYED on duplicate nonce', async () => {
    const { publicKey, privateKey } = generateAgent();
    const cred = makeCredential('cred-1', 'hermes', publicKey);
    const repo = makeRepo([cred]);
    const middleware = new AgentSignatureMiddleware(repo);
    const ts = new Date().toISOString();
    const nonce = 'dup-nonce';
    const sig = signRequest(privateKey, 'POST', '/recipes', {}, ts, nonce);
    const baseReq = (): Request =>
      makeReq({
        headers: {
          'x-agent-id': 'cred-1',
          'x-agent-signature': sig,
          'x-agent-timestamp': ts,
          'x-agent-nonce': nonce,
        },
        user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
      });
    await middleware.use(baseReq(), {} as never, jest.fn());
    await expect(middleware.use(baseReq(), {} as never, jest.fn())).rejects.toMatchObject({
      response: { code: 'AGENT_SIGNATURE_NONCE_REPLAYED' },
    });
  });

  it('rejects with AGENT_CREDENTIAL_REVOKED when credential is revoked', async () => {
    const { publicKey, privateKey } = generateAgent();
    const cred = makeCredential('cred-1', 'hermes', publicKey, { revoked: true });
    const repo = makeRepo([cred]);
    const middleware = new AgentSignatureMiddleware(repo);
    const ts = new Date().toISOString();
    const nonce = 'rev-nonce';
    const sig = signRequest(privateKey, 'POST', '/recipes', {}, ts, nonce);
    const req = makeReq({
      headers: {
        'x-agent-id': 'cred-1',
        'x-agent-signature': sig,
        'x-agent-timestamp': ts,
        'x-agent-nonce': nonce,
      },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
    });
    await expect(middleware.use(req, {} as never, jest.fn())).rejects.toMatchObject({
      response: { code: 'AGENT_CREDENTIAL_REVOKED' },
    });
  });

  it('rejects cross-org signature attempts', async () => {
    const { publicKey, privateKey } = generateAgent();
    const cred = makeCredential('cred-1', 'hermes', publicKey, { organizationId: 'cred-org' });
    const repo = makeRepo([cred]);
    const middleware = new AgentSignatureMiddleware(repo);
    const ts = new Date().toISOString();
    const nonce = 'xorg-nonce';
    const sig = signRequest(privateKey, 'POST', '/recipes', {}, ts, nonce);
    const req = makeReq({
      headers: {
        'x-agent-id': 'cred-1',
        'x-agent-signature': sig,
        'x-agent-timestamp': ts,
        'x-agent-nonce': nonce,
      },
      user: { userId: 'u', organizationId: 'caller-org', role: 'OWNER' },
    });
    await expect(middleware.use(req, {} as never, jest.fn())).rejects.toMatchObject({
      response: { code: 'AGENT_SIGNATURE_INVALID' },
    });
  });
});

describe('isSignatureRequired (via middleware behaviour)', () => {
  it('comma-list flag matches the calling org id case-insensitively', async () => {
    process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED = ` ${ORG_A.toUpperCase()} `;
    const repo = makeRepo();
    const middleware = new AgentSignatureMiddleware(repo);
    const req = makeReq({
      headers: { 'x-via-agent': 'true' },
      user: { userId: 'u', organizationId: ORG_A, role: 'OWNER' },
    });
    await expect(middleware.use(req, {} as never, jest.fn())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    delete process.env.NEXANDRO_AGENT_SIGNATURE_REQUIRED;
  });
});
