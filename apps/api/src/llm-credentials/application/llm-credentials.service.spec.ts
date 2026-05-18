import { OrgLlmCredential } from '../domain/org-llm-credential.entity';
import { EncryptionService } from '../infrastructure/encryption.service';
import { LlmCredentialsRepository } from '../infrastructure/llm-credentials.repository';
import {
  LlmCredentialsService,
  LlmProviderProbe,
} from './llm-credentials.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const SAMPLE_KEY = 'sk-test-ABCDEFG1234567890';

function makeRepo(): jest.Mocked<LlmCredentialsRepository> {
  return {
    findByOrganizationId: jest.fn(),
    deleteByOrganizationId: jest.fn(),
    save: jest.fn(),
    create: jest.fn().mockImplementation((data) => Object.assign(new OrgLlmCredential(), data)),
  } as unknown as jest.Mocked<LlmCredentialsRepository>;
}

function makeEncryption(): jest.Mocked<EncryptionService> {
  // Deterministic mock: prefix-encoded so we can assert the cleartext
  // never leaks AND the round-trip is exercised through the service.
  return {
    encrypt: jest.fn((s: string) => `ENC(${s})`),
    decrypt: jest.fn((s: string) => s.replace(/^ENC\((.*)\)$/, '$1')),
  } as unknown as jest.Mocked<EncryptionService>;
}

function makeProbe(result: { ok: boolean; error?: string }): jest.Mocked<LlmProviderProbe> {
  return { ping: jest.fn().mockResolvedValue(result) };
}

function rowFixture(overrides: Partial<OrgLlmCredential> = {}): OrgLlmCredential {
  const row = new OrgLlmCredential();
  row.id = 'row-id';
  row.organizationId = ORG_A;
  row.provider = 'openai';
  row.encryptedApiKey = `ENC(${SAMPLE_KEY})`;
  row.lastTestedAt = null;
  row.lastTestResult = null;
  row.lastTestError = null;
  row.createdAt = new Date();
  row.updatedAt = new Date();
  return Object.assign(row, overrides);
}

describe('LlmCredentialsService — getStatus()', () => {
  it('returns hasKey=false when no row exists', async () => {
    const repo = makeRepo();
    repo.findByOrganizationId.mockResolvedValue(null);
    const svc = new LlmCredentialsService(repo, makeEncryption());

    const status = await svc.getStatus(ORG_A);
    expect(status).toEqual({
      provider: null,
      hasKey: false,
      lastTestedAt: null,
      lastTestResult: null,
      lastTestError: null,
    });
  });

  it('returns hasKey=true + masked metadata when a row exists; NEVER returns the encryptedApiKey', async () => {
    const repo = makeRepo();
    const lastTestedAt = new Date('2026-05-18T10:00:00.000Z');
    repo.findByOrganizationId.mockResolvedValue(
      rowFixture({ lastTestedAt, lastTestResult: 'success', provider: 'anthropic' }),
    );
    const svc = new LlmCredentialsService(repo, makeEncryption());

    const status = await svc.getStatus(ORG_A);
    expect(status.provider).toBe('anthropic');
    expect(status.hasKey).toBe(true);
    expect(status.lastTestedAt).toBe(lastTestedAt.toISOString());
    expect(status.lastTestResult).toBe('success');
    // Defence-in-depth: response shape must not contain the ciphertext OR cleartext.
    const json = JSON.stringify(status);
    expect(json).not.toContain(SAMPLE_KEY);
    expect(json).not.toContain('ENC(');
    expect(status).not.toHaveProperty('encryptedApiKey');
    expect(status).not.toHaveProperty('apiKey');
  });
});

describe('LlmCredentialsService — upsert()', () => {
  it('encrypts the apiKey before persisting (cleartext NEVER reaches repo.save)', async () => {
    const repo = makeRepo();
    repo.findByOrganizationId.mockResolvedValue(null);
    repo.save.mockImplementation(async (r) => r as OrgLlmCredential);
    const enc = makeEncryption();
    const svc = new LlmCredentialsService(repo, enc);

    await svc.upsert(ORG_A, 'openai', SAMPLE_KEY);

    expect(enc.encrypt).toHaveBeenCalledWith(SAMPLE_KEY);
    const saved = repo.save.mock.calls[0]?.[0] as OrgLlmCredential;
    expect(saved.organizationId).toBe(ORG_A);
    expect(saved.provider).toBe('openai');
    expect(saved.encryptedApiKey).toBe(`ENC(${SAMPLE_KEY})`);
    expect(saved.encryptedApiKey).not.toBe(SAMPLE_KEY);
  });

  it('updates the existing row when one is present (replacement, not duplicate)', async () => {
    const repo = makeRepo();
    const existing = rowFixture({ provider: 'openai' });
    repo.findByOrganizationId.mockResolvedValue(existing);
    repo.save.mockImplementation(async (r) => r as OrgLlmCredential);
    const enc = makeEncryption();
    const svc = new LlmCredentialsService(repo, enc);

    await svc.upsert(ORG_A, 'mistral', 'sk-new-key');

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(existing.provider).toBe('mistral');
    expect(existing.encryptedApiKey).toBe('ENC(sk-new-key)');
    // Test metadata reset on rotation
    expect(existing.lastTestedAt).toBeNull();
    expect(existing.lastTestResult).toBeNull();
    expect(existing.lastTestError).toBeNull();
  });

  it('trims whitespace before encrypting', async () => {
    const repo = makeRepo();
    repo.findByOrganizationId.mockResolvedValue(null);
    repo.save.mockImplementation(async (r) => r as OrgLlmCredential);
    const enc = makeEncryption();
    const svc = new LlmCredentialsService(repo, enc);

    await svc.upsert(ORG_A, 'openai', '  sk-padded  ');
    expect(enc.encrypt).toHaveBeenCalledWith('sk-padded');
  });

  it('rejects unknown provider values', async () => {
    const repo = makeRepo();
    const svc = new LlmCredentialsService(repo, makeEncryption());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(svc.upsert(ORG_A, 'gemini' as any, SAMPLE_KEY)).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects empty / whitespace-only apiKey', async () => {
    const repo = makeRepo();
    const svc = new LlmCredentialsService(repo, makeEncryption());

    await expect(svc.upsert(ORG_A, 'openai', '')).rejects.toThrow();
    await expect(svc.upsert(ORG_A, 'openai', '   ')).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('LlmCredentialsService — test()', () => {
  it('decrypts the stored key, fires the probe, and persists success metadata', async () => {
    const repo = makeRepo();
    const row = rowFixture({ provider: 'openai' });
    repo.findByOrganizationId.mockResolvedValue(row);
    repo.save.mockImplementation(async (r) => r as OrgLlmCredential);
    const enc = makeEncryption();
    const probe = makeProbe({ ok: true });
    const svc = new LlmCredentialsService(repo, enc, probe);

    const status = await svc.test(ORG_A);

    expect(enc.decrypt).toHaveBeenCalledWith(`ENC(${SAMPLE_KEY})`);
    expect(probe.ping).toHaveBeenCalledWith('openai', SAMPLE_KEY);
    expect(row.lastTestResult).toBe('success');
    expect(row.lastTestError).toBeNull();
    expect(row.lastTestedAt).toBeInstanceOf(Date);
    expect(status.provider).toBe('openai');
    expect(status.lastTestResult).toBe('success');
    // Response shape never includes the cleartext
    const json = JSON.stringify(status);
    expect(json).not.toContain(SAMPLE_KEY);
  });

  it('persists failure metadata with the probe error', async () => {
    const repo = makeRepo();
    const row = rowFixture({ provider: 'anthropic' });
    repo.findByOrganizationId.mockResolvedValue(row);
    repo.save.mockImplementation(async (r) => r as OrgLlmCredential);
    const probe = makeProbe({ ok: false, error: 'HTTP 401' });
    const svc = new LlmCredentialsService(repo, makeEncryption(), probe);

    const status = await svc.test(ORG_A);
    expect(row.lastTestResult).toBe('failure');
    expect(row.lastTestError).toBe('HTTP 401');
    expect(status.lastTestResult).toBe('failure');
    expect(status.lastTestError).toBe('HTTP 401');
  });

  it('throws NO_KEY_CONFIGURED when no row exists', async () => {
    const repo = makeRepo();
    repo.findByOrganizationId.mockResolvedValue(null);
    const svc = new LlmCredentialsService(repo, makeEncryption(), makeProbe({ ok: true }));

    await expect(svc.test(ORG_A)).rejects.toThrow('NO_KEY_CONFIGURED');
  });
});

describe('LlmCredentialsService — clear()', () => {
  it('hard-deletes the row by organizationId', async () => {
    const repo = makeRepo();
    const svc = new LlmCredentialsService(repo, makeEncryption());
    await svc.clear(ORG_A);
    expect(repo.deleteByOrganizationId).toHaveBeenCalledWith(ORG_A);
  });
});
