import { api, ApiError } from './client';

/**
 * Sprint 4 W2-3b — frontend bindings for the categories CSV import flow.
 *
 * Backend lives in `apps/api/src/ingredients/application/categories-import.service.ts`
 * (shipped PR #223). Two-step contract:
 *
 *   1) `previewCategoriesImport(orgId, file)` — multipart upload (`csv` field).
 *      Server parses + dedupes + validates without mutating the DB.
 *   2) `commitCategoriesImport(orgId, payload)` — JSON body. Server applies the
 *      previewed plan in a single transaction.
 *
 * Both endpoints are OWNER-only (`@Roles('OWNER')`).
 *
 * Hard limits surfaced as constants so the UI can show hints before upload:
 *   - File size ≤ 1 MB
 *   - Row count ≤ 5,000
 */

export const CSV_MAX_BYTES = 1 * 1024 * 1024;
export const CSV_MAX_ROWS = 5_000;

export interface CategoriesPreviewNewRow {
  name: string;
  parentName?: string;
  color?: string;
}

export interface CategoriesPreviewDuplicateRow {
  name: string;
  parentName?: string;
  color?: string;
  existingId: string;
}

export interface CategoriesPreviewRowError {
  row: number;
  message: string;
}

export interface CategoriesPreviewResult {
  totalRows: number;
  new: CategoriesPreviewNewRow[];
  duplicates: CategoriesPreviewDuplicateRow[];
  errors: CategoriesPreviewRowError[];
}

export type CategoriesImportMode = 'skip-duplicates' | 'update-duplicates';

export interface CategoriesCommitPayload {
  new: CategoriesPreviewNewRow[];
  duplicates: CategoriesPreviewDuplicateRow[];
  mode: CategoriesImportMode;
}

export interface CategoriesCommitResult {
  created: number;
  updated: number;
  skipped: number;
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

/**
 * POST /api/categories/import/preview — multipart upload.
 *
 * Bypasses the JSON-default `api()` helper because multipart requires the
 * browser to compose its own boundary header (any explicit Content-Type
 * breaks the body parsing).
 */
export async function previewCategoriesImport(
  organizationId: string,
  file: File,
): Promise<CategoriesPreviewResult> {
  const fd = new FormData();
  fd.append('csv', file, file.name);
  const q = new URLSearchParams({ organizationId });
  const res = await fetch(`/api/categories/import/preview?${q.toString()}`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // body stays null when response isn't JSON.
    }
    throw new ApiError(res.status, body, `Categories import preview failed: HTTP ${res.status}`);
  }
  const env = (await res.json()) as WriteEnvelope<CategoriesPreviewResult>;
  return env.data;
}

export async function commitCategoriesImport(
  organizationId: string,
  payload: CategoriesCommitPayload,
): Promise<CategoriesCommitResult> {
  const q = new URLSearchParams({ organizationId });
  const env = await api<WriteEnvelope<CategoriesCommitResult>>(
    `/categories/import/commit?${q.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  return env.data;
}
