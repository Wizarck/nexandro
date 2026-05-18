import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import {
  LlmCredentialStatus,
  LlmCredentialsService,
} from '../application/llm-credentials.service';
import { LlmCredentialsController } from './llm-credentials.controller';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const SAMPLE_KEY = 'sk-test-ABCDEFG-1234567890';

function fakeReq(user?: unknown): Request {
  return { user, params: {} } as unknown as Request;
}

function ownerOf(orgId: string): Request {
  return fakeReq({
    userId: '99999999-9999-4999-8999-999999999999',
    organizationId: orgId,
    role: 'OWNER',
  });
}

function makeService(): jest.Mocked<LlmCredentialsService> {
  return {
    getStatus: jest.fn(),
    upsert: jest.fn(),
    test: jest.fn(),
    clear: jest.fn(),
  } as unknown as jest.Mocked<LlmCredentialsService>;
}

describe('LlmCredentialsController — auth + scope', () => {
  let service: jest.Mocked<LlmCredentialsService>;
  let ctrl: LlmCredentialsController;

  beforeEach(() => {
    service = makeService();
    ctrl = new LlmCredentialsController(service);
  });

  it('rejects unauthenticated callers (UnauthorizedException)', async () => {
    await expect(ctrl.getStatus(ORG_A, fakeReq(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects cross-org access (ForbiddenException ORG_SCOPE_MISMATCH)', async () => {
    await expect(ctrl.getStatus(ORG_B, ownerOf(ORG_A))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      ctrl.upsert(ORG_B, { provider: 'openai', apiKey: SAMPLE_KEY }, ownerOf(ORG_A)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.test(ORG_B, ownerOf(ORG_A))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.clear(ORG_B, ownerOf(ORG_A))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('LlmCredentialsController — getStatus()', () => {
  let service: jest.Mocked<LlmCredentialsService>;
  let ctrl: LlmCredentialsController;

  beforeEach(() => {
    service = makeService();
    ctrl = new LlmCredentialsController(service);
  });

  it('returns the service status verbatim', async () => {
    const status: LlmCredentialStatus = {
      provider: 'openai',
      hasKey: true,
      lastTestedAt: '2026-05-18T10:00:00.000Z',
      lastTestResult: 'success',
      lastTestError: null,
    };
    service.getStatus.mockResolvedValue(status);

    const out = await ctrl.getStatus(ORG_A, ownerOf(ORG_A));
    expect(out).toEqual(status);
    expect(service.getStatus).toHaveBeenCalledWith(ORG_A);
  });

  it('response NEVER leaks the API key (response shape sanity)', async () => {
    service.getStatus.mockResolvedValue({
      provider: 'openai',
      hasKey: true,
      lastTestedAt: null,
      lastTestResult: null,
      lastTestError: null,
    });
    const out = await ctrl.getStatus(ORG_A, ownerOf(ORG_A));
    const json = JSON.stringify(out);
    expect(json).not.toContain(SAMPLE_KEY);
    expect(out).not.toHaveProperty('apiKey');
    expect(out).not.toHaveProperty('encryptedApiKey');
  });
});

describe('LlmCredentialsController — upsert()', () => {
  let service: jest.Mocked<LlmCredentialsService>;
  let ctrl: LlmCredentialsController;

  beforeEach(() => {
    service = makeService();
    ctrl = new LlmCredentialsController(service);
  });

  it('forwards orgId from the path + dto fields to the service', async () => {
    service.upsert.mockResolvedValue(undefined);
    const result = await ctrl.upsert(
      ORG_A,
      { provider: 'anthropic', apiKey: SAMPLE_KEY },
      ownerOf(ORG_A),
    );
    expect(service.upsert).toHaveBeenCalledWith(ORG_A, 'anthropic', SAMPLE_KEY);
    expect(result).toBeUndefined(); // 204 No Content
  });

  it('does NOT return the apiKey (PUT returns void/204)', async () => {
    service.upsert.mockResolvedValue(undefined);
    const result = await ctrl.upsert(
      ORG_A,
      { provider: 'openai', apiKey: SAMPLE_KEY },
      ownerOf(ORG_A),
    );
    // The controller method returns Promise<void>; assert no leak in the
    // returned value regardless.
    expect(JSON.stringify(result ?? null)).not.toContain(SAMPLE_KEY);
  });
});

describe('LlmCredentialsController — test()', () => {
  let service: jest.Mocked<LlmCredentialsService>;
  let ctrl: LlmCredentialsController;

  beforeEach(() => {
    service = makeService();
    ctrl = new LlmCredentialsController(service);
  });

  it('returns the test result status', async () => {
    const status: LlmCredentialStatus = {
      provider: 'mistral',
      hasKey: true,
      lastTestedAt: '2026-05-18T11:30:00.000Z',
      lastTestResult: 'success',
      lastTestError: null,
    };
    service.test.mockResolvedValue(status);

    const out = await ctrl.test(ORG_A, ownerOf(ORG_A));
    expect(out).toEqual(status);
    expect(service.test).toHaveBeenCalledWith(ORG_A);
  });
});

describe('LlmCredentialsController — clear()', () => {
  let service: jest.Mocked<LlmCredentialsService>;
  let ctrl: LlmCredentialsController;

  beforeEach(() => {
    service = makeService();
    ctrl = new LlmCredentialsController(service);
  });

  it('calls service.clear and returns void (204)', async () => {
    service.clear.mockResolvedValue(undefined);
    const out = await ctrl.clear(ORG_A, ownerOf(ORG_A));
    expect(service.clear).toHaveBeenCalledWith(ORG_A);
    expect(out).toBeUndefined();
  });
});
