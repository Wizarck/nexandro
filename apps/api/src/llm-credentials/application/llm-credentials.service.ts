import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  LLM_PROVIDERS,
  LlmProvider,
  LlmTestResult,
  OrgLlmCredential,
} from '../domain/org-llm-credential.entity';
import { EncryptionService } from '../infrastructure/encryption.service';
import { LlmCredentialsRepository } from '../infrastructure/llm-credentials.repository';

/**
 * Public-facing status response for the `org_llm_credentials` REST
 * surface. NEVER contains the cleartext API key (we don't even store the
 * cleartext, only its AES-256-GCM ciphertext) and NEVER contains the
 * ciphertext either — operators rotate by re-PUTting a new key.
 */
export interface LlmCredentialStatus {
  provider: LlmProvider | null;
  hasKey: boolean;
  lastTestedAt: string | null;
  lastTestResult: LlmTestResult | null;
  lastTestError: string | null;
}

/**
 * DI token for swapping the provider-ping HTTP client in tests. The
 * default implementation uses Node's global `fetch` (Node 18+) with a
 * 10s timeout; the spec injects a stub.
 */
export const LLM_PROVIDER_PROBE = Symbol('LLM_PROVIDER_PROBE');

export interface LlmProviderProbe {
  ping(provider: LlmProvider, apiKey: string): Promise<{ ok: boolean; error?: string }>;
}

/** Provider-specific health endpoints (cheap GET; no token cost). */
const PROVIDER_ENDPOINTS: Record<LlmProvider, string> = {
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/models',
  mistral: 'https://api.mistral.ai/v1/models',
};

@Injectable()
export class DefaultLlmProviderProbe implements LlmProviderProbe {
  private readonly logger = new Logger(DefaultLlmProviderProbe.name);

  async ping(provider: LlmProvider, apiKey: string): Promise<{ ok: boolean; error?: string }> {
    const url = PROVIDER_ENDPOINTS[provider];
    const headers: Record<string, string> =
      provider === 'anthropic'
        ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${apiKey}` };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      if (res.ok) {
        return { ok: true };
      }
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      // DO NOT log the apiKey. Only the error message + provider name.
      const msg = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Provider ping failed for ${provider}: ${msg}`);
      return { ok: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Sprint 4 W2-1a — m4-byo-llm-provider-key. Owner-only application
 * service for per-org BYO LLM API keys.
 *
 * Invariants:
 *  - Cleartext API keys NEVER leave this service. They enter via
 *    `upsert()` (encrypted immediately) and exit only to the provider
 *    probe inside `test()` (decrypted just-in-time, never logged).
 *  - `getStatus()` is the only read endpoint — it returns a boolean
 *    `hasKey` flag plus test metadata, never the key itself.
 *  - Replacement is upsert (one row per org enforced by the UNIQUE
 *    constraint on `organization_id`); deletion is hard.
 */
@Injectable()
export class LlmCredentialsService {
  constructor(
    private readonly repo: LlmCredentialsRepository,
    private readonly encryption: EncryptionService,
    @Optional() @Inject(LLM_PROVIDER_PROBE) private readonly probe?: LlmProviderProbe,
  ) {}

  async getStatus(organizationId: string): Promise<LlmCredentialStatus> {
    const row = await this.repo.findByOrganizationId(organizationId);
    if (!row) {
      return {
        provider: null,
        hasKey: false,
        lastTestedAt: null,
        lastTestResult: null,
        lastTestError: null,
      };
    }
    return {
      provider: row.provider,
      hasKey: row.encryptedApiKey.length > 0,
      lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
      lastTestResult: row.lastTestResult,
      lastTestError: row.lastTestError,
    };
  }

  async upsert(
    organizationId: string,
    provider: LlmProvider,
    apiKey: string,
  ): Promise<void> {
    if (!LLM_PROVIDERS.includes(provider)) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error('apiKey must be a non-empty string');
    }
    const encrypted = this.encryption.encrypt(apiKey.trim());
    const existing = await this.repo.findByOrganizationId(organizationId);
    if (existing) {
      existing.provider = provider;
      existing.encryptedApiKey = encrypted;
      // Reset test metadata on key change — the previous test result no
      // longer reflects the new key's validity.
      existing.lastTestedAt = null;
      existing.lastTestResult = null;
      existing.lastTestError = null;
      await this.repo.save(existing);
      return;
    }
    const row = this.repo.create({
      organizationId,
      provider,
      encryptedApiKey: encrypted,
      lastTestedAt: null,
      lastTestResult: null,
      lastTestError: null,
    });
    await this.repo.save(row);
  }

  async test(organizationId: string): Promise<LlmCredentialStatus> {
    const row = await this.repo.findByOrganizationId(organizationId);
    if (!row) {
      throw new Error('NO_KEY_CONFIGURED');
    }
    const probe = this.probe ?? new DefaultLlmProviderProbe();
    const apiKey = this.encryption.decrypt(row.encryptedApiKey);
    const result = await probe.ping(row.provider, apiKey);
    row.lastTestedAt = new Date();
    row.lastTestResult = result.ok ? 'success' : 'failure';
    row.lastTestError = result.ok ? null : (result.error ?? 'unknown');
    await this.repo.save(row);
    return this.toStatus(row);
  }

  async clear(organizationId: string): Promise<void> {
    await this.repo.deleteByOrganizationId(organizationId);
  }

  private toStatus(row: OrgLlmCredential): LlmCredentialStatus {
    return {
      provider: row.provider,
      hasKey: row.encryptedApiKey.length > 0,
      lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
      lastTestResult: row.lastTestResult,
      lastTestError: row.lastTestError,
    };
  }
}
