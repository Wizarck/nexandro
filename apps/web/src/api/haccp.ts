import { api } from './client';

/**
 * REST client for the M3 HACCP BC (slice #10 m3-haccp-ui, Wave 2.6).
 *
 * Per ADR-J10-NO-CONTRACTS-IMPORT (design.md): all backend shapes
 * are INLINED here. No import from `@nexandro/contracts`. No
 * import from `apps/api/src/haccp/*`. The URL paths match slice #9's
 * registration. If slice #9's shapes diverge, the resolver picks up
 * the conflict at master merge.
 */

// ---- Inlined shapes (mirrors slice #9 m3-ccp-reading-aggregate) ----

export type CcpInputType = 'numeric' | 'checkbox' | 'multi-select';

export interface CcpSpecRange {
  min: number;
  max: number;
  unit: string;
}

export interface FsmsStandardSummary {
  id: string;
  version: string;
  effectiveAt: string;
}

export interface CcpSummary {
  id: string;
  name: string;
  organizationId: string;
  fsmsRef: string;
  inputType: CcpInputType;
  spec?: CcpSpecRange;
  dueBy?: string;
  lastReading?: {
    display: string;
    recordedAt: string;
    actor?: string;
  };
}

export interface CcpReading {
  id: string;
  organizationId: string;
  ccpId: string;
  actorUserId: string | null;
  /** Stringified value (decimal | "true"/"false" | comma-joined allergens). */
  value: string;
  unit: string | null;
  inSpec: boolean;
  specMin: number | null;
  specMax: number | null;
  correctiveActionId: string | null;
  fsmsStandardVersion: string | null;
  recordedAt: string;
  auditLogId: string | null;
}

export interface CorrectiveAction {
  id: string;
  organizationId: string;
  ccpId: string | null;
  label: string;
  isPredefined: boolean;
}

// ---- Request / response DTOs ----

export interface RecordReadingInput {
  organizationId: string;
  ccpId: string;
  actorUserId: string;
  value: string;
  unit?: string;
  correctiveActionId?: string;
  correctiveNotes?: string;
  fsmsStandardVersion?: string;
}

export interface LastOutOfSpecUnresolvedResponse {
  unresolved: boolean;
  priorReadingId?: string;
  priorRecordedAt?: string;
}

export interface RecordReadingResponse {
  reading: CcpReading;
}

export interface ListReadingsResponse {
  readings: ReadonlyArray<CcpReading>;
}

export interface ListCorrectiveActionsResponse {
  actions: ReadonlyArray<CorrectiveAction>;
}

// ---- Endpoint wrappers ----

export async function recordReading(
  input: RecordReadingInput,
): Promise<RecordReadingResponse> {
  return api<RecordReadingResponse>('/m3/haccp/readings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listReadings(
  organizationId: string,
  ccpId: string,
  limit = 5,
): Promise<ListReadingsResponse> {
  const qs = new URLSearchParams({
    organizationId,
    ccpId,
    limit: String(limit),
  }).toString();
  return api<ListReadingsResponse>(`/m3/haccp/readings?${qs}`);
}

export async function getLastOutOfSpecUnresolved(
  organizationId: string,
  ccpId: string,
): Promise<LastOutOfSpecUnresolvedResponse> {
  const qs = new URLSearchParams({ organizationId }).toString();
  return api<LastOutOfSpecUnresolvedResponse>(
    `/m3/haccp/ccps/${encodeURIComponent(ccpId)}/last-out-of-spec-unresolved?${qs}`,
  );
}

export async function listCorrectiveActions(
  organizationId: string,
  ccpId: string,
): Promise<ListCorrectiveActionsResponse> {
  const qs = new URLSearchParams({ organizationId, ccpId }).toString();
  return api<ListCorrectiveActionsResponse>(
    `/m3/haccp/corrective-actions?${qs}`,
  );
}

export async function createCorrectiveAction(input: {
  organizationId: string;
  ccpId: string | null;
  label: string;
}): Promise<{ action: CorrectiveAction }> {
  return api<{ action: CorrectiveAction }>('/m3/haccp/corrective-actions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
