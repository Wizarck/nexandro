import { ApiError, api } from './client';

/**
 * Sprint 2 P4 GDPR — frontend bindings for `/privacy/*`.
 *
 * Read shape returned by `GET /privacy/state?organizationId=…`. Backs the
 * Privacidad surface in `OwnerPrivacySection.tsx`.
 */
export interface RetentionPolicy {
  audit_log_days: number;
  photos_days: number;
  m3_review_queue_days: number;
}

export interface DpoContact {
  name: string;
  email: string;
  phone?: string;
}

export interface PrivacyState {
  organizationId: string;
  deletionScheduledAt: string | null;
  retentionPolicy: RetentionPolicy;
  dpoContact: DpoContact | null;
}

export interface DeleteOrganizationResponse {
  organizationId: string;
  deletionScheduledAt: string;
  graceDays: number;
}

export interface CancelDeleteResponse {
  organizationId: string;
  deletionScheduledAt: null;
  wasScheduled: boolean;
}

export interface StubResponse {
  enabled?: boolean;
  rotated?: boolean;
  message: string;
}

export async function getPrivacyState(organizationId: string): Promise<PrivacyState> {
  return api<PrivacyState>(`/privacy/state?organizationId=${encodeURIComponent(organizationId)}`);
}

/**
 * POST /privacy/export-mi-data — returns the raw Blob of the ZIP so the
 * caller can hand it to a temporary `<a download>` to trigger the browser
 * download. We bypass the api<T> JSON helper because the response is a
 * binary stream, not JSON.
 */
export async function exportMyData(organizationId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(
    `/api/privacy/export-mi-data?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // body stays null when the response wasn't JSON.
    }
    throw new ApiError(res.status, body, `API ${res.status} on /privacy/export-mi-data`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename =
    match?.[1] ?? `nexandro-data-export-${organizationId}-${new Date().toISOString().slice(0, 10)}.zip`;
  return { blob, filename };
}

export async function scheduleDeletion(organizationId: string): Promise<DeleteOrganizationResponse> {
  return api<DeleteOrganizationResponse>(
    `/privacy/delete-organization?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'POST' },
  );
}

export async function cancelDeletion(organizationId: string): Promise<CancelDeleteResponse> {
  return api<CancelDeleteResponse>(
    `/privacy/delete-organization?organizationId=${encodeURIComponent(organizationId)}`,
    { method: 'DELETE' },
  );
}

export async function patchRetentionPolicy(
  organizationId: string,
  patch: Partial<RetentionPolicy>,
): Promise<PrivacyState> {
  return api<PrivacyState>(
    `/privacy/retention-policy?organizationId=${encodeURIComponent(organizationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  );
}

export async function patchDpoContact(
  organizationId: string,
  contact: DpoContact | null,
): Promise<PrivacyState> {
  return api<PrivacyState>(
    `/privacy/dpo-contact?organizationId=${encodeURIComponent(organizationId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ contact }),
    },
  );
}

export async function enableTwoFactor(): Promise<StubResponse> {
  return api<StubResponse>('/privacy/two-factor/enable', { method: 'POST' });
}

export async function rotateApiToken(): Promise<StubResponse> {
  return api<StubResponse>('/privacy/api-token/rotate', { method: 'POST' });
}
