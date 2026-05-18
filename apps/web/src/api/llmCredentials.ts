import { api } from './client';

/**
 * Sprint 4 W2-1b — frontend bindings for `/organizations/:orgId/llm-credentials`.
 *
 * The backend (PR #224) stores an AES-256-GCM-encrypted API key per org and
 * NEVER returns the cleartext. The status response only reports
 * `{ provider, hasKey, lastTestedAt, lastTestResult, lastTestError }`.
 *
 * Cleartext API keys live only in transit through `upsertLlmCredential()` —
 * the caller MUST drop them from component state on success.
 */

export type LlmProvider = 'openai' | 'anthropic' | 'mistral';
export const LLM_PROVIDERS: LlmProvider[] = ['openai', 'anthropic', 'mistral'];

export type LlmTestResult = 'success' | 'failure';

export interface LlmCredentialStatus {
  provider: LlmProvider | null;
  hasKey: boolean;
  lastTestedAt: string | null;
  lastTestResult: LlmTestResult | null;
  lastTestError: string | null;
}

export interface UpsertLlmCredentialPayload {
  provider: LlmProvider;
  apiKey: string;
}

export async function getLlmCredentialStatus(orgId: string): Promise<LlmCredentialStatus> {
  return api<LlmCredentialStatus>(
    `/organizations/${encodeURIComponent(orgId)}/llm-credentials`,
  );
}

export async function upsertLlmCredential(
  orgId: string,
  payload: UpsertLlmCredentialPayload,
): Promise<void> {
  await api<null>(`/organizations/${encodeURIComponent(orgId)}/llm-credentials`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function testLlmCredential(orgId: string): Promise<LlmCredentialStatus> {
  return api<LlmCredentialStatus>(
    `/organizations/${encodeURIComponent(orgId)}/llm-credentials/test`,
    { method: 'POST' },
  );
}

export async function clearLlmCredential(orgId: string): Promise<void> {
  await api<null>(`/organizations/${encodeURIComponent(orgId)}/llm-credentials`, {
    method: 'DELETE',
  });
}
