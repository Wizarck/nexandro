import { api } from './client';

/**
 * Sprint 3 Block B — frontend bindings for `/users/*` (apps/api iam).
 *
 * NOTE: There is no email-only "invitation" endpoint yet. The backend
 * requires `password` at create time (bcrypt-hashed at cost 12).
 * Until R8 (real auth + invite flow) lands, the UI provisions users
 * directly with a generated provisional password the Owner shares
 * out-of-band. This trade-off is documented in the Block B PR followups.
 */

export type UserRole = 'OWNER' | 'MANAGER' | 'STAFF';

export const USER_ROLES: ReadonlyArray<UserRole> = ['OWNER', 'MANAGER', 'STAFF'] as const;

export interface UserResponse {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  organizationId: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export async function listUsers(organizationId: string): Promise<UserResponse[]> {
  const q = new URLSearchParams({ organizationId });
  return api<UserResponse[]>(`/users?${q.toString()}`);
}

export async function createUser(payload: CreateUserPayload): Promise<UserResponse> {
  const env = await api<WriteEnvelope<UserResponse>>('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return env.data;
}
