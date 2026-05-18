import { api } from './client';

/**
 * Sprint 3 Block B — frontend bindings for `/agent-credentials/*`.
 *
 * IMPORTANT: this surface registers **MCP agent attribution keys** (Ed25519
 * public keys per ADR-AGENT-CRED-1), not LLM provider API keys. The
 * `OwnerAgentCredentialsSection` shows both:
 *
 *   1. The real "Agentes registrados" list (this module's endpoints).
 *   2. A transparent "Claves de proveedor LLM" placeholder — no backend
 *      yet; deferred. See followup in the Block B PR body.
 */

export type AgentRole = 'OWNER' | 'MANAGER' | 'STAFF';

export interface AgentCredentialResponse {
  id: string;
  agentName: string;
  role: AgentRole;
  createdAt: string;
  revokedAt: string | null;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export interface CreateAgentCredentialPayload {
  agentName: string;
  publicKey: string;
  role: AgentRole;
}

export async function listAgentCredentials(): Promise<AgentCredentialResponse[]> {
  return api<AgentCredentialResponse[]>('/agent-credentials');
}

export async function createAgentCredential(
  payload: CreateAgentCredentialPayload,
): Promise<AgentCredentialResponse> {
  const env = await api<WriteEnvelope<AgentCredentialResponse>>('/agent-credentials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return env.data;
}

export async function revokeAgentCredential(id: string): Promise<AgentCredentialResponse> {
  const env = await api<WriteEnvelope<AgentCredentialResponse>>(
    `/agent-credentials/${encodeURIComponent(id)}/revoke`,
    { method: 'PUT' },
  );
  return env.data;
}

export async function deleteAgentCredential(id: string): Promise<{ id: string }> {
  const env = await api<WriteEnvelope<{ id: string }>>(
    `/agent-credentials/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return env.data;
}
