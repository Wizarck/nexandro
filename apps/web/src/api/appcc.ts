import { api } from './client';

/**
 * APPCC export REST client (slice #15 m3-appcc-i18n-ui, Wave 2.7).
 *
 * Per the cross-slice contract pattern (slice prompt CRITICAL hard rule),
 * all shapes are INLINED here — no `@nexandro/contracts` import; no
 * import from slice #14's `apps/api/src/compliance/*`. URL paths match
 * slice #14's prompt verbatim. If slice #14's shapes diverge at master
 * merge, the resolver picks up the conflict; only this file changes.
 */

export type Locale = 'es-ES' | 'ca-ES' | 'eu-ES' | 'gl-ES';

export type ScopeKey =
  | 'haccp'
  | 'lot'
  | 'procurement'
  | 'photo'
  | 'ai_obs';

export type Scope = Readonly<Record<ScopeKey, boolean>>;

export type ExportBundleStatus = 'generating' | 'ready' | 'failed';

export interface GenerateBundleRequest {
  organizationId: string;
  from: string; // ISO date YYYY-MM-DD
  to: string;
  locale: Locale;
  scope: Scope;
  recipients?: ReadonlyArray<string>;
}

export interface GenerateBundleResponse {
  bundleId: string;
  status: ExportBundleStatus;
}

export interface ExportBundleSummary {
  bundleId: string;
  organizationId: string;
  status: ExportBundleStatus;
  from: string;
  to: string;
  locale: Locale;
  scope: Scope;
  generatedAt: string;
  generatedByActor: string;
  sha256: string | null;
  auditLogId: string | null;
  pdfUrl: string | null;
  csvUrl: string | null;
  pdfSizeBytes: number | null;
  pdfPageCount: number | null;
  csvSizeBytes: number | null;
  dispatchedRecipients: number;
  archived: boolean;
}

export interface ListBundlesResponse {
  bundles: ReadonlyArray<ExportBundleSummary>;
}

export interface BundleStatusResponse {
  bundleId: string;
  status: ExportBundleStatus;
  currentStep: string | null;
  currentStepIndex: number;
  pageCount: number | null;
  sizeBytes: number | null;
  sha256: string | null;
  auditLogId: string | null;
  pdfUrl: string | null;
  csvUrl: string | null;
  dispatchedRecipients: number;
}

export async function generateBundle(
  input: GenerateBundleRequest,
): Promise<GenerateBundleResponse> {
  return api<GenerateBundleResponse>('/m3/compliance/exports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getBundleStatus(
  organizationId: string,
  bundleId: string,
): Promise<BundleStatusResponse> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<BundleStatusResponse>(
    `/m3/compliance/exports/${bundleId}?${qs}`,
  );
}

export async function listBundles(
  organizationId: string,
  limit = 10,
): Promise<ListBundlesResponse> {
  const qs = new URLSearchParams({
    organizationId,
    limit: String(limit),
  }).toString();
  return api<ListBundlesResponse>(`/m3/compliance/exports?${qs}`);
}

/**
 * Returns the proxied download URL for the bundle file. The Vite dev
 * proxy rewrites `/api/*` → backend; in production the same prefix is
 * served by the reverse proxy. The returned URL is suitable for direct
 * navigation (`window.location.assign`) or `<a download>` use.
 */
export function bundleDownloadUrl(
  organizationId: string,
  bundleId: string,
  kind: 'pdf' | 'csv',
): string {
  const qs = new URLSearchParams({ organizationId }).toString();
  return `/api/m3/compliance/exports/${bundleId}/${kind}?${qs}`;
}

/**
 * Returns the SSE stream URL for live progress updates. Consumers
 * construct an `EventSource(url)`; the stream emits one event per step
 * transition + a final `done` or `failure` event.
 */
export function bundleStreamUrl(
  organizationId: string,
  bundleId: string,
): string {
  const qs = new URLSearchParams({ organizationId }).toString();
  return `/api/m3/compliance/exports/${bundleId}/stream?${qs}`;
}
