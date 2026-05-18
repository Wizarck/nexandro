import { api } from './client';

/**
 * Sprint 4 W1-B — frontend bindings for the External Catalog (OFF mirror).
 *
 * Backed by `apps/api/src/external-catalog/interface/external-catalog.controller.ts`.
 * The current backend exposes only:
 *
 *   - `GET  /health/external-catalog` — last sync, row count, stale flag.
 *   - `POST /external-catalog/sync`   — manual trigger (OWNER, returns 202).
 *
 * There is NO browse/search endpoint yet. Search of OFF rows is consumed by
 * the ingredients picker via a different surface (#5 m2-ingredients-extension)
 * and is not part of this Settings tab.
 */

export type OffRegion = 'es' | 'pt' | 'it' | 'fr' | 'de' | 'nl';

export interface ExternalCatalogHealth {
  lastSyncAt: string | null;
  rowCount: number;
  stale: boolean;
}

export interface SyncRunResult {
  region: OffRegion | string;
  status: 'completed' | 'failed' | 'skipped' | string;
  rowsInserted?: number;
  rowsUpdated?: number;
  rowsScanned?: number;
  message?: string;
}

export interface SyncResponse {
  jobId: string;
  status: 'completed';
  results: SyncRunResult[];
}

interface WriteEnvelope<T> {
  data: T;
  missingFields: string[];
  nextRequired: string | null;
}

export async function fetchExternalCatalogHealth(): Promise<ExternalCatalogHealth> {
  return api<ExternalCatalogHealth>('/health/external-catalog');
}

export async function triggerExternalCatalogSync(): Promise<SyncResponse> {
  const env = await api<WriteEnvelope<SyncResponse>>(
    '/external-catalog/sync',
    { method: 'POST', body: JSON.stringify({}) },
  );
  return env.data;
}
